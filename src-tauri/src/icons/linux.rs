//! Linux: icons aren't stored in executables, so find the app's desktop entry
//! (by executable or window class) and look its icon up in the icon theme.

use std::{
    fs,
    path::{Path, PathBuf},
};

use super::Icon;

/// Icon files bigger than this are skipped (some themes ship huge SVGs).
const MAX_BYTES: u64 = 2 * 1024 * 1024;
/// Sharpest first: the UI shows icons at up to 72px on a 2x screen.
const SIZES: &[&str] = &["128x128", "256x256", "96x96", "512x512", "64x64", "48x48", "scalable"];

pub fn extract(process_path: &Path, app_name: &str) -> Option<Icon> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut data_dirs: Vec<PathBuf> = Vec::new();
    match std::env::var_os("XDG_DATA_HOME") {
        Some(d) => data_dirs.push(d.into()),
        None => data_dirs.extend(home.as_ref().map(|h| h.join(".local/share"))),
    }
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    data_dirs.extend(system.split(':').filter(|d| !d.is_empty()).map(PathBuf::from));
    data_dirs.extend(home.as_ref().map(|h| h.join(".local/share/flatpak/exports/share")));
    data_dirs.push("/var/lib/flatpak/exports/share".into());
    data_dirs.push("/var/lib/snapd/desktop".into());
    data_dirs.dedup();

    let mut icon_dirs: Vec<PathBuf> = home.iter().map(|h| h.join(".icons")).collect();
    icon_dirs.extend(data_dirs.iter().map(|d| d.join("icons")));
    extract_from(process_path, app_name, &data_dirs, &icon_dirs)
}

fn extract_from(process_path: &Path, app_name: &str, data_dirs: &[PathBuf], icon_dirs: &[PathBuf]) -> Option<Icon> {
    let exe = process_path.file_name()?.to_string_lossy().to_lowercase();
    let name = app_name.to_lowercase();
    let icon = data_dirs
        .iter()
        .filter_map(|d| fs::read_dir(d.join("applications")).ok())
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "desktop"))
        .filter_map(|p| fs::read_to_string(&p).ok().map(|text| (p, text)))
        .find_map(|(path, text)| {
            let entry = parse_entry(&text);
            matches(&entry, &path, process_path, &exe, &name).then_some(entry.icon).flatten()
        })?;
    load(&icon, icon_dirs)
}

#[derive(Default)]
struct Entry {
    exec: Option<String>,
    icon: Option<String>,
    wm_class: Option<String>,
}

/// The keys we need from the `[Desktop Entry]` group (not the actions).
fn parse_entry(text: &str) -> Entry {
    let mut entry = Entry::default();
    let mut in_main = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_main = line == "[Desktop Entry]";
            continue;
        }
        let Some((key, value)) = line.split_once('=').filter(|_| in_main) else {
            continue;
        };
        let value = value.trim().to_string();
        match key.trim() {
            "Exec" => entry.exec = Some(value),
            "Icon" => entry.icon = Some(value),
            "StartupWMClass" => entry.wm_class = Some(value),
            _ => {}
        }
    }
    entry
}

fn matches(entry: &Entry, desktop_file: &Path, process_path: &Path, exe: &str, name: &str) -> bool {
    if entry.icon.is_none() {
        return false;
    }
    if let Some(cmd) = entry.exec.as_deref().and_then(exec_program) {
        if Path::new(&cmd) == process_path || Path::new(&cmd).file_name().is_some_and(|f| f.to_string_lossy().to_lowercase() == exe) {
            return true;
        }
    }
    let class = entry.wm_class.as_deref().map(str::to_lowercase);
    let stem = desktop_file.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    class.as_deref() == Some(exe)
        || (!name.is_empty() && class.as_deref() == Some(name))
        || stem == exe
        || stem.rsplit('.').next() == Some(exe)
}

/// The program an `Exec=` line runs, skipping `env VAR=x` prefixes and quotes.
fn exec_program(exec: &str) -> Option<String> {
    let mut words = exec.split_whitespace().map(|w| w.trim_matches('"'));
    let mut first = words.next()?;
    if first == "env" || first.ends_with("/env") {
        first = words.find(|w| !w.contains('=') && !w.starts_with('-'))?;
    }
    Some(first.to_string())
}

fn load(icon: &str, icon_dirs: &[PathBuf]) -> Option<Icon> {
    let direct = Path::new(icon);
    if direct.is_absolute() {
        return read(direct);
    }
    for dir in icon_dirs {
        for size in SIZES {
            for ext in ["png", "svg"] {
                if let Some(found) = read(&dir.join("hicolor").join(size).join("apps").join(format!("{icon}.{ext}"))) {
                    return Some(found);
                }
            }
        }
    }
    let pixmaps = icon_dirs.iter().filter_map(|d| d.parent()).map(|d| d.join("pixmaps"));
    pixmaps
        .flat_map(|d| ["png", "svg"].map(|ext| d.join(format!("{icon}.{ext}"))))
        .find_map(|p| read(&p))
}

fn read(path: &Path) -> Option<Icon> {
    let mime = match path.extension()?.to_str()? {
        "png" => "image/png",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    if fs::metadata(path).ok()?.len() > MAX_BYTES {
        return None;
    }
    let data = fs::read(path).ok()?;
    (!data.is_empty()).then_some(Icon { mime, data })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempdir::Dir, Vec<PathBuf>, Vec<PathBuf>) {
        let root = tempdir::Dir::new("kairo-icons");
        let share = root.path().join("share");
        let apps = share.join("applications");
        fs::create_dir_all(&apps).unwrap();
        fs::write(apps.join("code.desktop"), "[Desktop Entry]\nName=Visual Studio Code\nExec=/usr/share/code/code --unity-launch %F\nIcon=vscode\nStartupWMClass=Code\n\n[Desktop Action new-empty-window]\nIcon=wrong\n").unwrap();
        fs::write(apps.join("org.gnome.Nautilus.desktop"), "[Desktop Entry]\nExec=env GDK_BACKEND=x11 nautilus --new-window\nIcon=org.gnome.Nautilus\n").unwrap();
        fs::write(apps.join("firefox.desktop"), "[Desktop Entry]\nExec=\"/opt/firefox/firefox\" %u\nIcon=/opt/firefox/browser/icon.png\n").unwrap();
        let hicolor = share.join("icons/hicolor");
        fs::create_dir_all(hicolor.join("48x48/apps")).unwrap();
        fs::create_dir_all(hicolor.join("128x128/apps")).unwrap();
        fs::create_dir_all(hicolor.join("scalable/apps")).unwrap();
        fs::write(hicolor.join("48x48/apps/vscode.png"), b"small").unwrap();
        fs::write(hicolor.join("128x128/apps/vscode.png"), b"large").unwrap();
        fs::write(hicolor.join("scalable/apps/org.gnome.Nautilus.svg"), b"<svg/>").unwrap();
        let dirs = vec![share.clone()];
        let icons = vec![share.join("icons")];
        (root, dirs, icons)
    }

    #[test]
    fn finds_the_sharpest_theme_icon_by_executable() {
        let (_root, dirs, icons) = fixture();
        let icon = extract_from(Path::new("/usr/share/code/code"), "Code", &dirs, &icons).unwrap();
        assert_eq!((icon.mime, icon.data.as_slice()), ("image/png", b"large".as_slice()));
    }

    #[test]
    fn skips_env_prefixes_and_falls_back_to_svg() {
        let (_root, dirs, icons) = fixture();
        let icon = extract_from(Path::new("/usr/bin/nautilus"), "Files", &dirs, &icons).unwrap();
        assert_eq!(icon.mime, "image/svg+xml");
    }

    #[test]
    fn unknown_apps_have_no_icon() {
        let (_root, dirs, icons) = fixture();
        assert!(extract_from(Path::new("/usr/bin/htop"), "htop", &dirs, &icons).is_none());
        assert_eq!(exec_program("\"/opt/firefox/firefox\" %u").as_deref(), Some("/opt/firefox/firefox"));
    }

    /// A throwaway directory, removed on drop.
    mod tempdir {
        use std::path::{Path, PathBuf};
        pub struct Dir(PathBuf);
        impl Dir {
            pub fn new(prefix: &str) -> Self {
                let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
                let p = std::env::temp_dir().join(format!("{prefix}-{}-{n}", std::process::id()));
                std::fs::create_dir_all(&p).unwrap();
                Self(p)
            }
            pub fn path(&self) -> &Path {
                &self.0
            }
        }
        impl Drop for Dir {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
    }
}
