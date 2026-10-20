use base64::Engine;
use std::path::Path;

/// Запись картинки PNG по пути, который мастер выбрал в диалоге «Сохранить как».
///
/// Почему своя команда, а не плагин `fs`: путь приходит ИЗ нативного диалога,
/// то есть любой в файловой системе. Узкого права для плагина под такой путь не
/// существует — пришлось бы выдать `fs:allow-write-file` с областью вроде
/// `$HOME/**`, и тогда писать куда угодно смог бы весь фронт, а не одна
/// кнопка. Здесь же разрешено ровно одно: положить байты в `*.png`.
///
/// Байты идут через base64, а не массивом чисел: лист A4 — это сотни килобайт,
/// и в JSON каждый байт обошёлся бы в три-четыре знака.
///
/// Формат не проверяется и не пересобирается: PNG рождается в полотне окна,
/// команда ему не владелец. Её дело — байты и путь.
pub fn write_png(path: &str, bytes_base64: &str) -> Result<(), String> {
    let target = Path::new(path);
    let is_png = target
        .extension()
        .map(|e| e.eq_ignore_ascii_case("png"))
        .unwrap_or(false);
    if !is_png {
        return Err("Схема сохраняется только файлом .png".into());
    }
    let parent = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| format!("Непригодный путь: {path}"))?;
    if !parent.is_dir() {
        return Err(format!("Папки больше нет: {}", parent.display()));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_base64)
        .map_err(|e| format!("Картинка пришла испорченной: {e}"))?;
    if bytes.is_empty() {
        return Err("Картинка пустая — сохранять нечего".into());
    }
    std::fs::write(target, &bytes).map_err(|e| format!("Файл не записался: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dnd-master-png-test-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn encode(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    /// Восемь байт подписи PNG — ими начинается любой настоящий файл.
    const PNG_HEAD: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

    #[test]
    fn writes_exactly_the_bytes_it_was_given() {
        let dir = temp_dir("writes");
        let mut bytes = PNG_HEAD.to_vec();
        bytes.extend_from_slice(&[0, 1, 2, 250, 251, 252]);
        let path = dir.join("Склеп старого рода.png");

        write_png(path.to_str().unwrap(), &encode(&bytes)).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn overwrites_the_file_the_master_picked_in_the_dialog() {
        // Диалог «Сохранить как» сам спрашивает о замене; если мастер согласился,
        // команда обязана заменить файл, а не дописать в конец.
        let dir = temp_dir("overwrite");
        let path = dir.join("схема.png");
        std::fs::write(&path, "старое содержимое подлиннее нового".as_bytes()).unwrap();

        write_png(path.to_str().unwrap(), &encode(&PNG_HEAD)).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), PNG_HEAD.to_vec());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refuses_anything_but_png() {
        let dir = temp_dir("not-png");
        let path = dir.join("схема.exe");
        let err = write_png(path.to_str().unwrap(), &encode(&PNG_HEAD)).unwrap_err();
        assert!(err.contains(".png"), "{err}");
        assert!(!path.exists(), "файл не того вида записываться не должен");
        // Расширение читается без оглядки на регистр: диалог Windows вернёт .PNG.
        let upper = dir.join("схема.PNG");
        write_png(upper.to_str().unwrap(), &encode(&PNG_HEAD)).unwrap();
        assert!(upper.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn says_so_when_the_folder_is_gone() {
        let dir = temp_dir("gone");
        let path = dir.join("нет такой папки").join("схема.png");
        let err = write_png(path.to_str().unwrap(), &encode(&PNG_HEAD)).unwrap_err();
        assert!(err.contains("Папки больше нет"), "{err}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refuses_broken_and_empty_pictures() {
        let dir = temp_dir("broken");
        let path = dir.join("схема.png");

        let err = write_png(path.to_str().unwrap(), "не base64 вовсе!!").unwrap_err();
        assert!(err.contains("испорченной"), "{err}");
        let err = write_png(path.to_str().unwrap(), "").unwrap_err();
        assert!(err.contains("пустая"), "{err}");
        // Ни пустой, ни испорченной картинкой файла не появилось.
        assert!(!path.exists());
        std::fs::remove_dir_all(&dir).ok();
    }
}
