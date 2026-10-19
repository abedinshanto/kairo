use serde::{Deserialize, Serialize};
use tauri::{plugin::PluginHandle, Runtime};

use crate::{Error, Result, UsageSpan};

#[derive(Deserialize)]
struct Granted {
    granted: bool,
}

#[derive(Serialize)]
struct QueryArgs {
    from: i64,
    to: i64,
}

#[derive(Deserialize)]
struct QueryResult {
    spans: Vec<UsageSpan>,
}

fn err(e: impl std::fmt::Display) -> Error {
    Error(e.to_string())
}

pub fn permission_granted<R: Runtime>(h: &PluginHandle<R>) -> Result<bool> {
    h.run_mobile_plugin::<Granted>("checkPermission", ())
        .map(|g| g.granted)
        .map_err(err)
}

pub fn request_permission<R: Runtime>(h: &PluginHandle<R>) -> Result<()> {
    h.run_mobile_plugin::<serde_json::Value>("requestPermission", ())
        .map(|_| ())
        .map_err(err)
}

pub fn query<R: Runtime>(h: &PluginHandle<R>, from: i64, to: i64) -> Result<Vec<UsageSpan>> {
    h.run_mobile_plugin::<QueryResult>("queryEvents", QueryArgs { from, to })
        .map(|r| r.spans)
        .map_err(err)
}
