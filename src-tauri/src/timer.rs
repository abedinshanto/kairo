//! The focus timer. It lives in the core (not the webview) so the countdown,
//! tray title and notifications keep working while the window is hidden.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::{
    models::{Phase, Settings, TimerSnapshot, TimerStatus},
    notify, now_ms, AppState,
};

/// Focus sessions shorter than this are discarded instead of recorded.
const MIN_RECORDED_MS: i64 = 60_000;
const MAX_DURATION_MS: i64 = 4 * 60 * 60 * 1000;

pub struct Timer {
    phase: Phase,
    status: TimerStatus,
    duration_ms: i64,
    /// Valid while idle or paused.
    remaining_ms: i64,
    /// Valid while running.
    ends_at: i64,
    started_at: Option<i64>,
    cycle: u32,
    intention: String,
    task_id: Option<i64>,
    interruptions: u32,
    last_tray_second: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Completed {
    pub phase: Phase,
    pub next: Phase,
    pub auto_started: bool,
    pub actual_ms: i64,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Start,
    Pause,
    Resume,
    Toggle,
    Skip,
    Stop,
}

struct SessionRecord {
    phase: Phase,
    start: i64,
    end: i64,
    planned_ms: i64,
    actual_ms: i64,
    completed: bool,
    intention: String,
    task_id: Option<i64>,
    interruptions: u32,
}

#[derive(Default)]
struct Effects {
    record: Option<SessionRecord>,
    completed: Option<Completed>,
}

impl Timer {
    pub fn new(settings: &Settings) -> Self {
        let duration = minutes_ms(Phase::Focus.minutes(settings));
        Self {
            phase: Phase::Focus,
            status: TimerStatus::Idle,
            duration_ms: duration,
            remaining_ms: duration,
            ends_at: 0,
            started_at: None,
            cycle: 0,
            intention: String::new(),
            task_id: None,
            interruptions: 0,
            last_tray_second: -1,
        }
    }

    fn remaining(&self, now: i64) -> i64 {
        match self.status {
            TimerStatus::Running => (self.ends_at - now).max(0),
            _ => self.remaining_ms,
        }
    }

    pub fn snapshot(&self, now: i64, settings: &Settings) -> TimerSnapshot {
        TimerSnapshot {
            phase: self.phase,
            status: self.status,
            duration_ms: self.duration_ms,
            remaining_ms: self.remaining(now),
            ends_at: (self.status == TimerStatus::Running).then_some(self.ends_at),
            started_at: self.started_at,
            cycle: self.cycle,
            cycle_length: settings.long_break_every,
            intention: self.intention.clone(),
            task_id: self.task_id,
            interruptions: self.interruptions,
            now,
        }
    }

    pub fn is_focus_running(&self) -> bool {
        self.phase == Phase::Focus && self.status == TimerStatus::Running
    }

    pub fn is_break_running(&self) -> bool {
        self.phase != Phase::Focus && self.status == TimerStatus::Running
    }

    /// Enter `phase` fresh (idle, full duration).
    fn enter(&mut self, phase: Phase, settings: &Settings) {
        self.phase = phase;
        self.status = TimerStatus::Idle;
        self.duration_ms = minutes_ms(phase.minutes(settings));
        self.remaining_ms = self.duration_ms;
        self.started_at = None;
        self.interruptions = 0;
    }

    fn run(&mut self, now: i64) {
        if self.started_at.is_none() {
            self.started_at = Some(now);
        }
        self.ends_at = now + self.remaining_ms;
        self.status = TimerStatus::Running;
    }

    /// Record whatever part of the current phase was used, if worth keeping.
    fn abandon(&mut self, now: i64) -> Option<SessionRecord> {
        let start = self.started_at?;
        let actual = self.duration_ms - self.remaining(now);
        (self.phase == Phase::Focus && actual >= MIN_RECORDED_MS).then(|| SessionRecord {
            phase: self.phase,
            start,
            end: now,
            planned_ms: self.duration_ms,
            actual_ms: actual,
            completed: false,
            intention: self.intention.clone(),
            task_id: self.task_id,
            interruptions: self.interruptions,
        })
    }

    fn complete(&mut self, now: i64, settings: &Settings) -> Effects {
        let finished = self.phase;
        let start = self.started_at.unwrap_or(self.ends_at - self.duration_ms);
        let record = SessionRecord {
            phase: finished,
            start,
            end: self.ends_at,
            planned_ms: self.duration_ms,
            actual_ms: self.duration_ms,
            completed: true,
            intention: self.intention.clone(),
            task_id: self.task_id,
            interruptions: self.interruptions,
        };
        let (next, auto) = match finished {
            Phase::Focus => {
                self.cycle += 1;
                let next = if self.cycle >= settings.long_break_every {
                    Phase::LongBreak
                } else {
                    Phase::ShortBreak
                };
                (next, settings.auto_start_breaks)
            }
            Phase::LongBreak => {
                self.cycle = 0;
                (Phase::Focus, settings.auto_start_focus)
            }
            Phase::ShortBreak => (Phase::Focus, settings.auto_start_focus),
        };
        self.enter(next, settings);
        if auto {
            self.run(now);
        }
        Effects {
            completed: Some(Completed {
                phase: finished,
                next,
                auto_started: auto,
                actual_ms: record.actual_ms,
            }),
            record: Some(record),
        }
    }

    fn act(&mut self, action: Action, now: i64, settings: &Settings) -> Effects {
        let mut fx = Effects::default();
        match (action, self.status) {
            (Action::Start | Action::Toggle | Action::Resume, TimerStatus::Idle)
            | (Action::Start | Action::Toggle | Action::Resume, TimerStatus::Paused) => {
                self.run(now)
            }
            (Action::Pause | Action::Toggle, TimerStatus::Running) => {
                self.remaining_ms = self.remaining(now);
                self.status = TimerStatus::Paused;
            }
            (Action::Skip, _) => {
                fx.record = self.abandon(now);
                let next = match self.phase {
                    Phase::Focus => Phase::ShortBreak,
                    Phase::LongBreak => {
                        self.cycle = 0;
                        Phase::Focus
                    }
                    Phase::ShortBreak => Phase::Focus,
                };
                self.enter(next, settings);
            }
            (Action::Stop, _) => {
                fx.record = self.abandon(now);
                self.enter(self.phase, settings);
            }
            _ => {}
        }
        fx
    }

    fn set_phase(&mut self, phase: Phase, now: i64, settings: &Settings) -> Effects {
        let fx = Effects {
            record: self.abandon(now),
            ..Default::default()
        };
        if phase == Phase::Focus && self.phase == Phase::LongBreak {
            self.cycle = 0;
        }
        self.enter(phase, settings);
        fx
    }

    fn extend(&mut self, minutes: i64, now: i64) {
        let requested = minutes.clamp(-60, 60) * 60_000;
        let remaining = self.remaining(now);
        let delta = requested
            .max(-(remaining - 1000))
            .min(MAX_DURATION_MS - self.duration_ms);
        self.duration_ms += delta;
        match self.status {
            TimerStatus::Running => self.ends_at += delta,
            _ => self.remaining_ms += delta,
        }
    }

    /// Adopt new durations when the user edits settings and the timer is untouched.
    pub fn apply_settings(&mut self, settings: &Settings) {
        if self.status == TimerStatus::Idle && self.started_at.is_none() {
            self.enter(self.phase, settings);
        }
    }

    pub fn note_interruption(&mut self) -> bool {
        if self.is_focus_running() {
            self.interruptions += 1;
            true
        } else {
            false
        }
    }
}

fn minutes_ms(minutes: u32) -> i64 {
    minutes as i64 * 60_000
}

// ------------------------------------------------------------------------------------
// Glue between the pure state machine and the app (db, events, tray, notifications).

pub fn snapshot<R: Runtime>(app: &AppHandle<R>) -> TimerSnapshot {
    let state = app.state::<AppState>();
    let settings = state.settings.read();
    let snap = state.timer.lock().snapshot(now_ms(), &settings);
    snap
}

pub fn perform<R: Runtime>(app: &AppHandle<R>, action: Action) -> TimerSnapshot {
    mutate(app, |t, now, s| t.act(action, now, s))
}

pub fn set_phase<R: Runtime>(app: &AppHandle<R>, phase: Phase) -> TimerSnapshot {
    mutate(app, |t, now, s| t.set_phase(phase, now, s))
}

pub fn extend<R: Runtime>(app: &AppHandle<R>, minutes: i64) -> TimerSnapshot {
    mutate(app, |t, now, _| {
        t.extend(minutes, now);
        Effects::default()
    })
}

pub fn set_intention<R: Runtime>(
    app: &AppHandle<R>,
    intention: String,
    task_id: Option<i64>,
) -> TimerSnapshot {
    mutate(app, |t, _, _| {
        t.intention = intention.chars().take(200).collect();
        t.task_id = task_id;
        Effects::default()
    })
}

pub fn note_interruption<R: Runtime>(app: &AppHandle<R>) {
    let changed = app.state::<AppState>().timer.lock().note_interruption();
    if changed {
        broadcast(app, snapshot(app));
    }
}

pub fn settings_changed<R: Runtime>(app: &AppHandle<R>) {
    mutate(app, |t, _, s| {
        t.apply_settings(s);
        Effects::default()
    });
}

/// Called a few times a second from the core's ticker thread.
pub fn tick<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let now = now_ms();
    let due = {
        let t = state.timer.lock();
        t.status == TimerStatus::Running && now >= t.ends_at
    };
    if due {
        mutate(app, |t, now, s| t.complete(now, s));
        return;
    }
    // Refresh the tray countdown once per second.
    let snap = {
        let settings = state.settings.read();
        let mut t = state.timer.lock();
        let second = t.remaining(now) / 1000;
        if t.status != TimerStatus::Running || second == t.last_tray_second {
            return;
        }
        t.last_tray_second = second;
        t.snapshot(now, &settings)
    };
    #[cfg(desktop)]
    crate::tray::update_timer(app, &snap);
    #[cfg(mobile)]
    let _ = snap;
}

fn mutate<R: Runtime>(
    app: &AppHandle<R>,
    f: impl FnOnce(&mut Timer, i64, &Settings) -> Effects,
) -> TimerSnapshot {
    let state = app.state::<AppState>();
    let now = now_ms();
    let (fx, snap) = {
        let settings = state.settings.read();
        let mut t = state.timer.lock();
        let fx = f(&mut t, now, &settings);
        t.last_tray_second = -1;
        (fx, t.snapshot(now, &settings))
    };

    if let Some(r) = &fx.record {
        if let Err(err) = state.db.insert_session(
            r.phase,
            r.start,
            r.end,
            r.planned_ms,
            r.actual_ms,
            r.completed,
            &r.intention,
            r.task_id,
            r.interruptions,
        ) {
            eprintln!("kairo: failed to record session: {err}");
        }
    }
    if let Some(done) = fx.completed {
        announce_completion(app, &done, &snap);
        let _ = app.emit("timer://completed", done);
    }
    broadcast(app, snap.clone());
    snap
}

fn broadcast<R: Runtime>(app: &AppHandle<R>, snap: TimerSnapshot) {
    #[cfg(desktop)]
    crate::tray::update_timer(app, &snap);
    #[cfg(mobile)]
    schedule_mobile_alert(app, &snap);
    let _ = app.emit("timer://state", snap);
}

fn announce_completion<R: Runtime>(app: &AppHandle<R>, done: &Completed, snap: &TimerSnapshot) {
    let state = app.state::<AppState>();
    let settings = state.settings.read().clone();
    let next_minutes = snap.duration_ms / 60_000;
    let (title, body) = match done.phase {
        Phase::Focus => (
            "Focus block complete".to_string(),
            match (done.next, done.auto_started) {
                (Phase::LongBreak, true) => format!("Nice work. Your {next_minutes}-minute long break has started."),
                (_, true) => format!("Nice work. Your {next_minutes}-minute break has started."),
                (Phase::LongBreak, false) => format!("Nice work. Take a {next_minutes}-minute long break."),
                _ => format!("Nice work. Take a {next_minutes}-minute break."),
            },
        ),
        _ => (
            "Break's over".to_string(),
            if done.auto_started {
                format!("Your next {next_minutes}-minute focus block has started.")
            } else {
                "Ready for the next focus block?".to_string()
            },
        ),
    };
    // On mobile the alert was scheduled ahead of time so it fires even when suspended.
    if cfg!(desktop) {
        notify(app, &title, &body);
    }

    if done.phase == Phase::Focus && settings.daily_focus_goal_minutes > 0 {
        let goal = minutes_ms(settings.daily_focus_goal_minutes);
        let today = crate::start_of_today();
        if let Ok(total) = state.db.focus_ms_since(today) {
            if total >= goal && total - done.actual_ms < goal {
                notify(
                    app,
                    "Daily focus goal reached",
                    &format!(
                        "{} of deep work today. Anything more is a bonus.",
                        crate::fmt_duration(total)
                    ),
                );
            }
        }
    }
}

#[cfg(mobile)]
const MOBILE_ALERT_ID: i32 = 7_001;

/// Mobile apps get suspended in the background, so the phase-end alert is
/// handed to the OS scheduler instead of being fired by our ticker.
#[cfg(mobile)]
fn schedule_mobile_alert<R: Runtime>(app: &AppHandle<R>, snap: &TimerSnapshot) {
    use tauri_plugin_notification::{NotificationExt, Schedule};
    let n = app.notification();
    let _ = n.cancel(vec![MOBILE_ALERT_ID]);
    let enabled = app.state::<AppState>().settings.read().notifications_enabled;
    let (Some(ends_at), true) = (snap.ends_at, enabled) else {
        return;
    };
    let Ok(date) = time::OffsetDateTime::from_unix_timestamp_nanos(ends_at as i128 * 1_000_000)
    else {
        return;
    };
    let (title, body) = match snap.phase {
        Phase::Focus => ("Focus block complete", "Nice work — time for a break."),
        _ => ("Break's over", "Ready for the next focus block?"),
    };
    let _ = n
        .builder()
        .id(MOBILE_ALERT_ID)
        .title(title)
        .body(body)
        .schedule(Schedule::At {
            date,
            repeating: false,
            allow_while_idle: true,
        })
        .show();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> Settings {
        Settings {
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            long_break_every: 2,
            auto_start_breaks: true,
            auto_start_focus: false,
            ..Default::default()
        }
    }

    #[test]
    fn runs_a_full_cycle() {
        let s = settings();
        let mut t = Timer::new(&s);
        t.act(Action::Start, 0, &s);
        assert_eq!(t.snapshot(1000, &s).remaining_ms, 25 * 60_000 - 1000);

        // Pause for a minute: the end moves out by the paused time.
        t.act(Action::Pause, 60_000, &s);
        t.act(Action::Resume, 120_000, &s);
        assert_eq!(t.ends_at, 120_000 + 24 * 60_000);

        let fx = t.complete(t.ends_at, &s);
        let rec = fx.record.unwrap();
        assert!(rec.completed);
        assert_eq!(rec.actual_ms, 25 * 60_000);
        assert_eq!(t.phase, Phase::ShortBreak);
        assert_eq!(t.status, TimerStatus::Running, "breaks auto-start");

        t.complete(t.ends_at, &s);
        assert_eq!((t.phase, t.status), (Phase::Focus, TimerStatus::Idle));

        t.act(Action::Start, 0, &s);
        t.complete(t.ends_at, &s);
        assert_eq!(t.phase, Phase::LongBreak, "second focus earns the long break");
        t.complete(t.ends_at, &s);
        assert_eq!((t.phase, t.cycle), (Phase::Focus, 0));
    }

    #[test]
    fn short_abandoned_sessions_are_not_recorded() {
        let s = settings();
        let mut t = Timer::new(&s);
        t.act(Action::Start, 0, &s);
        assert!(t.act(Action::Stop, 30_000, &s).record.is_none());
        t.act(Action::Start, 0, &s);
        let rec = t.act(Action::Skip, 10 * 60_000, &s).record.unwrap();
        assert!(!rec.completed);
        assert_eq!(rec.actual_ms, 10 * 60_000);
        assert_eq!(t.phase, Phase::ShortBreak);
    }

    #[test]
    fn extend_adds_time_and_never_goes_negative() {
        let s = settings();
        let mut t = Timer::new(&s);
        t.act(Action::Start, 0, &s);
        t.extend(5, 0);
        assert_eq!(t.ends_at, 30 * 60_000);
        t.extend(-60, 0);
        assert!(t.remaining(0) >= 1000);
    }
}
