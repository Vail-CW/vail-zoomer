// Linux Virtual Audio Device Setup
// This module handles automatic creation of virtual audio devices for PipeWire and PulseAudio

#[cfg(target_os = "linux")]
use std::fs::{self, OpenOptions};
#[cfg(target_os = "linux")]
use std::io::Write;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(target_os = "linux")]
use std::thread;
#[cfg(target_os = "linux")]
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Represents the Linux audio system type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioSystem {
    PipeWire,
    PulseAudio,
    Unknown,
}

/// Result of checking for virtual audio device
#[derive(Debug, Clone, Serialize)]
pub struct VirtualAudioStatus {
    pub exists: bool,
    pub audio_system: AudioSystem,
    pub pactl_installed: bool,
}

/// Result of setup operation
#[derive(Debug, Clone, Serialize)]
pub struct SetupResult {
    pub success: bool,
    pub message: String,
}

#[cfg(target_os = "linux")]
const PIPEWIRE_CONFIG: &str = r#"# Vail Zoomer Virtual Audio Device
# Creates a loopback that provides both a sink (for app output) and source (for Zoom input)
context.modules = [
  { name = libpipewire-module-loopback
    args = {
      node.description = "Vail Zoomer"
      capture.props = {
        node.name = "VailZoomer"
        media.class = "Audio/Sink"
        audio.position = [ FL FR ]
      }
      playback.props = {
        node.name = "VailZoomerMic"
        media.class = "Audio/Source"
        audio.position = [ FL FR ]
      }
    }
  }
]
"#;

#[cfg(target_os = "linux")]
const PULSEAUDIO_NULL_SINK: &str =
    "load-module module-null-sink sink_name=VailZoomer sink_properties=device.description=\"Vail_Zoomer_Output\"";

#[cfg(target_os = "linux")]
const PULSEAUDIO_REMAP_SOURCE: &str =
    "load-module module-remap-source master=VailZoomer.monitor source_name=VailZoomerMic source_properties=device.description=\"Vail_Zoomer_Microphone\"";

/// Check if pactl command is available
#[cfg(target_os = "linux")]
pub fn is_pactl_installed() -> bool {
    Command::new("which")
        .arg("pactl")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "linux"))]
pub fn is_pactl_installed() -> bool {
    false
}

/// Install pulseaudio-utils package (provides pactl)
#[cfg(target_os = "linux")]
fn install_pactl() -> Result<(), String> {
    eprintln!("[linux_audio] Attempting to install pulseaudio-utils...");

    // Try pkexec for graphical sudo prompt
    let result = Command::new("pkexec")
        .args(["apt-get", "install", "-y", "pulseaudio-utils"])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                eprintln!("[linux_audio] Successfully installed pulseaudio-utils");
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // Check if user cancelled the auth dialog
                if stderr.contains("dismissed") || stderr.contains("cancelled") {
                    Err("Installation cancelled. Please install manually: sudo apt install pulseaudio-utils".to_string())
                } else {
                    Err(format!("Failed to install pulseaudio-utils: {}", stderr))
                }
            }
        }
        Err(e) => {
            Err(format!("Failed to run installer: {}. Please install manually: sudo apt install pulseaudio-utils", e))
        }
    }
}

/// Detect whether the system uses PipeWire or PulseAudio
#[cfg(target_os = "linux")]
pub fn detect_audio_system() -> AudioSystem {
    // First try pactl if available
    let output = Command::new("pactl").args(["info"]).output();

    if let Ok(output) = output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if stdout.contains("pipewire") {
                return AudioSystem::PipeWire;
            } else if stdout.contains("pulseaudio") {
                return AudioSystem::PulseAudio;
            } else {
                // If pactl works but we can't identify the server, assume PulseAudio
                return AudioSystem::PulseAudio;
            }
        }
    }

    // Fallback: check if PipeWire is running via systemctl
    let pipewire_check = Command::new("systemctl")
        .args(["--user", "is-active", "pipewire"])
        .output();

    if let Ok(output) = pipewire_check {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
            if stdout == "active" {
                eprintln!("[linux_audio] Detected PipeWire via systemctl");
                return AudioSystem::PipeWire;
            }
        }
    }

    // Fallback: check if PulseAudio is running via systemctl
    let pulse_check = Command::new("systemctl")
        .args(["--user", "is-active", "pulseaudio"])
        .output();

    if let Ok(output) = pulse_check {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
            if stdout == "active" {
                eprintln!("[linux_audio] Detected PulseAudio via systemctl");
                return AudioSystem::PulseAudio;
            }
        }
    }

    // Last fallback: check for pipewire process
    let pgrep = Command::new("pgrep").args(["-x", "pipewire"]).output();
    if let Ok(output) = pgrep {
        if output.status.success() {
            eprintln!("[linux_audio] Detected PipeWire via pgrep");
            return AudioSystem::PipeWire;
        }
    }

    AudioSystem::Unknown
}

#[cfg(not(target_os = "linux"))]
pub fn detect_audio_system() -> AudioSystem {
    AudioSystem::Unknown
}

/// Check if the VailZoomerMic source exists
#[cfg(target_os = "linux")]
pub fn check_virtual_audio_device() -> Result<VirtualAudioStatus, String> {
    let pactl_installed = is_pactl_installed();
    let audio_system = detect_audio_system();

    // If pactl isn't installed, we can still detect the audio system but can't check for devices
    if !pactl_installed {
        return Ok(VirtualAudioStatus {
            exists: false,
            audio_system,
            pactl_installed: false,
        });
    }

    // Check for the source (VailZoomerMic) which is what Zoom sees
    let output = Command::new("pactl")
        .args(["list", "sources", "short"])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let exists = stdout.lines().any(|line| line.contains("VailZoomerMic"));

    Ok(VirtualAudioStatus {
        exists,
        audio_system,
        pactl_installed: true,
    })
}

#[cfg(not(target_os = "linux"))]
pub fn check_virtual_audio_device() -> Result<VirtualAudioStatus, String> {
    Ok(VirtualAudioStatus {
        exists: true, // Return true on non-Linux so UI doesn't show prompt
        audio_system: AudioSystem::Unknown,
        pactl_installed: true,
    })
}

/// Get the PipeWire config directory path
#[cfg(target_os = "linux")]
fn get_pipewire_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"))
        .join("pipewire")
        .join("pipewire.conf.d")
}

/// Get the PulseAudio config file path
#[cfg(target_os = "linux")]
fn get_pulseaudio_config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"))
        .join("pulse")
        .join("default.pa")
}

/// Setup virtual audio device for PipeWire
#[cfg(target_os = "linux")]
fn setup_pipewire() -> Result<SetupResult, String> {
    let config_dir = get_pipewire_config_dir();
    let config_file = config_dir.join("vail-zoomer.conf");

    // Create directory if it doesn't exist
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory {:?}: {}", config_dir, e))?;

    // Write the config file
    fs::write(&config_file, PIPEWIRE_CONFIG)
        .map_err(|e| format!("Failed to write config file {:?}: {}", config_file, e))?;

    // Restart PipeWire services
    let restart_result = Command::new("systemctl")
        .args(["--user", "restart", "pipewire", "pipewire-pulse"])
        .output();

    match restart_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to restart PipeWire: {}", stderr));
            }
        }
        Err(e) => {
            return Err(format!("Failed to run systemctl: {}", e));
        }
    }

    // Wait for the service to restart
    thread::sleep(Duration::from_millis(2000));

    // Verify the device was created
    let status = check_virtual_audio_device()?;
    if status.exists {
        Ok(SetupResult {
            success: true,
            message: "Virtual audio device created successfully. Select 'Vail Zoomer' as your output device.".to_string(),
        })
    } else {
        Err("Device was not created after restart. Please try logging out and back in, or restart your computer.".to_string())
    }
}

/// Setup virtual audio device for PulseAudio
#[cfg(target_os = "linux")]
fn setup_pulseaudio() -> Result<SetupResult, String> {
    let config_path = get_pulseaudio_config_path();
    let config_dir = config_path
        .parent()
        .ok_or("Failed to get pulse config directory")?;

    // Create directory if it doesn't exist
    fs::create_dir_all(config_dir)
        .map_err(|e| format!("Failed to create config directory {:?}: {}", config_dir, e))?;

    // Check if config lines already exist
    let existing_content = fs::read_to_string(&config_path).unwrap_or_default();

    if !existing_content.contains("VailZoomer") {
        // Append the config lines
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&config_path)
            .map_err(|e| format!("Failed to open config file {:?}: {}", config_path, e))?;

        writeln!(file, "\n# Vail Zoomer virtual audio device")
            .map_err(|e| format!("Failed to write to config file: {}", e))?;
        writeln!(file, "{}", PULSEAUDIO_NULL_SINK)
            .map_err(|e| format!("Failed to write to config file: {}", e))?;
        writeln!(file, "{}", PULSEAUDIO_REMAP_SOURCE)
            .map_err(|e| format!("Failed to write to config file: {}", e))?;
    }

    // Restart PulseAudio
    let _ = Command::new("pulseaudio").args(["--kill"]).output();
    thread::sleep(Duration::from_millis(500));

    let start_result = Command::new("pulseaudio").args(["--start"]).output();
    if let Err(e) = start_result {
        // PulseAudio might auto-start via systemd, so try that too
        let _ = Command::new("systemctl")
            .args(["--user", "restart", "pulseaudio"])
            .output();
        eprintln!("Note: pulseaudio --start failed ({}), tried systemctl", e);
    }

    // Wait for service to start
    thread::sleep(Duration::from_millis(2000));

    // Verify the device was created
    let status = check_virtual_audio_device()?;
    if status.exists {
        Ok(SetupResult {
            success: true,
            message: "Virtual audio device created successfully. Select 'Vail Zoomer Output' as your output device.".to_string(),
        })
    } else {
        Err("Device was not created after restart. Please try logging out and back in.".to_string())
    }
}

/// Main setup function that detects audio system and runs appropriate setup
#[cfg(target_os = "linux")]
pub fn setup_virtual_audio_device() -> Result<SetupResult, String> {
    // First, ensure pactl is installed (needed for verification)
    if !is_pactl_installed() {
        eprintln!("[linux_audio] pactl not found, attempting to install...");
        install_pactl()?;

        // Verify it's now installed
        if !is_pactl_installed() {
            return Err("Failed to install pulseaudio-utils. Please install manually: sudo apt install pulseaudio-utils".to_string());
        }
    }

    let audio_system = detect_audio_system();
    eprintln!("[linux_audio] Detected audio system: {:?}", audio_system);

    match audio_system {
        AudioSystem::PipeWire => setup_pipewire(),
        AudioSystem::PulseAudio => setup_pulseaudio(),
        AudioSystem::Unknown => Err(
            "Could not detect audio system. Please ensure PipeWire or PulseAudio is running."
                .to_string(),
        ),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn setup_virtual_audio_device() -> Result<SetupResult, String> {
    Err("Virtual audio setup is only available on Linux".to_string())
}
