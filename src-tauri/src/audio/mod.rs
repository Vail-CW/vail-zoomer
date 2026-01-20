mod sidetone;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Stream, StreamConfig, FromSample};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use crossbeam_channel::{bounded, Sender, Receiver};
use ringbuf::{HeapRb, traits::{Producer, Consumer, Split}};

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

        let is_key_down_clone = Arc::clone(&is_key_down);
        let frequency_clone = Arc::clone(&frequency_atomic);
        let volume_clone = Arc::clone(&volume_atomic);
        let local_volume_clone = Arc::clone(&local_volume_atomic);
        let mic_volume_clone = Arc::clone(&mic_volume_atomic);
        let mic_level_clone = Arc::clone(&mic_level_atomic);
        let output_level_clone = Arc::clone(&output_level_atomic);
        let sidetone_route_clone = Arc::clone(&sidetone_route_atomic);

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
        self.is_key_down.store(true, Ordering::Relaxed);
    }

    /// Signal key up (stop sidetone)
    pub fn key_up(&self) {
        self.is_key_down.store(false, Ordering::Relaxed);
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
) {
    let mut output_stream: Option<Stream> = None;
    let mut local_stream: Option<Stream> = None;
    let mut input_stream: Option<Stream> = None;

    let sidetone = Arc::new(parking_lot::Mutex::new(SidetoneGenerator::new(
        f32::from_bits(frequency.load(Ordering::Relaxed)),
        f32::from_bits(volume.load(Ordering::Relaxed)),
        48000.0,
    )));

    // Create a second sidetone generator for local output (independent phase)
    let local_sidetone = Arc::new(parking_lot::Mutex::new(SidetoneGenerator::new(
        f32::from_bits(frequency.load(Ordering::Relaxed)),
        f32::from_bits(local_volume.load(Ordering::Relaxed)),
        48000.0,
    )));

    // Create ring buffer for mic audio
    let ring_buffer = HeapRb::<f32>::new(RING_BUFFER_SIZE);
    let (producer, consumer) = ring_buffer.split();
    let producer = Arc::new(parking_lot::Mutex::new(producer));
    let consumer = Arc::new(parking_lot::Mutex::new(consumer));

    loop {
        match command_rx.recv() {
            Ok(AudioCommand::Start { output_device, input_device, local_device, sidetone_route: route }) => {
                // Stop existing streams
                output_stream = None;
                local_stream = None;
                input_stream = None;

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
                if need_local_output {
                    let local_dev = local_device.as_deref();
                    match create_local_output_stream(
                        local_dev,
                        Arc::clone(&local_sidetone),
                        Arc::clone(&is_key_down),
                        Arc::clone(&local_volume),
                    ) {
                        Ok(new_stream) => {
                            if let Err(e) = new_stream.play() {
                                eprintln!("Failed to start local output: {}", e);
                            } else {
                                local_stream = Some(new_stream);
                                println!("Local sidetone output started");
                            }
                        }
                        Err(e) => eprintln!("Failed to create local output stream: {}", e),
                    }
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
            Ok(AudioCommand::Shutdown) | Err(_) => {
                output_stream = None;
                local_stream = None;
                input_stream = None;
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

    let device = if let Some(name) = device_name {
        host.input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .ok_or_else(|| format!("Input device '{}' not found", name))?
    } else {
        host.default_input_device()
            .ok_or_else(|| "No default input device".to_string())?
    };

    let config = device
        .default_input_config()
        .map_err(|e| e.to_string())?;

    let channels = config.channels() as usize;

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_input_stream::<f32>(&device, &config.into(), producer, channels, mic_level),
        cpal::SampleFormat::I16 => build_input_stream::<i16>(&device, &config.into(), producer, channels, mic_level),
        cpal::SampleFormat::U16 => build_input_stream::<u16>(&device, &config.into(), producer, channels, mic_level),
        _ => return Err("Unsupported input sample format".to_string()),
    }?;

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
) -> Result<Stream, String> {
    let host = cpal::default_host();

    let device = if let Some(name) = device_name {
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        // Debug: print available devices
        eprintln!("[audio] Looking for output device: '{}'", name);
        eprintln!("[audio] Available output devices:");
        for d in &devices {
            if let Ok(n) = d.name() {
                eprintln!("[audio]   - '{}'", n);
            }
        }

        // Try exact match first
        devices.into_iter()
            .find(|d| d.name().map(|n| {
                // Exact match or case-insensitive substring match
                n == name ||
                n.to_lowercase().contains(&name.to_lowercase()) ||
                name.to_lowercase().contains(&n.to_lowercase())
            }).unwrap_or(false))
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

    // Update sidetone sample rate
    sidetone.lock().set_sample_rate(sample_rate);

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_output_stream::<f32>(&device, &config.into(), sidetone, is_key_down, consumer, mic_volume, output_level, include_sidetone, channels),
        cpal::SampleFormat::I16 => build_output_stream::<i16>(&device, &config.into(), sidetone, is_key_down, consumer, mic_volume, output_level, include_sidetone, channels),
        cpal::SampleFormat::U16 => build_output_stream::<u16>(&device, &config.into(), sidetone, is_key_down, consumer, mic_volume, output_level, include_sidetone, channels),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

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
) -> Result<Stream, String> {
    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let key_down = is_key_down.load(Ordering::Relaxed);
                let mic_vol = f32::from_bits(mic_volume.load(Ordering::Relaxed));
                let mut sidetone = sidetone.lock();
                let mut consumer = consumer.lock();
                let mut peak: f32 = 0.0;

                for frame in data.chunks_mut(channels) {
                    // Get sidetone sample (only if routing includes it)
                    let tone_sample = if include_sidetone {
                        sidetone.next_sample(key_down)
                    } else {
                        // Still need to advance the generator to keep it in sync
                        let _ = sidetone.next_sample(key_down);
                        0.0
                    };

                    // Get mic sample from ring buffer (or silence if empty)
                    let mic_sample = consumer.try_pop().unwrap_or(0.0) * mic_vol;

                    // Mix: add sidetone and mic together
                    let mixed = (tone_sample + mic_sample).clamp(-1.0, 1.0);

                    // Track output peak level
                    peak = peak.max(mixed.abs());

                    let value = T::from_sample(mixed);
                    for channel in frame.iter_mut() {
                        *channel = value;
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

    let device = if let Some(name) = device_name {
        host.output_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
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

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_local_output_stream::<f32>(&device, &config.into(), sidetone, is_key_down, channels),
        cpal::SampleFormat::I16 => build_local_output_stream::<i16>(&device, &config.into(), sidetone, is_key_down, channels),
        cpal::SampleFormat::U16 => build_local_output_stream::<u16>(&device, &config.into(), sidetone, is_key_down, channels),
        _ => return Err("Unsupported output sample format".to_string()),
    }?;

    Ok(stream)
}

fn build_local_output_stream<T: cpal::SizedSample + cpal::FromSample<f32>>(
    device: &Device,
    config: &StreamConfig,
    sidetone: Arc<parking_lot::Mutex<SidetoneGenerator>>,
    is_key_down: Arc<AtomicBool>,
    channels: usize,
) -> Result<Stream, String> {
    let stream_result = device
        .build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let key_down = is_key_down.load(Ordering::Relaxed);
                let mut sidetone = sidetone.lock();

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

// Linux-specific PulseAudio device enumeration for friendly names
// PipeWire also supports these APIs through PulseAudio compatibility

#[cfg(target_os = "linux")]
fn list_pulseaudio_sinks() -> Option<Vec<DeviceInfo>> {
    use pulsectl::controllers::SinkController;
    use pulsectl::controllers::DeviceControl;

    let mut handler = SinkController::create().ok()?;
    let devices = handler.list_devices().ok()?;

    // Get cpal device names for mapping
    let host = cpal::default_host();
    let cpal_devices: Vec<String> = host
        .output_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default();

    let result: Vec<DeviceInfo> = devices
        .into_iter()
        .filter_map(|dev| {
            let description = dev.description.clone()?;
            let pa_name = dev.name.clone()?;

            // Try to find matching cpal device
            // cpal on Linux uses ALSA names which may contain the PulseAudio device name
            let internal_name = cpal_devices
                .iter()
                .find(|cpal_name| {
                    // Check if cpal name contains the PA device name or vice versa
                    cpal_name.contains(&pa_name) || pa_name.contains(cpal_name.as_str())
                })
                .cloned()
                // If no match found, use PulseAudio name directly
                // (cpal may be using PulseAudio backend)
                .unwrap_or_else(|| pa_name.clone());

            Some(DeviceInfo {
                display_name: description,
                internal_name,
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

    // Get cpal device names for mapping
    let host = cpal::default_host();
    let cpal_devices: Vec<String> = host
        .input_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default();

    let result: Vec<DeviceInfo> = devices
        .into_iter()
        .filter_map(|dev| {
            let description = dev.description.clone()?;
            let pa_name = dev.name.clone()?;

            // Try to find matching cpal device
            let internal_name = cpal_devices
                .iter()
                .find(|cpal_name| {
                    cpal_name.contains(&pa_name) || pa_name.contains(cpal_name.as_str())
                })
                .cloned()
                .unwrap_or_else(|| pa_name.clone());

            Some(DeviceInfo {
                display_name: description,
                internal_name,
            })
        })
        .collect();

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}
