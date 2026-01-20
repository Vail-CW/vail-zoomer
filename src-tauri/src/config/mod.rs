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

/// Audio mixing mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum MixMode {
    #[default]
    AlwaysMix,
    CwMutesMic,
    PushToTalkVoice,
}

/// Where to route sidetone audio
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum SidetoneRoute {
    #[default]
    OutputOnly,      // Only to VB-Cable/output device (silent locally)
    LocalOnly,       // Only to local speakers (not mixed into output)
    Both,            // Both local speakers and output
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    // Keyer settings
    pub keyer_type: KeyerType,
    pub wpm: f32,
    pub dit_dah_ratio: f32,
    pub weighting: f32,
    pub swap_paddles: bool,

    // Sidetone settings
    pub sidetone_frequency: f32,
    pub sidetone_volume: f32,       // Volume for sidetone going to Zoom/output
    pub local_sidetone_volume: f32, // Volume for local monitoring (headphones/speakers)
    pub sidetone_route: SidetoneRoute,

    // Audio settings
    pub mic_volume: f32,
    pub mix_mode: MixMode,
    pub local_output_device: Option<String>,  // For local sidetone monitoring

    // Device settings
    pub midi_device: Option<String>,
    pub input_device: Option<String>,
    pub output_device: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            keyer_type: KeyerType::default(),
            wpm: 18.0,
            dit_dah_ratio: 3.0,
            weighting: 0.0,
            swap_paddles: false,
            sidetone_frequency: 600.0,
            sidetone_volume: 0.5,
            local_sidetone_volume: 0.3,
            sidetone_route: SidetoneRoute::default(),
            mic_volume: 1.0,
            mix_mode: MixMode::default(),
            local_output_device: None,
            midi_device: None,
            input_device: None,
            output_device: None,
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
