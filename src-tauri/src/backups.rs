//! Weekly local backups of the database (the last four are kept), and putting
//! one back. Backups stay in the app's data folder, on this device.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::{now_ms, AppState};

const KEEP: usize = 4;
const EVERY_MS: i64 = 7 * 86_400_000;
const PREFIX: &str = "kairo-";
/// The current database, saved just before a restore replaces it.
const BEFORE_RESTORE: &str = "before-restore.db";
/// Names the backup to put back on the next launch.
const RESTORE_MARKER: &str = "restore-from";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub name: String,
    /// When it was made (ms).
    pub at: i64,
    pub bytes: u64,
}

fn dir(db_path: &Path) -> PathBuf {
    db_path.parent().unwrap_or(Path::new(".")).join("backups")
}

/// Backups, newest first (the pre-restore copy included, last).
pub fn list(db_path: &Path) -> Vec<Backup> {
    let Ok(entries) = std::fs::read_dir(dir(db_path)) else {
        return Vec::new();
    };
    let mut out: Vec<Backup> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let meta = e.metadata().ok()?;
            let at = meta
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as i64;
            (name.ends_with(".db") && (name.starts_with(PREFIX) || name == BEFORE_RESTORE)).then_some(Backup {
                name,
                at,
                bytes: meta.len(),
            })
        })
        .collect();
    out.sort_by(|a, b| (a.name == BEFORE_RESTORE).cmp(&(b.name == BEFORE_RESTORE)).then(b.at.cmp(&a.at)));
    out
}

/// Make a backup now (one per day; today's is replaced) and keep the last four.
pub fn backup_now<R: Runtime>(app: &AppHandle<R>) -> Result<Backup, String> {
    let state = app.state::<AppState>();
    let folder = dir(&state.db_path);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let name = format!("{PREFIX}{}.db", chrono::Local::now().format("%Y-%m-%d"));
    state.db.backup_to(&folder.join(&name))?;
    let mut dated: Vec<Backup> = list(&state.db_path).into_iter().filter(|b| b.name.starts_with(PREFIX)).collect();
    dated.sort_by(|a, b| b.name.cmp(&a.name));
    for old in dated.iter().skip(KEEP) {
        let _ = std::fs::remove_file(folder.join(&old.name));
    }
    list(&state.db_path)
        .into_iter()
        .find(|b| b.name == name)
        .ok_or_else(|| "The backup wasn't written.".into())
}

/// The weekly backup, when it's due and backups are on.
pub fn run_if_due<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if !state.settings.read().backups {
        return;
    }
    let newest = list(&state.db_path)
        .into_iter()
        .filter(|b| b.name.starts_with(PREFIX))
        .map(|b| b.at)
        .max();
    if newest.map_or(true, |at| now_ms() - at >= EVERY_MS) {
        // Off the caller's thread: the timer ticks from it.
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(err) = backup_now(&app) {
                eprintln!("kairo: backup failed: {err}");
            }
        });
    }
}

/// Put a backup back: the current database is saved as "before-restore.db",
/// and the swap happens as Kairo restarts (the open database can't be replaced).
pub fn restore<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let valid = name.ends_with(".db")
        && !name.contains(['/', '\\'])
        && list(&state.db_path).iter().any(|b| b.name == name);
    if !valid {
        return Err("That backup isn't there any more.".into());
    }
    let folder = dir(&state.db_path);
    if name != BEFORE_RESTORE {
        state.db.backup_to(&folder.join(BEFORE_RESTORE))?;
    }
    std::fs::write(folder.join(RESTORE_MARKER), name).map_err(|e| e.to_string())?;
    app.restart();
}

/// At launch, before the database opens: finish a restore asked for last time.
pub fn apply_pending_restore(db_path: &Path) {
    let folder = dir(db_path);
    let marker = folder.join(RESTORE_MARKER);
    let Ok(name) = std::fs::read_to_string(&marker) else {
        return;
    };
    let _ = std::fs::remove_file(&marker);
    let source = folder.join(name.trim());
    if source.is_file() {
        for suffix in ["-wal", "-shm"] {
            let mut side = db_path.as_os_str().to_owned();
            side.push(suffix);
            let _ = std::fs::remove_file(PathBuf::from(side));
        }
        if let Err(err) = std::fs::copy(&source, db_path) {
            eprintln!("kairo: restore failed: {err}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_marker_swaps_the_database_in() {
        let root = std::env::temp_dir().join(format!("kairo-backup-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(dir(&root.join("kairo.db"))).unwrap();
        let db_path = root.join("kairo.db");
        std::fs::write(&db_path, b"current").unwrap();
        std::fs::write(dir(&db_path).join("kairo-2026-11-01.db"), b"backup").unwrap();
        std::fs::write(dir(&db_path).join(RESTORE_MARKER), "kairo-2026-11-01.db").unwrap();
        apply_pending_restore(&db_path);
        assert_eq!(std::fs::read(&db_path).unwrap(), b"backup");
        assert!(!dir(&db_path).join(RESTORE_MARKER).exists());
        assert_eq!(list(&db_path).len(), 1);
        let _ = std::fs::remove_dir_all(&root);
    }
}
