//! Sites: the favicon the browser already saved on this computer. Kairo never
//! fetches anything; it reads the Chromium-family browsers' own favicon caches,
//! and only for sites it has already seen you use.

use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use rusqlite::{params, Connection, OpenFlags};

use super::Icon;

/// Favicons smaller than this look blurry at avatar size; initials read better.
const MIN_PX: i64 = 32;
/// How long a copy of a browser's favicon database is reused.
const REFRESH: Duration = Duration::from_secs(60 * 60);

/// Profile folders of Chromium-family browsers (each holds `Default`, `Profile 1`…).
fn browser_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let base = home.join("Library/Application Support");
        for d in [
            "Google/Chrome",
            "Google/Chrome Beta",
            "Chromium",
            "BraveSoftware/Brave-Browser",
            "Microsoft Edge",
            "Arc/User Data",
            "Vivaldi",
        ] {
            roots.push(base.join(d));
        }
    }
    #[cfg(target_os = "windows")]
    if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        for d in [
            "Google/Chrome/User Data",
            "Chromium/User Data",
            "BraveSoftware/Brave-Browser/User Data",
            "Microsoft/Edge/User Data",
            "Vivaldi/User Data",
        ] {
            roots.push(local.join(d));
        }
    }
    #[cfg(target_os = "linux")]
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let base = home.join(".config");
        for d in ["google-chrome", "chromium", "BraveSoftware/Brave-Browser", "microsoft-edge", "vivaldi"] {
            roots.push(base.join(d));
        }
    }
    roots
}

fn databases() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for root in browser_roots() {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let db = entry.path().join("Favicons");
            if (name == "Default" || name.starts_with("Profile ")) && db.is_file() {
                out.push(db);
            }
        }
    }
    out
}

/// Copies of the browsers' favicon databases (they stay locked while a browser
/// runs), made on first use and refreshed hourly.
#[derive(Default)]
pub struct Favicons {
    copies: Vec<PathBuf>,
    made: Option<Instant>,
}

impl Favicons {
    fn refresh(&mut self) {
        if self.made.is_some_and(|t| t.elapsed() < REFRESH) {
            return;
        }
        for old in self.copies.drain(..) {
            let _ = std::fs::remove_file(old);
        }
        let dir = std::env::temp_dir();
        for (i, db) in databases().into_iter().enumerate() {
            let copy = dir.join(format!("kairo-favicons-{}-{i}.db", std::process::id()));
            if std::fs::copy(&db, &copy).is_ok() {
                self.copies.push(copy);
            }
        }
        self.made = Some(Instant::now());
    }

    /// The sharpest saved favicon for `domain` (or its subdomains), as PNG.
    pub fn lookup(&mut self, domain: &str) -> Option<Icon> {
        self.refresh();
        let (width, data) = self
            .copies
            .iter()
            .filter_map(|db| query(db, domain))
            .max_by_key(|(width, _)| *width)?;
        (width >= MIN_PX && data.starts_with(b"\x89PNG")).then_some(Icon { mime: "image/png", data })
    }
}

impl Drop for Favicons {
    fn drop(&mut self) {
        for copy in &self.copies {
            let _ = std::fs::remove_file(copy);
        }
    }
}

fn query(db: &Path, domain: &str) -> Option<(i64, Vec<u8>)> {
    let conn = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).ok()?;
    conn.query_row(
        "SELECT b.width, b.image_data FROM icon_mapping m JOIN favicon_bitmaps b ON b.icon_id = m.icon_id
         WHERE (m.page_url LIKE ?1 OR m.page_url LIKE ?2 OR m.page_url LIKE ?3) AND b.image_data IS NOT NULL
         ORDER BY b.width DESC LIMIT 1",
        params![
            format!("http%://{domain}/%"),
            format!("http%://www.{domain}/%"),
            format!("http%://%.{domain}/%")
        ],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?)),
    )
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_largest_favicon_for_a_domain_and_its_subdomains() {
        let path = std::env::temp_dir().join(format!("kairo-favicons-test-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE icon_mapping (page_url TEXT, icon_id INTEGER);
             CREATE TABLE favicon_bitmaps (icon_id INTEGER, width INTEGER, image_data BLOB);
             INSERT INTO icon_mapping VALUES ('https://www.instagram.com/explore/', 1), ('https://example.org/', 2);
             INSERT INTO favicon_bitmaps VALUES (1, 16, X'89504E47'), (1, 192, X'89504E4701'), (2, 32, X'89504E47');",
        )
        .unwrap();
        drop(conn);
        assert_eq!(query(&path, "instagram.com"), Some((192, vec![0x89, 0x50, 0x4E, 0x47, 0x01])));
        assert_eq!(query(&path, "youtube.com"), None);
        let _ = std::fs::remove_file(&path);
    }
}
