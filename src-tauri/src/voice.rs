//! Voice dictation, entirely on this device. The microphone is open only while
//! you dictate, and speech becomes text through Whisper (OpenAI's open speech
//! model) in its tiny English size, shipped with the app. No audio is stored.
//!
//! One `voice_listen` call is one utterance: it listens until you pause (or tap
//! again), transcribes, and returns the text. While listening it emits
//! `voice://level` (0–1, for the UI to animate) and then `voice://state`
//! ("thinking") while Whisper works.

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, Runtime};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::AppState;

/// Bundled with the desktop app (see `tauri.<os>.conf.json`).
pub const MODEL_FILE: &str = "voice/ggml-tiny.en-q5_1.bin";
/// Whisper listens at 16 kHz.
const RATE: u32 = 16_000;
/// Stop after this much quiet once you've said something.
const TRAILING_SILENCE: Duration = Duration::from_millis(1300);
/// Give up if nothing is said at all.
const NOTHING_SAID: Duration = Duration::from_secs(8);
const MAX_UTTERANCE: Duration = Duration::from_secs(20);
/// Free the model's memory (~100 MB) after this long unused.
const UNLOAD_AFTER: Duration = Duration::from_secs(5 * 60);

#[derive(Default)]
pub struct Voice {
    model: Mutex<Option<Arc<WhisperContext>>>,
    last_used: Mutex<Option<Instant>>,
    session: Mutex<Option<Arc<Session>>>,
}

#[derive(Default)]
struct Session {
    stop: AtomicBool,
    cancel: AtomicBool,
}

type CmdResult<T> = Result<T, String>;

fn model_path<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    if let Some(custom) = std::env::var_os("KAIRO_VOICE_MODEL") {
        return Some(custom.into());
    }
    app.path()
        .resolve(MODEL_FILE, BaseDirectory::Resource)
        .ok()
        .filter(|p| p.is_file())
}

/// Whether dictation can work here: the model is installed and there's a microphone.
#[tauri::command]
pub fn voice_available(app: AppHandle) -> bool {
    model_path(&app).is_some() && cpal::default_host().default_input_device().is_some()
}

/// Listen for one utterance and return it as text ("" if nothing was said, or cancelled).
#[tauri::command]
pub async fn voice_listen(app: AppHandle) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || listen(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// Stop listening now and transcribe what was said so far.
#[tauri::command]
pub fn voice_stop(app: AppHandle) {
    if let Some(s) = app.state::<Voice>().session.lock().as_ref() {
        s.stop.store(true, Ordering::Relaxed);
    }
}

/// Stop listening and throw the recording away.
#[tauri::command]
pub fn voice_cancel(app: AppHandle) {
    if let Some(s) = app.state::<Voice>().session.lock().as_ref() {
        s.cancel.store(true, Ordering::Relaxed);
    }
}

fn listen<R: Runtime>(app: &AppHandle<R>) -> CmdResult<String> {
    let voice = app.state::<Voice>();
    let session = {
        let mut slot = voice.session.lock();
        if slot.is_some() {
            return Err("Already listening.".into());
        }
        let s = Arc::new(Session::default());
        *slot = Some(s.clone());
        s
    };
    let result = (|| {
        // Load the model while the user talks, not after.
        let loader = {
            let app = app.clone();
            thread::spawn(move || load_model(&app))
        };
        let audio = record(app, &session)?;
        let model = loader.join().map_err(|_| "The voice model failed to load.".to_string())??;
        if session.cancel.load(Ordering::Relaxed) || audio.is_empty() {
            return Ok(String::new());
        }
        let _ = app.emit("voice://state", "thinking");
        let hints = task_hints(app);
        let text = transcribe(&model, &audio, &hints)?;
        Ok(clean(&text))
    })();
    *voice.session.lock() = None;
    *voice.last_used.lock() = Some(Instant::now());
    result
}

/// Open task titles help Whisper spell the words you're likely to say.
fn task_hints<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    app.state::<AppState>()
        .db
        .tasks()
        .map(|tasks| tasks.into_iter().filter(|t| !t.done).take(12).map(|t| t.title).collect())
        .unwrap_or_default()
}

// ------------------------------------------------------------------ model

fn load_model<R: Runtime>(app: &AppHandle<R>) -> CmdResult<Arc<WhisperContext>> {
    let voice = app.state::<Voice>();
    let mut slot = voice.model.lock();
    if let Some(model) = slot.as_ref() {
        return Ok(model.clone());
    }
    let path = model_path(app).ok_or("The voice model isn't installed.")?;
    // whisper.cpp logs every step to stderr otherwise.
    whisper_rs::install_logging_hooks();
    let ctx = WhisperContext::new_with_params(&path, WhisperContextParameters::default())
        .map_err(|e| format!("Couldn't load the voice model: {e}"))?;
    let model = Arc::new(ctx);
    *slot = Some(model.clone());
    drop(slot);
    spawn_unloader(app.clone());
    Ok(model)
}

/// Free the model once it hasn't been used for a while (Kairo runs all day).
fn spawn_unloader<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(60));
        let voice = app.state::<Voice>();
        let idle = voice.session.lock().is_none()
            && voice.last_used.lock().map_or(true, |t| t.elapsed() >= UNLOAD_AFTER);
        if idle {
            *voice.model.lock() = None;
            return;
        }
    });
}

fn transcribe(model: &WhisperContext, audio: &[f32], hints: &[String]) -> CmdResult<String> {
    let mut state = model.create_state().map_err(|e| e.to_string())?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    let threads = thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 6);
    params.set_n_threads(threads as i32);
    params.set_no_context(true);
    params.set_single_segment(true);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_print_timestamps(false);
    let prompt = hints.join(". ");
    if !prompt.is_empty() {
        params.set_initial_prompt(&prompt);
    }
    // Whisper wants at least a second of audio.
    let mut samples = audio.to_vec();
    if samples.len() < RATE as usize {
        samples.resize(RATE as usize, 0.0);
    }
    state.full(params, &samples).map_err(|e| e.to_string())?;
    let mut text = String::new();
    for segment in state.as_iter() {
        if let Ok(s) = segment.to_str_lossy() {
            text.push_str(&s);
        }
    }
    Ok(text)
}

// ------------------------------------------------------------------ microphone

/// Record until a pause after speech (or stop/cancel), as 16 kHz mono.
/// Empty when nothing was said.
fn record<R: Runtime>(app: &AppHandle<R>, session: &Session) -> CmdResult<Vec<f32>> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or("No microphone found.")?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("The microphone isn't available: {e}"))?;
    let rate = supported.sample_rate();
    let channels = supported.channels().max(1) as usize;
    let config = supported.config();
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::default();
    let failed: Arc<Mutex<Option<String>>> = Arc::default();

    use cpal::SampleFormat as F;
    let stream = match supported.sample_format() {
        F::F32 => open::<f32>(&device, &config, channels, &buffer, &failed),
        F::I16 => open::<i16>(&device, &config, channels, &buffer, &failed),
        F::U16 => open::<u16>(&device, &config, channels, &buffer, &failed),
        F::I32 => open::<i32>(&device, &config, channels, &buffer, &failed),
        F::I8 => open::<i8>(&device, &config, channels, &buffer, &failed),
        F::U8 => open::<u8>(&device, &config, channels, &buffer, &failed),
        other => return Err(format!("Unsupported microphone format ({other:?}).")),
    }?;
    stream
        .play()
        .map_err(|e| format!("Couldn't start the microphone: {e}"))?;
    let _ = app.emit("voice://state", "listening");

    let started = Instant::now();
    let mut vad = Vad::default();
    let mut read = 0;
    let window = (rate as usize / 20).max(1); // 50 ms
    loop {
        thread::sleep(Duration::from_millis(40));
        if let Some(err) = failed.lock().take() {
            return Err(format!("The microphone stopped: {err}"));
        }
        if session.cancel.load(Ordering::Relaxed) {
            return Ok(Vec::new());
        }
        let buf = buffer.lock();
        while read + window <= buf.len() {
            let level = vad.push(&buf[read..read + window], window as f32 / rate as f32);
            read += window;
            let _ = app.emit("voice://level", level);
        }
        drop(buf);
        let elapsed = started.elapsed();
        let done = session.stop.load(Ordering::Relaxed)
            || (vad.heard && vad.quiet_for >= TRAILING_SILENCE.as_secs_f32())
            || (!vad.heard && elapsed >= NOTHING_SAID)
            || elapsed >= MAX_UTTERANCE;
        if done {
            break;
        }
    }
    drop(stream);
    let samples = std::mem::take(&mut *buffer.lock());
    if !vad.heard {
        // Silence that is exactly zero means macOS (or Windows) withheld the microphone.
        if !samples.is_empty() && samples.iter().all(|s| *s == 0.0) {
            return Err(MIC_BLOCKED.into());
        }
        return Ok(Vec::new());
    }
    Ok(resample(&samples, rate, RATE))
}

#[cfg(target_os = "macos")]
const MIC_BLOCKED: &str = "Kairo can't hear the microphone. Allow it in System Settings → Privacy & Security → Microphone.";
#[cfg(target_os = "windows")]
const MIC_BLOCKED: &str = "Kairo can't hear the microphone. Allow desktop apps in Settings → Privacy & security → Microphone.";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const MIC_BLOCKED: &str = "Kairo can't hear the microphone. Check that it isn't muted.";

fn open<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    buffer: &Arc<Mutex<Vec<f32>>>,
    failed: &Arc<Mutex<Option<String>>>,
) -> CmdResult<cpal::Stream>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let buffer = buffer.clone();
    let failed = failed.clone();
    device
        .build_input_stream::<T, _, _>(
            *config,
            move |data: &[T], _| {
                let mut out = buffer.lock();
                // Down-mix to mono.
                for frame in data.chunks(channels) {
                    let sum: f32 = frame.iter().map(|s| cpal::Sample::to_sample::<f32>(*s)).sum();
                    out.push(sum / frame.len() as f32);
                }
            },
            move |err| *failed.lock() = Some(err.to_string()),
            None,
        )
        .map_err(|e| format!("Couldn't open the microphone: {e}"))
}

/// Energy-based voice activity: learns the room's noise floor, then counts
/// speech as anything well above it.
#[derive(Default)]
struct Vad {
    floor: Option<f32>,
    heard: bool,
    loud_for: f32,
    quiet_for: f32,
}

impl Vad {
    /// Feed one window; returns a 0–1 level for the UI.
    fn push(&mut self, window: &[f32], secs: f32) -> f32 {
        let rms = (window.iter().map(|s| s * s).sum::<f32>() / window.len().max(1) as f32).sqrt();
        let floor = self.floor.get_or_insert(rms);
        // The floor follows quiet stretches quickly and loud ones slowly.
        *floor = if rms < *floor { rms } else { *floor * 0.995 + rms * 0.005 };
        let threshold = (*floor * 3.0).max(0.006);
        if rms > threshold {
            self.loud_for += secs;
            self.quiet_for = 0.0;
            // A word, not a click.
            if self.loud_for >= 0.15 {
                self.heard = true;
            }
        } else {
            self.loud_for = 0.0;
            self.quiet_for += secs;
        }
        (rms / 0.12).sqrt().min(1.0)
    }
}

/// Linear resampling; plenty for speech.
fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let len = (input.len() as f64 / ratio) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let j = pos as usize;
            let frac = (pos - j as f64) as f32;
            let a = input[j];
            let b = *input.get(j + 1).unwrap_or(&a);
            a + (b - a) * frac
        })
        .collect()
}

// ------------------------------------------------------------------ text

/// Whisper's raw text, tidied for a task title: no sound tags, filler, quotes or
/// closing full stop; capitalised. Known silence hallucinations come out empty.
fn clean(raw: &str) -> String {
    let mut text = String::new();
    let mut depth = 0;
    for c in raw.chars() {
        match c {
            '[' | '(' => depth += 1,
            ']' | ')' if depth > 0 => depth -= 1,
            _ if depth == 0 => text.push(c),
            _ => {}
        }
    }
    let mut text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    for filler in ["um, ", "uh, ", "um ", "uh ", "so, ", "okay, ", "ok, "] {
        if text.len() > filler.len() && text[..filler.len()].eq_ignore_ascii_case(filler) {
            text = text[filler.len()..].to_string();
        }
    }
    let text = text
        .trim_matches(|c: char| c.is_whitespace() || matches!(c, '"' | '“' | '”' | '\'' | '-' | '—'))
        .trim_end_matches(['.', ',', ';', ':', '!', '…'])
        .trim()
        .to_string();
    let plain = text.to_lowercase();
    if matches!(
        plain.trim_end_matches(['.', '!', '?']),
        "" | "you" | "thank you" | "thanks" | "thanks for watching" | "thank you for watching" | "bye" | "please subscribe"
    ) {
        return String::new();
    }
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The whole pipeline on real recordings (needs the model):
    /// `KAIRO_TEST_WAVS=a.wav,b.wav cargo test --lib transcribes -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn transcribes_recordings() {
        let model_path = std::env::var("KAIRO_VOICE_MODEL")
            .unwrap_or_else(|_| format!("{}/{MODEL_FILE}", env!("CARGO_MANIFEST_DIR")));
        whisper_rs::install_logging_hooks();
        let model = WhisperContext::new_with_params(&model_path, WhisperContextParameters::default()).unwrap();
        let hints = vec!["Landing page redesign".to_string(), "Write Q4 planning doc".to_string()];
        for wav in std::env::var("KAIRO_TEST_WAVS").unwrap().split(',') {
            let (rate, samples) = read_wav(wav);
            let mut vad = Vad::default();
            let window = (rate as usize / 20).max(1);
            for chunk in samples.chunks(window) {
                vad.push(chunk, window as f32 / rate as f32);
            }
            let started = Instant::now();
            let text = clean(&transcribe(&model, &resample(&samples, rate, RATE), &hints).unwrap());
            println!("{wav}: heard={} {:?} in {:?}", vad.heard, text, started.elapsed());
            assert!(vad.heard && !text.is_empty());
        }
    }

    /// 16-bit PCM WAV as mono f32.
    fn read_wav(path: &str) -> (u32, Vec<f32>) {
        let bytes = std::fs::read(path).unwrap();
        let mut i = 12;
        let (mut rate, mut channels, mut data) = (16_000, 1usize, &bytes[0..0]);
        while i + 8 <= bytes.len() {
            let id = &bytes[i..i + 4];
            let len = u32::from_le_bytes(bytes[i + 4..i + 8].try_into().unwrap()) as usize;
            let body = &bytes[i + 8..(i + 8 + len).min(bytes.len())];
            if id == b"fmt " {
                channels = u16::from_le_bytes([body[2], body[3]]) as usize;
                rate = u32::from_le_bytes(body[4..8].try_into().unwrap());
            } else if id == b"data" {
                data = body;
            }
            i += 8 + len + (len & 1);
        }
        let samples = data
            .chunks_exact(2 * channels)
            .map(|f| {
                f.chunks_exact(2).map(|s| i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0).sum::<f32>() / channels as f32
            })
            .collect();
        (rate, samples)
    }

    #[test]
    fn tidies_whisper_text() {
        assert_eq!(clean(" landing page redesign."), "Landing page redesign");
        assert_eq!(clean("[BLANK_AUDIO]"), "");
        assert_eq!(clean(" Um, write the Q4 planning doc."), "Write the Q4 planning doc");
        assert_eq!(clean("(keyboard clicking) Review pull requests!"), "Review pull requests");
        assert_eq!(clean(" \"Fix the login bug\""), "Fix the login bug");
        assert_eq!(clean(" Thank you."), "");
        assert_eq!(clean("What's next? Ship it"), "What's next? Ship it");
    }

    #[test]
    fn resamples_to_whisper_rate() {
        let one_second_48k = vec![0.5f32; 48_000];
        let out = resample(&one_second_48k, 48_000, 16_000);
        assert_eq!(out.len(), 16_000);
        assert!(out.iter().all(|s| (s - 0.5).abs() < 1e-6));
        assert_eq!(resample(&[0.0, 1.0], 16_000, 32_000), vec![0.0, 0.5, 1.0, 1.0]);
    }

    #[test]
    fn hears_speech_over_room_noise_and_notices_the_pause() {
        let mut vad = Vad::default();
        let hum = vec![0.002f32; 800];
        let voice: Vec<f32> = (0..800).map(|i| if i % 2 == 0 { 0.1 } else { -0.1 }).collect();
        for _ in 0..10 {
            vad.push(&hum, 0.05);
        }
        assert!(!vad.heard, "room noise isn't speech");
        for _ in 0..6 {
            vad.push(&voice, 0.05);
        }
        assert!(vad.heard);
        for _ in 0..30 {
            vad.push(&hum, 0.05);
        }
        assert!(vad.quiet_for >= TRAILING_SILENCE.as_secs_f32());
    }
}
