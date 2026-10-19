use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// User preferences. Fields the core needs are typed; anything the UI wants to
/// persist on its own (mixer levels, collapsed panels…) lands in `extra`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    // Timer
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub long_break_every: u32,
    pub auto_start_breaks: bool,
    pub auto_start_focus: bool,

    // Goals
    pub daily_focus_goal_minutes: u32,
    pub distraction_budget_minutes: u32,

    // Tracking
    pub tracking_enabled: bool,
    pub idle_threshold_seconds: u32,
    pub store_window_titles: bool,
    pub track_browser_urls: bool,
    pub excluded_apps: Vec<String>,
    pub retention_days: u32,

    // Nudges & notifications
    pub notifications_enabled: bool,
    pub nudges_enabled: bool,
    pub focus_guard: bool,
    pub nudge_distraction_minutes: u32,
    pub nudge_break_minutes: u32,

    // Desktop
    pub show_timer_in_tray: bool,
    pub hide_dock_icon: bool,
    pub global_shortcut: String,

    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            long_break_every: 4,
            auto_start_breaks: true,
            auto_start_focus: false,
            daily_focus_goal_minutes: 240,
            distraction_budget_minutes: 60,
            tracking_enabled: true,
            idle_threshold_seconds: 180,
            store_window_titles: false,
            track_browser_urls: false,
            excluded_apps: Vec::new(),
            retention_days: 0,
            notifications_enabled: true,
            nudges_enabled: true,
            focus_guard: true,
            nudge_distraction_minutes: 15,
            nudge_break_minutes: 90,
            show_timer_in_tray: true,
            hide_dock_icon: false,
            global_shortcut: "CommandOrControl+Shift+Space".into(),
            extra: Map::new(),
        }
    }
}

impl Settings {
    /// Clamp values a hand-edited or imported settings blob could get wrong.
    pub fn sanitized(mut self) -> Self {
        self.focus_minutes = self.focus_minutes.clamp(1, 180);
        self.short_break_minutes = self.short_break_minutes.clamp(1, 60);
        self.long_break_minutes = self.long_break_minutes.clamp(1, 90);
        self.long_break_every = self.long_break_every.clamp(1, 12);
        self.idle_threshold_seconds = self.idle_threshold_seconds.clamp(30, 3600);
        self.nudge_distraction_minutes = self.nudge_distraction_minutes.clamp(1, 240);
        self.nudge_break_minutes = self.nudge_break_minutes.clamp(15, 480);
        self.excluded_apps.iter_mut().for_each(|a| *a = a.to_lowercase());
        self.excluded_apps.sort();
        self.excluded_apps.dedup();
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Focus,
    ShortBreak,
    LongBreak,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Phase::Focus => "focus",
            Phase::ShortBreak => "short_break",
            Phase::LongBreak => "long_break",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Phase::Focus => "Focus",
            Phase::ShortBreak => "Short break",
            Phase::LongBreak => "Long break",
        }
    }

    pub fn minutes(self, s: &Settings) -> u32 {
        match self {
            Phase::Focus => s.focus_minutes,
            Phase::ShortBreak => s.short_break_minutes,
            Phase::LongBreak => s.long_break_minutes,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub phase: Phase,
    pub status: TimerStatus,
    pub duration_ms: i64,
    pub remaining_ms: i64,
    pub ends_at: Option<i64>,
    pub started_at: Option<i64>,
    pub cycle: u32,
    pub cycle_length: u32,
    pub intention: String,
    pub task_id: Option<i64>,
    pub interruptions: u32,
    pub now: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySpan {
    pub id: i64,
    pub start: i64,
    pub end: i64,
    pub app_id: String,
    pub app_name: String,
    pub domain: Option<String>,
    pub title: Option<String>,
    pub category: String,
    pub productivity: i8,
    pub source: String,
}

/// Time totals for one bucket (an hour, a day…) split by productivity.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketTotals {
    pub from: i64,
    pub to: i64,
    pub productive_ms: i64,
    pub neutral_ms: i64,
    pub distracting_ms: i64,
    pub switches: i64,
}

/// Time spent on an app or a website within a range. Websites are their own
/// entity (`kind = "site"`) so "YouTube in Chrome" doesn't hide inside Chrome.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTotal {
    pub key: String,
    pub kind: String,
    pub name: String,
    pub app_name: String,
    pub category: String,
    pub productivity: i8,
    pub ms: i64,
    pub visits: i64,
    pub last_seen: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: i64,
    pub kind: Phase,
    pub start: i64,
    pub end: i64,
    pub planned_ms: i64,
    pub actual_ms: i64,
    pub completed: bool,
    pub intention: String,
    pub task_id: Option<i64>,
    pub interruptions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub estimate: u32,
    pub done: bool,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub pomodoros: u32,
    pub focus_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    /// `app:<app id>` or `site:<domain>`
    pub key: String,
    pub category: String,
    pub productivity: i8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerStatus {
    pub supported: bool,
    pub enabled: bool,
    pub paused_until: Option<i64>,
    pub platform: String,
    pub needs_permission: bool,
    pub current: Option<CurrentActivity>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CurrentActivity {
    pub app_id: String,
    pub app_name: String,
    pub domain: Option<String>,
    pub category: String,
    pub productivity: i8,
    pub since: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_keep_ui_fields_and_fill_defaults() {
        let json = r#"{"focusMinutes": 50, "theme": "light", "sound": {"master": 0.4}}"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.focus_minutes, 50);
        assert_eq!(s.short_break_minutes, 5, "missing fields take defaults");
        assert_eq!(s.extra.get("theme").and_then(|v| v.as_str()), Some("light"));

        let back = serde_json::to_value(&s).unwrap();
        assert_eq!(back["theme"], "light");
        assert_eq!(back["sound"]["master"], 0.4);
        assert_eq!(back["focusMinutes"], 50);
        assert!(back.get("extra").is_none(), "extra is flattened, not nested");
    }

    #[test]
    fn sanitize_clamps_and_normalises() {
        let s = Settings {
            focus_minutes: 0,
            excluded_apps: vec!["Slack".into(), "slack".into()],
            ..Default::default()
        }
        .sanitized();
        assert_eq!(s.focus_minutes, 1);
        assert_eq!(s.excluded_apps, vec!["slack".to_string()]);
    }
}
