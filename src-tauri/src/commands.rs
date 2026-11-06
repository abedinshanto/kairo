//! IPC surface for the UI. Everything here reads or writes the local database.
//! Kairo's only network use is opt-in: site icons and the update check.

use std::{collections::HashMap, path::PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::{
    db::NewSpan,
    models::{
        ActivitySpan, BucketTotals, EntityTotal, FocusSession, Phase, Rule, Settings, Task,
        TaskPatch, TimerSnapshot, TrackerStatus,
    },
    now_ms, timer, AppState,
};

type CmdResult<T> = Result<T, String>;

// ------------------------------------------------------------------ settings

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Settings {
    state.settings.read().clone()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) -> CmdResult<Settings> {
    let settings = settings.sanitized();
    let state = app.state::<AppState>();
    let old = state.settings.read().clone();
    state.db.save_settings(&settings)?;
    *state.settings.write() = settings.clone();

    // Excluding an app also forgets everything recorded about it.
    for app_id in settings
        .excluded_apps
        .iter()
        .filter(|a| !old.excluded_apps.contains(a))
    {
        state.db.delete_app_history(app_id)?;
    }
    for domain in settings
        .excluded_sites
        .iter()
        .filter(|d| !old.excluded_sites.contains(d))
    {
        state.db.delete_site_history(domain)?;
    }
    #[cfg(desktop)]
    if settings.download_site_icons && !old.download_site_icons {
        // Sites that came up empty before get another go, now from the web too.
        crate::icons::retry_sites(&app);
    }
    timer::settings_changed(&app);
    #[cfg(mobile)]
    crate::daily::schedule_mobile(&app);

    #[cfg(desktop)]
    {
        if old.capture_shortcut != settings.capture_shortcut {
            crate::rebind_shortcut(&app, &old.capture_shortcut, &settings.capture_shortcut);
        }
        if old.global_shortcut != settings.global_shortcut {
            crate::rebind_shortcut(&app, &old.global_shortcut, &settings.global_shortcut);
        }
        #[cfg(target_os = "macos")]
        if old.hide_dock_icon != settings.hide_dock_icon {
            let _ = app.set_dock_visibility(!settings.hide_dock_icon);
        }
        let snap = timer::snapshot(&app);
        crate::tray::update_timer(&app, &snap);
    }
    let _ = app.emit("settings://changed", &settings);
    Ok(settings)
}

// ------------------------------------------------------------------ timer

#[tauri::command]
pub fn timer_get(app: AppHandle) -> TimerSnapshot {
    timer::snapshot(&app)
}

#[tauri::command]
pub fn timer_action(app: AppHandle, action: timer::Action) -> TimerSnapshot {
    timer::perform(&app, action)
}

#[tauri::command]
pub fn timer_set_phase(app: AppHandle, phase: Phase) -> TimerSnapshot {
    timer::set_phase(&app, phase)
}

#[tauri::command]
pub fn timer_extend(app: AppHandle, minutes: i64) -> TimerSnapshot {
    timer::extend(&app, minutes)
}

#[tauri::command]
pub fn timer_set_intention(app: AppHandle, intention: String, task_id: Option<i64>) -> TimerSnapshot {
    timer::set_intention(&app, intention, task_id)
}

// ------------------------------------------------------------------ analytics

#[tauri::command]
pub fn activity_spans(state: State<AppState>, from: i64, to: i64) -> CmdResult<Vec<ActivitySpan>> {
    state.db.spans(from, to)
}

#[tauri::command]
pub fn bucket_totals(state: State<AppState>, buckets: Vec<(i64, i64)>) -> CmdResult<Vec<BucketTotals>> {
    if buckets.len() > 5000 {
        return Err("too many buckets".into());
    }
    state.db.bucket_totals(&buckets)
}

#[tauri::command]
pub fn entity_totals(state: State<AppState>, from: i64, to: i64) -> CmdResult<Vec<EntityTotal>> {
    state.db.entity_totals(from, to)
}

#[tauri::command]
pub fn focus_sessions(state: State<AppState>, from: i64, to: i64) -> CmdResult<Vec<FocusSession>> {
    state.db.sessions(from, to)
}

/// Real icons as data URLs, by key (an app id, or `site:<domain>`). Keys without
/// one are left out; sites among them are looked for in the background.
#[tauri::command]
pub fn app_icons(app: AppHandle, keys: Vec<String>) -> CmdResult<HashMap<String, String>> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let state = app.state::<AppState>();
    let keys: Vec<String> = keys.into_iter().take(500).collect();
    let icons: HashMap<String, String> = state
        .db
        .app_icons(&keys)?
        .into_iter()
        .map(|(id, mime, data)| (id, format!("data:{mime};base64,{}", STANDARD.encode(data))))
        .collect();
    #[cfg(desktop)]
    crate::icons::request_sites(
        &app,
        keys.iter()
            .filter(|k| !icons.contains_key(*k))
            .filter_map(|k| k.strip_prefix("site:"))
            .map(str::to_owned),
    );
    Ok(icons)
}

// ------------------------------------------------------------------ tasks

#[tauri::command]
pub fn tasks_list(state: State<AppState>) -> CmdResult<Vec<Task>> {
    state.db.tasks()
}

#[tauri::command]
pub fn task_create(state: State<AppState>, title: String, estimate: u32, due_day: Option<i64>) -> CmdResult<i64> {
    if title.trim().is_empty() {
        return Err("A task needs a title".into());
    }
    state.db.create_task(&title, estimate, due_day, now_ms())
}

/// Forget an app's or site's recorded time once, without excluding it.
#[tauri::command]
pub fn delete_history(app: AppHandle, kind: String, key: String) -> CmdResult<()> {
    app.state::<AppState>().db.delete_entity_history(&kind, &key)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

/// Set the priority order of tasks (ids, highest first).
#[tauri::command]
pub fn tasks_reorder(app: AppHandle, ids: Vec<i64>) -> CmdResult<()> {
    app.state::<AppState>().db.reorder_tasks(&ids)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

#[tauri::command]
pub fn task_update(state: State<AppState>, id: i64, patch: TaskPatch) -> CmdResult<()> {
    state.db.update_task(id, &patch, now_ms())
}

// ------------------------------------------------------------------ editing history

/// Log time Kairo couldn't see (a meeting, a call, reading on paper).
#[tauri::command]
pub fn span_add(app: AppHandle, start: i64, end: i64, name: String, category: String, productivity: i8) -> CmdResult<i64> {
    if name.trim().is_empty() || end <= start {
        return Err("Give it a name and an end after its start.".into());
    }
    let id = app.state::<AppState>().db.add_manual_span(start, end, &name, &category, productivity.clamp(-1, 1))?;
    let _ = app.emit("data://changed", ());
    Ok(id)
}

#[tauri::command]
pub fn span_update(app: AppHandle, id: i64, start: i64, end: i64) -> CmdResult<()> {
    if end <= start {
        return Err("The end has to come after the start.".into());
    }
    app.state::<AppState>().db.update_span_times(id, start, end)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

#[tauri::command]
pub fn span_delete(app: AppHandle, id: i64) -> CmdResult<()> {
    app.state::<AppState>().db.delete_span(id)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

/// Point a focus block at another task (or none).
#[tauri::command]
pub fn session_update(app: AppHandle, id: i64, task_id: Option<i64>, intention: String) -> CmdResult<()> {
    app.state::<AppState>().db.update_session_task(id, task_id, &intention)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

#[tauri::command]
pub fn session_delete(app: AppHandle, id: i64) -> CmdResult<()> {
    app.state::<AppState>().db.delete_session(id)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

#[tauri::command]
pub fn task_delete(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.db.delete_task(id)
}

// ------------------------------------------------------------------ classification

#[tauri::command]
pub fn rules_list(state: State<AppState>) -> CmdResult<Vec<Rule>> {
    state.db.list_rules()
}

#[tauri::command]
pub fn rule_set(app: AppHandle, rule: Rule) -> CmdResult<()> {
    app.state::<AppState>().db.set_rule(&rule)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

#[tauri::command]
pub fn rule_delete(app: AppHandle, key: String) -> CmdResult<()> {
    app.state::<AppState>().db.delete_rule(&key)?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

// ------------------------------------------------------------------ tracking

#[tauri::command]
pub fn tracker_status(app: AppHandle) -> TrackerStatus {
    status(&app)
}

#[tauri::command]
pub fn tracker_pause(app: AppHandle, minutes: Option<u32>) -> TrackerStatus {
    set_tracking_pause(&app, minutes);
    status(&app)
}

pub fn set_tracking_pause<R: Runtime>(app: &AppHandle<R>, minutes: Option<u32>) {
    let state = app.state::<AppState>();
    let until = minutes.map(|m| now_ms() + m as i64 * 60_000);
    state.tracker.lock().paused_until = until;
    #[cfg(desktop)]
    crate::tray::update_tracking(app, until.is_some());
    let _ = app.emit("tracker://status", status(app));
}

fn status<R: Runtime>(app: &AppHandle<R>) -> TrackerStatus {
    let state = app.state::<AppState>();
    let enabled = state.settings.read().tracking_enabled;
    let shared = state.tracker.lock();
    let now = now_ms();
    let platform = std::env::consts::OS.to_string();

    #[cfg(desktop)]
    let (supported, needs_permission) = (true, false);
    #[cfg(mobile)]
    let (supported, needs_permission) = {
        use tauri_plugin_screentime::ScreenTimeExt;
        let st = app.screentime();
        let supported = st.is_supported();
        (supported, supported && !st.permission_granted().unwrap_or(false))
    };

    TrackerStatus {
        supported,
        enabled,
        paused_until: shared.paused_until.filter(|t| *t > now),
        platform,
        needs_permission,
        current: shared.current.clone(),
    }
}

/// Opens the OS screen to grant usage access (Android).
#[tauri::command]
pub fn usage_permission_request(app: AppHandle) -> CmdResult<()> {
    use tauri_plugin_screentime::ScreenTimeExt;
    app.screentime().request_permission().map_err(|e| e.to_string())
}

/// Pull new foreground usage from the OS into the local database (Android).
/// Returns the number of spans added. A no-op on desktop.
#[tauri::command]
pub fn usage_sync(app: AppHandle) -> CmdResult<usize> {
    use tauri_plugin_screentime::ScreenTimeExt;
    let st = app.screentime();
    if !st.is_supported() || !st.permission_granted().unwrap_or(false) {
        return Ok(0);
    }
    let state = app.state::<AppState>();
    if !state.settings.read().tracking_enabled {
        return Ok(0);
    }
    let excluded = state.settings.read().excluded_apps.clone();
    let now = now_ms();
    let from = state
        .db
        .kv_get("usage_synced_until")?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(now - 7 * 24 * 3_600_000);
    // Look back further than `from` so apps that were already open get their
    // resume event; only the part after `from` is new.
    let spans = st
        .query(from - 6 * 3_600_000, now)
        .map_err(|e| e.to_string())?;
    let mut added = 0;
    let mut seen: Vec<String> = Vec::new();
    for s in spans {
        if !seen.contains(&s.package) {
            seen.push(s.package.clone());
        }
        let (start, end) = (s.start.max(from), s.end.min(now));
        if end - start < 1000 || excluded.contains(&s.package.to_lowercase()) {
            continue;
        }
        state.db.insert_long_span(&NewSpan {
            start,
            end,
            app_id: &s.package.to_lowercase(),
            app_name: &s.label,
            domain: None,
            title: None,
            source: "android",
            continuation: s.start < from,
        })?;
        added += 1;
    }
    state.db.kv_set("usage_synced_until", &now.to_string())?;
    if added > 0 {
        let _ = app.emit("data://changed", ());
    }
    fetch_android_icons(&app, &seen);
    Ok(added)
}

/// Launcher icons for apps we don't have a fresh icon for yet (Android).
#[cfg(target_os = "android")]
fn fetch_android_icons(app: &AppHandle, packages: &[String]) {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use tauri_plugin_screentime::ScreenTimeExt;
    const REFRESH_MS: i64 = 30 * 24 * 3_600_000;
    let state = app.state::<AppState>();
    let missing: Vec<String> = packages
        .iter()
        .filter(|p| !state.db.has_app_icon(&p.to_lowercase(), REFRESH_MS).unwrap_or(true))
        .take(50)
        .cloned()
        .collect();
    if missing.is_empty() {
        return;
    }
    let Ok(icons) = app.screentime().app_icons(&missing) else {
        return;
    };
    for icon in icons {
        let id = icon.package.to_lowercase();
        if let Ok(png) = STANDARD.decode(icon.png.as_bytes()) {
            if state.db.set_app_icon(&id, "image/png", &png).is_ok() {
                let _ = app.emit("icons://changed", &id);
            }
        }
    }
}

#[cfg(not(target_os = "android"))]
fn fetch_android_icons(_app: &AppHandle, _packages: &[String]) {}

// ------------------------------------------------------------------ data control

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    spans: i64,
    sessions: i64,
    first_activity: Option<i64>,
    db_path: String,
    db_bytes: u64,
}

#[tauri::command]
pub fn data_info(state: State<AppState>) -> CmdResult<DataInfo> {
    let (spans, sessions, first_activity) = state.db.stats()?;
    let db_bytes = ["", "-wal"]
        .iter()
        .filter_map(|suffix| {
            let mut p = state.db_path.clone().into_os_string();
            p.push(suffix);
            std::fs::metadata(PathBuf::from(p)).ok()
        })
        .map(|m| m.len())
        .sum();
    Ok(DataInfo {
        spans,
        sessions,
        first_activity,
        db_path: state.db_path.display().to_string(),
        db_bytes,
    })
}

#[tauri::command]
pub fn export_data(state: State<AppState>, path: String, format: String) -> CmdResult<()> {
    let path = PathBuf::from(path);
    match format.as_str() {
        "csv" => state.db.export_csv(&path),
        _ => {
            let settings = state.settings.read().clone();
            state.db.export_json(&path, &settings, now_ms())
        }
    }
}

/// Merge a Kairo JSON export into this device's data.
#[tauri::command]
pub fn import_data(app: AppHandle, path: String) -> CmdResult<crate::db::ImportCounts> {
    let file = std::fs::File::open(&path).map_err(|e| format!("Couldn't open the file: {e}"))?;
    let export: crate::db::ExportFile =
        serde_json::from_reader(std::io::BufReader::new(file)).map_err(|_| "That isn't a Kairo export.".to_string())?;
    if export.format != "kairo-export" {
        return Err("That isn't a Kairo export.".into());
    }
    let counts = app.state::<AppState>().db.import_export(&export)?;
    let _ = app.emit("data://changed", ());
    Ok(counts)
}

#[tauri::command]
pub fn backups_list(state: State<AppState>) -> Vec<crate::backups::Backup> {
    crate::backups::list(&state.db_path)
}

#[tauri::command]
pub fn backup_now(app: AppHandle) -> CmdResult<crate::backups::Backup> {
    crate::backups::backup_now(&app)
}

/// Put a backup back and restart Kairo with it.
#[tauri::command]
pub fn backup_restore(app: AppHandle, name: String) -> CmdResult<()> {
    crate::backups::restore(&app, &name)
}

/// What the last update check found (only ever set when the user turned checks on).
#[tauri::command]
pub fn update_status(app: AppHandle) -> Option<crate::update::UpdateInfo> {
    app.state::<crate::update::Updates>().found.lock().clone()
}

/// "Check now" in Settings; off the main thread, it waits on the network.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Option<crate::update::UpdateInfo> {
    tauri::async_runtime::spawn_blocking(move || crate::update::check_now(&app)).await.ok().flatten()
}

#[tauri::command]
pub fn update_open() -> CmdResult<()> {
    crate::update::open_releases()
}

#[tauri::command]
pub fn wipe_data(app: AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    state.db.wipe()?;
    // Don't re-import OS usage history the user just asked us to forget.
    state.db.kv_set("usage_synced_until", &now_ms().to_string())?;
    let _ = app.emit("data://changed", ());
    Ok(())
}

/// The panel or the capture box asks to go away (Escape, or done).
#[tauri::command]
pub fn window_hide(window: tauri::WebviewWindow) {
    #[cfg(desktop)]
    crate::panel::hide(&window);
    #[cfg(mobile)]
    let _ = window;
}

/// "Open Kairo" from the panel or the capture box: the main window comes up.
#[tauri::command]
pub fn window_open_main(app: AppHandle, window: tauri::WebviewWindow, view: Option<String>) {
    #[cfg(desktop)]
    {
        crate::panel::hide(&window);
        crate::show_main_window(&app);
        if let Some(view) = view {
            let _ = app.emit_to("main", "window://view", view);
        }
    }
    #[cfg(mobile)]
    let _ = (app, window, view);
}
