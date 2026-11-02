//! Real app icons: extracted once from the app on disk, kept in the local
//! database and shown next to app names instead of initials.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
};

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::AppState;

/// Stored size: crisp at the 72px the UI shows at most, on a 2x screen.
/// (Linux reads the theme's files as they are.)
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub const ICON_PX: u32 = 128;
/// Look again after a month so updated apps get their new icon.
const REFRESH_MS: i64 = 30 * 24 * 3_600_000;

pub struct Icon {
    pub mime: &'static str,
    pub data: Vec<u8>,
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod win32;

#[cfg(target_os = "macos")]
fn extract<R: Runtime>(app: &AppHandle<R>, process_path: &Path, _app_name: &str) -> Option<Icon> {
    // AppKit wants the main thread; wait for the answer here.
    let (tx, rx) = mpsc::channel();
    let path = process_path.to_path_buf();
    app.run_on_main_thread(move || {
        let _ = tx.send(macos::extract(&path));
    })
    .ok()?;
    rx.recv().ok().flatten()
}

#[cfg(target_os = "windows")]
fn extract<R: Runtime>(_app: &AppHandle<R>, process_path: &Path, _app_name: &str) -> Option<Icon> {
    win32::extract(process_path)
}

#[cfg(target_os = "linux")]
fn extract<R: Runtime>(_app: &AppHandle<R>, process_path: &Path, app_name: &str) -> Option<Icon> {
    linux::extract(process_path, app_name)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn extract<R: Runtime>(_app: &AppHandle<R>, _process_path: &Path, _app_name: &str) -> Option<Icon> {
    None
}

/// The tracker hands every app it sees to this worker (once per run); the
/// worker fetches the icon in the background if we don't have a fresh one.
pub struct IconWorker {
    tx: mpsc::Sender<(String, PathBuf, String)>,
    seen: HashSet<String>,
}

impl IconWorker {
    pub fn spawn<R: Runtime>(app: AppHandle<R>) -> Self {
        let (tx, rx) = mpsc::channel::<(String, PathBuf, String)>();
        let worker = thread::Builder::new().name("kairo-icons".into()).spawn(move || {
            for (app_id, path, name) in rx {
                let state = app.state::<AppState>();
                if state.db.has_app_icon(&app_id, REFRESH_MS).unwrap_or(true) {
                    continue;
                }
                let Some(icon) = extract(&app, &path, &name) else {
                    continue;
                };
                if state.db.set_app_icon(&app_id, icon.mime, &icon.data).is_ok() {
                    let _ = app.emit("icons://changed", &app_id);
                }
            }
        });
        if let Err(err) = worker {
            eprintln!("kairo: icon worker unavailable: {err}");
        }
        Self {
            tx,
            seen: HashSet::new(),
        }
    }

    /// Cheap after the first call for an app.
    pub fn see(&mut self, app_id: &str, process_path: &Path, app_name: &str) {
        if self.seen.insert(app_id.to_owned()) {
            let _ = self
                .tx
                .send((app_id.to_owned(), process_path.to_owned(), app_name.to_owned()));
        }
    }
}
