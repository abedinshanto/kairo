//! Cross-app foreground usage for Kairo.
//!
//! * Android: backed by `UsageStatsManager` (the user grants "Usage access" once).
//! * Desktop: not used — the desktop tracker samples the foreground window directly.
//! * iOS: Apple only exposes Screen Time data inside a sandboxed DeviceActivity
//!   report extension, so third-party apps cannot read it; `is_supported` is false.

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
mod android;

/// One contiguous stretch of time an app spent in the foreground.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSpan {
    pub package: String,
    pub label: String,
    pub start: i64,
    pub end: i64,
}

#[derive(Debug)]
pub struct Error(pub String);

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

pub struct ScreenTime<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> ScreenTime<R> {
    /// Whether this platform can report other apps' usage at all.
    pub fn is_supported(&self) -> bool {
        cfg!(target_os = "android")
    }

    pub fn permission_granted(&self) -> Result<bool> {
        #[cfg(target_os = "android")]
        {
            android::permission_granted(&self.handle)
        }
        #[cfg(not(target_os = "android"))]
        {
            Ok(false)
        }
    }

    /// Opens the system "Usage access" settings page.
    pub fn request_permission(&self) -> Result<()> {
        #[cfg(target_os = "android")]
        {
            android::request_permission(&self.handle)
        }
        #[cfg(not(target_os = "android"))]
        {
            Err(Error("usage access is only available on Android".into()))
        }
    }

    /// Foreground spans between `from` and `to` (unix ms).
    pub fn query(&self, from: i64, to: i64) -> Result<Vec<UsageSpan>> {
        #[cfg(target_os = "android")]
        {
            android::query(&self.handle, from, to)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (from, to);
            Ok(Vec::new())
        }
    }
}

pub trait ScreenTimeExt<R: Runtime> {
    fn screentime(&self) -> &ScreenTime<R>;
}

impl<R: Runtime, T: Manager<R>> ScreenTimeExt<R> for T {
    fn screentime(&self) -> &ScreenTime<R> {
        self.state::<ScreenTime<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("screentime")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let state = ScreenTime {
                handle: _api
                    .register_android_plugin("app.kairo.screentime", "ScreenTimePlugin")
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?,
            };
            #[cfg(not(target_os = "android"))]
            let state = ScreenTime::<R> {
                _marker: std::marker::PhantomData,
            };
            app.manage(state);
            Ok(())
        })
        .build()
}
