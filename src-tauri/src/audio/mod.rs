mod sidetone;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Stream, StreamConfig, FromSample};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use crossbeam_channel::{bounded, Sender, Receiver};
use ringbuf::{HeapRb, traits::{Producer, Consumer, Split}};

#[cfg(target_os = "linux")]
use std::process::Command;

pub use sidetone::SidetoneGenerator;

/// Device info with display name and internal name for selection
#[derive(Clone, serde::Serialize)]
pub struct DeviceInfo {
    /// User-friendly display name
    pub display_name: String,
    /// Internal name used for device selection (cpal name)
    pub internal_name: String,
}

/// Ring buffer size for mic audio (holds ~100ms at 48kHz)
const RING_BUFFER_SIZE: usize = 4800;

/// Mic ducking hold time after key up (~250ms at 48kHz)
const MIC_DUCKING_HOLD_SAMPLES: u32 = 12000;

/// Max test recording samples (5 seconds at 48kHz)
const MAX_RECORDING_SAMPLES: usize = 48000 * 5;

/// Sidetone routing mode
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SidetoneRoute {
    OutputOnly,  // Only to VB-Cable (silent locally)
    LocalOnly,   // Only to local speakers
    Both,        // Both outputs
}

/// Commands sent to the audio thread
enum AudioCommand {
    Start {
        output_device: Option<String>,
        input_device: Option<String>,
        local_device: Option<String>,
        sidetone_route: SidetoneRoute,
    },
    Stop,
    SetFrequency(f32),
    SetVolume(f32),
    SetLocalVolume(f32),
    SetMicVolume(f32),
    SetSidetoneRoute(SidetoneRoute),
    StartTestRecording,
    StopTestRecording,
    StartPlayback { device: Option<String> },
    StopPlayback,
    Shutdown,
}

/// Handle to control the audio engine from Tauri commands
/// This is Send + Sync safe because it only holds channels and atomics
pub struct AudioEngineHandle {
    command_tx: Sender<AudioCommand>,
    is_key_down: Arc<AtomicBool>,
    frequency: Arc<AtomicU32>,
    volume: Arc<AtomicU32>,           // Sidetone volume for output (Zoom)
    local_volume: Arc<AtomicU32>,     // Sidetone volume for local monitoring
    mic_volume: Arc<AtomicU32>,
    mic_level: Arc<AtomicU32>,
    output_level: Arc<AtomicU32>,
    sidetone_route: Arc<AtomicU32>,  // Store as u32 for atomic ops
    mic_ducking_enabled: Arc<AtomicBool>,  // Whether to mute mic while sending
    mic_ducking_hold: Arc<AtomicU32>,      // Samples remaining for ducking hold after key up
    // Test recording state
    is_recording: Arc<AtomicBool>,
    is_playing: Arc<AtomicBool>,
    recording_buffer: Arc<parking_lot::Mutex<Vec<f32>>>,
    playback_position: Arc<AtomicUsize>,
    sample_rate: Arc<AtomicU32>,
}

impl AudioEngineHandle {
    /// Create a new audio engine handle and spawn the audio thread
    pub fn new(frequency: f32, volume: f32) -> Result<Self, String> {
        let (command_tx, command_rx) = bounded::<AudioCommand>(16);
        let is_key_down = Arc::new(AtomicBool::new(false));
        let frequency_atomic = Arc::new(AtomicU32::new(frequency.to_bits()));
        let volume_atomic = Arc::new(AtomicU32::new(volume.to_bits()));
        let local_volume_atomic = Arc::new(AtomicU32::new(0.3_f32.to_bits())); // Default local volume 30%
        let mic_volume_atomic = Arc::new(AtomicU32::new(1.0_f32.to_bits())); // Default mic volume 100%
        let mic_level_atomic = Arc::new(AtomicU32::new(0.0_f32.to_bits())); // Current mic level
        let output_level_atomic = Arc::new(AtomicU32::new(0.0_f32.to_bits())); // Current output level
        let sidetone_route_atomic = Arc::new(AtomicU32::new(0)); // 0 = OutputOnly
        let mic_ducking_enabled = Arc::new(AtomicBool::new(false));
        let mic_ducking_hold = Arc::new(AtomicU32::new(0));
        // Test recording state
        let is_recording = Arc::new(AtomicBool::new(false));
        let is_playing = Arc::new(AtomicBool::new(false));
        let recording_buffer = Arc::new(parking_lot::Mutex::new(Vec::with_capacity(MAX_RECORDING_SAMPLES)));
        let playback_position = Arc::new(AtomicUsize::new(0));
        let sample_rate = Arc::new(AtomicU32::new(48000)); // Default sample rate

        let is_key_down_clone = Arc::clone(&is_key_down);
        let frequency_clone = Arc::clone(&frequency_atomic);
        let volume_clone = Arc::clone(&volume_atomic);
        let local_volume_clone = Arc::clone(&local_volume_atomic);
        let mic_volume_clone = Arc::clone(&mic_volume_atomic);
        let mic_level_clone = Arc::clone(&mic_level_atomic);
        let output_level_clone = Arc::clone(&output_level_atomic);
        let sidetone_route_clone = Arc::clone(&sidetone_route_atomic);
        let mic_ducking_enabled_clone = Arc::clone(&mic_ducking_enabled);
        let mic_ducking_hold_clone = Arc::clone(&mic_ducking_hold);
        let is_recording_clone = Arc::clone(&is_recording);
        let recording_buffer_clone = Arc::clone(&recording_buffer);
        let is_playing_clone = Arc::clone(&is_playing);
        let playback_position_clone = Arc::clone(&playback_position);
        let sample_rate_clone = Arc::clone(&sample_rate);

        // Spawn the audio thread
        thread::spawn(move || {
            audio_thread(
                command_rx,
                is_key_down_clone,
                frequency_clone,
                volume_clone,
                local_volume_clone,
                mic_volume_clone,
                mic_level_clone,
                output_level_clone,
                sidetone_route_clone,
                mic_ducking_enabled_clone,
                mic_ducking_hold_clone,
                is_recording_clone,
                recording_buffer_clone,
                is_playing_clone,
                playback_position_clone,
                sample_rate_clone,
            );
        });

        Ok(Self {
            command_tx,
            is_key_down,
            frequency: frequency_atomic,
            volume: volume_atomic,
            local_volume: local_volume_atomic,
            mic_volume: mic_volume_atomic,
            mic_level: mic_level_atomic,
            output_level: output_level_atomic,
            sidetone_route: sidetone_route_atomic,
            mic_ducking_enabled,
            mic_ducking_hold,
            is_recording,
            is_playing,
            recording_buffer,
            playback_position,
            sample_rate,
        })
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

    /// Start audio with optional input and output device names
    pub fn start(&self, output_device: Option<String>) -> Result<(), String> {
        self.command_tx.send(AudioCommand::Start {
            output_device,
            input_device: None,
            local_device: None,
            sidetone_route: SidetoneRoute::OutputOnly,
        })
        .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Start audio with both input and output devices
    pub fn start_with_devices(&self, output_device: Option<String>, input_device: Option<String>) -> Result<(), String> {
        let route = self.get_sidetone_route();
        self.command_tx.send(AudioCommand::Start {
            output_device,
            input_device,
            local_device: None,
            sidetone_route: route,
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
        self.sidetone_route.store(sidetone_route as u32, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::Start {
            output_device,
            input_device,
            local_device,
            sidetone_route,
        })
        .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Stop audio output
    pub fn stop(&self) -> Result<(), String> {
        self.command_tx.send(AudioCommand::Stop)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Signal key down (start sidetone)
    pub fn key_down(&self) {
        eprintln!("[audio] *** KEY DOWN - sidetone ON ***");
        self.is_key_down.store(true, Ordering::Relaxed);
        // Reset ducking hold to max while key is down
        self.mic_ducking_hold.store(MIC_DUCKING_HOLD_SAMPLES, Ordering::Relaxed);
    }

    /// Signal key up (stop sidetone)
    pub fn key_up(&self) {
        eprintln!("[audio] *** KEY UP - sidetone OFF ***");
        self.is_key_down.store(false, Ordering::Relaxed);
        // Start the ducking hold countdown (will be decremented in audio callback)
        self.mic_ducking_hold.store(MIC_DUCKING_HOLD_SAMPLES, Ordering::Relaxed);
    }

    /// Enable or disable mic ducking while sending
    pub fn set_mic_ducking(&self, enabled: bool) {
        self.mic_ducking_enabled.store(enabled, Ordering::Relaxed);
    }

    /// Update sidetone frequency
    pub fn set_sidetone_frequency(&self, frequency: f32) {
        self.frequency.store(frequency.to_bits(), Ordering::Relaxed);
        let _ = self.command_tx.send(AudioCommand::SetFrequency(frequency));
    }

    /// Update sidetone volume (for output to Zoom)
    pub fn set_sidetone_volume(&self, volume: f32) {
        self.volume.store(volume.to_bits(), Ordering::Relaxed);
        let _ = self.command_tx.send(AudioCommand::SetVolume(volume));
    }

    /// Update local sidetone volume (for local monitoring)
    pub fn set_local_sidetone_volume(&self, volume: f32) {
        self.local_volume.store(volume.to_bits(), Ordering::Relaxed);
        let _ = self.command_tx.send(AudioCommand::SetLocalVolume(volume));
    }

    /// Update microphone volume
    pub fn set_mic_volume(&self, volume: f32) {
        self.mic_volume.store(volume.to_bits(), Ordering::Relaxed);
        let _ = self.command_tx.send(AudioCommand::SetMicVolume(volume));
    }

    /// Get current microphone level (0.0 to 1.0)
    pub fn get_mic_level(&self) -> f32 {
        f32::from_bits(self.mic_level.load(Ordering::Relaxed))
    }

    /// Get current output level (0.0 to 1.0)
    pub fn get_output_level(&self) -> f32 {
        f32::from_bits(self.output_level.load(Ordering::Relaxed))
    }

    /// Set sidetone routing mode
    pub fn set_sidetone_route(&self, route: SidetoneRoute) {
        self.sidetone_route.store(route as u32, Ordering::Relaxed);
        let _ = self.command_tx.send(AudioCommand::SetSidetoneRoute(route));
    }

    /// Get current sidetone routing mode
    pub fn get_sidetone_route(&self) -> SidetoneRoute {
        match self.sidetone_route.load(Ordering::Relaxed) {
            0 => SidetoneRoute::OutputOnly,
            1 => SidetoneRoute::LocalOnly,
            _ => SidetoneRoute::Both,
        }
    }

    /// Start test recording - captures 5 seconds of mixed audio
    pub fn start_test_recording(&self) -> Result<(), String> {
        // Clear buffer and start recording
        {
            let mut buf = self.recording_buffer.lock();
            buf.clear();
        }
        self.is_recording.store(true, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StartTestRecording)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Stop test recording
    pub fn stop_test_recording(&self) -> Result<(), String> {
        self.is_recording.store(false, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StopTestRecording)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Start playback of recorded audio
    pub fn start_playback(&self, device: Option<String>) -> Result<(), String> {
        self.playback_position.store(0, Ordering::Relaxed);
        self.is_playing.store(true, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StartPlayback { device })
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Stop playback
    pub fn stop_playback(&self) -> Result<(), String> {
        self.is_playing.store(false, Ordering::Relaxed);
        self.command_tx.send(AudioCommand::StopPlayback)
            .map_err(|_| "Audio thread not responding".to_string())
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }

    /// Check if currently playing back
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::Relaxed)
    }

    /// Get number of samples recorded
    pub fn get_recording_samples(&self) -> usize {
        self.recording_buffer.lock().len()
    }

    /// Get current sample rate
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Relaxed)
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
        let pos = self.playback_position.load(Ordering::Relaxed);
        (pos as f32 / total as f32).min(1.0)
    }
}

impl Drop for AudioEngineHandle {
    fn drop(&mut self) {
        let _ = self.command_tx.send(AudioCommand::Shutdown);
    }
}

/// Audio thread that owns the cpal Streams (not Send)
fn audio_thread(
    command_rx: Receiver<AudioCommand>,
    is_key_down: Arc<AtomicBool>,
    frequency: Arc<AtomicU32>,
    volume: Arc<AtomicU32>,
    local_volume: Arc<AtomicU32>,
    mic_volume: Arc<AtomicU32>,
    mic_level: Arc<AtomicU32>,
    output_level: Arc<AtomicU32>,
    sidetone_route: Arc<AtomicU32>,
    mic_ducking_enabled: Arc<AtomicBool>,
    mic_ducking_hold: Arc<AtomicU32>,
    is_recording: Arc<AtomicBool>,
    recording_buffer: Arc<parking_lot::Mutex<Vec<f32>>>,
    is_playing: Arc<AtomicBool>,
    playback_position: Arc<AtomicUsize>,
    sample_rate: Arc<AtomicU32>,
) {
    let mut output_stream: Option<Stream> = None;
    let mut local_stream: Option<Stream> = None;
    let mut input_stream: Option<Stream> = None;
    let mut playback_stream: Option<Stream> = None;

    let init_freq = f32::from_bits(frequency.load(Ordering::Relaxed));
    let init_vol = f32::from_bits(volume.load(Ordering::Relaxed));
    let init_local_vol = f32::from_bits(local_volume.load(Ordering::Relaxed));

    eprintln!("[audio] Initializing sidetone generators:");
    eprintln!("[audio]   Main sidetone: freq={} Hz, volume={}", init_freq, init_vol);
    eprintln!("[audio]   Local sidetone: freq={} Hz, volume={}", init_freq, init_local_vol);

    let sidetone = Arc::new(parking_lot::Mutex::new(SidetoneGenerator::new(
        init_freq,
        init_vol,
        48000.0,
    )));

    // Create a second sidetone generator for local output (independent phase)
    let local_sidetone = Arc::new(parking_lot::Mutex::new(SidetoneGenerator::new(
        init_freq,
        init_local_vol,
        48000.0,
    )));

    loop {
        match command_rx.recv() {
            Ok(AudioCommand::Start { output_device, input_device, local_device, sidetone_route: route }) => {
                eprintln!("[audio] === Starting audio ===");
                eprintln!("[audio] Output device: {:?}", output_device);
                eprintln!("[audio] Input device: {:?}", input_device);
                eprintln!("[audio] Local device: {:?}", local_device);
                eprintln!("[audio] Sidetone route: {:?} (0=OutputOnly, 1=LocalOnly, 2=Both)", route as u32);

                // Stop existing streams
                output_stream = None;
                local_stream = None;
                input_stream = None;

                // Create fresh ring buffer for mic audio (prevents stale data issues)
                let ring_buffer = HeapRb::<f32>::new(RING_BUFFER_SIZE);
                let (producer, consumer) = ring_buffer.split();
                let producer = Arc::new(parking_lot::Mutex::new(producer));
                let consumer = Arc::new(parking_lot::Mutex::new(consumer));

                // Update sidetone route
                sidetone_route.store(route as u32, Ordering::Relaxed);

                // Start input stream (mic capture)
                if let Some(ref input_name) = input_device {
                    match create_input_stream(Some(input_name.as_str()), Arc::clone(&producer), Arc::clone(&mic_level)) {
                        Ok(new_stream) => {
                            if let Err(e) = new_stream.play() {
                                eprintln!("Failed to start mic input: {}", e);
                            } else {
                                input_stream = Some(new_stream);
                                println!("Mic input started: {}", input_name);
                            }
                        }
                        Err(e) => eprintln!("Failed to create mic input stream: {}", e),
                    }
                } else {
                    // Try default input device
                    match create_input_stream(None, Arc::clone(&producer), Arc::clone(&mic_level)) {
                        Ok(new_stream) => {
                            if let Err(e) = new_stream.play() {
                                eprintln!("Failed to start default mic: {}", e);
                            } else {
                                input_stream = Some(new_stream);
                                println!("Default mic input started");
                            }
                        }
                        Err(e) => eprintln!("No mic available: {}", e),
                    }
                }

                // Determine if sidetone should go to main output
                let include_sidetone_in_output = route == SidetoneRoute::OutputOnly || route == SidetoneRoute::Both;

                // Start main output stream (mic + optionally sidetone mixed) for VB-Cable/Zoom
                match create_output_stream(
                    output_device.as_deref(),
                    Arc::clone(&sidetone),
                    Arc::clone(&is_key_down),
                    Arc::clone(&consumer),
                    Arc::clone(&mic_volume),
                    Arc::clone(&output_level),
                    include_sidetone_in_output,
                    Arc::clone(&mic_ducking_enabled),
                    Arc::clone(&mic_ducking_hold),
                    Arc::clone(&is_recording),
                    Arc::clone(&recording_buffer),
                    Arc::clone(&sample_rate),
                ) {
                    Ok(new_stream) => {
                        if let Err(e) = new_stream.play() {
                            eprintln!("Failed to start audio output: {}", e);
                        } else {
                            output_stream = Some(new_stream);
                            println!("Audio output started (sidetone: {})", include_sidetone_in_output);
                        }
                    }
                    Err(e) => eprintln!("Failed to create audio output stream: {}", e),
                }

                // Start local output stream (sidetone only) if routing requires it
                let need_local_output = route == SidetoneRoute::LocalOnly || route == SidetoneRoute::Both;
                eprintln!("[audio] Need local output: {} (route={:?})", need_local_output, route as u32);
                if need_local_output {
                    let local_dev = local_device.as_deref();
                    eprintln!("[audio] Creating local output stream with device: {:?}", local_dev);
                    match create_local_output_stream(
                        local_dev,
                        Arc::clone(&local_sidetone),
                        Arc::clone(&is_key_down),
                        Arc::clone(&local_volume),
                    ) {
                        Ok(new_stream) => {
                            if let Err(e) = new_stream.play() {
                                eprintln!("[audio] Failed to start local output: {}", e);
                            } else {
                                local_stream = Some(new_stream);
                                eprintln!("[audio] Local sidetone output started successfully!");
                                // Routing is now handled in create_local_output_stream
                            }
                        }
                        Err(e) => eprintln!("[audio] Failed to create local output stream: {}", e),
                    }
                } else {
                    eprintln!("[audio] Skipping local output (not needed for this route)");
                }
            }
            Ok(AudioCommand::Stop) => {
                output_stream = None;
                local_stream = None;
                input_stream = None;
            }
            Ok(AudioCommand::SetFrequency(freq)) => {
                sidetone.lock().set_frequency(freq);
                local_sidetone.lock().set_frequency(freq);
            }
            Ok(AudioCommand::SetVolume(vol)) => {
                sidetone.lock().set_volume(vol);
            }
            Ok(AudioCommand::SetLocalVolume(vol)) => {
                local_sidetone.lock().set_volume(vol);
            }
            Ok(AudioCommand::SetMicVolume(_vol)) => {
                // mic_volume is read directly from atomic in the callback
            }
            Ok(AudioCommand::SetSidetoneRoute(_route)) => {
                // Route changes require restart of audio to take effect
                // The atomic is updated, but streams need restart
            }
            Ok(AudioCommand::StartTestRecording) => {
                eprintln!("[audio] Starting test recording...");
                // Recording flag is already set by handle method
            }
            Ok(AudioCommand::StopTestRecording) => {
                eprintln!("[audio] Stopped test recording. Samples: {}", recording_buffer.lock().len());
                // Recording flag is already cleared by handle method
            }
            Ok(AudioCommand::StartPlayback { device }) => {
                eprintln!("[audio] Starting playback on device: {:?}", device);
                // Stop any existing playback stream
                playback_stream = None;

                // Create playback stream
                match create_playback_stream(
                    device.as_deref(),
                    Arc::clone(&recording_buffer),
                    Arc::clone(&is_playing),
                    Arc::clone(&playback_position),
                ) {
                    Ok(new_stream) => {
                        if let Err(e) = new_stream.play() {
                            eprintln!("[audio] Failed to start playback: {}", e);
                            is_playing.store(false, Ordering::Relaxed);
                        } else {
                            playback_stream = Some(new_stream);
                            eprintln!("[audio] Playback started");
                        }
                    }
                    Err(e) => {
                        eprintln!("[audio] Failed to create playback stream: {}", e);
                        is_playing.store(false, Ordering::Relaxed);
                    }
                }
            }
            Ok(AudioCommand::StopPlayback) => {
                eprintln!("[audio] Stopping playback");
                playback_stream = None;
                // is_playing flag is already cleared by handle method
            }
            Ok(AudioCommand::Shutdown) | Err(_) => {
                output_stream = None;
                local_stream = None;
                input_stream = None;
                playback_stream = None;
                break;
            }
        }
    }
}

type MicConsumer = Arc<parking_lot::Mutex<ringbuf::HeapCons<f32>>>;
type MicProducer = Arc<parking_lot::Mutex<ringbuf::HeapProd<f32>>>;

/// Create an audio input stream (microphone capture)
fn create_input_stream(
    device_name: Option<&str>,
    producer: MicProducer,
    mic_level: Arc<AtomicU32>,
) -> Result<Stream, String> {
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

    let config = device
        .default_input_config()
        .map_err(|e| e.to_string())?;

    let channels = config.channels() as usize;

    // Capture baseline source-output IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_source_outputs = if pulse_source.is_some() {
        get_source_output_ids()
    } else {
        Vec::new()
    };

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_input_stream::<f32>(&device, &config.into(), producer, channels, mic_level),
        cpal::SampleFormat::I16 => build_input_stream::<i16>(&device, &config.into(), producer, channels, mic_level),
        cpal::SampleFormat::U16 => build_input_stream::<u16>(&device, &config.into(), producer, channels, mic_level),
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
    producer: MicProducer,
    channels: usize,
    mic_level: Arc<AtomicU32>,
) -> Result<Stream, String>
where
    f32: FromSample<T>,
{
    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let mut producer = producer.lock();
                let mut peak: f32 = 0.0;

                // Convert to mono (average channels) and push to ring buffer
                for frame in data.chunks(channels) {
                    let sample: f32 = frame
                        .iter()
                        .map(|s| <f32 as FromSample<T>>::from_sample_(*s))
                        .sum::<f32>()
                        / channels as f32;
                    let _ = producer.try_push(sample);

                    // Track peak level
                    peak = peak.max(sample.abs());
                }

                // Update mic level with smoothing (fast attack, slow decay)
                let current = f32::from_bits(mic_level.load(Ordering::Relaxed));
                let new_level = if peak > current {
                    peak // Fast attack
                } else {
                    current * 0.95 + peak * 0.05 // Slow decay
                };
                mic_level.store(new_level.to_bits(), Ordering::Relaxed);
            },
            |err| eprintln!("Input stream error: {}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    Ok(stream)
}

/// Create an audio output stream (mic + optionally sidetone mixed) for VB-Cable/Zoom
fn create_output_stream(
    device_name: Option<&str>,
    sidetone: Arc<parking_lot::Mutex<SidetoneGenerator>>,
    is_key_down: Arc<AtomicBool>,
    consumer: MicConsumer,
    mic_volume: Arc<AtomicU32>,
    output_level: Arc<AtomicU32>,
    include_sidetone: bool,
    mic_ducking_enabled: Arc<AtomicBool>,
    mic_ducking_hold: Arc<AtomicU32>,
    is_recording: Arc<AtomicBool>,
    recording_buffer: Arc<parking_lot::Mutex<Vec<f32>>>,
    sample_rate_out: Arc<AtomicU32>,
) -> Result<Stream, String> {
    let host = cpal::default_host();

    // On Linux, always use the "pipewire" ALSA device and route using pactl
    // The device_name parameter is a PulseAudio sink name, not an ALSA name
    #[cfg(target_os = "linux")]
    let (device, pulse_sink) = {
        eprintln!("[audio] Looking for 'pipewire' or 'default' ALSA output device...");
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        eprintln!("[audio] Available ALSA output devices:");
        for d in &devices {
            if let Ok(n) = d.name() {
                eprintln!("[audio]   - '{}'", n);
            }
        }

        let dev = devices.iter()
            .find(|d| d.name().map(|n| n == "pipewire" || n == "default").unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| "No pipewire/default output device available".to_string())?;

        eprintln!("[audio] Using ALSA output device: {:?}", dev.name());
        if let Some(name) = device_name {
            eprintln!("[audio] Will route to PulseAudio sink: {}", name);
        }

        (dev, device_name.map(|s| s.to_string()))
    };

    #[cfg(not(target_os = "linux"))]
    let device = if let Some(name) = device_name {
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        devices.iter()
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| format!("Output device '{}' not found", name))?
    } else {
        host.default_output_device()
            .ok_or_else(|| "No default output device".to_string())?
    };

    let config = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = config.sample_rate().0 as f32;
    let channels = config.channels() as usize;

    // Update sidetone sample rate and store it for recording duration calculation
    sidetone.lock().set_sample_rate(sample_rate);
    sample_rate_out.store(sample_rate as u32, Ordering::Relaxed);

    // Capture baseline sink-input IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_sink_inputs = if pulse_sink.is_some() {
        get_sink_input_ids()
    } else {
        Vec::new()
    };

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_output_stream::<f32>(&device, &config.into(), sidetone, is_key_down, consumer, mic_volume, output_level, include_sidetone, channels, mic_ducking_enabled, mic_ducking_hold, is_recording, recording_buffer),
        cpal::SampleFormat::I16 => build_output_stream::<i16>(&device, &config.into(), sidetone, is_key_down, consumer, mic_volume, output_level, include_sidetone, channels, mic_ducking_enabled, mic_ducking_hold, is_recording, recording_buffer),
        cpal::SampleFormat::U16 => build_output_stream::<u16>(&device, &config.into(), sidetone, is_key_down, consumer, mic_volume, output_level, include_sidetone, channels, mic_ducking_enabled, mic_ducking_hold, is_recording, recording_buffer),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

    // On Linux, route the sink-input to the user's selected PulseAudio sink
    #[cfg(target_os = "linux")]
    if let Some(sink_name) = pulse_sink {
        route_sink_input_to_device_with_baseline(sink_name, baseline_sink_inputs);
    }

    Ok(stream)
}

fn build_output_stream<T: cpal::SizedSample + cpal::FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    sidetone: Arc<parking_lot::Mutex<SidetoneGenerator>>,
    is_key_down: Arc<AtomicBool>,
    consumer: MicConsumer,
    mic_volume: Arc<AtomicU32>,
    output_level: Arc<AtomicU32>,
    include_sidetone: bool,
    channels: usize,
    mic_ducking_enabled: Arc<AtomicBool>,
    mic_ducking_hold: Arc<AtomicU32>,
    is_recording: Arc<AtomicBool>,
    recording_buffer: Arc<parking_lot::Mutex<Vec<f32>>>,
) -> Result<Stream, String> {
    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let key_down = is_key_down.load(Ordering::Relaxed);
                let mic_vol = f32::from_bits(mic_volume.load(Ordering::Relaxed));
                let ducking_enabled = mic_ducking_enabled.load(Ordering::Relaxed);
                let mut sidetone = sidetone.lock();
                let mut consumer = consumer.lock();
                let mut peak: f32 = 0.0;

                // Track samples processed for ducking hold countdown
                let mut samples_in_frame = 0u32;

                for frame in data.chunks_mut(channels) {
                    samples_in_frame += 1;

                    // Get sidetone sample (only if routing includes it)
                    let tone_sample = if include_sidetone {
                        sidetone.next_sample(key_down)
                    } else {
                        // Still need to advance the generator to keep it in sync
                        let _ = sidetone.next_sample(key_down);
                        0.0
                    };

                    // Get mic sample from ring buffer (or silence if empty)
                    let raw_mic = consumer.try_pop().unwrap_or(0.0);

                    // Apply mic ducking: mute mic while key is down or during hold period
                    let ducking_hold = mic_ducking_hold.load(Ordering::Relaxed);
                    let should_duck = ducking_enabled && (key_down || ducking_hold > 0);
                    let mic_sample = if should_duck { 0.0 } else { raw_mic * mic_vol };

                    // Mix: add sidetone and mic together
                    let mixed = (tone_sample + mic_sample).clamp(-1.0, 1.0);

                    // Capture sample for test recording if active
                    if is_recording.load(Ordering::Relaxed) {
                        if let Some(mut buf) = recording_buffer.try_lock() {
                            if buf.len() < MAX_RECORDING_SAMPLES {
                                buf.push(mixed);
                            }
                        }
                    }

                    // Track output peak level
                    peak = peak.max(mixed.abs());

                    let value = T::from_sample(mixed);
                    for channel in frame.iter_mut() {
                        *channel = value;
                    }
                }

                // Decrement ducking hold counter (only when key is up and ducking is enabled)
                if ducking_enabled && !key_down {
                    let current_hold = mic_ducking_hold.load(Ordering::Relaxed);
                    if current_hold > 0 {
                        let new_hold = current_hold.saturating_sub(samples_in_frame);
                        mic_ducking_hold.store(new_hold, Ordering::Relaxed);
                    }
                }

                // Update output level with smoothing
                let current = f32::from_bits(output_level.load(Ordering::Relaxed));
                let new_level = if peak > current {
                    peak
                } else {
                    current * 0.95 + peak * 0.05
                };
                output_level.store(new_level.to_bits(), Ordering::Relaxed);
            },
            |err| eprintln!("Output stream error: {}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    Ok(stream)
}

/// Create a local output stream (sidetone only) for monitoring through headphones/speakers
fn create_local_output_stream(
    device_name: Option<&str>,
    sidetone: Arc<parking_lot::Mutex<SidetoneGenerator>>,
    is_key_down: Arc<AtomicBool>,
    _local_volume: Arc<AtomicU32>,
) -> Result<Stream, String> {
    let host = cpal::default_host();

    // On Linux, always use the "pipewire" ALSA device and route using pactl
    // The device_name parameter is a PulseAudio sink name, not an ALSA name
    #[cfg(target_os = "linux")]
    let (device, pulse_sink) = {
        eprintln!("[audio] Looking for 'pipewire' or 'default' ALSA device for local output...");
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        let dev = devices.iter()
            .find(|d| d.name().map(|n| n == "pipewire" || n == "default").unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| "No pipewire/default output device for local monitoring".to_string())?;

        eprintln!("[audio] Using ALSA local output device: {:?}", dev.name());
        if let Some(name) = device_name {
            eprintln!("[audio] Will route local sidetone to PulseAudio sink: {}", name);
        }

        (dev, device_name.map(|s| s.to_string()))
    };

    #[cfg(not(target_os = "linux"))]
    let device = if let Some(name) = device_name {
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        devices.iter()
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| format!("Local output device '{}' not found", name))?
    } else {
        host.default_output_device()
            .ok_or_else(|| "No default output device for local monitoring".to_string())?
    };

    let config = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = config.sample_rate().0 as f32;
    let channels = config.channels() as usize;

    // Update sidetone sample rate
    sidetone.lock().set_sample_rate(sample_rate);

    // Capture baseline sink-input IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_sink_inputs = get_sink_input_ids();

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_local_output_stream::<f32>(&device, &config.into(), sidetone, is_key_down, channels),
        cpal::SampleFormat::I16 => build_local_output_stream::<i16>(&device, &config.into(), sidetone, is_key_down, channels),
        cpal::SampleFormat::U16 => build_local_output_stream::<u16>(&device, &config.into(), sidetone, is_key_down, channels),
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

    Ok(stream)
}

fn build_local_output_stream<T: cpal::SizedSample + cpal::FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    sidetone: Arc<parking_lot::Mutex<SidetoneGenerator>>,
    is_key_down: Arc<AtomicBool>,
    channels: usize,
) -> Result<Stream, String> {
    // Debug counters for local output
    let callback_count = Arc::new(AtomicU32::new(0));
    let callback_count_clone = Arc::clone(&callback_count);
    let has_logged_first = Arc::new(AtomicBool::new(false));
    let has_logged_first_clone = Arc::clone(&has_logged_first);
    let has_logged_keydown = Arc::new(AtomicBool::new(false));
    let has_logged_keydown_clone = Arc::clone(&has_logged_keydown);

    let stream_result = device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let key_down = is_key_down.load(Ordering::Relaxed);
                let mut sidetone = sidetone.lock();

                // Debug: log first callback to confirm stream is running
                let count = callback_count_clone.fetch_add(1, Ordering::Relaxed);
                if count == 0 && !has_logged_first_clone.swap(true, Ordering::Relaxed) {
                    eprintln!("[audio-local] *** First callback! Stream is running. Buffer size: {} ***", data.len());
                }

                // Debug: log first key_down detection
                if key_down && !has_logged_keydown_clone.swap(true, Ordering::Relaxed) {
                    eprintln!("[audio-local] *** First key_down detected! Generating sidetone ***");
                }

                for frame in data.chunks_mut(channels) {
                    // Get sidetone sample (volume is already in the generator)
                    let tone_sample = sidetone.next_sample(key_down);

                    let value = T::from_sample(tone_sample);
                    for channel in frame.iter_mut() {
                        *channel = value;
                    }
                }
            },
            |err| eprintln!("Local output stream error: {}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    Ok(stream_result)
}

/// Create a playback stream for test recording playback
fn create_playback_stream(
    device_name: Option<&str>,
    recording_buffer: Arc<parking_lot::Mutex<Vec<f32>>>,
    is_playing: Arc<AtomicBool>,
    playback_position: Arc<AtomicUsize>,
) -> Result<Stream, String> {
    let host = cpal::default_host();

    // On Linux, always use the "pipewire" ALSA device and route using pactl
    #[cfg(target_os = "linux")]
    let (device, pulse_sink) = {
        eprintln!("[audio] Looking for 'pipewire' or 'default' ALSA device for playback...");
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        let dev = devices.iter()
            .find(|d| d.name().map(|n| n == "pipewire" || n == "default").unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| "No pipewire/default output device for playback".to_string())?;

        eprintln!("[audio] Using ALSA playback device: {:?}", dev.name());
        if let Some(name) = device_name {
            eprintln!("[audio] Will route playback to PulseAudio sink: {}", name);
        }

        (dev, device_name.map(|s| s.to_string()))
    };

    #[cfg(not(target_os = "linux"))]
    let device = if let Some(name) = device_name {
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        devices.iter()
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| format!("Playback device '{}' not found", name))?
    } else {
        host.default_output_device()
            .ok_or_else(|| "No default output device for playback".to_string())?
    };

    let config = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let channels = config.channels() as usize;

    // Capture baseline sink-input IDs before creating stream
    #[cfg(target_os = "linux")]
    let baseline_sink_inputs = get_sink_input_ids();

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_playback_stream::<f32>(&device, &config.into(), recording_buffer, is_playing, playback_position, channels),
        cpal::SampleFormat::I16 => build_playback_stream::<i16>(&device, &config.into(), recording_buffer, is_playing, playback_position, channels),
        cpal::SampleFormat::U16 => build_playback_stream::<u16>(&device, &config.into(), recording_buffer, is_playing, playback_position, channels),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

    // On Linux, route playback to the user's selected PulseAudio sink or default speakers
    #[cfg(target_os = "linux")]
    if let Some(sink_name) = pulse_sink {
        route_sink_input_to_device_with_baseline(sink_name, baseline_sink_inputs);
    } else {
        route_local_stream_to_default_speakers_with_baseline(baseline_sink_inputs);
    }

    Ok(stream)
}

fn build_playback_stream<T: cpal::SizedSample + cpal::FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    recording_buffer: Arc<parking_lot::Mutex<Vec<f32>>>,
    is_playing: Arc<AtomicBool>,
    playback_position: Arc<AtomicUsize>,
    channels: usize,
) -> Result<Stream, String> {
    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                // Check if playback should continue
                if !is_playing.load(Ordering::Relaxed) {
                    // Fill with silence
                    for sample in data.iter_mut() {
                        *sample = T::from_sample(0.0f32);
                    }
                    return;
                }

                let buf = recording_buffer.lock();
                let buf_len = buf.len();

                for frame in data.chunks_mut(channels) {
                    let pos = playback_position.load(Ordering::Relaxed);

                    let sample = if pos < buf_len {
                        buf[pos]
                    } else {
                        // Playback finished
                        is_playing.store(false, Ordering::Relaxed);
                        0.0
                    };

                    playback_position.fetch_add(1, Ordering::Relaxed);

                    let value = T::from_sample(sample);
                    for channel in frame.iter_mut() {
                        *channel = value;
                    }
                }
            },
            |err| eprintln!("Playback stream error: {}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    Ok(stream)
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

#[cfg(not(target_os = "linux"))]
fn route_local_stream_to_default_speakers_with_baseline(_existing_ids: Vec<String>) {
    // No-op on non-Linux platforms
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

    // Store PulseAudio names directly - we'll route using pactl, not CPAL device selection
    let result: Vec<DeviceInfo> = devices
        .into_iter()
        .filter_map(|dev| {
            let description = dev.description.clone()?;
            let pa_name = dev.name.clone()?;

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
