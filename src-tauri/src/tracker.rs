//! Desktop activity tracker: samples the foreground app once a second and
//! writes merged spans to the local database. Idle time is never recorded.

use std::{
    path::Path,
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::{
    categories,
    db::{NewSpan, MAX_SPAN_MS},
    models::{CurrentActivity, Settings},
    notify, now_ms, sites, timer, AppState,
};

const POLL: Duration = Duration::from_secs(1);
/// Two samples of the same app further apart than this start a new span
/// (the machine slept, or the tracker was paused).
const MERGE_GAP_MS: i64 = 15_000;
const PERSIST_EVERY_MS: i64 = 10_000;

struct OpenSpan {
    id: i64,
    key: (String, Option<String>, Option<String>),
    start: i64,
    last_seen: i64,
    persisted_end: i64,
}

#[derive(Default)]
struct Nudges {
    distracting_since: Option<i64>,
    distracting_name: String,
    active_since: Option<i64>,
    last_focus_guard: i64,
    last_distraction: i64,
    last_break: i64,
}

#[derive(Default)]
struct UrlCache {
    title: String,
    domain: Option<String>,
    at: Option<Instant>,
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    #[cfg(target_os = "macos")]
    macos::keep_awake();

    thread::Builder::new()
        .name("kairo-tracker".into())
        .spawn(move || {
            let mut open: Option<OpenSpan> = None;
            let mut nudges = Nudges::default();
            let mut urls = UrlCache::default();
            loop {
                thread::sleep(POLL);
                sample(&app, &mut open, &mut nudges, &mut urls);
            }
        })
        .expect("failed to start tracker thread");
}

fn sample<R: Runtime>(
    app: &AppHandle<R>,
    open: &mut Option<OpenSpan>,
    nudges: &mut Nudges,
    urls: &mut UrlCache,
) {
    let state = app.state::<AppState>();
    let settings = state.settings.read().clone();
    let now = now_ms();

    let paused = state
        .tracker
        .lock()
        .paused_until
        .is_some_and(|until| until > now);
    if !settings.tracking_enabled || paused {
        close(app, open, None);
        nudges.reset_streaks();
        return;
    }

    let idle_ms = user_idle::UserIdle::get_time()
        .map(|t| t.as_milliseconds() as i64)
        .unwrap_or(0);
    if idle_ms >= settings.idle_threshold_seconds as i64 * 1000 {
        close(app, open, Some(now - idle_ms));
        nudges.distracting_since = None;
        if idle_ms >= 5 * 60_000 {
            nudges.active_since = None;
        }
        return;
    }

    let Ok(win) = active_win_pos_rs::get_active_window() else {
        return;
    };
    let app_name = clean_name(&win.app_name, &win.process_path);
    let app_id = app_id_for(&app_name, &win.process_path);
    if app_id.is_empty() {
        return;
    }
    if settings.excluded_apps.contains(&app_id) {
        close(app, open, None);
        return;
    }

    let domain = if categories::is_browser(&app_id, &app_name) {
        detect_domain(&settings, &app_name, &win.title, urls)
    } else {
        None
    };
    let title = (settings.store_window_titles && !win.title.trim().is_empty())
        .then(|| win.title.chars().take(300).collect::<String>());
    let key = (app_id.clone(), domain.clone(), title.clone());

    if let Some(span) = open.as_mut() {
        let fresh = now - span.last_seen <= MERGE_GAP_MS;
        if span.key == key && fresh && now - span.start < MAX_SPAN_MS {
            span.last_seen = now;
            if now - span.persisted_end >= PERSIST_EVERY_MS {
                let _ = state.db.update_span_end(span.id, now);
                span.persisted_end = now;
            }
            nudges.evaluate(app, &settings, now);
            return;
        }
    }

    // Switching apps: the new span picks up exactly where the old one ended.
    let (start, continuation) = match open.as_ref() {
        Some(prev) if now - prev.last_seen <= MERGE_GAP_MS => (prev.last_seen, prev.key == key),
        _ => (now, false),
    };
    close(app, open, None);

    let span = NewSpan {
        start,
        end: now,
        app_id: &app_id,
        app_name: &app_name,
        domain: domain.as_deref(),
        title: title.as_deref(),
        source: "desktop",
        continuation,
    };
    let Ok(id) = state.db.insert_span(&span) else {
        return;
    };
    *open = Some(OpenSpan {
        id,
        key,
        start,
        last_seen: now,
        persisted_end: now,
    });

    if !continuation {
        let (category, productivity) = state.db.resolve(&app_id, &app_name, domain.as_deref());
        let current = CurrentActivity {
            app_id,
            app_name: app_name.clone(),
            domain: domain.clone(),
            category,
            productivity,
            since: start,
        };
        if productivity < 0 {
            timer::note_interruption(app);
            if nudges.distracting_since.is_none() {
                nudges.distracting_since = Some(start);
            }
            nudges.distracting_name = domain.unwrap_or(app_name);
        } else {
            nudges.distracting_since = None;
        }
        state.tracker.lock().current = Some(current.clone());
        let _ = app.emit("tracker://current", Some(current));
    }
    nudges.evaluate(app, &settings, now);
}

fn close<R: Runtime>(app: &AppHandle<R>, open: &mut Option<OpenSpan>, at: Option<i64>) {
    let Some(span) = open.take() else { return };
    let state = app.state::<AppState>();
    let end = at.unwrap_or(span.last_seen).clamp(span.start, span.last_seen);
    // Sub-second flickers (alt-tab passing through an app) aren't real visits.
    if end - span.start < 1000 {
        let _ = state.db.delete_span(span.id);
    } else {
        let _ = state.db.update_span_end(span.id, end);
    }
    if state.tracker.lock().current.take().is_some() {
        let _ = app.emit("tracker://current", None::<CurrentActivity>);
    }
}

/// A stable identifier: the `.app` bundle on macOS, the executable elsewhere.
fn app_id_for(app_name: &str, process_path: &Path) -> String {
    #[cfg(target_os = "macos")]
    for comp in process_path.components() {
        let s = comp.as_os_str().to_string_lossy();
        if let Some(bundle) = s.strip_suffix(".app") {
            return bundle.to_lowercase();
        }
    }
    process_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| app_name.trim().to_lowercase())
}

fn clean_name(app_name: &str, process_path: &Path) -> String {
    let name = app_name.trim();
    if !name.is_empty() {
        return name.to_string();
    }
    process_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn detect_domain(
    settings: &Settings,
    app_name: &str,
    title: &str,
    cache: &mut UrlCache,
) -> Option<String> {
    #[cfg(target_os = "macos")]
    if settings.track_browser_urls {
        let stale = cache.at.is_none_or(|t| t.elapsed() > Duration::from_secs(3));
        if cache.title != title || stale {
            cache.title = title.to_string();
            cache.at = Some(Instant::now());
            cache.domain = macos::browser_url(app_name)
                .and_then(|u| sites::domain_from_url(&u))
                .or_else(|| sites::domain_from_title(title));
        }
        return cache.domain.clone();
    }
    let _ = (settings, app_name, &cache.at, &cache.domain);
    if cache.title != title {
        cache.title = title.to_string();
        cache.domain = sites::domain_from_title(title);
    }
    cache.domain.clone()
}

impl Nudges {
    fn reset_streaks(&mut self) {
        self.distracting_since = None;
        self.active_since = None;
    }

    fn evaluate<R: Runtime>(&mut self, app: &AppHandle<R>, s: &Settings, now: i64) {
        let state = app.state::<AppState>();
        let (focus_running, break_running, remaining_ms, intention) = {
            let t = state.timer.lock();
            let snap = t.snapshot(now, s);
            (
                t.is_focus_running(),
                t.is_break_running(),
                snap.remaining_ms,
                snap.intention,
            )
        };
        if break_running {
            self.active_since = None;
        } else if self.active_since.is_none() {
            self.active_since = Some(now);
        }

        let distracted_for = self.distracting_since.map_or(0, |t| now - t);

        if focus_running && s.focus_guard && distracted_for >= 20_000
            && now - self.last_focus_guard >= 3 * 60_000
        {
            self.last_focus_guard = now;
            let left = (remaining_ms + 59_999) / 60_000;
            let about = if intention.trim().is_empty() {
                String::new()
            } else {
                format!(" on “{}”", intention.trim())
            };
            notify(
                app,
                "Still in a focus block",
                &format!(
                    "{left} min left{about}. {} can wait until your break.",
                    self.distracting_name
                ),
            );
        }

        if !s.nudges_enabled || focus_running {
            return;
        }
        if distracted_for >= s.nudge_distraction_minutes as i64 * 60_000
            && now - self.last_distraction >= 20 * 60_000
        {
            self.last_distraction = now;
            notify(
                app,
                &format!(
                    "{} on {}",
                    crate::fmt_duration(distracted_for),
                    self.distracting_name
                ),
                "Start a focus block to get back to what matters?",
            );
        }
        let active_for = self.active_since.map_or(0, |t| now - t);
        if active_for >= s.nudge_break_minutes as i64 * 60_000
            && now - self.last_break >= 45 * 60_000
        {
            self.last_break = now;
            notify(
                app,
                "Time for a breather",
                &format!(
                    "You've been at it for {} without a break. Five minutes away from the screen will sharpen the next hour.",
                    crate::fmt_duration(active_for)
                ),
            );
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::{
        process::{Command, Stdio},
        time::{Duration, Instant},
    };

    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

    /// Opt out of App Nap so sampling stays at 1 Hz while the window is hidden.
    pub fn keep_awake() {
        let info = NSProcessInfo::processInfo();
        let reason = NSString::from_str("Tracking focus time");
        let token = info.beginActivityWithOptions_reason(
            NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
            &reason,
        );
        // The activity lasts as long as the token lives: for the whole process.
        std::mem::forget(token);
    }

    /// Front tab URL via AppleScript (asks for Automation permission once per browser).
    pub fn browser_url(app_name: &str) -> Option<String> {
        let script = match app_name {
            "Safari" | "Safari Technology Preview" | "Orion" => {
                format!("tell application \"{app_name}\" to get URL of front document")
            }
            "Google Chrome" | "Google Chrome Canary" | "Brave Browser" | "Microsoft Edge"
            | "Arc" | "Vivaldi" | "Chromium" | "Opera" | "Dia" => format!(
                "tell application \"{app_name}\" to get URL of active tab of front window"
            ),
            _ => return None,
        };
        let mut child = Command::new("osascript")
            .args(["-e", &script])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let deadline = Instant::now() + Duration::from_millis(1500);
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => break,
                Ok(Some(_)) | Err(_) => return None,
                Ok(None) if Instant::now() > deadline => {
                    let _ = child.kill();
                    return None;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            }
        }
        let out = child.wait_with_output().ok()?;
        let url = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (!url.is_empty()).then_some(url)
    }
}
