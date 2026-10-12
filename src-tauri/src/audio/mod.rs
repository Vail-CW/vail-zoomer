mod sidetone;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Stream, StreamConfig, SupportedBufferSize, SupportedStreamConfig};
use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use crossbeam_queue::ArrayQueue;
use ringbuf::{
    traits::{Consumer, Observer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::config::{BufferSizeMode, Settings};

#[cfg(target_os = "linux")]
use std::process::Command;


/// Linux audio routing: PulseAudio/PipeWire-Pulse honor `PULSE_SINK` /
/// `PULSE_SOURCE`, and pipewire-alsa honors `PIPEWIRE_NODE`. Setting these
/// before we open the cpal stream is the most reliable way to ensure the
/// stream lands on the right virtual device — far better than racing a
/// `pactl move-sink-input` against the new stream's registration.
///
/// Env vars are process-global, but cpal stream construction is serialized
/// on the audio thread, so set→build→clear is safe within that thread.
#[cfg(target_os = "linux")]
struct PulseRouteGuard {
    prev_sink: Option<String>,
    prev_source: Option<String>,
    prev_pipewire_node: Option<String>,
}

#[cfg(target_os = "linux")]
impl PulseRouteGuard {
    fn for_sink(name: Option<&str>) -> Self {
        let prev_sink = std::env::var("PULSE_SINK").ok();
        let prev_pipewire_node = std::env::var("PIPEWIRE_NODE").ok();
        if let Some(n) = name {
            std::env::set_var("PULSE_SINK", n);
            std::env::set_var("PIPEWIRE_NODE", n);
        } else {
            std::env::remove_var("PULSE_SINK");
            std::env::remove_var("PIPEWIRE_NODE");
        }
        Self {
            prev_sink,
            prev_source: None,
            prev_pipewire_node,
        }
    }

    fn for_source(name: Option<&str>) -> Self {
        let prev_source = std::env::var("PULSE_SOURCE").ok();
        let prev_pipewire_node = std::env::var("PIPEWIRE_NODE").ok();
        if let Some(n) = name {
            std::env::set_var("PULSE_SOURCE", n);
            std::env::set_var("PIPEWIRE_NODE", n);
        } else {
            std::env::remove_var("PULSE_SOURCE");
            std::env::remove_var("PIPEWIRE_NODE");
        }
        Self {
            prev_sink: None,
            prev_source,
            prev_pipewire_node,
        }
    }
}

/// Return a sink to route the local-monitoring stream to: the user's
/// chosen device, or the system default — but if the default is VailZoomer
/// itself (which would create a sidetone loop), pick the first non-VailZoomer
/// sink instead.
#[cfg(target_os = "linux")]
fn resolve_local_sink(explicit: Option<&str>) -> Option<String> {
    if let Some(name) = explicit {
        return Some(name.to_string());
    }

    let default_sink = Command::new("pactl")
        .args(["get-default-sink"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    if !default_sink.is_empty() && !default_sink.to_lowercase().contains("vailzoomer") {
        return Some(default_sink);
    }

    // Default is VailZoomer (or unknown) — pick the first sink that isn't us.
    Command::new("pactl")
        .args(["list", "sinks", "short"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout).into_owned();
            for line in stdout.lines() {
                let mut parts = line.split_whitespace();
                let _id = parts.next();
                if let Some(name) = parts.next() {
                    if !name.to_lowercase().contains("vailzoomer") {
                        return Some(name.to_string());
                    }
                }
            }
            None
        })
}

#[cfg(target_os = "linux")]
impl Drop for PulseRouteGuard {
    fn drop(&mut self) {
        match self.prev_sink.take() {
            Some(v) => std::env::set_var("PULSE_SINK", v),
            None => std::env::remove_var("PULSE_SINK"),
        }
        match self.prev_source.take() {
            Some(v) => std::env::set_var("PULSE_SOURCE", v),
            None => std::env::remove_var("PULSE_SOURCE"),
        }
        match self.prev_pipewire_node.take() {
            Some(v) => std::env::set_var("PIPEWIRE_NODE", v),
            None => std::env::remove_var("PIPEWIRE_NODE"),
        }
    }
}

#[cfg(target_os = "macos")]
extern "C" {
    fn request_microphone_permission() -> i32;
    fn check_microphone_permission() -> i32;
}

pub use sidetone::SidetoneGenerator;

/// Device info with display name and internal name for selection
#[derive(Clone, serde::Serialize)]
pub struct DeviceInfo {
    /// User-friendly display name
    pub display_name: String,
    /// Internal name used for device selection (cpal name)
    pub internal_name: String,
}

/// Events the audio thread reports to the rest of the app. Always sent from
/// the audio thread's control loop, never from inside a realtime callback.
#[derive(Debug, Clone)]
pub enum AudioEvent {
    /// A stream reported an error ("input", "output", "local" or "playback").
    StreamError { stream: &'static str, message: String },
    /// Automatic recovery succeeded and audio is running again.
    Restarted,
    /// Automatic recovery gave up after all retries.
    RestartFailed { message: String },
    /// The backend said a device disappeared (unplugged, disabled, ...).
    DeviceLost,
}

/// Mic ring buffer: how much mic audio we try to keep queued (latency vs.
/// underrun safety), and how big the ring is (headroom for bursts).
const TARGET_FILL_SECS: f32 = 0.040;
const RING_SECS: f32 = 0.250;

/// Mic ducking hold time after key up
const MIC_DUCKING_HOLD_SECS: f32 = 0.250;

/// Max test recording length in seconds. The buffer is preallocated for up to
/// 192 kHz so the realtime callback never has to grow it.
const MAX_RECORDING_SECS: usize = 5;
const MAX_RECORDING_SAMPLES: usize = 192_000 * MAX_RECORDING_SECS;

/// Capacity of each key-event queue (events are tiny and consumed every
/// few milliseconds, so this is generous).
const KEY_QUEUE_CAPACITY: usize = 256;

/// Auto-restart policy after a stream error.
const RESTART_ATTEMPTS: u32 = 3;
const RESTART_BACKOFF: Duration = Duration::from_millis(500);

/// Sidetone routing mode
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SidetoneRoute {
    OutputOnly,  // Only to VB-Cable (silent locally)
    LocalOnly,   // Only to local speakers
    Both,        // Both outputs
}

impl SidetoneRoute {
    fn includes_output(self) -> bool {
        self != SidetoneRoute::LocalOnly
    }
    fn includes_local(self) -> bool {
        self != SidetoneRoute::OutputOnly
    }
    fn from_u32(v: u32) -> Self {
        match v {
            0 => SidetoneRoute::OutputOnly,
            1 => SidetoneRoute::LocalOnly,
            _ => SidetoneRoute::Both,
        }
    }
}

impl From<crate::config::SidetoneRoute> for SidetoneRoute {
    fn from(r: crate::config::SidetoneRoute) -> Self {
        match r {
            crate::config::SidetoneRoute::OutputOnly => SidetoneRoute::OutputOnly,
            crate::config::SidetoneRoute::LocalOnly => SidetoneRoute::LocalOnly,
            crate::config::SidetoneRoute::Both => SidetoneRoute::Both,
        }
    }
}

fn buffer_mode_to_u32(m: BufferSizeMode) -> u32 {
    match m {
        BufferSizeMode::Auto => 0,
        BufferSizeMode::Low => 1,
        BufferSizeMode::Safe => 2,
    }
}

/// Frame count requested for a buffer mode (None = let the driver pick).
fn buffer_mode_frames(v: u32) -> Option<u32> {
    match v {
        1 => Some(128),
        2 => Some(1024),
        _ => None,
    }
}

/// A key transition stamped with when it really happened, so the output
/// callback can place the edge on the exact sample instead of the buffer start.
#[derive(Clone, Copy)]
struct KeyEvent {
    at: Instant,
    down: bool,
}

/// A stream error captured by a cpal error callback. The error callback may
/// run on the backend's audio thread, so it only does a non-blocking
/// `try_send`; the audio control loop does everything else.
struct StreamFault {
    stream: &'static str,
    message: String,
    device_lost: bool,
}

/// State shared between the handle, the control thread and the realtime
/// callbacks. Everything here is atomics or lock-free queues, except the
/// recording buffer (try-locked, never blocked on, from callbacks).
struct Shared {
    frequency: AtomicU32,     // f32 bits
    volume: AtomicU32,        // Sidetone volume for output (Zoom), f32 bits
    local_volume: AtomicU32,  // Sidetone volume for local monitoring, f32 bits
    rise_ms: AtomicU32,       // Sidetone rise/fall time, f32 bits
    mic_volume: AtomicU32,
    mic_level: AtomicU32,
    output_level: AtomicU32,
    route: AtomicU32,          // SidetoneRoute as u32; read per callback so changes are live
    mic_ducking: AtomicBool,
    buffer_mode: AtomicU32,    // BufferSizeMode as u32; read at stream build time
    key_down: AtomicBool,      // Latest requested key state (for introspection / restarts)
    // One queue per consuming stream so each sees every edge.
    key_queue_out: Arc<ArrayQueue<KeyEvent>>,
    key_queue_local: Arc<ArrayQueue<KeyEvent>>,
    // Test recording state
    is_recording: AtomicBool,
    is_playing: AtomicBool,
    recording_buffer: parking_lot::Mutex<Vec<f32>>,
    playback_position: AtomicUsize,
    sample_rate: AtomicU32,
}

impl Shared {
    fn new(frequency: f32, volume: f32) -> Self {
        Self {
            frequency: AtomicU32::new(frequency.to_bits()),
            volume: AtomicU32::new(volume.to_bits()),
            local_volume: AtomicU32::new(0.3_f32.to_bits()),
            rise_ms: AtomicU32::new(5.0_f32.to_bits()),
            mic_volume: AtomicU32::new(1.0_f32.to_bits()),
            mic_level: AtomicU32::new(0.0_f32.to_bits()),
            output_level: AtomicU32::new(0.0_f32.to_bits()),
            route: AtomicU32::new(0),
            mic_ducking: AtomicBool::new(false),
            buffer_mode: AtomicU32::new(0),
            key_down: AtomicBool::new(false),
            key_queue_out: Arc::new(ArrayQueue::new(KEY_QUEUE_CAPACITY)),
            key_queue_local: Arc::new(ArrayQueue::new(KEY_QUEUE_CAPACITY)),
            is_recording: AtomicBool::new(false),
            is_playing: AtomicBool::new(false),
            recording_buffer: parking_lot::Mutex::new(Vec::with_capacity(MAX_RECORDING_SAMPLES)),
            playback_position: AtomicUsize::new(0),
            sample_rate: AtomicU32::new(48000),
        }
    }

    fn load_f32(a: &AtomicU32) -> f32 {
        f32::from_bits(a.load(Ordering::Relaxed))
    }

    fn route(&self) -> SidetoneRoute {
        SidetoneRoute::from_u32(self.route.load(Ordering::Relaxed))
    }
}

/// Commands sent to the audio thread
enum AudioCommand {
    Start {
        output_device: Option<String>,
        input_device: Option<String>,
        local_device: Option<String>,
    },
    Stop,
    /// Route atomics are already updated; the thread only needs to know so it
    /// can lazily create the local stream.
    SetSidetoneRoute,
    StartTestRecording,
    StopTestRecording,
    StartPlayback { device: Option<String> },
    StopPlayback,
    Shutdown,
}

type Subscribers = Arc<parking_lot::Mutex<Vec<Sender<AudioEvent>>>>;

/// Handle to control the audio engine from Tauri commands
/// This is Send + Sync safe because it only holds channels and atomics
pub struct AudioEngineHandle {
    command_tx: Sender<AudioCommand>,
    shared: Arc<Shared>,
    subscribers: Subscribers,
}

impl AudioEngineHandle {
    /// Create a new audio engine handle and spawn the audio thread.
    /// Call `apply_settings` afterwards to push the rest of the saved settings.
    pub fn new(frequency: f32, volume: f32) -> Result<Self, String> {
        let (command_tx, command_rx) = bounded::<AudioCommand>(16);
        let shared = Arc::new(Shared::new(frequency, volume));
        let subscribers: Subscribers = Arc::new(parking_lot::Mutex::new(Vec::new()));

        let shared_clone = Arc::clone(&shared);
        let subs_clone = Arc::clone(&subscribers);
        thread::spawn(move || audio_thread(command_rx, shared_clone, subs_clone));

        Ok(Self { command_tx, shared, subscribers })
    }

    /// Subscribe to engine events (stream errors, auto-restart results).
    /// Every subscriber receives every event.
    pub fn subscribe(&self) -> Receiver<AudioEvent> {
        let (tx, rx) = unbounded();
        self.subscribers.lock().push(tx);
        rx
    }

    /// List available audio output devices with friendly names
    pub fn list_output_devices() -> Vec<DeviceInfo> {
        #[cfg(target_os = "linux")]
        {
            if let Some(devices) = list_pulseaudio_sinks() {
                return devices;
            }
        }

        // Fallback to cpal names (used on Windows/macOS or if PulseAudio unavailable)
        let host = cpal::default_host();
        host.output_devices()
            .map(|devices| {
                devices
                    .filter_map(|d| {
                        d.name().ok().map(|name| DeviceInfo {
                            display_name: name.clone(),
                            internal_name: name,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// List available audio input devices with friendly names
    pub fn list_input_devices() -> Vec<DeviceInfo> {
        #[cfg(target_os = "linux")]
        {
            if let Some(devices) = list_pulseaudio_sources() {
                return devices;
            }
        }

        // Fallback to cpal names (used on Windows/macOS or if PulseAudio unavailable)
        let host = cpal::default_host();
        host.input_devices()
            .map(|devices| {
                devices
                    .filter_map(|d| {
                        d.name().ok().map(|name| DeviceInfo {
                            display_name: name.clone(),
                            internal_name: name,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Push every audio-relevant saved setting into the live engine. Safe to
    /// call before or after start; all values are read live by the callbacks
    /// except the buffer size mode, which applies on the next start.
    pub fn apply_settings(&self, settings: &Settings) {
        self.set_sidetone_frequency(settings.sidetone_frequency);
        self.set_sidetone_volume(settings.sidetone_volume);
        self.set_local_sidetone_volume(settings.local_sidetone_volume);
        self.set_sidetone_rise_ms(settings.sidetone_rise_ms);
        self.set_mic_volume(settings.mic_volume);
        self.set_mic_ducking(settings.mic_ducking);
        self.set_buffer_size_mode(settings.buffer_size_mode);
        self.set_sidetone_route(settings.sidetone_route.into());
    }

    /// Start audio with optional output device name (uses the current route)
    pub fn start(&self, output_device: Option<String>) -> Result<(), String> {
        self.command_tx.send(AudioCommand::Start {
            output_device,
            input_device: None,
            local_device: None,
        })
        .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Start audio with both input and output devices
    pub fn start_with_devices(&self, output_device: Option<String>, input_device: Option<String>) -> Result<(), String> {
        self.command_tx.send(AudioCommand::Start {
            output_device,
            input_device,
            local_device: None,
        })
        .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Start audio with full device configuration
    pub fn start_with_all_devices(
        &self,
        output_device: Option<String>,
        input_device: Option<String>,
        local_device: Option<String>,
        sidetone_route: SidetoneRoute,
    ) -> Result<(), String> {
        self.shared.route.store(sidetone_route as u32, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::Start {
            output_device,
            input_device,
            local_device,
        })
        .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Stop audio output
    pub fn stop(&self) -> Result<(), String> {
        self.command_tx.send(AudioCommand::Stop)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Queue a key transition that happened at `at`. The output callbacks place
    /// the edge on the matching sample within their buffer. Lock-free; safe to
    /// call from the MIDI thread.
    pub fn key_event(&self, down: bool, at: Instant) {
        self.shared.key_down.store(down, Ordering::Relaxed);
        let ev = KeyEvent { at, down };
        // force_push drops the oldest event if a queue is full (e.g. a stream
        // that isn't running) instead of ever blocking or rejecting the newest.
        let _ = self.shared.key_queue_out.force_push(ev);
        let _ = self.shared.key_queue_local.force_push(ev);
    }

    /// Set the key state "now"
    pub fn set_key_down(&self, down: bool) {
        self.key_event(down, Instant::now());
    }

    /// Signal key down (start sidetone)
    pub fn key_down(&self) {
        self.set_key_down(true);
    }

    /// Signal key up (stop sidetone)
    pub fn key_up(&self) {
        self.set_key_down(false);
    }

    /// Sound the sidetone at `frequency_hz` for `duration_ms` through the
    /// active route, without involving the decoder. Also makes `frequency_hz`
    /// the live sidetone frequency. The key-up is queued with a future
    /// timestamp; the callback holds it until it is due.
    pub fn play_tone_preview(&self, frequency_hz: f32, duration_ms: u32) {
        self.shared.frequency.store(frequency_hz.to_bits(), Ordering::Relaxed);
        let now = Instant::now();
        self.key_event(true, now);
        self.key_event(false, now + Duration::from_millis(duration_ms as u64));
    }

    /// Enable or disable mic ducking while sending
    pub fn set_mic_ducking(&self, enabled: bool) {
        self.shared.mic_ducking.store(enabled, Ordering::Relaxed);
    }

    /// Update sidetone frequency
    pub fn set_sidetone_frequency(&self, frequency: f32) {
        self.shared.frequency.store(frequency.to_bits(), Ordering::Relaxed);
    }

    /// Update sidetone volume (for output to Zoom)
    pub fn set_sidetone_volume(&self, volume: f32) {
        self.shared.volume.store(volume.to_bits(), Ordering::Relaxed);
    }

    /// Update local sidetone volume (for local monitoring)
    pub fn set_local_sidetone_volume(&self, volume: f32) {
        self.shared.local_volume.store(volume.to_bits(), Ordering::Relaxed);
    }

    /// Update the sidetone rise/fall time (clamped to 1..=20 ms)
    pub fn set_sidetone_rise_ms(&self, rise_ms: f32) {
        let rise_ms = rise_ms.clamp(1.0, 20.0);
        self.shared.rise_ms.store(rise_ms.to_bits(), Ordering::Relaxed);
    }

    /// Choose the requested buffer size; takes effect on the next start.
    pub fn set_buffer_size_mode(&self, mode: BufferSizeMode) {
        self.shared.buffer_mode.store(buffer_mode_to_u32(mode), Ordering::Relaxed);
    }

    /// Update microphone volume
    pub fn set_mic_volume(&self, volume: f32) {
        self.shared.mic_volume.store(volume.to_bits(), Ordering::Relaxed);
    }

    /// Get current microphone level (0.0 to 1.0)
    pub fn get_mic_level(&self) -> f32 {
        Shared::load_f32(&self.shared.mic_level)
    }

    /// Get current output level (0.0 to 1.0)
    pub fn get_output_level(&self) -> f32 {
        Shared::load_f32(&self.shared.output_level)
    }

    /// Set sidetone routing mode. Takes effect immediately; a local-monitor
    /// stream is created on demand if the engine is running without one.
    pub fn set_sidetone_route(&self, route: SidetoneRoute) {
        self.shared.route.store(route as u32, Ordering::Relaxed);
        let _ = self.command_tx.try_send(AudioCommand::SetSidetoneRoute);
    }

    /// Get current sidetone routing mode
    pub fn get_sidetone_route(&self) -> SidetoneRoute {
        self.shared.route()
    }

    /// Start test recording - captures 5 seconds of mixed audio
    pub fn start_test_recording(&self) -> Result<(), String> {
        // Clear buffer and start recording
        self.shared.recording_buffer.lock().clear();
        self.shared.is_recording.store(true, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StartTestRecording)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Stop test recording
    pub fn stop_test_recording(&self) -> Result<(), String> {
        self.shared.is_recording.store(false, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StopTestRecording)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Start playback of recorded audio
    pub fn start_playback(&self, device: Option<String>) -> Result<(), String> {
        self.shared.playback_position.store(0, Ordering::Relaxed);
        self.shared.is_playing.store(true, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StartPlayback { device })
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Stop playback
    pub fn stop_playback(&self) -> Result<(), String> {
        self.shared.is_playing.store(false, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StopPlayback)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        self.shared.is_recording.load(Ordering::Relaxed)
    }

    /// Check if currently playing back
    pub fn is_playing(&self) -> bool {
        self.shared.is_playing.load(Ordering::Relaxed)
    }

    /// Get number of samples recorded
    pub fn get_recording_samples(&self) -> usize {
        self.shared.recording_buffer.lock().len()
    }

    /// Get current sample rate
    pub fn get_sample_rate(&self) -> u32 {
        self.shared.sample_rate.load(Ordering::Relaxed)
    }

    /// Get recording duration in seconds
    pub fn get_recording_duration(&self) -> f32 {
        let samples = self.get_recording_samples();
        let rate = self.get_sample_rate();
        if rate > 0 {
            samples as f32 / rate as f32
        } else {
            0.0
        }
    }

    /// Get playback progress (0.0 to 1.0)
    pub fn get_playback_progress(&self) -> f32 {
        let total = self.get_recording_samples();
        if total == 0 {
            return 0.0;
        }
        let pos = self.shared.playback_position.load(Ordering::Relaxed);
        (pos as f32 / total as f32).min(1.0)
    }
}

impl Drop for AudioEngineHandle {
    fn drop(&mut self) {
        let _ = self.command_tx.send(AudioCommand::Shutdown);
    }
}

/// Devices used by the last Start, remembered for auto-restart and for lazily
/// creating the local-monitor stream.
#[derive(Clone)]
struct StartConfig {
    output_device: Option<String>,
    input_device: Option<String>,
    local_device: Option<String>,
}

/// Owns the cpal streams (which are not Send) on the audio thread.
struct Engine {
    shared: Arc<Shared>,
    fault_tx: Sender<StreamFault>,
    output_stream: Option<Stream>,
    local_stream: Option<Stream>,
    input_stream: Option<Stream>,
    playback_stream: Option<Stream>,
    config: Option<StartConfig>,
    running: bool,
}

impl Engine {
    fn drop_main_streams(&mut self) {
        self.output_stream = None;
        self.local_stream = None;
        self.input_stream = None;
    }

    /// (Re)build mic input, main output and, if the route needs it, the local
    /// monitor stream. Only a main-output failure is an error; a missing mic or
    /// local device is logged and the rest keeps working.
    fn build_streams(&mut self, cfg: &StartConfig) -> Result<(), String> {
        self.drop_main_streams();
        let shared = &self.shared;

        // Stale edges from before this (re)start must not replay.
        while shared.key_queue_out.pop().is_some() {}
        while shared.key_queue_local.pop().is_some() {}

        // Output rate is resolved up-front so the mic resampler can target it.
        // Without this, a 44.1 kHz mic feeding a 48 kHz cable sounds garbled.
        let target_rate = query_output_sample_rate(cfg.output_device.as_deref());
        eprintln!("[audio] Target output sample rate (for mic resampler): {} Hz", target_rate);

        // Fresh ring per start (no stale data), pre-filled with silence to the
        // target fill so the output doesn't start by underrunning.
        let target_fill = ((target_rate * TARGET_FILL_SECS) as usize).max(1);
        let capacity = (target_rate * RING_SECS) as usize;
        let (mut producer, consumer) = HeapRb::<f32>::new(capacity).split();
        for _ in 0..target_fill {
            let _ = producer.try_push(0.0);
        }

        match create_input_stream(
            cfg.input_device.as_deref(),
            producer,
            Arc::clone(shared),
            target_rate,
            target_fill,
            self.fault_tx.clone(),
        ) {
            Ok(stream) => match stream.play() {
                Ok(()) => {
                    self.input_stream = Some(stream);
                    eprintln!("[audio] Mic input started: {:?}", cfg.input_device);
                }
                Err(e) => eprintln!("[audio] Failed to start mic input: {}", e),
            },
            Err(e) => eprintln!("[audio] Failed to create mic input stream: {}", e),
        }

        let stream = create_output_stream(
            cfg.output_device.as_deref(),
            Arc::clone(shared),
            consumer,
            target_fill,
            self.fault_tx.clone(),
        )?;
        stream.play().map_err(|e| format!("Failed to start audio output: {}", e))?;
        self.output_stream = Some(stream);
        eprintln!("[audio] Audio output started");

        self.config = Some(cfg.clone());
        self.running = true;
        self.ensure_local_stream();
        Ok(())
    }

    /// Create the local monitor stream if the route wants it and it doesn't exist.
    fn ensure_local_stream(&mut self) {
        if !self.running || self.local_stream.is_some() || !self.shared.route().includes_local() {
            return;
        }
        let local_device = self.config.as_ref().and_then(|c| c.local_device.clone());
        eprintln!("[audio] Creating local output stream with device: {:?}", local_device);
        match create_local_output_stream(local_device.as_deref(), Arc::clone(&self.shared), self.fault_tx.clone()) {
            Ok(stream) => match stream.play() {
                Ok(()) => {
                    self.local_stream = Some(stream);
                    eprintln!("[audio] Local sidetone output started");
                }
                Err(e) => eprintln!("[audio] Failed to start local output: {}", e),
            },
            Err(e) => eprintln!("[audio] Failed to create local output stream: {}", e),
        }
    }

    fn start_playback(&mut self, device: Option<&str>) {
        self.playback_stream = None;
        // Copy out under the lock here (control thread), so the callback can
        // own plain data and never touch the mutex.
        let recording = self.shared.recording_buffer.lock().clone();
        let rec_rate = self.shared.sample_rate.load(Ordering::Relaxed) as f32;
        match create_playback_stream(device, recording, rec_rate, Arc::clone(&self.shared), self.fault_tx.clone()) {
            Ok(stream) => match stream.play() {
                Ok(()) => {
                    self.playback_stream = Some(stream);
                    eprintln!("[audio] Playback started");
                }
                Err(e) => {
                    eprintln!("[audio] Failed to start playback: {}", e);
                    self.shared.is_playing.store(false, Ordering::Relaxed);
                }
            },
            Err(e) => {
                eprintln!("[audio] Failed to create playback stream: {}", e);
                self.shared.is_playing.store(false, Ordering::Relaxed);
            }
        }
    }
}

fn emit(subscribers: &Subscribers, event: AudioEvent) {
    // Drop subscribers whose receiver went away.
    subscribers.lock().retain(|tx| tx.send(event.clone()).is_ok());
}

/// Tracks an in-progress automatic restart so the control loop can keep
/// servicing commands between attempts instead of sleeping.
struct Restart {
    attempt: u32,
    next_at: Instant,
}

/// Audio thread that owns the cpal Streams (not Send)
fn audio_thread(command_rx: Receiver<AudioCommand>, shared: Arc<Shared>, subscribers: Subscribers) {
    let (fault_tx, fault_rx) = bounded::<StreamFault>(16);
    let mut engine = Engine {
        shared: Arc::clone(&shared),
        fault_tx,
        output_stream: None,
        local_stream: None,
        input_stream: None,
        playback_stream: None,
        config: None,
        running: false,
    };
    let mut restart: Option<Restart> = None;

    loop {
        // Wake at least every 50 ms to poll stream faults, sooner if a restart is due.
        let mut wait = Duration::from_millis(50);
        if let Some(r) = &restart {
            wait = wait.min(r.next_at.saturating_duration_since(Instant::now()));
        }

        match command_rx.recv_timeout(wait) {
            Ok(AudioCommand::Start { output_device, input_device, local_device }) => {
                eprintln!("[audio] === Starting audio ===");
                eprintln!("[audio] Output device: {:?}", output_device);
                eprintln!("[audio] Input device: {:?}", input_device);
                eprintln!("[audio] Local device: {:?}", local_device);
                eprintln!("[audio] Sidetone route: {:?} (0=OutputOnly, 1=LocalOnly, 2=Both)", shared.route() as u32);

                restart = None;
                let cfg = StartConfig { output_device, input_device, local_device };
                if let Err(e) = engine.build_streams(&cfg) {
                    eprintln!("[audio] Failed to start audio: {}", e);
                    engine.running = false;
                    emit(&subscribers, AudioEvent::StreamError { stream: "output", message: e });
                }
                while fault_rx.try_recv().is_ok() {}
            }
            Ok(AudioCommand::Stop) => {
                restart = None;
                engine.running = false;
                engine.drop_main_streams();
            }
            Ok(AudioCommand::SetSidetoneRoute) => {
                // The callbacks already read the new route atomically; only the
                // local stream may need to appear.
                engine.ensure_local_stream();
            }
            Ok(AudioCommand::StartTestRecording) => {
                eprintln!("[audio] Starting test recording...");
            }
            Ok(AudioCommand::StopTestRecording) => {
                eprintln!("[audio] Stopped test recording. Samples: {}", shared.recording_buffer.lock().len());
            }
            Ok(AudioCommand::StartPlayback { device }) => {
                eprintln!("[audio] Starting playback on device: {:?}", device);
                engine.start_playback(device.as_deref());
            }
            Ok(AudioCommand::StopPlayback) => {
                eprintln!("[audio] Stopping playback");
                engine.playback_stream = None;
            }
            Ok(AudioCommand::Shutdown) | Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                engine.drop_main_streams();
                engine.playback_stream = None;
                break;
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
        }

        // Surface faults reported by stream error callbacks.
        while let Ok(fault) = fault_rx.try_recv() {
            eprintln!("[audio] {} stream error: {}", fault.stream, fault.message);
            if fault.stream == "playback" {
                shared.is_playing.store(false, Ordering::Relaxed);
                emit(&subscribers, AudioEvent::StreamError { stream: fault.stream, message: fault.message });
                continue;
            }
            // Ignore follow-on faults while already stopped or recovering.
            if !engine.running || restart.is_some() {
                continue;
            }
            if fault.device_lost {
                emit(&subscribers, AudioEvent::DeviceLost);
            }
            emit(&subscribers, AudioEvent::StreamError { stream: fault.stream, message: fault.message });
            restart = Some(Restart { attempt: 0, next_at: Instant::now() + RESTART_BACKOFF });
        }

        // Run a due restart attempt.
        let due = restart.as_ref().map_or(false, |r| Instant::now() >= r.next_at);
        if due {
            let mut r = restart.take().unwrap();
            r.attempt += 1;
            let mut cfg = engine.config.clone().unwrap_or(StartConfig {
                output_device: None,
                input_device: None,
                local_device: None,
            });
            // Last resort: the named devices may be gone for good, so try the defaults.
            if r.attempt >= RESTART_ATTEMPTS {
                cfg = StartConfig { output_device: None, input_device: None, local_device: None };
            }
            eprintln!("[audio] Restart attempt {}/{}", r.attempt, RESTART_ATTEMPTS);
            match engine.build_streams(&cfg) {
                Ok(()) => {
                    // Dropping the old streams can raise stale errors; discard them.
                    while fault_rx.try_recv().is_ok() {}
                    emit(&subscribers, AudioEvent::Restarted);
                }
                Err(e) if r.attempt >= RESTART_ATTEMPTS => {
                    engine.running = false;
                    emit(&subscribers, AudioEvent::RestartFailed { message: e });
                }
                Err(_) => {
                    r.next_at = Instant::now() + RESTART_BACKOFF;
                    restart = Some(r);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Realtime DSP. Everything below runs inside cpal callbacks: no locks, no
// allocation, no I/O. State lives in plain structs owned by the closure.
// ---------------------------------------------------------------------------

/// Smooth, bounded saturation: linear up to `KNEE`, then a tanh curve that
/// approaches (but never exceeds) 1.0, so loud peaks round off instead of
/// hard-clipping.
const LIMITER_KNEE: f32 = 0.9;

#[inline]
fn soft_clip(x: f32) -> f32 {
    let a = x.abs();
    if a <= LIMITER_KNEE {
        x
    } else {
        let head = 1.0 - LIMITER_KNEE;
        x.signum() * (LIMITER_KNEE + head * ((a - LIMITER_KNEE) / head).tanh())
    }
}

/// Feed-forward peak limiter (fast attack, ~50 ms release) followed by the
/// soft clipper above as a guarantee that |output| <= 1.0.
struct Limiter {
    gain: f32,
    attack: f32,
    release: f32,
}

impl Limiter {
    fn new(sample_rate: f32) -> Self {
        Self {
            gain: 1.0,
            attack: 1.0 - (-1.0 / (0.0005 * sample_rate)).exp(),
            release: 1.0 - (-1.0 / (0.050 * sample_rate)).exp(),
        }
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let a = x.abs();
        let target = if a > LIMITER_KNEE { LIMITER_KNEE / a } else { 1.0 };
        let coef = if target < self.gain { self.attack } else { self.release };
        self.gain += (target - self.gain) * coef;
        soft_clip(x * self.gain)
    }
}

/// Turns timestamped key events into sample-accurate edges inside a callback.
///
/// An event stamped `at` is placed at sample offset
/// `(at + buffer_duration - callback_start) * rate`: i.e. every edge is
/// delayed by exactly one buffer. A constant delay preserves dit/dah timing
/// to the sample, whereas snapping to buffer boundaries would add up to a
/// buffer of jitter. Events that are already older than that land on sample 0
/// of this buffer, and events scheduled beyond this buffer (tone preview
/// key-ups) are held until a later callback.
struct KeyScheduler {
    queue: Arc<ArrayQueue<KeyEvent>>,
    pending: Option<KeyEvent>,
}

impl KeyScheduler {
    fn new(queue: Arc<ArrayQueue<KeyEvent>>) -> Self {
        Self { queue, pending: None }
    }

    /// Next edge due within this buffer as `(sample offset, key_down)`.
    fn next_edge(&mut self, now: Instant, latency_s: f64, rate: f64, frames: usize) -> Option<(usize, bool)> {
        let ev = self.pending.take().or_else(|| self.queue.pop())?;
        let rel_s = if ev.at >= now {
            (ev.at - now).as_secs_f64() + latency_s
        } else {
            latency_s - (now - ev.at).as_secs_f64()
        };
        let offset = (rel_s * rate).max(0.0);
        if offset >= frames as f64 {
            self.pending = Some(ev);
            None
        } else {
            Some((offset as usize, ev.down))
        }
    }
}

/// Exponential smoothing step for a ~`secs` time constant.
fn smoothing_coef(secs: f32, rate: f32) -> f32 {
    1.0 - (-1.0 / (secs * rate)).exp()
}

/// Output-callback peak/level metering shared by the mixers.
#[inline]
fn update_level(level: &AtomicU32, peak: f32) {
    let current = f32::from_bits(level.load(Ordering::Relaxed));
    let new_level = if peak > current {
        peak // Fast attack
    } else {
        current * 0.95 + peak * 0.05 // Slow decay
    };
    level.store(new_level.to_bits(), Ordering::Relaxed);
}

/// Main output: mic (from the ring) + sidetone, limited.
struct MainMixer {
    shared: Arc<Shared>,
    consumer: HeapCons<f32>,
    generator: SidetoneGenerator,
    sched: KeyScheduler,
    limiter: Limiter,
    channels: usize,
    rate: f64,
    key_down: bool,
    // Mic ducking: hold counter (in samples) and a short gain ramp so muting
    // the mic doesn't click.
    duck_hold: u32,
    duck_hold_max: u32,
    duck_gain: f32,
    duck_coef: f32,
    // Sidetone route gate, ramped so live route changes don't click.
    tone_gate: f32,
    gate_coef: f32,
    // If the ring ever grows past this (e.g. after a stall) we drop back to target.
    target_fill: usize,
    max_fill: usize,
}

impl MainMixer {
    fn new(shared: Arc<Shared>, consumer: HeapCons<f32>, rate: f32, channels: usize, target_fill: usize) -> Self {
        let queue = Arc::clone(&shared.key_queue_out);
        let key_down = shared.key_down.load(Ordering::Relaxed);
        let route = shared.route();
        Self {
            generator: SidetoneGenerator::new(
                Shared::load_f32(&shared.frequency),
                Shared::load_f32(&shared.volume),
                rate,
            ),
            shared,
            consumer,
            sched: KeyScheduler::new(queue),
            limiter: Limiter::new(rate),
            channels,
            rate: rate as f64,
            key_down,
            duck_hold: 0,
            // Derived from the real stream rate, not an assumed 48 kHz.
            duck_hold_max: (MIC_DUCKING_HOLD_SECS * rate) as u32,
            duck_gain: 1.0,
            duck_coef: smoothing_coef(0.003, rate),
            tone_gate: if route.includes_output() { 1.0 } else { 0.0 },
            gate_coef: smoothing_coef(0.003, rate),
            target_fill,
            max_fill: target_fill * 3,
        }
    }

    fn render<T: cpal::SizedSample + FromSample<f32>>(&mut self, data: &mut [T]) {
        let channels = self.channels;
        let frames = data.len() / channels;
        let now = Instant::now();
        let latency_s = frames as f64 / self.rate;
        let mut next_edge = self.sched.next_edge(now, latency_s, self.rate, frames);

        // Live parameters: one atomic read each per buffer.
        self.generator.set_frequency(Shared::load_f32(&self.shared.frequency));
        self.generator.set_volume(Shared::load_f32(&self.shared.volume));
        self.generator.set_rise_ms(Shared::load_f32(&self.shared.rise_ms));
        let mic_vol = Shared::load_f32(&self.shared.mic_volume);
        let ducking_enabled = self.shared.mic_ducking.load(Ordering::Relaxed);
        let gate_target = if self.shared.route().includes_output() { 1.0 } else { 0.0 };

        // Clock-drift backstop: after a stall the ring can hold far more than
        // the target; trim it so latency doesn't stick high.
        if self.consumer.occupied_len() > self.max_fill {
            let excess = self.consumer.occupied_len() - self.target_fill;
            self.consumer.skip(excess);
        }

        // Test recording: try_lock once per buffer; if the control thread holds
        // it we just skip this buffer rather than block.
        let mut rec = if self.shared.is_recording.load(Ordering::Relaxed) {
            self.shared.recording_buffer.try_lock()
        } else {
            None
        };
        let rec_limit = MAX_RECORDING_SAMPLES.min(MAX_RECORDING_SECS * self.rate as usize);

        let mut peak: f32 = 0.0;

        for (i, frame) in data.chunks_mut(channels).enumerate() {
            while let Some((offset, down)) = next_edge {
                if i < offset {
                    break;
                }
                self.key_down = down;
                next_edge = self.sched.next_edge(now, latency_s, self.rate, frames);
            }

            self.tone_gate += (gate_target - self.tone_gate) * self.gate_coef;
            // Always advance the generator so envelope/phase stay continuous
            // even when the route currently mutes it.
            let tone_sample = self.generator.next_sample(self.key_down) * self.tone_gate;

            let raw_mic = self.consumer.try_pop().unwrap_or(0.0);

            // Mic ducking: mute while key is down and for the hold period after.
            if self.key_down {
                self.duck_hold = self.duck_hold_max;
            } else if self.duck_hold > 0 {
                self.duck_hold -= 1;
            }
            let duck_target = if ducking_enabled && self.duck_hold > 0 { 0.0 } else { 1.0 };
            self.duck_gain += (duck_target - self.duck_gain) * self.duck_coef;
            let mic_sample = raw_mic * mic_vol * self.duck_gain;

            let mixed = self.limiter.process(tone_sample + mic_sample);

            if let Some(buf) = rec.as_mut() {
                if buf.len() < rec_limit && buf.len() < buf.capacity() {
                    buf.push(mixed);
                }
            }

            peak = peak.max(mixed.abs());

            let value = T::from_sample(mixed);
            for channel in frame.iter_mut() {
                *channel = value;
            }
        }

        update_level(&self.shared.output_level, peak);
    }
}

/// Local monitor: sidetone only, for headphones/speakers.
struct LocalMixer {
    shared: Arc<Shared>,
    generator: SidetoneGenerator,
    sched: KeyScheduler,
    channels: usize,
    rate: f64,
    key_down: bool,
    gate: f32,
    gate_coef: f32,
}

impl LocalMixer {
    fn new(shared: Arc<Shared>, rate: f32, channels: usize) -> Self {
        let queue = Arc::clone(&shared.key_queue_local);
        let key_down = shared.key_down.load(Ordering::Relaxed);
        let route = shared.route();
        Self {
            generator: SidetoneGenerator::new(
                Shared::load_f32(&shared.frequency),
                Shared::load_f32(&shared.local_volume),
                rate,
            ),
            shared,
            sched: KeyScheduler::new(queue),
            channels,
            rate: rate as f64,
            key_down,
            gate: if route.includes_local() { 1.0 } else { 0.0 },
            gate_coef: smoothing_coef(0.003, rate),
        }
    }

    fn render<T: cpal::SizedSample + FromSample<f32>>(&mut self, data: &mut [T]) {
        let channels = self.channels;
        let frames = data.len() / channels;
        let now = Instant::now();
        let latency_s = frames as f64 / self.rate;
        let mut next_edge = self.sched.next_edge(now, latency_s, self.rate, frames);

        self.generator.set_frequency(Shared::load_f32(&self.shared.frequency));
        self.generator.set_volume(Shared::load_f32(&self.shared.local_volume));
        self.generator.set_rise_ms(Shared::load_f32(&self.shared.rise_ms));
        let gate_target = if self.shared.route().includes_local() { 1.0 } else { 0.0 };

        for (i, frame) in data.chunks_mut(channels).enumerate() {
            while let Some((offset, down)) = next_edge {
                if i < offset {
                    break;
                }
                self.key_down = down;
                next_edge = self.sched.next_edge(now, latency_s, self.rate, frames);
            }

            self.gate += (gate_target - self.gate) * self.gate_coef;
            let value = T::from_sample(self.generator.next_sample(self.key_down) * self.gate);
            for channel in frame.iter_mut() {
                *channel = value;
            }
        }
    }
}

/// Mic capture: downmix to mono, resample to the output rate, and nudge the
/// resample ratio by up to +/-0.2% so the ring fill hovers at the target.
/// Input and output devices run on independent clocks, so without this the
/// ring would slowly overflow or run dry.
struct MicInput {
    producer: HeapProd<f32>,
    shared: Arc<Shared>,
    channels: usize,
    /// Input samples consumed per output sample at nominal ratio.
    base_step: f64,
    prev_sample: f32,
    pos: f64,
    /// One-pole low-pass applied before decimation, to tame aliasing when
    /// the mic rate is above the output rate. `None` when not downsampling.
    lowpass_coef: Option<f32>,
    lowpass_state: f32,
    target_fill: f32,
    fill_avg: f32,
}

impl MicInput {
    fn new(
        producer: HeapProd<f32>,
        shared: Arc<Shared>,
        channels: usize,
        input_rate: f32,
        target_rate: f32,
        target_fill: usize,
    ) -> Self {
        let lowpass_coef = if input_rate > target_rate {
            // Cutoff at ~45% of the target rate.
            let fc = 0.45 * target_rate;
            Some(1.0 - (-2.0 * std::f32::consts::PI * fc / input_rate).exp())
        } else {
            None
        };
        Self {
            producer,
            shared,
            channels,
            base_step: input_rate as f64 / target_rate as f64,
            prev_sample: 0.0,
            pos: 0.0,
            lowpass_coef,
            lowpass_state: 0.0,
            target_fill: target_fill as f32,
            fill_avg: target_fill as f32,
        }
    }

    fn process<T: Copy>(&mut self, data: &[T])
    where
        f32: FromSample<T>,
    {
        // Proportional drift control on a smoothed fill level (the raw level
        // saw-tooths with every buffer). Fill above target -> consume input
        // slightly faster (fewer output samples), and vice versa.
        let fill = self.producer.occupied_len() as f32;
        self.fill_avg += 0.1 * (fill - self.fill_avg);
        let err = (self.fill_avg - self.target_fill) / self.target_fill;
        let adjust = (err * 0.004).clamp(-0.002, 0.002) as f64;
        let step = self.base_step * (1.0 + adjust);

        let mut peak: f32 = 0.0;

        for frame in data.chunks(self.channels) {
            let mut curr: f32 = frame
                .iter()
                .map(|s| <f32 as FromSample<T>>::from_sample_(*s))
                .sum::<f32>()
                / self.channels as f32;

            // Track peak on the raw signal
            peak = peak.max(curr.abs());

            if let Some(coef) = self.lowpass_coef {
                self.lowpass_state += coef * (curr - self.lowpass_state);
                curr = self.lowpass_state;
            }

            // Emit every output sample whose position falls between the
            // previous and current input sample (linear interpolation).
            while self.pos <= 1.0 {
                let resampled = self.prev_sample + (curr - self.prev_sample) * self.pos as f32;
                let _ = self.producer.try_push(resampled);
                self.pos += step;
            }
            self.pos -= 1.0;
            self.prev_sample = curr;
        }

        update_level(&self.shared.mic_level, peak);
    }
}

/// Test-recording playback. Owns its (already resampled) samples so the
/// callback never touches the recording mutex.
struct Player {
    shared: Arc<Shared>,
    data: Vec<f32>,
    pos: usize,
    /// Source-recording samples per played sample, for progress reporting.
    src_per_out: f64,
    channels: usize,
}

impl Player {
    fn render<T: cpal::SizedSample + FromSample<f32>>(&mut self, data: &mut [T]) {
        if !self.shared.is_playing.load(Ordering::Relaxed) {
            for sample in data.iter_mut() {
                *sample = T::from_sample(0.0f32);
            }
            return;
        }

        for frame in data.chunks_mut(self.channels) {
            let sample = if self.pos < self.data.len() {
                self.data[self.pos]
            } else {
                // Playback finished
                self.shared.is_playing.store(false, Ordering::Relaxed);
                0.0
            };
            self.pos += 1;

            let value = T::from_sample(sample);
            for channel in frame.iter_mut() {
                *channel = value;
            }
        }

        let progress = (self.pos as f64 * self.src_per_out) as usize;
        self.shared.playback_position.store(progress, Ordering::Relaxed);
    }
}

/// Linear-interpolation resampler for the (non-realtime) test playback path.
fn resample_linear(input: &[f32], from_rate: f32, to_rate: f32) -> Vec<f32> {
    if input.is_empty() || (from_rate - to_rate).abs() < 0.5 {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (input.len() as f64 / ratio).ceil() as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let idx = pos as usize;
            let frac = (pos - idx as f64) as f32;
            let a = input[idx.min(input.len() - 1)];
            let b = input[(idx + 1).min(input.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Stream construction (control thread)
// ---------------------------------------------------------------------------

/// Error callback: forwards to the control loop through a non-blocking
/// bounded channel (allocating only on the rare error path). All handling,
/// logging and recovery happen on the audio control thread.
fn error_callback(stream: &'static str, tx: Sender<StreamFault>) -> impl FnMut(cpal::StreamError) + Send + 'static {
    move |err| {
        let device_lost = matches!(err, cpal::StreamError::DeviceNotAvailable);
        let _ = tx.try_send(StreamFault { stream, message: err.to_string(), device_lost });
    }
}

/// Pick the stream config for the requested buffer size. A Fixed size is only
/// used if the device advertises a range containing it AND a throwaway probe
/// stream actually opens with it (some backends advertise ranges they reject).
fn probe_output<T: cpal::SizedSample>(device: &Device, config: &StreamConfig) -> bool {
    device
        .build_output_stream(
            config,
            |data: &mut [T], _| {
                for s in data.iter_mut() {
                    *s = T::EQUILIBRIUM;
                }
            },
            |_| {},
            None,
        )
        .is_ok()
}

fn probe_input<T: cpal::SizedSample>(device: &Device, config: &StreamConfig) -> bool {
    device.build_input_stream(config, |_: &[T], _| {}, |_| {}, None).is_ok()
}

fn pick_stream_config(device: &Device, supported: &SupportedStreamConfig, mode: u32, input: bool) -> StreamConfig {
    let mut config: StreamConfig = supported.config();
    let Some(frames) = buffer_mode_frames(mode) else {
        return config;
    };
    let in_range = match supported.buffer_size() {
        SupportedBufferSize::Range { min, max } => (*min..=*max).contains(&frames),
        SupportedBufferSize::Unknown => false,
    };
    if !in_range {
        eprintln!("[audio] Buffer size {} not supported by device, using default", frames);
        return config;
    }
    let mut candidate = config.clone();
    candidate.buffer_size = cpal::BufferSize::Fixed(frames);
    let ok = match (input, supported.sample_format()) {
        (false, cpal::SampleFormat::F32) => probe_output::<f32>(device, &candidate),
        (false, cpal::SampleFormat::I16) => probe_output::<i16>(device, &candidate),
        (false, cpal::SampleFormat::U16) => probe_output::<u16>(device, &candidate),
        (true, cpal::SampleFormat::F32) => probe_input::<f32>(device, &candidate),
        (true, cpal::SampleFormat::I16) => probe_input::<i16>(device, &candidate),
        (true, cpal::SampleFormat::U16) => probe_input::<u16>(device, &candidate),
        _ => false,
    };
    if ok {
        eprintln!("[audio] Using fixed buffer of {} frames", frames);
        config = candidate;
    } else {
        eprintln!("[audio] Device rejected fixed buffer of {} frames, using default", frames);
    }
    config
}

/// Find an output device by name (non-Linux) or the generic pipewire/default
/// ALSA device (Linux, where routing is done by PulseAudio sink name).
/// Returns the device plus the PulseAudio sink name to route to (Linux only).
fn resolve_output_device(device_name: Option<&str>, what: &str) -> Result<(Device, Option<String>), String> {
    let host = cpal::default_host();

    #[cfg(target_os = "linux")]
    {
        eprintln!("[audio] Looking for 'pipewire' or 'default' ALSA device for {}...", what);
        let devices: Vec<_> = host.output_devices().map_err(|e| e.to_string())?.collect();
        let dev = devices
            .iter()
            .find(|d| d.name().map(|n| n == "pipewire" || n == "default").unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| format!("No pipewire/default output device for {}", what))?;
        eprintln!("[audio] Using ALSA {} device: {:?}", what, dev.name());
        if let Some(name) = device_name {
            eprintln!("[audio] Will route {} to PulseAudio sink: {}", what, name);
        }
        Ok((dev, device_name.map(|s| s.to_string())))
    }

    #[cfg(not(target_os = "linux"))]
    {
        let device = if let Some(name) = device_name {
            let devices: Vec<_> = host.output_devices().map_err(|e| e.to_string())?.collect();
            // Falls back to the default device if the named one is gone.
            devices
                .iter()
                .find(|d| d.name().map(|n| n == name).unwrap_or(false))
                .cloned()
                .or_else(|| host.default_output_device())
                .ok_or_else(|| format!("{} device '{}' not found", what, name))?
        } else {
            host.default_output_device()
                .ok_or_else(|| format!("No default output device for {}", what))?
        };
        Ok((device, None))
    }
}

/// Create an audio input stream (microphone capture).
/// Samples are resampled to `target_sample_rate` before being pushed to the
/// ring buffer, so the output stream can drain at its own rate.
fn create_input_stream(
    device_name: Option<&str>,
    producer: HeapProd<f32>,
    shared: Arc<Shared>,
    target_sample_rate: f32,
    target_fill: usize,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    // On macOS, always request microphone permission via AVFoundation.
    // CoreAudio alone doesn't always trigger the TCC permission dialog,
    // especially with ad-hoc signed apps. We call requestAccess every time
    // (not just when status != authorized) because it also initializes the
    // AVFoundation mic subsystem, which may be needed for CoreAudio to work.
    #[cfg(target_os = "macos")]
    {
        let status = unsafe { check_microphone_permission() };
        eprintln!("[audio] macOS mic permission status: {} (0=notDetermined, 1=restricted, 2=denied, 3=authorized)", status);

        eprintln!("[audio] Requesting microphone permission...");
        let result = unsafe { request_microphone_permission() };
        eprintln!("[audio] Microphone permission result: {} (1=granted, 0=denied, -1=timeout)", result);

        if result != 1 {
            return Err("Microphone permission denied. Please enable in System Settings > Privacy & Security > Microphone".to_string());
        }
    }

    let host = cpal::default_host();

    // On Linux, always use the "pipewire" ALSA device and route using pactl
    // The device_name parameter is a PulseAudio source name, not an ALSA name
    #[cfg(target_os = "linux")]
    let (device, pulse_source) = {
        eprintln!("[audio] Looking for 'pipewire' or 'default' ALSA input device...");
        let devices: Vec<_> = host.input_devices()
            .map_err(|e| e.to_string())?
            .collect();

        eprintln!("[audio] Available ALSA input devices:");
        for d in &devices {
            if let Ok(n) = d.name() {
                eprintln!("[audio]   - '{}'", n);
            }
        }

        let dev = devices.iter()
            .find(|d| d.name().map(|n| n == "pipewire" || n == "default").unwrap_or(false))
            .cloned()
            .or_else(|| host.default_input_device())
            .ok_or_else(|| "No pipewire/default input device available".to_string())?;

        eprintln!("[audio] Using ALSA input device: {:?}", dev.name());
        if let Some(name) = device_name {
            eprintln!("[audio] Will route to PulseAudio source: {}", name);
        }

        (dev, device_name.map(|s| s.to_string()))
    };

    #[cfg(not(target_os = "linux"))]
    let device = if let Some(name) = device_name {
        let devices: Vec<_> = host.input_devices()
            .map_err(|e| e.to_string())?
            .collect();

        devices.iter()
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .cloned()
            .or_else(|| host.default_input_device())
            .ok_or_else(|| format!("Input device '{}' not found", name))?
    } else {
        host.default_input_device()
            .ok_or_else(|| "No default input device".to_string())?
    };

    let supported = device
        .default_input_config()
        .map_err(|e| e.to_string())?;

    eprintln!("[audio] Input device config: channels={}, sample_rate={}, format={:?}",
        supported.channels(), supported.sample_rate().0, supported.sample_format());
    eprintln!("[audio] Input device name: {:?}", device.name());

    let channels = supported.channels() as usize;
    let input_rate = supported.sample_rate().0 as f32;
    eprintln!("[audio] Resampling mic {} Hz -> {} Hz", input_rate, target_sample_rate);

    // Capture baseline source-output IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_source_outputs = if pulse_source.is_some() {
        get_source_output_ids()
    } else {
        Vec::new()
    };

    // Linux: pin the PulseAudio/PipeWire routing target via env vars BEFORE
    // cpal opens the stream. This is the deterministic path; the legacy
    // post-creation `pactl move-source-output` below is kept as a fallback
    // in case the env doesn't take effect (e.g. cpal hits an ALSA backend
    // that ignores both PULSE_SOURCE and PIPEWIRE_NODE).
    #[cfg(target_os = "linux")]
    let _route_guard = PulseRouteGuard::for_source(pulse_source.as_deref());

    let config = pick_stream_config(&device, &supported, shared.buffer_mode.load(Ordering::Relaxed), true);
    let mic = MicInput::new(producer, shared, channels, input_rate, target_sample_rate, target_fill);

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build_input_stream::<f32>(&device, &config, mic, fault_tx),
        cpal::SampleFormat::I16 => build_input_stream::<i16>(&device, &config, mic, fault_tx),
        cpal::SampleFormat::U16 => build_input_stream::<u16>(&device, &config, mic, fault_tx),
        _ => return Err("Unsupported input sample format".to_string()),
    }?;

    // On Linux, route the source-output to the user's selected PulseAudio source
    #[cfg(target_os = "linux")]
    if let Some(source_name) = pulse_source {
        route_source_output_to_device_with_baseline(source_name, baseline_source_outputs);
    }

    Ok(stream)
}

fn build_input_stream<T: cpal::SizedSample>(
    device: &Device,
    config: &StreamConfig,
    mut mic: MicInput,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String>
where
    f32: FromSample<T>,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| mic.process(data),
            error_callback("input", fault_tx),
            None,
        )
        .map_err(|e| e.to_string())
}

/// Create an audio output stream (mic + optionally sidetone mixed) for VB-Cable/Zoom
fn create_output_stream(
    device_name: Option<&str>,
    shared: Arc<Shared>,
    consumer: HeapCons<f32>,
    target_fill: usize,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    let (device, pulse_sink) = resolve_output_device(device_name, "output")?;

    let supported = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = supported.sample_rate().0 as f32;
    let channels = supported.channels() as usize;

    // Stored for recording duration calculation
    shared.sample_rate.store(sample_rate as u32, Ordering::Relaxed);

    // Capture baseline sink-input IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_sink_inputs = if pulse_sink.is_some() {
        get_sink_input_ids()
    } else {
        Vec::new()
    };

    // Pin the routing target via env vars before cpal builds the stream.
    #[cfg(target_os = "linux")]
    let _route_guard = PulseRouteGuard::for_sink(pulse_sink.as_deref());

    let config = pick_stream_config(&device, &supported, shared.buffer_mode.load(Ordering::Relaxed), false);
    let mixer = MainMixer::new(shared, consumer, sample_rate, channels, target_fill);

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build_main_stream::<f32>(&device, &config, mixer, fault_tx),
        cpal::SampleFormat::I16 => build_main_stream::<i16>(&device, &config, mixer, fault_tx),
        cpal::SampleFormat::U16 => build_main_stream::<u16>(&device, &config, mixer, fault_tx),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

    // On Linux, route the sink-input to the user's selected PulseAudio sink
    #[cfg(target_os = "linux")]
    if let Some(sink_name) = pulse_sink {
        route_sink_input_to_device_with_baseline(sink_name, baseline_sink_inputs);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = pulse_sink;

    Ok(stream)
}

fn build_main_stream<T: cpal::SizedSample + FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    mut mixer: MainMixer,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| mixer.render(data),
            error_callback("output", fault_tx),
            None,
        )
        .map_err(|e| e.to_string())
}

/// Create a local output stream (sidetone only) for monitoring through headphones/speakers
fn create_local_output_stream(
    device_name: Option<&str>,
    shared: Arc<Shared>,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    let (device, pulse_sink) = resolve_output_device(device_name, "local output")?;

    let supported = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = supported.sample_rate().0 as f32;
    let channels = supported.channels() as usize;

    // Capture baseline sink-input IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_sink_inputs = get_sink_input_ids();

    // Local-monitoring stream must NOT land on VailZoomer (would loop into
    // the meeting output). Resolve a safe target sink and pin via env.
    #[cfg(target_os = "linux")]
    let resolved_local_sink = resolve_local_sink(pulse_sink.as_deref());
    #[cfg(target_os = "linux")]
    let _route_guard = PulseRouteGuard::for_sink(resolved_local_sink.as_deref());

    let config = pick_stream_config(&device, &supported, shared.buffer_mode.load(Ordering::Relaxed), false);
    let mixer = LocalMixer::new(shared, sample_rate, channels);

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build_local_output_stream::<f32>(&device, &config, mixer, fault_tx),
        cpal::SampleFormat::I16 => build_local_output_stream::<i16>(&device, &config, mixer, fault_tx),
        cpal::SampleFormat::U16 => build_local_output_stream::<u16>(&device, &config, mixer, fault_tx),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

    // On Linux, route the local sidetone to the user's selected PulseAudio sink
    // If no specific device selected, route to default speakers (away from VailZoomer)
    #[cfg(target_os = "linux")]
    if let Some(sink_name) = pulse_sink {
        route_sink_input_to_device_with_baseline(sink_name, baseline_sink_inputs);
    } else {
        // No specific device - route to default speakers using baseline
        route_local_stream_to_default_speakers_with_baseline(baseline_sink_inputs);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = pulse_sink;

    Ok(stream)
}

fn build_local_output_stream<T: cpal::SizedSample + FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    mut mixer: LocalMixer,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| mixer.render(data),
            error_callback("local", fault_tx),
            None,
        )
        .map_err(|e| e.to_string())
}

/// Create a playback stream for test recording playback. The recording was
/// captured at the main output's rate, so it is resampled here to whatever
/// rate the playback device runs at (otherwise it would play pitch-shifted).
fn create_playback_stream(
    device_name: Option<&str>,
    recording: Vec<f32>,
    recording_rate: f32,
    shared: Arc<Shared>,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    let (device, pulse_sink) = resolve_output_device(device_name, "playback")?;

    let supported = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let channels = supported.channels() as usize;
    let device_rate = supported.sample_rate().0 as f32;

    let source_len = recording.len();
    let data = resample_linear(&recording, recording_rate, device_rate);
    let src_per_out = if data.is_empty() { 0.0 } else { source_len as f64 / data.len() as f64 };

    // Capture baseline sink-input IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_sink_inputs = get_sink_input_ids();

    // Playback should also avoid VailZoomer (same loop concern as local sidetone).
    #[cfg(target_os = "linux")]
    let resolved_playback_sink = resolve_local_sink(pulse_sink.as_deref());
    #[cfg(target_os = "linux")]
    let _route_guard = PulseRouteGuard::for_sink(resolved_playback_sink.as_deref());

    let config: StreamConfig = supported.config();
    let player = Player { shared, data, pos: 0, src_per_out, channels };

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build_playback_stream::<f32>(&device, &config, player, fault_tx),
        cpal::SampleFormat::I16 => build_playback_stream::<i16>(&device, &config, player, fault_tx),
        cpal::SampleFormat::U16 => build_playback_stream::<u16>(&device, &config, player, fault_tx),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

    // On Linux, route playback to the user's selected PulseAudio sink or default speakers
    #[cfg(target_os = "linux")]
    if let Some(sink_name) = pulse_sink {
        route_sink_input_to_device_with_baseline(sink_name, baseline_sink_inputs);
    } else {
        route_local_stream_to_default_speakers_with_baseline(baseline_sink_inputs);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = pulse_sink;

    Ok(stream)
}

fn build_playback_stream<T: cpal::SizedSample + FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    mut player: Player,
    fault_tx: Sender<StreamFault>,
) -> Result<Stream, String> {
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| player.render(data),
            error_callback("playback", fault_tx),
            None,
        )
        .map_err(|e| e.to_string())
}

/// Resolve the output device that would be used for a given name and return
/// its default sample rate. Mirrors the lookup logic in `create_output_stream`
/// so the mic resampler targets the same device that the output stream will
/// actually open. Falls back to 48 kHz (VB-Cable's native rate, also the
/// default for most modern output devices) if anything fails.
///
/// **Don't optimize this with `pactl list sinks`** — the cpal output stream
/// goes through the ALSA "pipewire" shim and opens at whatever rate that
/// shim negotiates, NOT the sink's native rate. PipeWire then resamples
/// internally between the two. If we point the mic resampler at the sink's
/// rate, the producer rate and consumer rate diverge, ring buffer overflows,
/// and audio comes out pitched-down + scratchy. cpal's `default_output_config()`
/// returns what the stream will actually negotiate — that's the right answer.
fn query_output_sample_rate(device_name: Option<&str>) -> f32 {
    let host = cpal::default_host();

    let device = if let Some(name) = device_name {
        let devices: Vec<_> = match host.output_devices() {
            Ok(d) => d.collect(),
            Err(_) => return 48000.0,
        };

        #[cfg(target_os = "linux")]
        let search_names: Vec<&str> = if name.to_lowercase().contains("vailzoomer")
            || name.to_lowercase().contains("vail zoomer")
        {
            vec![name, "VailZoomer", "vailzoomer", "Vail Zoomer", "pipewire", "default"]
        } else {
            vec![name, "pipewire", "default"]
        };
        #[cfg(not(target_os = "linux"))]
        let search_names: Vec<&str> = vec![name];

        let mut found = None;
        for search_name in &search_names {
            found = devices
                .iter()
                .find(|d| {
                    d.name()
                        .map(|n| {
                            n == *search_name
                                || n.to_lowercase().contains(&search_name.to_lowercase())
                                || search_name.to_lowercase().contains(&n.to_lowercase())
                        })
                        .unwrap_or(false)
                });
            if found.is_some() {
                break;
            }
        }
        found.cloned().or_else(|| host.default_output_device())
    } else {
        host.default_output_device()
    };

    device
        .and_then(|d| d.default_output_config().ok())
        .map(|c| c.sample_rate().0 as f32)
        .unwrap_or(48000.0)
}

/// On Linux, move our local sidetone stream to the default speakers.
/// Uses baseline IDs to identify our newly created stream.
#[cfg(target_os = "linux")]
fn route_local_stream_to_default_speakers_with_baseline(existing_ids: Vec<String>) {
    thread::spawn(move || {
        eprintln!("[audio] Routing NEW local sidetone to default speakers...");
        eprintln!("[audio] Existing sink-inputs before creation: {:?}", existing_ids);

        // Get the default sink name (user's real speakers)
        let default_sink = match Command::new("pactl")
            .args(["get-default-sink"])
            .output()
        {
            Ok(output) if output.status.success() => {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            }
            _ => {
                eprintln!("[audio] Could not get default sink, skipping stream routing");
                return;
            }
        };

        // Skip if default sink is VailZoomer
        if default_sink.to_lowercase().contains("vailzoomer") {
            eprintln!("[audio] Default sink is VailZoomer, skipping routing");
            return;
        }

        eprintln!("[audio] Default sink for local output: {}", default_sink);

        // Wait for our new stream to be registered
        for attempt in 1..=15 {
            thread::sleep(Duration::from_millis(100));

            let current_ids = get_sink_input_ids();

            // Find new IDs that didn't exist before
            let new_ids: Vec<&String> = current_ids
                .iter()
                .filter(|id| !existing_ids.contains(id))
                .collect();

            if new_ids.is_empty() {
                if attempt == 15 {
                    eprintln!("[audio] No new sink-input found for local sidetone after 15 attempts");
                }
                continue;
            }

            // Route the first new stream to default speakers
            let sink_input_id = new_ids[0];
            eprintln!("[audio] Found new sink-input for local sidetone: {} (attempt {})", sink_input_id, attempt);

            match Command::new("pactl")
                .args(["move-sink-input", sink_input_id, &default_sink])
                .output()
            {
                Ok(output) if output.status.success() => {
                    eprintln!("[audio] Successfully routed local sidetone {} to {}", sink_input_id, default_sink);
                    return;
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[audio] Failed to route local sidetone: {}", stderr);
                }
                Err(e) => {
                    eprintln!("[audio] Error routing local sidetone: {}", e);
                }
            }
            return; // Don't retry after attempting to move
        }
        eprintln!("[audio] Timeout waiting for local sidetone stream");
    });
}

/// Get current sink-input IDs
#[cfg(target_os = "linux")]
fn get_sink_input_ids() -> Vec<String> {
    Command::new("pactl")
        .args(["list", "short", "sink-inputs"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|line| line.split_whitespace().next())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// On Linux, route our output stream (sink-input) to the specified PulseAudio sink.
/// This allows us to use the generic "pipewire" ALSA device and then route to the
/// user's selected output device using PulseAudio names directly.
///
/// Takes existing_ids to identify which streams existed BEFORE we created ours.
#[cfg(target_os = "linux")]
fn route_sink_input_to_device_with_baseline(sink_name: String, existing_ids: Vec<String>) {
    thread::spawn(move || {
        eprintln!("[audio] Routing NEW sink-input to PulseAudio sink: {}", sink_name);
        eprintln!("[audio] Existing sink-inputs before creation: {:?}", existing_ids);

        // Wait for our new stream to be registered
        for attempt in 1..=15 {
            thread::sleep(Duration::from_millis(100));

            let current_ids = get_sink_input_ids();

            // Find new IDs that didn't exist before
            let new_ids: Vec<&String> = current_ids
                .iter()
                .filter(|id| !existing_ids.contains(id))
                .collect();

            if new_ids.is_empty() {
                if attempt == 15 {
                    eprintln!("[audio] No new sink-input found after 15 attempts");
                }
                continue;
            }

            // Route the first new stream (should be ours)
            let sink_input_id = new_ids[0];
            eprintln!("[audio] Found new sink-input: {} (attempt {})", sink_input_id, attempt);

            match Command::new("pactl")
                .args(["move-sink-input", sink_input_id, &sink_name])
                .output()
            {
                Ok(output) if output.status.success() => {
                    eprintln!("[audio] Successfully routed sink-input {} to {}", sink_input_id, sink_name);
                    return;
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[audio] Failed to route sink-input: {}", stderr);
                }
                Err(e) => {
                    eprintln!("[audio] Error routing sink-input: {}", e);
                }
            }
            return; // Don't retry after attempting to move
        }
        eprintln!("[audio] Timeout waiting for new sink-input");
    });
}

/// Get current source-output IDs
#[cfg(target_os = "linux")]
fn get_source_output_ids() -> Vec<String> {
    Command::new("pactl")
        .args(["list", "short", "source-outputs"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|line| line.split_whitespace().next())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// On Linux, route our input stream (source-output) to the specified PulseAudio source.
/// This allows us to use the generic "pipewire" ALSA device and then route to the
/// user's selected microphone using PulseAudio names directly.
///
/// Takes existing_ids to identify which streams existed BEFORE we created ours.
#[cfg(target_os = "linux")]
fn route_source_output_to_device_with_baseline(source_name: String, existing_ids: Vec<String>) {
    thread::spawn(move || {
        eprintln!("[audio] Routing NEW source-output to PulseAudio source: {}", source_name);
        eprintln!("[audio] Existing source-outputs before creation: {:?}", existing_ids);

        // Wait for our new stream to be registered
        for attempt in 1..=15 {
            thread::sleep(Duration::from_millis(100));

            let current_ids = get_source_output_ids();

            // Find new IDs that didn't exist before
            let new_ids: Vec<&String> = current_ids
                .iter()
                .filter(|id| !existing_ids.contains(id))
                .collect();

            if new_ids.is_empty() {
                if attempt == 15 {
                    eprintln!("[audio] No new source-output found after 15 attempts");
                }
                continue;
            }

            // Route the first new stream (should be ours)
            let source_output_id = new_ids[0];
            eprintln!("[audio] Found new source-output: {} (attempt {})", source_output_id, attempt);

            match Command::new("pactl")
                .args(["move-source-output", source_output_id, &source_name])
                .output()
            {
                Ok(output) if output.status.success() => {
                    eprintln!("[audio] Successfully routed source-output {} to {}", source_output_id, source_name);
                    return;
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[audio] Failed to route source-output: {}", stderr);
                }
                Err(e) => {
                    eprintln!("[audio] Error routing source-output: {}", e);
                }
            }
            return; // Don't retry after attempting to move
        }
        eprintln!("[audio] Timeout waiting for new source-output");
    });
}

// Linux-specific PulseAudio device enumeration for friendly names
// PipeWire also supports these APIs through PulseAudio compatibility

#[cfg(target_os = "linux")]
fn list_pulseaudio_sinks() -> Option<Vec<DeviceInfo>> {
    use pulsectl::controllers::SinkController;
    use pulsectl::controllers::DeviceControl;

    let mut handler = SinkController::create().ok()?;
    let devices = handler.list_devices().ok()?;

    // Store PulseAudio names directly - we'll route using pactl, not CPAL device selection
    let result: Vec<DeviceInfo> = devices
        .into_iter()
        .filter_map(|dev| {
            let description = dev.description.clone()?;
            let pa_name = dev.name.clone()?;

            Some(DeviceInfo {
                display_name: description,
                // Store PulseAudio name - used with pactl move-sink-input
                internal_name: pa_name,
            })
        })
        .collect();

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

#[cfg(target_os = "linux")]
fn list_pulseaudio_sources() -> Option<Vec<DeviceInfo>> {
    use pulsectl::controllers::SourceController;
    use pulsectl::controllers::DeviceControl;

    let mut handler = SourceController::create().ok()?;
    let devices = handler.list_devices().ok()?;

    let result: Vec<DeviceInfo> = devices
        .into_iter()
        .filter_map(|dev| {
            let description = dev.description.clone()?;
            let pa_name = dev.name.clone()?;

            // Drop sink-monitor sources — those are playback taps, not mics,
            // and they only clutter the mic picker (`.monitor` suffix and the
            // "Monitor of …" description are PulseAudio's universal markers).
            // Also drop our own VailZoomer.monitor (used internally as the
            // VailZoomerMic master) so it doesn't show up as a pickable mic.
            if pa_name.ends_with(".monitor")
                || description.starts_with("Monitor of ")
                || pa_name == "VailZoomer.monitor"
            {
                return None;
            }

            Some(DeviceInfo {
                display_name: description,
                // Store PulseAudio name - used with pactl move-source-output
                internal_name: pa_name,
            })
        })
        .collect();

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}
