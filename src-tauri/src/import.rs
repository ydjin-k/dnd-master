use std::path::Path;
use std::sync::OnceLock;

use image::DynamicImage;
use ocrs::{DimOrder, ImageSource, OcrEngine, OcrEngineParams};
use pdfium_render::prelude::Pdfium;
use rten::Model;
use rten_tensor::prelude::*;
use rten_tensor::NdTensor;
use tauri::{AppHandle, Manager};

fn image_to_tensor(image: DynamicImage) -> NdTensor<u8, 3> {
    let image = image.into_rgb8();
    let (width, height) = image.dimensions();
    NdTensor::from_data([height as usize, width as usize, 3], image.into_vec())
}

/// Модели лежат в ресурсах установщика (см. tauri.conf.json `bundle.resources`) —
/// распознавание работает офлайн, без обращения к сети. В dev-сборке ресурсы
/// установщика не собраны, поэтому там модели читаются прямо из src-tauri/models.
fn models_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("models"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("models"))
}

fn load_ocr_engine(detection_path: &Path, recognition_path: &Path) -> Result<OcrEngine, String> {
    let detection_model = Model::load_file(detection_path).map_err(|e| {
        format!("не удалось загрузить модель поиска текста {detection_path:?}: {e}")
    })?;
    let recognition_model = Model::load_file(recognition_path).map_err(|e| {
        format!("не удалось загрузить модель распознавания символов {recognition_path:?}: {e}")
    })?;

    OcrEngine::new(OcrEngineParams {
        detection_model: Some(detection_model),
        recognition_model: Some(recognition_model),
        ..Default::default()
    })
    .map_err(|e| format!("не удалось создать OCR-движок: {e}"))
}

/// Ядро без Tauri — так это можно проверить юнит-тестом без запуска приложения.
pub fn extract_text_from_image_with_models(
    image_path: &str,
    detection_model_path: &Path,
    recognition_model_path: &Path,
) -> Result<String, String> {
    let img = image::open(image_path)
        .map_err(|e| format!("не удалось открыть изображение {image_path:?}: {e}"))?;
    let tensor = image_to_tensor(img);
    let source = ImageSource::from_tensor(tensor.view(), DimOrder::Hwc)
        .map_err(|e| format!("не удалось подготовить изображение: {e}"))?;

    let engine = load_ocr_engine(detection_model_path, recognition_model_path)?;
    let input = engine
        .prepare_input(source)
        .map_err(|e| format!("не удалось подготовить вход OCR: {e}"))?;
    let word_rects = engine
        .detect_words(&input)
        .map_err(|e| format!("не удалось найти области текста: {e}"))?;
    let line_rects = engine.find_text_lines(&input, &word_rects);
    let line_texts = engine
        .recognize_text(&input, &line_rects)
        .map_err(|e| format!("не удалось распознать текст: {e}"))?;

    let lines: Vec<String> = line_texts.iter().flatten().map(|l| l.to_string()).collect();
    Ok(lines.join("\n"))
}

pub fn extract_text_from_image(app: &AppHandle, path: &str) -> Result<String, String> {
    let models = models_dir(app)?;
    extract_text_from_image_with_models(
        path,
        &models.join("text-detection.rten"),
        &models.join("text-recognition.rten"),
    )
}

/// Как и models_dir() для OCR: в dev-сборке библиотека читается прямо из
/// src-tauri/pdfium (скачана fetch-pdfium.sh), в установленном приложении —
/// из каталога ресурсов установщика (см. tauri.conf.json `bundle.resources`).
fn pdfium_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pdfium"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("pdfium"))
}

/// Pdfium::new() паникует, если вызвать её дважды в одном процессе (глобальные
/// биндинги можно установить только один раз) — OnceLock::get_or_init
/// гарантирует ровно один вызов даже при параллельных импортах.
fn pdfium_instance(pdfium_dir: &Path) -> Result<&'static Pdfium, String> {
    static PDFIUM: OnceLock<Result<Pdfium, String>> = OnceLock::new();
    PDFIUM
        .get_or_init(|| {
            let bindings =
                Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(pdfium_dir))
                    .map_err(|e| {
                        format!("не удалось загрузить библиотеку PDFium из {pdfium_dir:?}: {e}")
                    })?;
            Ok(Pdfium::new(bindings))
        })
        .as_ref()
        .map_err(|e| e.clone())
}

/// Ядро без Tauri — так это можно проверить юнит-тестом без запуска приложения
/// (как extract_text_from_image_with_models() для OCR выше).
///
/// pdf_extract (использовался раньше) не восстанавливает порядок чтения в
/// сложных многоколоночных макетах — на заполняемых листах персонажа D&D
/// (сами по себе AcroForm-таблицы) значения полей перемешивались с чужими
/// подписями. PDFium — движок Chromium, тот же, что стоит за «выделить всё» в
/// PDF-просмотрщике браузера — восстанавливает порядок чтения намного лучше
/// (хотя сам API честно предупреждает, что для нестандартных макетов порядок
/// в документе и порядок чтения глазами всё ещё могут не совпадать).
pub fn extract_text_from_pdf_with_library_dir(
    path: &str,
    pdfium_dir: &Path,
) -> Result<String, String> {
    let pdfium = pdfium_instance(pdfium_dir)?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| format!("не удалось открыть PDF {path:?}: {e}"))?;

    let mut out = String::new();
    for page in document.pages().iter() {
        let text = page
            .text()
            .map_err(|e| format!("не удалось извлечь текст страницы: {e}"))?;
        out.push_str(&text.all());
        out.push('\n');
    }
    Ok(out)
}

pub fn extract_text_from_pdf(app: &AppHandle, path: &str) -> Result<String, String> {
    extract_text_from_pdf_with_library_dir(path, &pdfium_dir(app)?)
}

pub fn extract_text_from_docx(path: &str) -> Result<String, String> {
    let bytes =
        std::fs::read(path).map_err(|e| format!("не удалось прочитать файл {path:?}: {e}"))?;
    let docx = docx_rs::read_docx(&bytes)
        .map_err(|e| format!("не удалось разобрать DOCX {path:?}: {e}"))?;

    let mut out = String::new();
    for child in docx.document.children {
        if let docx_rs::DocumentChild::Paragraph(para) = child {
            for para_child in para.children {
                if let docx_rs::ParagraphChild::Run(run) = para_child {
                    for run_child in run.children {
                        if let docx_rs::RunChild::Text(text) = run_child {
                            out.push_str(&text.text);
                        }
                    }
                }
            }
            out.push('\n');
        }
    }
    Ok(out)
}

pub fn extract_text_from_txt(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("не удалось прочитать файл {path:?}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_printed_text_on_sample_sheet() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let models = manifest_dir.join("models");
        let image = manifest_dir.join("tests/fixtures/sample-sheet.png");

        let text = extract_text_from_image_with_models(
            image.to_str().unwrap(),
            &models.join("text-detection.rten"),
            &models.join("text-recognition.rten"),
        )
        .expect("OCR должен отработать без ошибок");

        let upper = text.to_uppercase();
        assert!(
            upper.contains("TORIN") && upper.contains("IRONBEARD"),
            "ожидал имя персонажа в распознанном тексте, получил: {text:?}"
        );
        assert!(
            upper.contains("FIGHTER"),
            "ожидал класс персонажа в распознанном тексте, получил: {text:?}"
        );
    }

    #[test]
    fn reads_text_from_a_docx_round_trip() {
        use docx_rs::{Docx, Paragraph, Run};

        let path = std::env::temp_dir().join("dnd-master-import-test.docx");
        {
            let file = std::fs::File::create(&path).expect("создать временный docx");
            Docx::new()
                .add_paragraph(Paragraph::new().add_run(Run::new().add_text("Иллидан, друид")))
                .pack(file)
                .expect("записать docx");
        }

        let text = extract_text_from_docx(path.to_str().unwrap()).expect("прочитать docx");
        assert!(
            text.contains("Иллидан") && text.contains("друид"),
            "получил: {text:?}"
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn extracts_pdf_text_in_visual_reading_order_not_source_order() {
        // Фикстура сгенерирована headless-Chromium'ом (msedge --print-to-pdf) из HTML,
        // где div со «значением» идёт в исходнике ПЕРВЫМ, но абсолютно спозиционирован
        // ПРАВЕЕ подписи на той же строке — ровно так же, как в реальных заполняемых
        // листах персонажа перепутывались подпись поля и его значение (см. коммит с
        // диагнозом бага pdf_extract). PDFium восстанавливает порядок чтения по
        // положению на странице, а не по порядку объявления в PDF-потоке.
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let pdfium_dir = manifest_dir.join("pdfium");
        let pdf = manifest_dir.join("tests/fixtures/layout-order-sample.pdf");

        let text = extract_text_from_pdf_with_library_dir(pdf.to_str().unwrap(), &pdfium_dir)
            .expect("PDFium должен прочитать фикстуру без ошибок");

        let label_pos = text.find("ПОДПИСЬ").expect("подпись должна быть в тексте");
        let value_pos = text.find("СЕКРЕТНОЕ").expect("значение должно быть в тексте");
        assert!(
            label_pos < value_pos,
            "подпись должна идти раньше значения (порядок чтения), получил: {text:?}"
        );
    }
}
