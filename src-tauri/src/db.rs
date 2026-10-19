//! On-device storage. A single SQLite file in the app data directory; nothing
//! here ever touches the network.

use std::{
    collections::HashMap,
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    categories,
    models::{
        ActivitySpan, BucketTotals, EntityTotal, FocusSession, Phase, Rule, Settings, Task,
    },
};

/// Spans are split so none is longer than this; range queries rely on it to
/// stay index-bound (`start_ts >= from - MAX_SPAN_MS`).
pub const MAX_SPAN_MS: i64 = 60 * 60 * 1000;

const SCHEMA_VERSION: i32 = 1;

pub type DbResult<T> = Result<T, String>;

fn e(err: impl std::fmt::Display) -> String {
    err.to_string()
}

pub struct NewSpan<'a> {
    pub start: i64,
    pub end: i64,
    pub app_id: &'a str,
    pub app_name: &'a str,
    pub domain: Option<&'a str>,
    pub title: Option<&'a str>,
    pub source: &'a str,
    pub continuation: bool,
}

pub struct Db {
    conn: Mutex<Connection>,
    rules: Mutex<HashMap<String, (String, i8)>>,
}

impl Db {
    pub fn open(path: &Path) -> DbResult<Self> {
        let conn = Connection::open(path).map_err(e)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> DbResult<Self> {
        Self::init(Connection::open_in_memory().map_err(e)?)
    }

    fn init(conn: Connection) -> DbResult<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(e)?;
        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(e)?;
        if version < 1 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS activity (
                    id INTEGER PRIMARY KEY,
                    start_ts INTEGER NOT NULL,
                    end_ts INTEGER NOT NULL,
                    app_id TEXT NOT NULL,
                    app_name TEXT NOT NULL,
                    domain TEXT,
                    title TEXT,
                    category TEXT NOT NULL,
                    productivity INTEGER NOT NULL,
                    source TEXT NOT NULL DEFAULT 'desktop',
                    cont INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE INDEX IF NOT EXISTS idx_activity_start ON activity(start_ts);
                 CREATE INDEX IF NOT EXISTS idx_activity_app ON activity(app_id);
                 CREATE INDEX IF NOT EXISTS idx_activity_domain ON activity(domain);

                 CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY,
                    kind TEXT NOT NULL,
                    start_ts INTEGER NOT NULL,
                    end_ts INTEGER NOT NULL,
                    planned_ms INTEGER NOT NULL,
                    actual_ms INTEGER NOT NULL,
                    completed INTEGER NOT NULL,
                    intention TEXT NOT NULL DEFAULT '',
                    task_id INTEGER,
                    interruptions INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_ts);

                 CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    estimate INTEGER NOT NULL DEFAULT 1,
                    done INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    completed_at INTEGER
                 );

                 CREATE TABLE IF NOT EXISTS rules (
                    key TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    productivity INTEGER NOT NULL
                 );

                 CREATE TABLE IF NOT EXISTS kv (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                 );",
            )
            .map_err(e)?;
        }
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(e)?;

        let db = Self {
            conn: Mutex::new(conn),
            rules: Mutex::new(HashMap::new()),
        };
        db.reload_rules()?;
        Ok(db)
    }

    // ---------------------------------------------------------------- kv/settings

    pub fn kv_get(&self, key: &str) -> DbResult<Option<String>> {
        self.conn
            .lock()
            .query_row("SELECT value FROM kv WHERE key = ?1", [key], |r| r.get(0))
            .optional()
            .map_err(e)
    }

    pub fn kv_set(&self, key: &str, value: &str) -> DbResult<()> {
        self.conn
            .lock()
            .execute(
                "INSERT INTO kv(key, value) VALUES(?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map(|_| ())
            .map_err(e)
    }

    pub fn load_settings(&self) -> Settings {
        self.kv_get("settings")
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str::<Settings>(&json).ok())
            .unwrap_or_default()
            .sanitized()
    }

    pub fn save_settings(&self, settings: &Settings) -> DbResult<()> {
        self.kv_set("settings", &serde_json::to_string(settings).map_err(e)?)
    }

    // ---------------------------------------------------------------- classification

    fn reload_rules(&self) -> DbResult<()> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT key, category, productivity FROM rules")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?))))
            .map_err(e)?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(e)?;
        *self.rules.lock() = rows;
        Ok(())
    }

    /// Category and productivity for an app (and optional website), honouring user rules.
    pub fn resolve(&self, app_id: &str, app_name: &str, domain: Option<&str>) -> (String, i8) {
        let rules = self.rules.lock();
        if let Some(domain) = domain {
            if let Some((c, p)) = rules.get(&format!("site:{domain}")) {
                return (c.clone(), *p);
            }
            if let Some(c) = categories::classify_domain(domain) {
                return (c.to_string(), categories::default_productivity(c));
            }
        }
        if let Some((c, p)) = rules.get(&format!("app:{app_id}")) {
            return (c.clone(), *p);
        }
        let c = categories::classify_app(app_id, app_name);
        (c.to_string(), categories::default_productivity(c))
    }

    pub fn list_rules(&self) -> DbResult<Vec<Rule>> {
        Ok(self
            .rules
            .lock()
            .iter()
            .map(|(key, (category, productivity))| Rule {
                key: key.clone(),
                category: category.clone(),
                productivity: *productivity,
            })
            .collect())
    }

    pub fn set_rule(&self, rule: &Rule) -> DbResult<()> {
        if !categories::is_valid_category(&rule.category) {
            return Err(format!("unknown category: {}", rule.category));
        }
        self.conn
            .lock()
            .execute(
                "INSERT INTO rules(key, category, productivity) VALUES(?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET category = excluded.category,
                                               productivity = excluded.productivity",
                params![rule.key, rule.category, rule.productivity.clamp(-1, 1)],
            )
            .map_err(e)?;
        self.reload_rules()?;
        self.reclassify(&rule.key)
    }

    pub fn delete_rule(&self, key: &str) -> DbResult<()> {
        self.conn
            .lock()
            .execute("DELETE FROM rules WHERE key = ?1", [key])
            .map_err(e)?;
        self.reload_rules()?;
        self.reclassify(key)
    }

    /// Re-apply classification to stored history touched by a rule change.
    fn reclassify(&self, key: &str) -> DbResult<()> {
        let (filter, value) = match key.split_once(':') {
            Some(("app", v)) => ("app_id = ?1 AND domain IS NULL", v),
            Some(("site", v)) => ("domain = ?1", v),
            _ => return Err(format!("bad rule key: {key}")),
        };
        let groups: Vec<(String, String, Option<String>)> = {
            let conn = self.conn.lock();
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT DISTINCT app_id, app_name, domain FROM activity WHERE {filter}"
                ))
                .map_err(e)?;
            let rows = stmt
                .query_map([value], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .map_err(e)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(e)?;
            rows
        };
        let mut conn = self.conn.lock();
        let tx = conn.transaction().map_err(e)?;
        for (app_id, app_name, domain) in groups {
            let (category, productivity) = self.resolve(&app_id, &app_name, domain.as_deref());
            tx.execute(
                "UPDATE activity SET category = ?1, productivity = ?2
                 WHERE app_id = ?3 AND app_name = ?4 AND domain IS ?5",
                params![category, productivity, app_id, app_name, domain],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)
    }

    // ---------------------------------------------------------------- activity

    pub fn insert_span(&self, span: &NewSpan) -> DbResult<i64> {
        let (category, productivity) = self.resolve(span.app_id, span.app_name, span.domain);
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO activity(start_ts, end_ts, app_id, app_name, domain, title, category,
                                  productivity, source, cont)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                span.start,
                span.end,
                span.app_id,
                span.app_name,
                span.domain,
                span.title,
                category,
                productivity,
                span.source,
                span.continuation as i64
            ],
        )
        .map_err(e)?;
        Ok(conn.last_insert_rowid())
    }

    /// Insert a span of any length, splitting it into `MAX_SPAN_MS` pieces.
    pub fn insert_long_span(&self, span: &NewSpan) -> DbResult<()> {
        let mut start = span.start;
        let mut first = true;
        while start < span.end {
            let end = (start + MAX_SPAN_MS).min(span.end);
            self.insert_span(&NewSpan {
                start,
                end,
                continuation: span.continuation || !first,
                ..*span
            })?;
            first = false;
            start = end;
        }
        Ok(())
    }

    pub fn update_span_end(&self, id: i64, end: i64) -> DbResult<()> {
        self.conn
            .lock()
            .execute("UPDATE activity SET end_ts = ?1 WHERE id = ?2", params![end, id])
            .map(|_| ())
            .map_err(e)
    }

    pub fn delete_span(&self, id: i64) -> DbResult<()> {
        self.conn
            .lock()
            .execute("DELETE FROM activity WHERE id = ?1", [id])
            .map(|_| ())
            .map_err(e)
    }

    /// Spans overlapping `[from, to)`, clipped to the range.
    pub fn spans(&self, from: i64, to: i64) -> DbResult<Vec<ActivitySpan>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare_cached(
                "SELECT id, MAX(start_ts, ?1), MIN(end_ts, ?2), app_id, app_name, domain, title,
                        category, productivity, source
                 FROM activity
                 WHERE start_ts >= ?3 AND start_ts < ?2 AND end_ts > ?1
                 ORDER BY start_ts",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![from, to, from - MAX_SPAN_MS], |r| {
                Ok(ActivitySpan {
                    id: r.get(0)?,
                    start: r.get(1)?,
                    end: r.get(2)?,
                    app_id: r.get(3)?,
                    app_name: r.get(4)?,
                    domain: r.get(5)?,
                    title: r.get(6)?,
                    category: r.get(7)?,
                    productivity: r.get(8)?,
                    source: r.get(9)?,
                })
            })
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e);
        rows
    }

    pub fn bucket_totals(&self, buckets: &[(i64, i64)]) -> DbResult<Vec<BucketTotals>> {
        let conn = self.conn.lock();
        let mut time_stmt = conn
            .prepare_cached(
                "SELECT productivity, SUM(MIN(end_ts, ?2) - MAX(start_ts, ?1))
                 FROM activity
                 WHERE start_ts >= ?3 AND start_ts < ?2 AND end_ts > ?1
                 GROUP BY productivity",
            )
            .map_err(e)?;
        let mut switch_stmt = conn
            .prepare_cached(
                "SELECT COUNT(*) FROM activity WHERE start_ts >= ?1 AND start_ts < ?2 AND cont = 0",
            )
            .map_err(e)?;
        let mut out = Vec::with_capacity(buckets.len());
        for &(from, to) in buckets {
            let mut totals = BucketTotals {
                from,
                to,
                ..Default::default()
            };
            let rows = time_stmt
                .query_map(params![from, to, from - MAX_SPAN_MS], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
                })
                .map_err(e)?;
            for row in rows {
                let (p, ms) = row.map_err(e)?;
                match p.signum() {
                    1 => totals.productive_ms += ms,
                    -1 => totals.distracting_ms += ms,
                    _ => totals.neutral_ms += ms,
                }
            }
            totals.switches = switch_stmt
                .query_row(params![from, to], |r| r.get(0))
                .map_err(e)?;
            out.push(totals);
        }
        Ok(out)
    }

    pub fn entity_totals(&self, from: i64, to: i64) -> DbResult<Vec<EntityTotal>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare_cached(
                "SELECT COALESCE(domain, app_id) AS k,
                        CASE WHEN domain IS NULL THEN 'app' ELSE 'site' END AS kind,
                        MAX(app_name), MAX(category), MAX(productivity),
                        SUM(MIN(end_ts, ?2) - MAX(start_ts, ?1)) AS ms,
                        SUM(CASE WHEN cont = 0 THEN 1 ELSE 0 END),
                        MAX(end_ts)
                 FROM activity
                 WHERE start_ts >= ?3 AND start_ts < ?2 AND end_ts > ?1
                 GROUP BY k, kind
                 ORDER BY ms DESC",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![from, to, from - MAX_SPAN_MS], |r| {
                let key: String = r.get(0)?;
                let kind: String = r.get(1)?;
                let app_name: String = r.get(2)?;
                Ok(EntityTotal {
                    name: if kind == "site" { key.clone() } else { app_name.clone() },
                    key,
                    kind,
                    app_name,
                    category: r.get(3)?,
                    productivity: r.get(4)?,
                    ms: r.get(5)?,
                    visits: r.get(6)?,
                    last_seen: r.get(7)?,
                })
            })
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e);
        rows
    }

    /// Permanently remove an app's history (used when the user excludes it).
    pub fn delete_app_history(&self, app_id: &str) -> DbResult<usize> {
        self.conn
            .lock()
            .execute("DELETE FROM activity WHERE app_id = ?1", [app_id])
            .map_err(e)
    }

    pub fn purge_before(&self, ts: i64) -> DbResult<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM activity WHERE end_ts < ?1", [ts])
            .map_err(e)?;
        conn.execute("DELETE FROM sessions WHERE end_ts < ?1", [ts])
            .map_err(e)?;
        Ok(())
    }

    // ---------------------------------------------------------------- sessions

    #[allow(clippy::too_many_arguments)]
    pub fn insert_session(
        &self,
        kind: Phase,
        start: i64,
        end: i64,
        planned_ms: i64,
        actual_ms: i64,
        completed: bool,
        intention: &str,
        task_id: Option<i64>,
        interruptions: u32,
    ) -> DbResult<i64> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO sessions(kind, start_ts, end_ts, planned_ms, actual_ms, completed,
                                  intention, task_id, interruptions)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                kind.as_str(),
                start,
                end,
                planned_ms,
                actual_ms,
                completed as i64,
                intention,
                task_id,
                interruptions
            ],
        )
        .map_err(e)?;
        Ok(conn.last_insert_rowid())
    }

    pub fn sessions(&self, from: i64, to: i64) -> DbResult<Vec<FocusSession>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare_cached(
                "SELECT id, kind, start_ts, end_ts, planned_ms, actual_ms, completed, intention,
                        task_id, interruptions
                 FROM sessions WHERE start_ts < ?2 AND end_ts > ?1 ORDER BY start_ts",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![from, to], |r| {
                let kind: String = r.get(1)?;
                Ok(FocusSession {
                    id: r.get(0)?,
                    kind: match kind.as_str() {
                        "short_break" => Phase::ShortBreak,
                        "long_break" => Phase::LongBreak,
                        _ => Phase::Focus,
                    },
                    start: r.get(2)?,
                    end: r.get(3)?,
                    planned_ms: r.get(4)?,
                    actual_ms: r.get(5)?,
                    completed: r.get::<_, i64>(6)? != 0,
                    intention: r.get(7)?,
                    task_id: r.get(8)?,
                    interruptions: r.get(9)?,
                })
            })
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e);
        rows
    }

    /// Completed focus time since `from` — used for goal notifications.
    pub fn focus_ms_since(&self, from: i64) -> DbResult<i64> {
        self.conn
            .lock()
            .query_row(
                "SELECT COALESCE(SUM(actual_ms), 0) FROM sessions
                 WHERE kind = 'focus' AND start_ts >= ?1",
                [from],
                |r| r.get(0),
            )
            .map_err(e)
    }

    // ---------------------------------------------------------------- tasks

    pub fn tasks(&self) -> DbResult<Vec<Task>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare_cached(
                "SELECT t.id, t.title, t.estimate, t.done, t.created_at, t.completed_at,
                        COALESCE(SUM(CASE WHEN s.completed = 1 THEN 1 ELSE 0 END), 0),
                        COALESCE(SUM(s.actual_ms), 0)
                 FROM tasks t
                 LEFT JOIN sessions s ON s.task_id = t.id AND s.kind = 'focus'
                 GROUP BY t.id
                 ORDER BY t.done, COALESCE(t.completed_at, 0) DESC, t.created_at DESC",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    estimate: r.get(2)?,
                    done: r.get::<_, i64>(3)? != 0,
                    created_at: r.get(4)?,
                    completed_at: r.get(5)?,
                    pomodoros: r.get(6)?,
                    focus_ms: r.get(7)?,
                })
            })
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e);
        rows
    }

    pub fn create_task(&self, title: &str, estimate: u32, now: i64) -> DbResult<i64> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO tasks(title, estimate, created_at) VALUES(?1, ?2, ?3)",
            params![title.trim(), estimate.clamp(1, 20), now],
        )
        .map_err(e)?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_task(
        &self,
        id: i64,
        title: Option<&str>,
        estimate: Option<u32>,
        done: Option<bool>,
        now: i64,
    ) -> DbResult<()> {
        let conn = self.conn.lock();
        if let Some(title) = title {
            conn.execute("UPDATE tasks SET title = ?1 WHERE id = ?2", params![title.trim(), id])
                .map_err(e)?;
        }
        if let Some(estimate) = estimate {
            conn.execute(
                "UPDATE tasks SET estimate = ?1 WHERE id = ?2",
                params![estimate.clamp(1, 20), id],
            )
            .map_err(e)?;
        }
        if let Some(done) = done {
            conn.execute(
                "UPDATE tasks SET done = ?1, completed_at = ?2 WHERE id = ?3",
                params![done as i64, if done { Some(now) } else { None }, id],
            )
            .map_err(e)?;
        }
        Ok(())
    }

    pub fn delete_task(&self, id: i64) -> DbResult<()> {
        let conn = self.conn.lock();
        conn.execute("UPDATE sessions SET task_id = NULL WHERE task_id = ?1", [id])
            .map_err(e)?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", [id])
            .map(|_| ())
            .map_err(e)
    }

    // ---------------------------------------------------------------- data control

    pub fn wipe(&self) -> DbResult<()> {
        self.conn
            .lock()
            .execute_batch(
                "DELETE FROM activity; DELETE FROM sessions; DELETE FROM tasks;
                 DELETE FROM rules; DELETE FROM kv WHERE key != 'settings'; VACUUM;",
            )
            .map_err(e)?;
        self.reload_rules()
    }

    pub fn stats(&self) -> DbResult<(i64, i64, Option<i64>)> {
        let conn = self.conn.lock();
        let spans: i64 = conn
            .query_row("SELECT COUNT(*) FROM activity", [], |r| r.get(0))
            .map_err(e)?;
        let sessions: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
            .map_err(e)?;
        let first: Option<i64> = conn
            .query_row("SELECT MIN(start_ts) FROM activity", [], |r| r.get(0))
            .map_err(e)?;
        Ok((spans, sessions, first))
    }

    /// Stream everything to a JSON file the user chose.
    pub fn export_json(&self, path: &Path, settings: &Settings, now: i64) -> DbResult<()> {
        let mut w = BufWriter::new(File::create(path).map_err(e)?);
        let head = serde_json::json!({
            "format": "kairo-export",
            "version": 1,
            "exportedAt": now,
            "settings": settings,
            "rules": self.list_rules()?,
            "tasks": self.tasks()?,
            "sessions": self.sessions(i64::MIN / 2, i64::MAX / 2)?,
        });
        let head = serde_json::to_string(&head).map_err(e)?;
        // Splice the (potentially huge) activity array in without buffering it all.
        write!(w, "{},\"activity\":[", &head[..head.len() - 1]).map_err(e)?;
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, start_ts, end_ts, app_id, app_name, domain, title, category,
                        productivity, source FROM activity ORDER BY start_ts",
            )
            .map_err(e)?;
        let mut rows = stmt.query([]).map_err(e)?;
        let mut first = true;
        while let Some(r) = rows.next().map_err(e)? {
            let span = ActivitySpan {
                id: r.get(0).map_err(e)?,
                start: r.get(1).map_err(e)?,
                end: r.get(2).map_err(e)?,
                app_id: r.get(3).map_err(e)?,
                app_name: r.get(4).map_err(e)?,
                domain: r.get(5).map_err(e)?,
                title: r.get(6).map_err(e)?,
                category: r.get(7).map_err(e)?,
                productivity: r.get(8).map_err(e)?,
                source: r.get(9).map_err(e)?,
            };
            if !first {
                w.write_all(b",").map_err(e)?;
            }
            first = false;
            serde_json::to_writer(&mut w, &span).map_err(e)?;
        }
        w.write_all(b"]}").map_err(e)?;
        w.flush().map_err(e)
    }

    pub fn export_csv(&self, path: &Path) -> DbResult<()> {
        let mut w = BufWriter::new(File::create(path).map_err(e)?);
        writeln!(w, "start,end,duration_seconds,app,app_id,website,category,productivity,source,title")
            .map_err(e)?;
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT start_ts, end_ts, app_name, app_id, domain, category, productivity,
                        source, title FROM activity ORDER BY start_ts",
            )
            .map_err(e)?;
        let mut rows = stmt.query([]).map_err(e)?;
        while let Some(r) = rows.next().map_err(e)? {
            let start: i64 = r.get(0).map_err(e)?;
            let end: i64 = r.get(1).map_err(e)?;
            let iso = |ms: i64| {
                chrono::DateTime::from_timestamp_millis(ms)
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default()
            };
            let fields = [
                iso(start),
                iso(end),
                ((end - start) / 1000).to_string(),
                r.get::<_, String>(2).map_err(e)?,
                r.get::<_, String>(3).map_err(e)?,
                r.get::<_, Option<String>>(4).map_err(e)?.unwrap_or_default(),
                r.get::<_, String>(5).map_err(e)?,
                r.get::<_, i64>(6).map_err(e)?.to_string(),
                r.get::<_, String>(7).map_err(e)?,
                r.get::<_, Option<String>>(8).map_err(e)?.unwrap_or_default(),
            ];
            let line = fields.iter().map(|f| csv_field(f)).collect::<Vec<_>>().join(",");
            writeln!(w, "{line}").map_err(e)?;
        }
        w.flush().map_err(e)
    }
}

fn csv_field(s: &str) -> String {
    // Neutralise spreadsheet formula injection from window titles.
    let s = if s.starts_with(['=', '+', '-', '@']) && s.parse::<f64>().is_err() {
        format!("'{s}")
    } else {
        s.to_string()
    };
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span<'a>(start: i64, end: i64, app: &'a str, domain: Option<&'a str>) -> NewSpan<'a> {
        NewSpan {
            start,
            end,
            app_id: app,
            app_name: app,
            domain,
            title: None,
            source: "desktop",
            continuation: false,
        }
    }

    #[test]
    fn totals_clip_to_buckets_and_rules_reclassify() {
        let db = Db::in_memory().unwrap();
        db.insert_span(&span(0, 60_000, "slack", None)).unwrap();
        db.insert_span(&span(60_000, 180_000, "google chrome", Some("youtube.com"))).unwrap();
        db.insert_long_span(&span(180_000, 180_000 + 2 * MAX_SPAN_MS + 5, "code", None))
            .unwrap();

        let b = db.bucket_totals(&[(30_000, 120_000)]).unwrap();
        assert_eq!(b[0].neutral_ms, 30_000);
        assert_eq!(b[0].distracting_ms, 60_000);
        assert_eq!(b[0].switches, 1);

        let all = db.bucket_totals(&[(0, i64::MAX / 2)]).unwrap();
        assert_eq!(all[0].productive_ms, 2 * MAX_SPAN_MS + 5);
        assert_eq!(all[0].switches, 3, "continuation rows are not app switches");

        db.set_rule(&Rule {
            key: "site:youtube.com".into(),
            category: "learning".into(),
            productivity: 1,
        })
        .unwrap();
        let ents = db.entity_totals(0, i64::MAX / 2).unwrap();
        let yt = ents.iter().find(|e| e.key == "youtube.com").unwrap();
        assert_eq!((yt.category.as_str(), yt.productivity, yt.kind.as_str()), ("learning", 1, "site"));

        db.delete_rule("site:youtube.com").unwrap();
        let ents = db.entity_totals(0, i64::MAX / 2).unwrap();
        let yt = ents.iter().find(|e| e.key == "youtube.com").unwrap();
        assert_eq!(yt.productivity, -1);
    }

    #[test]
    fn csv_escapes() {
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("=cmd()"), "'=cmd()");
        assert_eq!(csv_field("-1"), "-1");
    }
}
