//! Real icons for apps (extracted from the app on disk) and sites (the favicon a
//! browser already saved, or, only if the user turned it on, the site's own
//! icon from the web), kept in the local database and shown instead of initials.

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use parking_lot::Mutex;
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

mod favicons;
mod web;
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

enum Job {
    App { id: String, path: PathBuf, name: String },
    /// Stored under `site:<domain>`.
    Site { domain: String },
    /// Forget which sites came up empty (site icon downloads were just turned on).
    RetrySites,
}

/// Lets commands queue work for the icon worker (sites from history, retries).
struct IconQueue(Mutex<mpsc::Sender<Job>>);

/// Look for icons of sites the UI is showing but we have none for (history from
/// before Kairo looked for site icons, or sites that missed last time).
pub fn request_sites<R: Runtime>(app: &AppHandle<R>, domains: impl IntoIterator<Item = String>) {
    if let Some(queue) = app.try_state::<IconQueue>() {
        let tx = queue.0.lock();
        for domain in domains {
            let _ = tx.send(Job::Site { domain });
        }
    }
}

/// Give every site in the history without an icon another go (most used first).
pub fn retry_sites<R: Runtime>(app: &AppHandle<R>) {
    let Some(queue) = app.try_state::<IconQueue>() else {
        return;
    };
    let domains = app
        .state::<AppState>()
        .db
        .site_domains(300)
        .unwrap_or_default();
    let tx = queue.0.lock();
    let _ = tx.send(Job::RetrySites);
    for domain in domains {
        let _ = tx.send(Job::Site { domain });
    }
}

/// How often a site without an icon is looked up again: in the browsers' caches
/// (cheap, and the browser may have saved one since) and on the web.
const LOCAL_RETRY: Duration = Duration::from_secs(5 * 60);
const WEB_RETRY: Duration = Duration::from_secs(6 * 3600);

#[derive(Default)]
struct Tried {
    local: Option<Instant>,
    web: Option<Instant>,
}

/// The tracker hands every app and site it sees to this worker; the worker
/// fetches the icon in the background if we don't have a fresh one.
pub struct IconWorker {
    tx: mpsc::Sender<Job>,
    seen_apps: HashSet<String>,
    seen_sites: HashMap<String, Instant>,
}

impl IconWorker {
    pub fn spawn<R: Runtime>(app: AppHandle<R>) -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        app.manage(IconQueue(Mutex::new(tx.clone())));
        let worker = thread::Builder::new().name("kairo-icons".into()).spawn(move || {
            let mut favicons = favicons::Favicons::default();
            let mut tried: HashMap<String, Tried> = HashMap::new();
            for job in rx {
                let state = app.state::<AppState>();
                let (key, icon) = match job {
                    Job::RetrySites => {
                        tried.clear();
                        continue;
                    }
                    Job::App { id, path, name } => {
                        if state.db.has_app_icon(&id, REFRESH_MS).unwrap_or(true) {
                            continue;
                        }
                        let icon = extract(&app, &path, &name);
                        (id, icon)
                    }
                    Job::Site { domain } => {
                        let key = format!("site:{domain}");
                        if state.db.has_app_icon(&key, REFRESH_MS).unwrap_or(true) {
                            continue;
                        }
                        let download = state.settings.read().download_site_icons;
                        let t = tried.entry(domain.clone()).or_default();
                        let local_due = t.local.map_or(true, |at| at.elapsed() >= LOCAL_RETRY);
                        let web_due = download
                            && web::allowed(&domain)
                            && t.web.map_or(true, |at| at.elapsed() >= WEB_RETRY);
                        let mut icon = None;
                        if local_due {
                            t.local = Some(Instant::now());
                            icon = favicons.lookup(&domain);
                        }
                        if icon.is_none() && web_due {
                            t.web = Some(Instant::now());
                            icon = web::fetch(&domain);
                        }
                        (key, icon)
                    }
                };
                let Some(icon) = icon else {
                    continue;
                };
                if state.db.set_app_icon(&key, icon.mime, &icon.data).is_ok() {
                    let _ = app.emit("icons://changed", &key);
                }
            }
        });
        if let Err(err) = worker {
            eprintln!("kairo: icon worker unavailable: {err}");
        }
        Self {
            tx,
            seen_apps: HashSet::new(),
            seen_sites: HashMap::new(),
        }
    }

    /// Cheap after the first call for an app.
    pub fn see(&mut self, app_id: &str, process_path: &Path, app_name: &str) {
        if self.seen_apps.insert(app_id.to_owned()) {
            let _ = self.tx.send(Job::App {
                id: app_id.to_owned(),
                path: process_path.to_owned(),
                name: app_name.to_owned(),
            });
        }
    }

    /// A website seen in a browser. Passed on again every few minutes, so a site
    /// whose icon the browser hadn't saved yet gets it on a later visit.
    pub fn see_site(&mut self, domain: &str) {
        let due = self
            .seen_sites
            .get(domain)
            .map_or(true, |at| at.elapsed() >= LOCAL_RETRY);
        if due {
            self.seen_sites.insert(domain.to_owned(), Instant::now());
            let _ = self.tx.send(Job::Site {
                domain: domain.to_owned(),
            });
        }
    }
}
