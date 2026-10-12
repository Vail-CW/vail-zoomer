// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod cw;
mod input;
mod config;
mod linux_audio_setup;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use crossbeam_channel::{Receiver, RecvTimeoutError, Sender};
use parking_lot::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Wry};

use audio::{AudioEngineHandle, AudioEvent, DeviceInfo};
use input::{MidiEvent, MidiHandler, PortLister, TimedMidiEvent};
use cw::CwEngine;
use config::{BufferSizeMode, Settings};
use serde::Serialize;

/// Event payload for key state changes
#[derive(Clone, Serialize)]
struct KeyEvent {
    down: bool,
}

/// Event payload for decoded CW characters
#[derive(Clone, Serialize)]
struct DecodedEvent {
    character: String,
    wpm: f32,
}

/// Event payload for the partial character being built ("-..")
#[derive(Clone, Serialize)]
struct ElementEvent {
    elements: String,
}

/// Event payload for live level meters (linear peaks, 0..1)
#[derive(Clone, Serialize)]
struct LevelsEvent {
    mic: f32,
    output: f32,
}

/// Event payload for audio engine state
#[derive(Clone, Serialize)]
struct AudioStatus {
    state: &'static str,
    message: Option<String>,
}

/// MIDI connection state, both as an event payload and a command result
#[derive(Clone, Serialize, PartialEq, Default)]
pub struct MidiStatus {
    connected: bool,
    device: Option<String>,
    error: Option<String>,
}

/// Menu items kept so the tray's check marks can follow state changes made
/// elsewhere (UI, adapter, tray itself).
#[derive(Clone)]
struct TrayItems {
    mute: CheckMenuItem<Wry>,
    practice: CheckMenuItem<Wry>,
}

/// Coalesces settings writes. Callers mutate the in-memory settings and call
/// `request`; a single background thread writes the latest snapshot to disk
/// so slider drags and CC streams never fsync on the calling thread.
#[derive(Clone)]
struct SettingsSaver {
    tx: Sender<()>,
}

impl SettingsSaver {
    const COALESCE: Duration = Duration::from_millis(300);

    fn spawn(settings: Arc<Mutex<Settings>>) -> Self {
        let (tx, rx): (Sender<()>, Receiver<()>) = crossbeam_channel::unbounded();
        thread::spawn(move || {
            while rx.recv().is_ok() {
                thread::sleep(Self::COALESCE);
                while rx.try_recv().is_ok() {}
                let snapshot = settings.lock().clone();
                if let Err(e) = snapshot.save() {
                    eprintln!("[settings] Background save failed: {}", e);
                }
            }
        });
        Self { tx }
    }

    fn request(&self) {
        let _ = self.tx.send(());
    }
}

/// Application state shared across the app. Everything is behind an `Arc`, so
/// cloning is cheap and lets background threads own a copy.
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Mutex<Settings>>,
    pub audio_engine: Arc<Mutex<Option<AudioEngineHandle>>>,
    pub midi_handler: Arc<Mutex<MidiHandler>>,
    pub cw_engine: Arc<Mutex<CwEngine>>,
    saver: SettingsSaver,
    midi_status: Arc<Mutex<MidiStatus>>,
    midi_devices: Arc<Mutex<Vec<String>>>,
    audio_running: Arc<AtomicBool>,
    mic_muted: Arc<AtomicBool>,
    last_pattern: Arc<Mutex<String>>,
    tray: Arc<Mutex<Option<TrayItems>>>,
}

fn keyer_program(keyer: config::KeyerType) -> u8 {
    match keyer {
        config::KeyerType::Straight => 1,
        config::KeyerType::Bug => 2,
        config::KeyerType::ElBug => 3,
        config::KeyerType::SingleDot => 4,
        config::KeyerType::Ultimatic => 5,
        config::KeyerType::PlainIambic => 6,
        config::KeyerType::IambicA => 7,
        config::KeyerType::IambicB => 8,
        config::KeyerType::Keyahead => 9,
    }
}

/// Push keyer type, speed and sidetone pitch to the adapter. Send errors are
/// ignored: the adapter may be input-only or mid-unplug.
fn sync_adapter(handler: &mut MidiHandler, s: &Settings) {
    let _ = handler.send_keyer_type(keyer_program(s.keyer_type));
    let _ = handler.send_wpm(s.wpm as u8);
    let _ = handler.send_sidetone_frequency_hz(s.sidetone_frequency);
}

/// Apply settings to the live engine, then layer the temporary overrides
/// (practice mode and tray mute) on top. Saved settings are never modified by
/// the overrides, so turning them off restores the user's values exactly.
fn push_settings_to_engine(state: &AppState, engine: &AudioEngineHandle, s: &Settings) {
    engine.apply_settings(s);
    if s.practice_mode || state.mic_muted.load(Ordering::Relaxed) {
        engine.set_mic_volume(0.0);
    }
    if s.practice_mode {
        // Nothing may reach the video app; the user still hears themselves.
        engine.set_sidetone_volume(0.0);
        engine.set_sidetone_route(audio::SidetoneRoute::LocalOnly);
    }
}

/// Re-apply current settings to the engine if one exists.
fn refresh_engine(state: &AppState) {
    let settings = state.settings.lock().clone();
    if let Some(ref engine) = *state.audio_engine.lock() {
        push_settings_to_engine(state, engine, &settings);
    }
}

/// Update the tray check marks to match current state.
fn sync_tray(state: &AppState) {
    let items = state.tray.lock().clone();
    if let Some(items) = items {
        let _ = items.mute.set_checked(state.mic_muted.load(Ordering::Relaxed));
        let _ = items.practice.set_checked(state.settings.lock().practice_mode);
    }
}

fn emit_audio_status(app: &AppHandle, state: &AppState, status: &'static str, message: Option<String>) {
    state.audio_running.store(status == "running", Ordering::Relaxed);
    let _ = app.emit("audio:status", AudioStatus { state: status, message });
}

/// Publish a new MIDI status; no-op (no IPC) if nothing changed.
fn set_midi_status(app: &AppHandle, state: &AppState, status: MidiStatus) {
    {
        let mut current = state.midi_status.lock();
        if *current == status {
            return;
        }
        *current = status.clone();
    }
    let _ = app.emit("midi:status", status);
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Settings {
    state.settings.lock().clone()
}

#[tauri::command]
async fn update_settings(state: tauri::State<'_, AppState>, mut settings: Settings) -> Result<(), String> {
    // practice_mode is owned by set_practice_mode (and the tray); a stale copy
    // coming back from the UI must not silently undo it.
    let prev = {
        let mut current = state.settings.lock();
        settings.practice_mode = current.practice_mode;
        std::mem::replace(&mut *current, settings.clone())
    };

    if let Some(ref engine) = *state.audio_engine.lock() {
        push_settings_to_engine(&state, engine, &settings);
    }

    {
        let mut cw = state.cw_engine.lock();
        cw.set_wpm(settings.wpm);
        cw.set_keyer_type(settings.keyer_type);
    }

    // Only talk to the adapter about what changed; slider drags would
    // otherwise send three USB messages per tick.
    let keyer_changed = settings.keyer_type != prev.keyer_type;
    let wpm_changed = settings.wpm as u8 != prev.wpm as u8;
    let freq_changed = settings.sidetone_frequency != prev.sidetone_frequency;
    if keyer_changed || wpm_changed || freq_changed {
        let mut handler = state.midi_handler.lock();
        if keyer_changed {
            let _ = handler.send_keyer_type(keyer_program(settings.keyer_type));
        }
        if wpm_changed {
            let _ = handler.send_wpm(settings.wpm as u8);
        }
        if freq_changed {
            let _ = handler.send_sidetone_frequency_hz(settings.sidetone_frequency);
        }
    }

    state.saver.request();
    Ok(())
}

#[tauri::command]
fn list_midi_devices(state: tauri::State<AppState>) -> Vec<String> {
    state.midi_devices.lock().clone()
}

#[tauri::command]
fn get_midi_status(state: tauri::State<AppState>) -> MidiStatus {
    state.midi_status.lock().clone()
}

#[tauri::command]
fn connect_midi_device(
    app: AppHandle,
    state: tauri::State<AppState>,
    device_name: String,
) -> Result<(), String> {
    let settings = state.settings.lock().clone();
    let result = {
        let mut handler = state.midi_handler.lock();
        let result = handler.connect(&device_name);
        if result.is_ok() {
            sync_adapter(&mut handler, &settings);
        }
        result
    };

    match result {
        Ok(()) => {
            state.settings.lock().midi_device = Some(device_name.clone());
            state.saver.request();
            set_midi_status(&app, &state, MidiStatus {
                connected: true,
                device: Some(device_name),
                error: None,
            });
            Ok(())
        }
        Err(e) => {
            set_midi_status(&app, &state, MidiStatus {
                connected: false,
                device: None,
                error: Some(e.clone()),
            });
            Err(e)
        }
    }
}

#[tauri::command]
async fn list_audio_devices() -> Vec<DeviceInfo> {
    AudioEngineHandle::list_output_devices()
}

#[tauri::command]
fn get_mic_level(state: tauri::State<AppState>) -> f32 {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.get_mic_level()
    } else {
        0.0
    }
}

#[tauri::command]
fn get_output_level(state: tauri::State<AppState>) -> f32 {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.get_output_level()
    } else {
        0.0
    }
}

#[tauri::command]
async fn list_input_devices() -> Vec<DeviceInfo> {
    AudioEngineHandle::list_input_devices()
}

/// Create the engine on first use and start forwarding its events.
fn ensure_engine(
    app: &AppHandle,
    state: &AppState,
    slot: &mut Option<AudioEngineHandle>,
) -> Result<(), String> {
    if slot.is_none() {
        let settings = state.settings.lock().clone();
        let engine = AudioEngineHandle::new(settings.sidetone_frequency, settings.sidetone_volume)?;
        spawn_audio_event_forwarder(app.clone(), state.clone(), engine.subscribe());
        *slot = Some(engine);
    }
    Ok(())
}

/// Saved settings (plus practice/mute overrides) go live once the engine has
/// been started, then the UI is told audio is running.
fn finish_start(app: &AppHandle, state: &AppState, engine: &AudioEngineHandle) {
    let settings = state.settings.lock().clone();
    push_settings_to_engine(state, engine, &settings);
    emit_audio_status(app, state, "running", None);
}

#[tauri::command]
fn start_audio(
    app: AppHandle,
    state: tauri::State<AppState>,
    device_name: Option<String>,
) -> Result<(), String> {
    let mut engine_lock = state.audio_engine.lock();
    ensure_engine(&app, &state, &mut engine_lock)?;

    if let Some(ref engine) = *engine_lock {
        engine.start(device_name)?;
        finish_start(&app, &state, engine);
    }

    Ok(())
}

#[tauri::command]
fn start_audio_with_devices(
    app: AppHandle,
    state: tauri::State<AppState>,
    output_device: Option<String>,
    input_device: Option<String>,
) -> Result<(), String> {
    let mut engine_lock = state.audio_engine.lock();
    ensure_engine(&app, &state, &mut engine_lock)?;

    if let Some(ref engine) = *engine_lock {
        engine.start_with_devices(output_device, input_device)?;
        finish_start(&app, &state, engine);
    }

    Ok(())
}

#[tauri::command]
fn start_audio_with_all_devices(
    app: AppHandle,
    state: tauri::State<AppState>,
    output_device: Option<String>,
    input_device: Option<String>,
    local_device: Option<String>,
) -> Result<(), String> {
    let mut engine_lock = state.audio_engine.lock();
    ensure_engine(&app, &state, &mut engine_lock)?;

    if let Some(ref engine) = *engine_lock {
        let settings = state.settings.lock().clone();
        let audio_route = if settings.practice_mode {
            audio::SidetoneRoute::LocalOnly
        } else {
            settings.sidetone_route.into()
        };
        engine.start_with_all_devices(output_device, input_device, local_device, audio_route)?;
        finish_start(&app, &state, engine);
    }

    Ok(())
}

#[tauri::command]
fn stop_audio(app: AppHandle, state: tauri::State<AppState>) {
    if let Some(ref engine) = *state.audio_engine.lock() {
        let _ = engine.stop();
    }
    emit_audio_status(&app, &state, "stopped", None);
}

/// Set mic volume without persisting to settings file
/// Used for temporary muting during wizard
#[tauri::command]
fn set_mic_volume(state: tauri::State<AppState>, volume: f32) {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.set_mic_volume(volume);
    }
}

#[tauri::command]
fn play_tone_preview(
    state: tauri::State<AppState>,
    frequency: f32,
    duration_ms: u32,
) -> Result<(), String> {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.play_tone_preview(frequency, duration_ms);
        Ok(())
    } else {
        Err("Audio engine not initialized".to_string())
    }
}

/// Shared by the command and the tray. Sidetone stays audible locally, but
/// the mic and the sidetone feed to the output are silenced.
fn apply_practice_mode(app: &AppHandle, state: &AppState, enabled: bool, notify_ui: bool) {
    let snapshot = {
        let mut s = state.settings.lock();
        s.practice_mode = enabled;
        s.clone()
    };
    if let Some(ref engine) = *state.audio_engine.lock() {
        push_settings_to_engine(state, engine, &snapshot);
    }
    state.saver.request();
    sync_tray(state);
    if notify_ui {
        let _ = app.emit("settings:changed", snapshot);
    }
}

#[tauri::command]
fn set_practice_mode(app: AppHandle, state: tauri::State<AppState>, enabled: bool) -> Result<(), String> {
    apply_practice_mode(&app, &state, enabled, false);
    Ok(())
}

#[tauri::command]
fn set_sidetone_rise_ms(state: tauri::State<AppState>, ms: f32) -> Result<(), String> {
    let ms = ms.clamp(1.0, 20.0);
    state.settings.lock().sidetone_rise_ms = ms;
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.set_sidetone_rise_ms(ms);
    }
    state.saver.request();
    Ok(())
}

#[tauri::command]
fn set_buffer_size_mode(state: tauri::State<AppState>, mode: BufferSizeMode) -> Result<(), String> {
    state.settings.lock().buffer_size_mode = mode;
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.set_buffer_size_mode(mode);
    }
    state.saver.request();
    Ok(())
}

/// Single path for every key transition (MIDI or frontend-driven): sidetone,
/// decoder, and the cw:* events.
fn process_key(app: &AppHandle, state: &AppState, down: bool, is_dit: bool, at: Instant) {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.key_event(down, at);
    }

    let (decoded, pattern) = {
        let mut cw = state.cw_engine.lock();
        let decoded = if down { cw.key_down(is_dit) } else { cw.key_up() };
        (decoded, cw.current_pattern().to_string())
    };

    if let Some(decoded) = decoded {
        emit_decoded(app, decoded);
    }
    let _ = app.emit("cw:key", KeyEvent { down });
    emit_pattern(app, state, &pattern);
}

/// Flush a character that has sat unfinished past the decoder's timeout.
fn process_timeout(app: &AppHandle, state: &AppState) {
    let (decoded, pattern) = {
        let mut cw = state.cw_engine.lock();
        (cw.check_timeout(), cw.current_pattern().to_string())
    };
    if let Some(decoded) = decoded {
        emit_decoded(app, decoded);
    }
    emit_pattern(app, state, &pattern);
}

/// Emit cw:element only when the partial character actually changed.
fn emit_pattern(app: &AppHandle, state: &AppState, pattern: &str) {
    let mut last = state.last_pattern.lock();
    if *last != pattern {
        *last = pattern.to_string();
        let _ = app.emit("cw:element", ElementEvent { elements: pattern.to_string() });
    }
}

#[tauri::command]
fn key_down(app: AppHandle, state: tauri::State<AppState>, is_dit: bool) {
    process_key(&app, &state, true, is_dit, Instant::now());
}

#[tauri::command]
fn key_up(app: AppHandle, state: tauri::State<AppState>) {
    process_key(&app, &state, false, false, Instant::now());
}

/// Helper to emit decoded characters to frontend
fn emit_decoded(app_handle: &AppHandle, decoded: cw::DecodedElement) {
    let _ = app_handle.emit("cw:decoded", DecodedEvent {
        character: decoded.character,
        wpm: decoded.wpm,
    });
}

/// Apply a control change sent by the adapter (user turned a knob/menu on the
/// device). CC1 = speed, CC2 = sidetone note, CC7 = volume.
fn handle_cc(app: &AppHandle, state: &AppState, controller: u8, value: u8) {
    // Our own CC1/CC2 writes can bounce straight back; ignore those echoes.
    if matches!(controller, input::CC_DIT_DURATION | input::CC_SIDETONE_NOTE)
        && state.midi_handler.lock().is_echo(controller, value)
    {
        return;
    }

    let snapshot = {
        let mut s = state.settings.lock();
        let changed = match controller {
            input::CC_DIT_DURATION => match input::cc_dit_to_wpm(value) {
                Some(wpm) => {
                    let wpm = wpm.round().max(5.0);
                    let changed = s.wpm.round() != wpm;
                    if changed {
                        s.wpm = wpm;
                    }
                    changed
                }
                None => false,
            },
            input::CC_SIDETONE_NOTE => {
                // The adapter only knows semitones; don't replace a precise
                // pitch with its rounded equivalent.
                let changed = input::hz_to_note(s.sidetone_frequency) != value;
                if changed {
                    s.sidetone_frequency = input::note_to_hz(value);
                }
                changed
            }
            input::CC_VOLUME => {
                let volume = value as f32 / 127.0;
                let changed = (s.sidetone_volume - volume).abs() > 0.004;
                if changed {
                    s.sidetone_volume = volume;
                }
                changed
            }
            _ => false,
        };
        changed.then(|| s.clone())
    };

    let Some(snapshot) = snapshot else { return };
    if let Some(ref engine) = *state.audio_engine.lock() {
        push_settings_to_engine(state, engine, &snapshot);
    }
    state.cw_engine.lock().set_wpm(snapshot.wpm);
    state.saver.request();
    let _ = app.emit("settings:changed", snapshot);
}

/// Spawn a background thread to process MIDI events. It blocks on the channel
/// (waking at least every 50 ms for the decoder timeout), so it costs nothing
/// while the key is idle.
fn start_midi_event_loop(app: AppHandle, state: AppState) {
    let rx = state.midi_handler.lock().event_receiver();
    thread::spawn(move || {
        const TICK: Duration = Duration::from_millis(50);
        let mut last_timeout_check = Instant::now();

        loop {
            match rx.recv_timeout(TICK) {
                Ok(TimedMidiEvent { event, at }) => match event {
                    MidiEvent::NoteOn { note, velocity } => {
                        eprintln!("[midi] Note on: note={}, velocity={}", note, velocity);
                        // Adapter keyer modes send note 1 = dit, 2 = dah;
                        // passthrough sends C# (61) = dit, D (62) = dah.
                        let is_dit = note == 1 || note == 61;
                        process_key(&app, &state, true, is_dit, at);
                    }
                    MidiEvent::NoteOff { note } => {
                        eprintln!("[midi] Note off: note={}", note);
                        process_key(&app, &state, false, false, at);
                    }
                    MidiEvent::ControlChange { controller, value } => {
                        eprintln!("[midi] CC: controller={}, value={}", controller, value);
                        handle_cc(&app, &state, controller, value);
                    }
                },
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }

            // Also checked after events so a flood of CCs can't starve it.
            if last_timeout_check.elapsed() >= TICK {
                last_timeout_check = Instant::now();
                process_timeout(&app, &state);
            }
        }
    });
}

/// Poll MIDI ports once a second: publish list changes, connect to the saved
/// or a Vail-looking device, notice unplugs and reconnect on replug.
fn start_midi_poller(app: AppHandle, state: AppState) {
    thread::spawn(move || {
        let mut lister = PortLister::new();
        let mut last_ports: Option<Vec<String>> = None;

        loop {
            let ports = lister.list();
            if last_ports.as_ref() != Some(&ports) {
                *state.midi_devices.lock() = ports.clone();
                let _ = app.emit("midi:devices", ports.clone());
                last_ports = Some(ports.clone());
            }

            poll_midi_connection(&app, &state, &ports);
            thread::sleep(Duration::from_secs(1));
        }
    });
}

fn poll_midi_connection(app: &AppHandle, state: &AppState, ports: &[String]) {
    let preferred = state.settings.lock().midi_device.clone();
    let settings = state.settings.lock().clone();
    let mut handler = state.midi_handler.lock();

    if let Some(name) = handler.connected_name().map(str::to_string) {
        if ports.contains(&name) {
            return;
        }
        handler.disconnect();
        drop(handler);
        eprintln!("[midi] '{}' disappeared", name);
        set_midi_status(app, state, MidiStatus::default());
        return;
    }

    let Some(target) = input::pick_auto_device(ports, preferred.as_deref()) else {
        return;
    };

    let result = handler.connect(&target);
    if result.is_ok() {
        sync_adapter(&mut handler, &settings);
    }
    drop(handler);

    let status = match result {
        Ok(()) => MidiStatus { connected: true, device: Some(target), error: None },
        Err(e) => MidiStatus { connected: false, device: None, error: Some(e) },
    };
    set_midi_status(app, state, status);
}

/// Forward engine events to the UI as `audio:status`.
fn spawn_audio_event_forwarder(app: AppHandle, state: AppState, rx: Receiver<AudioEvent>) {
    thread::spawn(move || {
        for event in rx.iter() {
            match event {
                AudioEvent::StreamError { stream, message } => emit_audio_status(
                    &app,
                    &state,
                    "restarting",
                    Some(format!("Audio {} stream problem: {}", stream, message)),
                ),
                AudioEvent::Restarted => emit_audio_status(&app, &state, "running", None),
                AudioEvent::RestartFailed { message } => {
                    emit_audio_status(&app, &state, "error", Some(message))
                }
                AudioEvent::DeviceLost => emit_audio_status(
                    &app,
                    &state,
                    "error",
                    Some("An audio device was disconnected. Reconnect it or choose another device in Settings.".to_string()),
                ),
            }
        }
    });
}

/// Emit meter levels at 20 Hz, but only while audio runs and only when there
/// is something to show.
fn start_level_emitter(app: AppHandle, state: AppState) {
    thread::spawn(move || {
        let mut last = (0.0f32, 0.0f32);
        loop {
            thread::sleep(Duration::from_millis(50));
            if !state.audio_running.load(Ordering::Relaxed) {
                continue;
            }
            // try_lock: never stall metering behind a slow start/stop.
            let levels = match state.audio_engine.try_lock() {
                Some(guard) => guard
                    .as_ref()
                    .map(|e| (e.get_mic_level(), e.get_output_level())),
                None => None,
            };
            let Some((mic, output)) = levels else { continue };
            if (mic, output) == last && mic == 0.0 && output == 0.0 {
                continue;
            }
            last = (mic, output);
            let _ = app.emit("audio:levels", LevelsEvent { mic, output });
        }
    });
}

fn build_tray(app: &tauri::App, state: &AppState) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Vail Zoomer", true, None::<&str>)?;
    let mute = CheckMenuItem::with_id(app, "mute", "Mute mic", true, false, None::<&str>)?;
    let practice = CheckMenuItem::with_id(
        app,
        "practice",
        "Practice mode",
        true,
        state.settings.lock().practice_mode,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mute, &practice, &separator, &quit])?;

    *state.tray.lock() = Some(TrayItems { mute, practice });

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Vail Zoomer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let state = app.state::<AppState>();
            match event.id().as_ref() {
                "show" => show_main_window(app),
                "mute" => {
                    let muted = !state.mic_muted.load(Ordering::Relaxed);
                    state.mic_muted.store(muted, Ordering::Relaxed);
                    refresh_engine(&state);
                    sync_tray(&state);
                }
                "practice" => {
                    let enabled = !state.settings.lock().practice_mode;
                    apply_practice_mode(app, &state, enabled, true);
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

// Linux Virtual Audio Setup Commands

#[tauri::command]
fn check_linux_virtual_audio() -> Result<linux_audio_setup::VirtualAudioStatus, String> {
    linux_audio_setup::check_virtual_audio_device()
}

#[tauri::command]
fn setup_linux_virtual_audio() -> Result<linux_audio_setup::SetupResult, String> {
    linux_audio_setup::setup_virtual_audio_device()
}

#[tauri::command]
fn remove_linux_virtual_audio() -> Result<(), String> {
    linux_audio_setup::remove_virtual_audio_devices()
}

#[tauri::command]
fn install_linux_audio_prerequisites() -> Result<linux_audio_setup::InstallResult, String> {
    linux_audio_setup::install_audio_prerequisites()
}

#[tauri::command]
fn list_linux_missing_prerequisites() -> Vec<String> {
    linux_audio_setup::missing_prerequisites()
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

#[tauri::command]
fn dump_linux_audio_diagnostics() -> String {
    linux_audio_setup::dump_audio_diagnostics()
}

#[tauri::command]
fn mark_linux_audio_setup_complete(state: tauri::State<AppState>) -> Result<(), String> {
    let mut settings = state.settings.lock();
    settings.linux_audio_setup_completed = true;
    settings.save()
}

#[tauri::command]
fn is_linux_audio_setup_completed(state: tauri::State<AppState>) -> bool {
    state.settings.lock().linux_audio_setup_completed
}

// Windows VB-Cable Install Command

/// Launch the bundled VB-Cable installer, elevated, on explicit user request.
///
/// The app setup never touches the audio driver (that behavior gets installers
/// flagged by antivirus/HIPS). This command is only ever called from a button
/// the user clicks inside the app. On Windows it runs the bundled
/// `VBCABLE_Setup_x64.exe` via a normal UAC elevation prompt; on other
/// platforms it's a no-op error (VB-Cable is Windows-only).
#[tauri::command]
fn install_vbcable(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Don't flash a console window when we shell out to PowerShell.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Could not locate app resources: {e}"))?;

        // Prefer the 64-bit installer; fall back to the 32-bit one.
        let x64 = resource_dir.join("resources/VBCABLE/VBCABLE_Setup_x64.exe");
        let x86 = resource_dir.join("resources/VBCABLE/VBCABLE_Setup.exe");
        let installer = if x64.exists() { x64 } else { x86 };

        if !installer.exists() {
            return Err(format!(
                "VB-Cable installer not found at {}",
                installer.display()
            ));
        }

        // Single-quote the path for PowerShell and escape any embedded quotes.
        let path_str = installer.to_string_lossy().replace('\'', "''");

        // `Start-Process -Verb RunAs` raises the UAC prompt and runs the
        // installer elevated. If the user cancels UAC, Start-Process throws and
        // PowerShell exits non-zero, which we surface as a friendly message.
        let status = std::process::Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &format!("Start-Process -FilePath '{path_str}' -Verb RunAs"),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    "Could not find PowerShell (powershell.exe) on this system.".to_string()
                } else {
                    format!("Failed to launch installer: {e}")
                }
            })?;

        if status.success() {
            Ok(())
        } else {
            Err("VB-Cable installer did not start. You may have declined the administrator prompt.".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("VB-Cable is only used on Windows.".to_string())
    }
}

// Test Recording Commands

/// State returned for test recording progress
#[derive(Clone, Serialize)]
struct TestRecordingState {
    is_recording: bool,
    is_playing: bool,
    samples_recorded: usize,
    sample_rate: u32,
    duration_seconds: f32,
    playback_progress: f32,
}

#[tauri::command]
fn start_test_recording(state: tauri::State<AppState>) -> Result<(), String> {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.start_test_recording()
    } else {
        Err("Audio engine not initialized".to_string())
    }
}

#[tauri::command]
fn stop_test_recording(state: tauri::State<AppState>) -> Result<(), String> {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.stop_test_recording()
    } else {
        Err("Audio engine not initialized".to_string())
    }
}

#[tauri::command]
fn play_test_recording(state: tauri::State<AppState>, local_device: Option<String>) -> Result<(), String> {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.start_playback(local_device)
    } else {
        Err("Audio engine not initialized".to_string())
    }
}

#[tauri::command]
fn stop_test_playback(state: tauri::State<AppState>) -> Result<(), String> {
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.stop_playback()
    } else {
        Err("Audio engine not initialized".to_string())
    }
}

#[tauri::command]
fn get_test_recording_state(state: tauri::State<AppState>) -> TestRecordingState {
    if let Some(ref engine) = *state.audio_engine.lock() {
        TestRecordingState {
            is_recording: engine.is_recording(),
            is_playing: engine.is_playing(),
            samples_recorded: engine.get_recording_samples(),
            sample_rate: engine.get_sample_rate(),
            duration_seconds: engine.get_recording_duration(),
            playback_progress: engine.get_playback_progress(),
        }
    } else {
        TestRecordingState {
            is_recording: false,
            is_playing: false,
            samples_recorded: 0,
            sample_rate: 48000,
            duration_seconds: 0.0,
            playback_progress: 0.0,
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Sweep any orphan virtual-audio modules from a crashed previous run
            // before we touch anything else (Linux only — no-op elsewhere).
            #[cfg(target_os = "linux")]
            linux_audio_setup::cleanup_orphan_modules_at_startup();

            // Load settings from disk (or use defaults if not found)
            let settings = Settings::load();
            let cw_engine = CwEngine::new(settings.wpm);
            let settings = Arc::new(Mutex::new(settings));

            let state = AppState {
                saver: SettingsSaver::spawn(Arc::clone(&settings)),
                settings,
                audio_engine: Arc::new(Mutex::new(None)),
                midi_handler: Arc::new(Mutex::new(MidiHandler::new())),
                cw_engine: Arc::new(Mutex::new(cw_engine)),
                midi_status: Arc::new(Mutex::new(MidiStatus::default())),
                midi_devices: Arc::new(Mutex::new(PortLister::new().list())),
                audio_running: Arc::new(AtomicBool::new(false)),
                mic_muted: Arc::new(AtomicBool::new(false)),
                last_pattern: Arc::new(Mutex::new(String::new())),
                tray: Arc::new(Mutex::new(None)),
            };

            app.manage(state.clone());

            if let Err(e) = build_tray(app, &state) {
                // The app is fully usable without a tray icon.
                eprintln!("[tray] Could not create tray icon: {}", e);
            }

            start_midi_event_loop(app.handle().clone(), state.clone());
            start_midi_poller(app.handle().clone(), state.clone());
            start_level_emitter(app.handle().clone(), state.clone());

            // The first connect can win the race against the webview's
            // listeners; repeat the status once the page has had time to load.
            let handle = app.handle().clone();
            let late_state = state;
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(1));
                let status = late_state.midi_status.lock().clone();
                let _ = handle.emit("midi:status", status);
            });

            Ok(())
        })
        .on_window_event(|_window, _event| {
            // Virtual audio devices are persistent (loaded by the systemd user
            // unit on every login), so we intentionally do nothing on window
            // close. Closing the main window quits the app.
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            list_midi_devices,
            get_midi_status,
            connect_midi_device,
            list_audio_devices,
            get_mic_level,
            get_output_level,
            list_input_devices,
            start_audio,
            start_audio_with_devices,
            start_audio_with_all_devices,
            stop_audio,
            set_mic_volume,
            play_tone_preview,
            set_practice_mode,
            set_sidetone_rise_ms,
            set_buffer_size_mode,
            key_down,
            key_up,
            check_linux_virtual_audio,
            setup_linux_virtual_audio,
            remove_linux_virtual_audio,
            install_linux_audio_prerequisites,
            list_linux_missing_prerequisites,
            dump_linux_audio_diagnostics,
            mark_linux_audio_setup_complete,
            is_linux_audio_setup_completed,
            install_vbcable,
            start_test_recording,
            stop_test_recording,
            play_test_recording,
            stop_test_playback,
            get_test_recording_state,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Flush any debounced settings write before the process goes away.
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    let snapshot = state.settings.lock().clone();
                    let _ = snapshot.save();
                }
            }
        });
}
