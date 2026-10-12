use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Keyer types supported by Vail Zoomer
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum KeyerType {
    #[default]
    Straight,
    Bug,
    IambicA,
    IambicB,
    Ultimatic,
    SingleDot,
    ElBug,
    PlainIambic,
    Keyahead,
}

/// Requested audio buffer size. `Auto` lets the driver choose; `Low` asks for
/// 128 frames (lowest latency, needs a healthy driver); `Safe` asks for 1024
/// frames (resists glitches on slow machines). Falls back to the driver
/// default when the device cannot honor the request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum BufferSizeMode {
    #[default]
    Auto,
    Low,
    Safe,
}

/// Where to route sidetone audio
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum SidetoneRoute {
    #[default]
    OutputOnly,      // Only to VB-Cable/output device (silent locally)
    LocalOnly,       // Only to local speakers (not mixed into output)
    Both,            // Both local speakers and output
}

/// Application settings.
///
/// Struct-level `serde(default)` so settings.json files written by older
/// versions (missing newer fields, or carrying removed ones) still load.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    // Keyer settings
    pub keyer_type: KeyerType,
    pub wpm: f32,

    // Sidetone settings
    pub sidetone_frequency: f32,
    pub sidetone_volume: f32,       // Volume for sidetone going to Zoom/output
    pub local_sidetone_volume: f32, // Volume for local monitoring (headphones/speakers)
    pub sidetone_route: SidetoneRoute,
    pub sidetone_rise_ms: f32,      // Raised-cosine rise/fall time, clamped 1..=20 ms

    // Audio settings
    pub mic_volume: f32,
    pub buffer_size_mode: BufferSizeMode,
    pub mic_ducking: bool,  // Mute mic while sending CW (with 250ms hold after key up)
    pub local_output_device: Option<String>,  // For local sidetone monitoring

    // Device settings
    pub midi_device: Option<String>,
    pub input_device: Option<String>,
    pub output_device: Option<String>,

    // Linux-specific: whether virtual audio setup has been completed
    pub linux_audio_setup_completed: bool,

    // UI preferences (the audio engine ignores these)
    pub theme: String,
    pub practice_mode: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            keyer_type: KeyerType::default(),
            wpm: 18.0,
            sidetone_frequency: 600.0,
            sidetone_volume: 0.5,
            local_sidetone_volume: 0.3,
            sidetone_route: SidetoneRoute::default(),
            mic_volume: 1.0,
            sidetone_rise_ms: 5.0,
            buffer_size_mode: BufferSizeMode::default(),
            mic_ducking: false,
            local_output_device: None,
            midi_device: None,
            input_device: None,
            output_device: None,
            linux_audio_setup_completed: false,
            theme: "dark".to_string(),
            practice_mode: false,
        }
    }
}

impl Settings {
    /// Get the path to the settings file
    fn config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|mut path| {
            path.push("vail-zoomer");
            path.push("settings.json");
            path
        })
    }

    /// Load settings from disk, or return defaults if not found
    pub fn load() -> Self {
        let path = match Self::config_path() {
            Some(p) => p,
            None => {
                eprintln!("[settings] Could not determine config path");
                return Self::default();
            }
        };

        eprintln!("[settings] Config path: {:?}", path);

        if !path.exists() {
            eprintln!("[settings] Config file does not exist, using defaults");
            return Self::default();
        }

        let contents = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[settings] Failed to read config file: {}", e);
                return Self::default();
            }
        };

        match serde_json::from_str(&contents) {
            Ok(settings) => {
                eprintln!("[settings] Loaded settings from {:?}", path);
                settings
            }
            Err(e) => {
                eprintln!("[settings] Failed to parse config file: {}", e);
                eprintln!("[settings] File contents: {}", contents);
                Self::default()
            }
        }
    }

    /// Save settings to disk
    pub fn save(&self) -> Result<(), String> {
        use std::io::Write;

        let path = Self::config_path().ok_or("Could not determine config directory")?;
        eprintln!("[settings] Saving to {:?}", path);

        // Create parent directory if it doesn't exist
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
        }

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        // Write with explicit sync to ensure data reaches disk
        let mut file = fs::File::create(&path)
            .map_err(|e| format!("Failed to create config file: {}", e))?;
        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write config file: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync config file: {}", e))?;

        eprintln!("[settings] Successfully saved settings to {:?}", path);
        Ok(())
    }
}
