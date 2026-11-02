//! Once-a-day jobs: the end-of-day summary at the time the user picks, and
//! trimming data older than the retention period.
// Phones get the summary from the OS scheduler, so the desktop jobs go unused there.
#![cfg_attr(mobile, allow(dead_code, unused_imports))]

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::{fmt_duration, now_ms, start_of_today, AppState};

/// Days with less tracked time than this get no summary.
const MIN_ACTIVE_MS: i64 = 30 * 60_000;
/// Distractions shorter than this aren't worth naming.
const MIN_LEAK_MS: i64 = 5 * 60_000;
const SUMMARY_SENT: &str = "summary_sent_day";
const BUDGET_SENT: &str = "budget_sent_day";
const PURGED: &str = "purged_day";
pub const SUMMARY_TITLE: &str = "Your day in Kairo";
#[cfg(mobile)]
const SUMMARY_ID: i32 = 7_002;

/// Called from the ticker; does real work at most once a minute.
#[cfg(desktop)]
pub fn tick<R: Runtime>(app: &AppHandle<R>, last_run: &mut i64) {
    let now = now_ms();
    if now - *last_run < 60_000 {
        return;
    }
    *last_run = now;
    let today = start_of_today();
    purge_old_data(app, today);
    refresh_tray_today(app, today, now);
    warn_when_budget_used(app, today, now);
    send_summary_if_due(app, today, now);
}

#[cfg(desktop)]
fn refresh_tray_today<R: Runtime>(app: &AppHandle<R>, today: i64, now: i64) {
    let state = app.state::<AppState>();
    let Some(t) = state.db.bucket_totals(&[(today, now)]).ok().and_then(|t| t.into_iter().next()) else {
        return;
    };
    let active = t.productive_ms + t.neutral_ms + t.distracting_ms;
    let focus = state.db.focus_ms_since(today).unwrap_or(0);
    let text = if active < 60_000 {
        "Today · nothing tracked yet".to_string()
    } else {
        let mut text = format!("Today {} · {}% productive", fmt_duration(active), t.productive_ms * 100 / active);
        if focus >= 60_000 {
            text.push_str(&format!(" · focus {}", fmt_duration(focus)));
        }
        text
    };
    crate::tray::update_today(app, &text);
}

/// One gentle heads-up the moment today's distracting time reaches the budget.
#[cfg(desktop)]
fn warn_when_budget_used<R: Runtime>(app: &AppHandle<R>, today: i64, now: i64) {
    let state = app.state::<AppState>();
    let (budget, nudges) = {
        let s = state.settings.read();
        (s.distraction_budget_minutes as i64 * 60_000, s.nudges_enabled)
    };
    let key = today.to_string();
    if budget == 0 || !nudges || state.db.kv_get(BUDGET_SENT).ok().flatten().as_deref() == Some(key.as_str()) {
        return;
    }
    let Some(t) = state.db.bucket_totals(&[(today, now)]).ok().and_then(|t| t.into_iter().next()) else {
        return;
    };
    if t.distracting_ms < budget {
        return;
    }
    let _ = state.db.kv_set(BUDGET_SENT, &key);
    crate::notify(
        app,
        "Distraction budget used",
        &format!(
            "{} on distracting apps and sites today. The rest of the day is yours to protect.",
            fmt_duration(t.distracting_ms)
        ),
    );
}

#[cfg(desktop)]
fn purge_old_data<R: Runtime>(app: &AppHandle<R>, today: i64) {
    let state = app.state::<AppState>();
    let days = state.settings.read().retention_days;
    let key = today.to_string();
    if days == 0 || state.db.kv_get(PURGED).ok().flatten().as_deref() == Some(key.as_str()) {
        return;
    }
    if state.db.purge_before(now_ms() - days as i64 * 86_400_000).is_ok() {
        let _ = state.db.kv_set(PURGED, &key);
    }
}

/// After the chosen time (or on waking, if the Mac slept through it), once a day.
#[cfg(desktop)]
fn send_summary_if_due<R: Runtime>(app: &AppHandle<R>, today: i64, now: i64) {
    let state = app.state::<AppState>();
    let (enabled, at) = {
        let s = state.settings.read();
        (s.daily_summary, s.daily_summary_minutes)
    };
    let key = today.to_string();
    if !enabled
        || now < today + at as i64 * 60_000
        || state.db.kv_get(SUMMARY_SENT).ok().flatten().as_deref() == Some(key.as_str())
    {
        return;
    }
    // A quiet day might still get busy this evening, so check again later.
    let Some(text) = headline(&state, today, now) else {
        return;
    };
    let _ = state.db.kv_set(SUMMARY_SENT, &key);
    crate::notify(app, SUMMARY_TITLE, &text);
}

/// "6h 12m on screen, 74% productive. Focus 2h 30m of 4h. Biggest distraction: YouTube (38 min)."
pub fn headline(state: &AppState, from: i64, to: i64) -> Option<String> {
    let t = state.db.bucket_totals(&[(from, to)]).ok()?.into_iter().next()?;
    let active = t.productive_ms + t.neutral_ms + t.distracting_ms;
    if active < MIN_ACTIVE_MS {
        return None;
    }
    let mut parts = vec![format!(
        "{} on screen, {}% productive.",
        fmt_duration(active),
        t.productive_ms * 100 / active
    )];
    let focus = state.db.focus_ms_since(from).unwrap_or(0);
    let goal = state.settings.read().daily_focus_goal_minutes as i64 * 60_000;
    if focus > 0 && goal > 0 {
        parts.push(format!("Focus {} of {}.", fmt_duration(focus), fmt_duration(goal)));
    } else if focus > 0 {
        parts.push(format!("Focus {}.", fmt_duration(focus)));
    }
    let leak = state
        .db
        .entity_totals(from, to)
        .ok()?
        .into_iter()
        .filter(|e| e.productivity < 0 && e.ms >= MIN_LEAK_MS)
        .max_by_key(|e| e.ms);
    if let Some(e) = leak {
        parts.push(format!("Biggest distraction: {} ({}).", e.name, fmt_duration(e.ms)));
    }
    Some(parts.join(" "))
}

/// Phones suspend Kairo in the background, so the OS delivers the reminder.
#[cfg(mobile)]
pub fn schedule_mobile<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_notification::{NotificationExt, Schedule, ScheduleInterval};
    let n = app.notification();
    let _ = n.cancel(vec![SUMMARY_ID]);
    let s = app.state::<AppState>().settings.read().clone();
    if !s.daily_summary || !s.notifications_enabled {
        return;
    }
    let _ = n
        .builder()
        .id(SUMMARY_ID)
        .title(SUMMARY_TITLE)
        .body("See what you got done today and where the time went.")
        .schedule(Schedule::Interval {
            interval: ScheduleInterval {
                hour: Some((s.daily_summary_minutes / 60) as u8),
                minute: Some((s.daily_summary_minutes % 60) as u8),
                second: Some(0),
                ..Default::default()
            },
            allow_while_idle: true,
        })
        .show();
}

/// A tap on any of our notifications brings Kairo up; on the summary, it opens it.
pub fn on_notification_tap<R: Runtime>(app: &AppHandle<R>, title: Option<&str>) {
    #[cfg(desktop)]
    crate::show_main_window(app);
    if title == Some(SUMMARY_TITLE) {
        let _ = app.emit("summary://open", ());
    }
}
