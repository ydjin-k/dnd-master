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
/// Два независимых источника текста, оба добавляются в вывод:
///
/// 1. Значения AcroForm-полей — по ИМЕНИ поля, а не по позиции на странице.
///    Это единственный надёжный способ развести соседние поля в плотных
///    сетках (шапка листа персонажа: имя/класс/раса/предыстория в одну
///    визуальную строку, узел КЗ/Инициатива/Скорость) — там даже
///    сортировка по X/Y координатам путает, какое значение к какой подписи
///    относится. Работает, только если в PDF есть ДЕЙСТВУЮЩАЯ форма:
///    document.form() возвращает None для PDF, где форма уже расплющена в
///    статический текст (частый случай для сохранённых/распечатанных
///    листов — проверено на реальном пользовательском файле «Гоблин
///    варвар.pdf»: там form() == None, значения живут только как обычный
///    текст страницы, см. п.2).
/// 2. pdf_extract (использовался раньше) не восстанавливает порядок чтения в
///    сложных многоколоночных макетах. PDFium — движок Chromium, тот же, что
///    стоит за «выделить всё» в PDF-просмотрщике браузера — восстанавливает
///    порядок чтения намного лучше (хотя сам API честно предупреждает, что
///    для нестандартных макетов порядок в документе и порядок чтения
///    глазами всё ещё могут не совпадать — см. плотные сетки выше).
pub fn extract_text_from_pdf_with_library_dir(
    path: &str,
    pdfium_dir: &Path,
) -> Result<String, String> {
    let pdfium = pdfium_instance(pdfium_dir)?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| format!("не удалось открыть PDF {path:?}: {e}"))?;

    let mut out = String::new();

    if let Some(form) = document.form() {
        let values = form.field_values(document.pages());
        let mut names: Vec<&String> = values.keys().collect();
        names.sort();
        for name in names {
            if let Some(value) = values.get(name).and_then(|v| v.as_deref()) {
                if !value.is_empty() && value != "false" {
                    out.push_str(name);
                    out.push_str(": ");
                    out.push_str(value);
                    out.push('\n');
                }
            }
        }
    }

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

    #[test]
    fn extracts_acroform_field_values_by_field_name() {
        // Фикстура — вручную собранный минимальный PDF с ДЕЙСТВУЮЩИМ (не расплющенным)
        // AcroForm-полем: одно текстовое поле с именем "CharacterName" и значением
        // "Torin Ironbeard", плюс обычный статический текст на странице. Байтовые
        // смещения xref посчитаны скриптом (не угадывались руками), см. историю
        // разработки этого коммита. Проверяет путь, которого нет в
        // extracts_pdf_text_in_visual_reading_order_not_source_order выше: чтение
        // значения ПО ИМЕНИ ПОЛЯ, не по позиции текста на странице.
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let pdfium_dir = manifest_dir.join("pdfium");
        let pdf = manifest_dir.join("tests/fixtures/acroform-sample.pdf");

        let text = extract_text_from_pdf_with_library_dir(pdf.to_str().unwrap(), &pdfium_dir)
            .expect("PDFium должен прочитать фикстуру с формой без ошибок");

        assert!(
            text.contains("CharacterName: Torin Ironbeard"),
            "ожидал значение поля по имени, получил: {text:?}"
        );
        assert!(
            text.contains("Static label text"),
            "обычный текст страницы должен остаться в выводе тоже, получил: {text:?}"
        );
    }

    #[test]
    fn falls_back_to_page_text_when_pdf_has_no_live_form() {
        // layout-order-sample.pdf сгенерирован Chromium'ом (print-to-pdf), который
        // всегда расплющивает формы в статический текст — то есть document.form()
        // для него уже == None. Это ровно тот же случай, что и с реальным
        // пользовательским PDF (сохранённый/распечатанный лист персонажа): нет живой
        // формы, значит единственный путь — текст страницы, и падать тут нельзя.
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let pdfium_dir = manifest_dir.join("pdfium");
        let pdf = manifest_dir.join("tests/fixtures/layout-order-sample.pdf");

        let text = extract_text_from_pdf_with_library_dir(pdf.to_str().unwrap(), &pdfium_dir)
            .expect("PDF без формы должен читаться через обычный текст страницы");

        assert!(
            text.contains("ПОДПИСЬ") && text.contains("СЕКРЕТНОЕ"),
            "получил: {text:?}"
        );
    }
}
