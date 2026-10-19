//! Kairo core: focus timer, on-device activity tracking and local analytics.

mod categories;
mod commands;
mod db;
mod models;
#[cfg(desktop)]
mod sites;
mod timer;
#[cfg(desktop)]
mod tracker;
#[cfg(desktop)]
mod tray;

use std::{path::PathBuf, thread, time::Duration};

use parking_lot::{Mutex, RwLock};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::{
    db::Db,
    models::{CurrentActivity, Settings},
};

pub struct AppState {
    pub db: Db,
    pub db_path: PathBuf,
    pub settings: RwLock<Settings>,
    pub timer: Mutex<timer::Timer>,
    pub tracker: Mutex<TrackerShared>,
}

#[derive(Default)]
pub struct TrackerShared {
    pub paused_until: Option<i64>,
    pub current: Option<CurrentActivity>,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Local midnight, in unix ms.
pub fn start_of_today() -> i64 {
    use chrono::{Local, TimeZone};
    let today = Local::now().date_naive();
    today
        .and_hms_opt(0, 0, 0)
        .and_then(|t| Local.from_local_datetime(&t).earliest())
        .map(|t| t.timestamp_millis())
        .unwrap_or_else(|| now_ms() - now_ms() % 86_400_000)
}

pub fn fmt_duration(ms: i64) -> String {
    let minutes = (ms / 60_000).max(0);
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h}h"),
        (h, m) => format!("{h}h {m}m"),
    }
}

pub fn notify<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    if !app.state::<AppState>().settings.read().notifications_enabled {
        return;
    }
    let _ = app.notification().builder().title(title).body(body).show();
}

#[cfg(desktop)]
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
pub fn rebind_shortcut<R: Runtime>(app: &AppHandle<R>, old: &str, new: &str) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    if !old.is_empty() {
        let _ = gs.unregister(old);
    }
    if !new.is_empty() {
        if let Err(err) = gs.register(new) {
            eprintln!("kairo: could not register shortcut {new}: {err}");
        }
    }
}

fn setup<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let db_path = dir.join("kairo.db");
    let db = Db::open(&db_path)?;
    let settings = db.load_settings();
    if settings.retention_days > 0 {
        let cutoff = now_ms() - settings.retention_days as i64 * 86_400_000;
        db.purge_before(cutoff)?;
    }

    app.manage(AppState {
        timer: Mutex::new(timer::Timer::new(&settings)),
        settings: RwLock::new(settings.clone()),
        tracker: Mutex::new(TrackerShared::default()),
        db,
        db_path,
    });

    #[cfg(desktop)]
    {
        let handle = app.handle();
        tray::create(handle)?;
        tray::update_timer(handle, &timer::snapshot(handle));
        tracker::spawn(handle.clone());
        rebind_shortcut(handle, "", &settings.global_shortcut);

        #[cfg(target_os = "macos")]
        if settings.hide_dock_icon {
            let _ = handle.set_dock_visibility(false);
        }

        // Launched at login: start quietly in the tray.
        if std::env::args().any(|a| a == "--hidden") {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
        }
    }

    let handle = app.handle().clone();
    thread::Builder::new()
        .name("kairo-ticker".into())
        .spawn(move || loop {
            thread::sleep(Duration::from_millis(250));
            timer::tick(&handle);
        })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        timer::perform(app, timer::Action::Toggle);
                    }
                })
                .build(),
        );

    let app = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_screentime::init())
        .setup(setup)
        .on_window_event(|window, event| {
            // Closing the window keeps Kairo running in the tray/menu bar.
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    let state = window.state::<AppState>();
                    if state.db.kv_get("close_hint").ok().flatten().is_none() {
                        let _ = state.db.kv_set("close_hint", "1");
                        notify(
                            window.app_handle(),
                            "Kairo is still running",
                            "Your timer and tracking continue in the menu bar. Quit from the tray icon.",
                        );
                    }
                }
            }
            #[cfg(mobile)]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::timer_get,
            commands::timer_action,
            commands::timer_set_phase,
            commands::timer_extend,
            commands::timer_set_intention,
            commands::activity_spans,
            commands::bucket_totals,
            commands::entity_totals,
            commands::focus_sessions,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::rules_list,
            commands::rule_set,
            commands::rule_delete,
            commands::tracker_status,
            commands::tracker_pause,
            commands::usage_permission_request,
            commands::usage_sync,
            commands::data_info,
            commands::export_data,
            commands::wipe_data,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Kairo");

    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show_main_window(_app);
        }
    });
}
