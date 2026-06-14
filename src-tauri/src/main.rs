// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod cw;
mod input;
mod config;
mod linux_audio_setup;

use std::sync::Arc;
use std::thread;
use std::time::Duration;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use audio::{AudioEngineHandle, DeviceInfo};
use input::{MidiHandler, MidiEvent};
use cw::CwEngine;
use config::Settings;
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

/// Application state shared across the app
pub struct AppState {
    pub settings: Arc<Mutex<Settings>>,
    pub audio_engine: Arc<Mutex<Option<AudioEngineHandle>>>,
    pub midi_handler: Arc<Mutex<Option<MidiHandler>>>,
    pub cw_engine: Arc<Mutex<CwEngine>>,
}

// Implement Send + Sync for AppState since all fields are thread-safe
unsafe impl Send for AppState {}
unsafe impl Sync for AppState {}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Settings {
    state.settings.lock().clone()
}

#[tauri::command]
fn update_settings(state: tauri::State<AppState>, settings: Settings) -> Result<(), String> {
    let mut current = state.settings.lock();
    *current = settings.clone();

    // Update audio engine with new settings
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.set_sidetone_frequency(settings.sidetone_frequency);
        engine.set_sidetone_volume(settings.sidetone_volume);
        engine.set_local_sidetone_volume(settings.local_sidetone_volume);
        engine.set_mic_volume(settings.mic_volume);
        engine.set_mic_ducking(settings.mic_ducking);

        // Convert config sidetone route to audio sidetone route
        let audio_route = match settings.sidetone_route {
            config::SidetoneRoute::OutputOnly => audio::SidetoneRoute::OutputOnly,
            config::SidetoneRoute::LocalOnly => audio::SidetoneRoute::LocalOnly,
            config::SidetoneRoute::Both => audio::SidetoneRoute::Both,
        };
        engine.set_sidetone_route(audio_route);
    }

    // Update CW engine with new settings
    let mut cw = state.cw_engine.lock();
    cw.set_wpm(settings.wpm);
    cw.set_keyer_type(settings.keyer_type);

    // Sync settings to Vail adapter via MIDI
    if let Some(ref mut handler) = *state.midi_handler.lock() {
        // Send keyer type (convert enum to MIDI program number)
        let keyer_num = match settings.keyer_type {
            config::KeyerType::Straight => 1,
            config::KeyerType::Bug => 2,
            config::KeyerType::ElBug => 3,
            config::KeyerType::SingleDot => 4,
            config::KeyerType::Ultimatic => 5,
            config::KeyerType::PlainIambic => 6,
            config::KeyerType::IambicA => 7,
            config::KeyerType::IambicB => 8,
            config::KeyerType::Keyahead => 9,
        };
        let _ = handler.send_keyer_type(keyer_num);

        // Send WPM
        let _ = handler.send_wpm(settings.wpm as u8);

        // Send sidetone frequency (Hz -> nearest MIDI note, CC2)
        let _ = handler.send_sidetone_frequency_hz(settings.sidetone_frequency);
    }

    // Save settings to disk and return any errors to the frontend
    settings.save()
}

#[tauri::command]
fn list_midi_devices(state: tauri::State<AppState>) -> Vec<String> {
    if let Some(ref handler) = *state.midi_handler.lock() {
        handler.list_devices()
    } else {
        vec![]
    }
}

#[tauri::command]
fn connect_midi_device(state: tauri::State<AppState>, device_name: String) -> Result<(), String> {
    if let Some(ref mut handler) = *state.midi_handler.lock() {
        handler.connect(&device_name).map_err(|e| e.to_string())
    } else {
        Err("MIDI handler not initialized".to_string())
    }
}

#[tauri::command]
fn list_audio_devices() -> Vec<DeviceInfo> {
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
fn list_input_devices() -> Vec<DeviceInfo> {
    AudioEngineHandle::list_input_devices()
}

#[tauri::command]
fn start_audio(state: tauri::State<AppState>, device_name: Option<String>) -> Result<(), String> {
    let mut engine_lock = state.audio_engine.lock();

    if engine_lock.is_none() {
        let settings = state.settings.lock().clone();
        let engine = AudioEngineHandle::new(settings.sidetone_frequency, settings.sidetone_volume)?;
        *engine_lock = Some(engine);
    }

    if let Some(ref engine) = *engine_lock {
        engine.start(device_name)?;
    }

    Ok(())
}

#[tauri::command]
fn start_audio_with_devices(
    state: tauri::State<AppState>,
    output_device: Option<String>,
    input_device: Option<String>,
) -> Result<(), String> {
    let mut engine_lock = state.audio_engine.lock();

    if engine_lock.is_none() {
        let settings = state.settings.lock().clone();
        let engine = AudioEngineHandle::new(settings.sidetone_frequency, settings.sidetone_volume)?;
        *engine_lock = Some(engine);
    }

    if let Some(ref engine) = *engine_lock {
        engine.start_with_devices(output_device, input_device)?;
    }

    Ok(())
}

#[tauri::command]
fn start_audio_with_all_devices(
    state: tauri::State<AppState>,
    output_device: Option<String>,
    input_device: Option<String>,
    local_device: Option<String>,
) -> Result<(), String> {
    let mut engine_lock = state.audio_engine.lock();

    if engine_lock.is_none() {
        let settings = state.settings.lock().clone();
        let engine = AudioEngineHandle::new(settings.sidetone_frequency, settings.sidetone_volume)?;
        *engine_lock = Some(engine);
    }

    if let Some(ref engine) = *engine_lock {
        let settings = state.settings.lock().clone();
        let audio_route = match settings.sidetone_route {
            config::SidetoneRoute::OutputOnly => audio::SidetoneRoute::OutputOnly,
            config::SidetoneRoute::LocalOnly => audio::SidetoneRoute::LocalOnly,
            config::SidetoneRoute::Both => audio::SidetoneRoute::Both,
        };
        engine.start_with_all_devices(output_device, input_device, local_device, audio_route)?;
    }

    Ok(())
}

#[tauri::command]
fn stop_audio(state: tauri::State<AppState>) {
    if let Some(ref engine) = *state.audio_engine.lock() {
        let _ = engine.stop();
    }
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
fn key_down(state: tauri::State<AppState>, is_dit: bool) {
    eprintln!("[cmd] key_down called (is_dit={})", is_dit);
    // Trigger sidetone
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.key_down();
    } else {
        eprintln!("[cmd] WARNING: No audio engine in key_down!");
    }

    // Feed to CW engine for decoding
    let mut cw = state.cw_engine.lock();
    cw.key_down(is_dit);
}

#[tauri::command]
fn key_up(state: tauri::State<AppState>) {
    eprintln!("[cmd] key_up called");
    // Stop sidetone
    if let Some(ref engine) = *state.audio_engine.lock() {
        engine.key_up();
    }

    // Feed to CW engine for decoding
    let mut cw = state.cw_engine.lock();
    cw.key_up();
}

/// Helper to emit decoded characters to frontend
fn emit_decoded(app_handle: &AppHandle, decoded: cw::DecodedElement) {
    let _ = app_handle.emit("cw:decoded", DecodedEvent {
        character: decoded.character,
        wpm: decoded.wpm,
    });
}

/// Spawn a background thread to process MIDI events
fn start_midi_event_loop(
    app_handle: AppHandle,
    midi_handler: Arc<Mutex<Option<MidiHandler>>>,
    audio_engine: Arc<Mutex<Option<AudioEngineHandle>>>,
    cw_engine: Arc<Mutex<CwEngine>>,
) {
    thread::spawn(move || {
        let mut loop_counter: u32 = 0;

        loop {
            // Poll for MIDI events
            let event = {
                if let Some(ref handler) = *midi_handler.lock() {
                    handler.try_recv()
                } else {
                    None
                }
            };

            if let Some(event) = event {
                match event {
                    MidiEvent::NoteOn { note, velocity } => {
                        eprintln!("[midi] *** NOTE ON: note={}, velocity={} ***", note, velocity);

                        // Determine if this is a dit or dah based on note
                        // Vail adapter sends note 1 for dit, note 2 for dah (in keyer modes)
                        // In Passthrough mode it sends C# (61) for dit, D (62) for dah
                        let is_dit = note == 1 || note == 61;

                        // Trigger sidetone
                        if let Some(ref engine) = *audio_engine.lock() {
                            engine.key_down();
                        } else {
                            eprintln!("[midi] WARNING: No audio engine available!");
                        }

                        // Feed to CW engine - key_down may return decoded chars (from gap)
                        let mut cw = cw_engine.lock();
                        if let Some(decoded) = cw.key_down(is_dit) {
                            emit_decoded(&app_handle, decoded);
                        }

                        // Emit event to frontend
                        let _ = app_handle.emit("cw:key", KeyEvent { down: true });
                    }
                    MidiEvent::NoteOff { note } => {
                        eprintln!("[midi] Note Off: note={}", note);

                        // Stop sidetone
                        if let Some(ref engine) = *audio_engine.lock() {
                            engine.key_up();
                        }

                        // Feed to CW engine
                        let mut cw = cw_engine.lock();
                        if let Some(decoded) = cw.key_up() {
                            emit_decoded(&app_handle, decoded);
                        }

                        // Emit key up event
                        let _ = app_handle.emit("cw:key", KeyEvent { down: false });
                    }
                    MidiEvent::ControlChange { controller, value } => {
                        eprintln!("[midi] CC: controller={}, value={}", controller, value);
                    }
                }
            }

            // Check for timeout every ~50ms (50 loop iterations at 1ms sleep)
            loop_counter = loop_counter.wrapping_add(1);
            if loop_counter % 50 == 0 {
                let mut cw = cw_engine.lock();
                if let Some(decoded) = cw.check_timeout() {
                    emit_decoded(&app_handle, decoded);
                }
            }

            // Small sleep to avoid busy-waiting
            thread::sleep(Duration::from_millis(1));
        }
    });
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

            let midi_handler = Arc::new(Mutex::new(MidiHandler::new().ok()));
            let audio_engine = Arc::new(Mutex::new(None));
            let cw_engine = Arc::new(Mutex::new(cw_engine));

            let state = AppState {
                settings: Arc::new(Mutex::new(settings)),
                audio_engine: Arc::clone(&audio_engine),
                midi_handler: Arc::clone(&midi_handler),
                cw_engine: Arc::clone(&cw_engine),
            };

            app.manage(state);

            // Start the MIDI event processing loop
            start_midi_event_loop(
                app.handle().clone(),
                midi_handler,
                audio_engine,
                cw_engine,
            );

            Ok(())
        })
        .on_window_event(|_window, _event| {
            // Virtual audio devices are persistent (loaded by the systemd user
            // unit on every login), so we intentionally do nothing on window
            // close. Users can remove devices explicitly from the UI.
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            list_midi_devices,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
