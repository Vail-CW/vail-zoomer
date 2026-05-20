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
    pub log: Vec<String>,  // Verbose step-by-step log for UI display
    pub devices_created: Vec<String>,  // List of devices created
}

// Note: We no longer use persistent PipeWire config files.
// Virtual audio devices are created dynamically using pactl and cleaned up on app exit.

#[cfg(target_os = "linux")]
const PULSEAUDIO_NULL_SINK: &str =
    "load-module module-null-sink sink_name=VailZoomer sink_properties=device.description=\"Vail_Zoomer_Output\"";

#[cfg(target_os = "linux")]
const PULSEAUDIO_REMAP_SOURCE: &str =
    "load-module module-remap-source master=VailZoomer.monitor source_name=VailZoomerMic source_properties=device.description=\"Vail_Zoomer_Microphone\"";

/// Distribution family — determines which package manager / package names to use.
#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DistroFamily {
    Debian,   // apt, dpkg
    Arch,     // pacman
    Fedora,   // dnf, rpm
    Suse,     // zypper
    Other,
}

/// Detect distro family by reading /etc/os-release (ID and ID_LIKE).
#[cfg(target_os = "linux")]
fn detect_distro_family() -> DistroFamily {
    let content = match std::fs::read_to_string("/etc/os-release") {
        Ok(c) => c,
        Err(_) => return DistroFamily::Other,
    };
    let mut id = String::new();
    let mut id_like = String::new();
    for line in content.lines() {
        if let Some(v) = line.strip_prefix("ID=") {
            id = v.trim().trim_matches('"').to_lowercase();
        } else if let Some(v) = line.strip_prefix("ID_LIKE=") {
            id_like = v.trim().trim_matches('"').to_lowercase();
        }
    }
    let haystack = format!("{} {}", id, id_like);
    if haystack.contains("debian") || haystack.contains("ubuntu") {
        DistroFamily::Debian
    } else if haystack.contains("arch") || haystack.contains("manjaro") {
        DistroFamily::Arch
    } else if haystack.contains("fedora") || haystack.contains("rhel") || haystack.contains("centos") {
        DistroFamily::Fedora
    } else if haystack.contains("suse") {
        DistroFamily::Suse
    } else {
        DistroFamily::Other
    }
}

/// Check whether a binary is on PATH.
#[cfg(target_os = "linux")]
fn has_command(name: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {} >/dev/null 2>&1", name)])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Per-distro install hint for missing packages, formatted for the UI.
#[cfg(target_os = "linux")]
fn install_hint_for(capability: &str) -> String {
    // capability is one of: "pactl", "pipewire-alsa", "alsa-pulse-plugin"
    let (apt, pacman, dnf, zypper) = match capability {
        "pactl" => (
            "pulseaudio-utils",
            "libpulse",
            "pulseaudio-utils",
            "pulseaudio-utils",
        ),
        "pipewire-alsa" => (
            "pipewire-alsa",
            "pipewire-alsa",
            "pipewire-alsa",
            "pipewire-alsa",
        ),
        "alsa-pulse-plugin" => (
            "libasound2-plugins",
            "alsa-plugins",
            "alsa-plugins-pulseaudio",
            "alsa-plugins-pulse",
        ),
        _ => return format!("Please install support for: {}", capability),
    };
    match detect_distro_family() {
        DistroFamily::Debian => format!("sudo apt install {}", apt),
        DistroFamily::Arch => format!("sudo pacman -S {}", pacman),
        DistroFamily::Fedora => format!("sudo dnf install {}", dnf),
        DistroFamily::Suse => format!("sudo zypper install {}", zypper),
        DistroFamily::Other => format!(
            "Install equivalent of: apt:{} / pacman:{} / dnf:{}",
            apt, pacman, dnf
        ),
    }
}

/// Check if pactl command is available.
#[cfg(target_os = "linux")]
pub fn is_pactl_installed() -> bool {
    has_command("pactl")
}

#[cfg(not(target_os = "linux"))]
pub fn is_pactl_installed() -> bool {
    false
}

/// Check whether the ALSA→Pulse plugin is present by looking for the actual library
/// in any of the standard library paths used by Debian, Arch, and Fedora.
#[cfg(target_os = "linux")]
fn is_alsa_pulse_plugin_installed() -> bool {
    const CANDIDATES: &[&str] = &[
        "/usr/lib/alsa-lib/libasound_module_pcm_pulse.so",
        "/usr/lib64/alsa-lib/libasound_module_pcm_pulse.so",
        "/usr/lib/x86_64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so",
        "/usr/lib/aarch64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so",
    ];
    CANDIDATES.iter().any(|p| std::path::Path::new(p).exists())
}

/// Check whether pipewire-alsa is providing the ALSA bridge.
/// pipewire-alsa drops a config file into /usr/share/alsa/alsa.conf.d/ — that's
/// the most distro-agnostic signal.
#[cfg(target_os = "linux")]
fn is_pipewire_alsa_installed() -> bool {
    let conf_dir = std::path::Path::new("/usr/share/alsa/alsa.conf.d");
    if let Ok(entries) = std::fs::read_dir(conf_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains("pipewire") {
                return true;
            }
        }
    }
    false
}

/// Create ALSA configuration for VailZoomer devices (both output and input)
#[cfg(target_os = "linux")]
fn create_alsa_vailzoomer_config() -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    let home = std::env::var("HOME")
        .map_err(|_| "Could not determine home directory".to_string())?;
    let asoundrc_path = PathBuf::from(&home).join(".asoundrc");

    let config_content = r#"# VailZoomer ALSA PCM device
# This is the virtual microphone for Zoom/Audacity to use as input

pcm.vailzoomer {
    type pulse
    device "VailZoomerMic"
    hint {
        show on
        description "Vail Zoomer Microphone"
    }
}

ctl.vailzoomer {
    type pulse
    device "VailZoomerMic"
}
"#;

    // Check if .asoundrc already exists
    if asoundrc_path.exists() {
        let existing = fs::read_to_string(&asoundrc_path)
            .map_err(|e| format!("Failed to read .asoundrc: {}", e))?;

        // Only add if vailzoomer config doesn't already exist
        if !existing.contains("pcm.vailzoomer") {
            let updated = format!("{}\n{}", existing, config_content);
            fs::write(&asoundrc_path, updated)
                .map_err(|e| format!("Failed to update .asoundrc: {}", e))?;
            eprintln!("[linux_audio] Added VailZoomer config to existing .asoundrc");
        } else {
            eprintln!("[linux_audio] VailZoomer config already exists in .asoundrc");
        }
    } else {
        fs::write(&asoundrc_path, config_content)
            .map_err(|e| format!("Failed to create .asoundrc: {}", e))?;
        eprintln!("[linux_audio] Created .asoundrc with VailZoomer config");
    }

    Ok(())
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

/// Check if the VailZoomer sink and VailZoomerMic source exist
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
    let source_output = Command::new("pactl")
        .args(["list", "sources", "short"])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;

    let source_stdout = String::from_utf8_lossy(&source_output.stdout);
    let source_exists = source_stdout
        .lines()
        .any(|line| line.contains("VailZoomerMic"));

    // Also check for the sink (VailZoomer) where the app sends audio
    let sink_output = Command::new("pactl")
        .args(["list", "sinks", "short"])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;

    let sink_stdout = String::from_utf8_lossy(&sink_output.stdout);
    let sink_exists = sink_stdout.lines().any(|line| {
        line.contains("VailZoomer") && !line.contains("VailZoomerMic")
    });

    Ok(VirtualAudioStatus {
        exists: source_exists && sink_exists,
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
    let mut log: Vec<String> = Vec::new();
    let mut devices_created: Vec<String> = Vec::new();

    log.push("Starting PipeWire virtual audio setup...".to_string());

    // Verify pipewire-alsa is providing the ALSA bridge (required for ALSA apps like cpal
    // to see PipeWire devices). We no longer install packages from inside the app — the
    // pkexec apt-get flow was Debian-only and gave bad UX on Arch/Fedora/etc.
    if !is_pipewire_alsa_installed() {
        let hint = install_hint_for("pipewire-alsa");
        log.push(format!("✗ pipewire-alsa not detected. Install it with: {}", hint));
        return Err(format!(
            "pipewire-alsa is required so other apps can see VailZoomer's virtual devices. Install it with: {}",
            hint
        ));
    } else {
        log.push("✓ pipewire-alsa already installed".to_string());
    }

    // Use pactl to create virtual devices (works with PipeWire's PulseAudio compatibility layer)
    log.push("Creating virtual audio devices using pactl...".to_string());
    eprintln!("[linux_audio] Creating virtual audio devices using pactl...");

    // Create null sink
    log.push("Creating VailZoomer sink (output device)...".to_string());
    let sink_result = Command::new("pactl")
        .args([
            "load-module",
            "module-null-sink",
            "sink_name=VailZoomer",
            "sink_properties=device.description=\"Vail_Zoomer\"",
        ])
        .output();

    match sink_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // Device might already exist, check if it's just a duplicate error
                if !stderr.contains("already") && !stderr.contains("exists") {
                    log.push(format!("✗ Failed to create VailZoomer sink: {}", stderr));
                    return Err(format!("Failed to create VailZoomer sink: {}", stderr));
                } else {
                    log.push("✓ VailZoomer sink already exists".to_string());
                    eprintln!("[linux_audio] VailZoomer sink already exists, continuing...");
                }
            } else {
                let module_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
                log.push(format!("✓ Created VailZoomer sink (module {})", module_id));
                devices_created.push(format!("VailZoomer (sink, module {})", module_id));
                eprintln!("[linux_audio] Created VailZoomer sink");
            }
        }
        Err(e) => {
            log.push(format!("✗ Failed to run pactl: {}", e));
            return Err(format!("Failed to run pactl for sink creation: {}", e));
        }
    }

    // Create remap source
    log.push("Creating VailZoomerMic source (virtual microphone)...".to_string());
    let source_result = Command::new("pactl")
        .args([
            "load-module",
            "module-remap-source",
            "master=VailZoomer.monitor",
            "source_name=VailZoomerMic",
            "source_properties=device.description=\"Vail_Zoomer_Microphone\"",
        ])
        .output();

    match source_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if !stderr.contains("already") && !stderr.contains("exists") {
                    log.push(format!("✗ Failed to create VailZoomerMic: {}", stderr));
                    return Err(format!("Failed to create VailZoomerMic source: {}", stderr));
                } else {
                    log.push("✓ VailZoomerMic source already exists".to_string());
                    eprintln!("[linux_audio] VailZoomerMic source already exists, continuing...");
                }
            } else {
                let module_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
                log.push(format!("✓ Created VailZoomerMic source (module {})", module_id));
                devices_created.push(format!("VailZoomerMic (source, module {})", module_id));
                eprintln!("[linux_audio] Created VailZoomerMic source");
            }
        }
        Err(e) => {
            log.push(format!("✗ Failed to run pactl: {}", e));
            return Err(format!("Failed to run pactl for source creation: {}", e));
        }
    }

    // Verify the ALSA pulse plugin is present (lets ALSA-only apps reach PipeWire/Pulse).
    if !is_alsa_pulse_plugin_installed() {
        let hint = install_hint_for("alsa-pulse-plugin");
        log.push(format!(
            "⚠ ALSA pulse plugin not detected — some ALSA-only apps may not see VailZoomer. Install it with: {}",
            hint
        ));
    } else {
        log.push("✓ ALSA pulse plugin present".to_string());
    }

    // Create ALSA configuration so apps like Audacity and Zoom can see VailZoomer
    log.push("Creating ALSA configuration (~/.asoundrc)...".to_string());
    match create_alsa_vailzoomer_config() {
        Ok(()) => log.push("✓ ALSA configuration created".to_string()),
        Err(e) => log.push(format!("Warning: Could not create ALSA config: {}", e)),
    }

    // Wait a moment for devices to be ready
    log.push("Waiting for devices to initialize...".to_string());
    thread::sleep(Duration::from_millis(500));

    // Verify the device was created by listing sinks and sources
    log.push("Verifying devices...".to_string());

    // Get sink info
    if let Ok(output) = Command::new("pactl").args(["list", "sinks", "short"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("VailZoomer") {
                log.push(format!("  Found sink: {}", line.trim()));
            }
        }
    }

    // Get source info
    if let Ok(output) = Command::new("pactl").args(["list", "sources", "short"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("VailZoomer") {
                log.push(format!("  Found source: {}", line.trim()));
            }
        }
    }

    let status = check_virtual_audio_device()?;
    if status.exists {
        log.push("✓ All devices verified successfully!".to_string());
        Ok(SetupResult {
            success: true,
            message: "Virtual audio devices created successfully. Audio routing is now active.".to_string(),
            log,
            devices_created,
        })
    } else {
        log.push("✗ Device verification failed - devices may not be visible yet".to_string());
        Err("Devices were loaded but verification failed. They may still work - try restarting the app.".to_string())
    }
}

/// Setup virtual audio device for PulseAudio
#[cfg(target_os = "linux")]
fn setup_pulseaudio() -> Result<SetupResult, String> {
    let mut log: Vec<String> = Vec::new();
    let devices_created: Vec<String> = Vec::new();

    log.push("Starting PulseAudio virtual audio setup...".to_string());

    let config_path = get_pulseaudio_config_path();
    let config_dir = config_path
        .parent()
        .ok_or("Failed to get pulse config directory")?;

    // Create directory if it doesn't exist
    log.push(format!("Creating config directory: {:?}", config_dir));
    fs::create_dir_all(config_dir)
        .map_err(|e| format!("Failed to create config directory {:?}: {}", config_dir, e))?;

    // Check if config lines already exist
    let existing_content = fs::read_to_string(&config_path).unwrap_or_default();

    if !existing_content.contains("VailZoomer") {
        log.push(format!("Writing config to: {:?}", config_path));
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
        log.push("✓ Config written".to_string());
    } else {
        log.push("✓ Config already exists".to_string());
    }

    // Restart PulseAudio
    log.push("Restarting PulseAudio...".to_string());
    let _ = Command::new("pulseaudio").args(["--kill"]).output();
    thread::sleep(Duration::from_millis(500));

    let start_result = Command::new("pulseaudio").args(["--start"]).output();
    if let Err(e) = start_result {
        // PulseAudio might auto-start via systemd, so try that too
        let _ = Command::new("systemctl")
            .args(["--user", "restart", "pulseaudio"])
            .output();
        log.push(format!("Note: pulseaudio --start failed ({}), tried systemctl", e));
        eprintln!("Note: pulseaudio --start failed ({}), tried systemctl", e);
    }

    // Wait for service to start
    log.push("Waiting for PulseAudio to start...".to_string());
    thread::sleep(Duration::from_millis(2000));

    // Verify the device was created
    log.push("Verifying devices...".to_string());
    let status = check_virtual_audio_device()?;
    if status.exists {
        log.push("✓ Devices verified successfully!".to_string());
        Ok(SetupResult {
            success: true,
            message: "Virtual audio device created successfully.".to_string(),
            log,
            devices_created,
        })
    } else {
        log.push("✗ Device verification failed".to_string());
        Err("Device was not created after restart. Please try logging out and back in.".to_string())
    }
}

/// Main setup function that detects audio system and runs appropriate setup
#[cfg(target_os = "linux")]
pub fn setup_virtual_audio_device() -> Result<SetupResult, String> {
    // pactl is the only hard prerequisite: we use it to create the virtual sink/source
    // and to verify them. Surface a per-distro install hint instead of trying to install
    // from the app (the old apt-get flow was Debian-only).
    if !is_pactl_installed() {
        let hint = install_hint_for("pactl");
        return Err(format!(
            "`pactl` not found. It's required to create the virtual audio devices. Install it with: {}",
            hint
        ));
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

/// Clean up virtual audio devices (call on app exit)
#[cfg(target_os = "linux")]
pub fn cleanup_virtual_audio_devices() -> Result<(), String> {
    eprintln!("[linux_audio] Cleaning up virtual audio devices...");

    // Get list of loaded modules and find VailZoomer ones
    let output = Command::new("pactl")
        .args(["list", "modules", "short"])
        .output()
        .map_err(|e| format!("Failed to list modules: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut modules_to_unload: Vec<String> = Vec::new();

    // Find module IDs for VailZoomer devices
    for line in stdout.lines() {
        if line.contains("VailZoomer") || line.contains("Vail_Zoomer") {
            if let Some(module_id) = line.split_whitespace().next() {
                modules_to_unload.push(module_id.to_string());
            }
        }
    }

    // Unload modules in reverse order (loopback first, then sources, then sinks)
    modules_to_unload.reverse();
    for module_id in &modules_to_unload {
        eprintln!("[linux_audio] Unloading module {}", module_id);
        let _ = Command::new("pactl")
            .args(["unload-module", module_id])
            .output();
    }

    // Remove .asoundrc VailZoomer config if it exists
    if let Ok(home) = std::env::var("HOME") {
        let asoundrc_path = std::path::PathBuf::from(&home).join(".asoundrc");
        if asoundrc_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&asoundrc_path) {
                // Only remove if it contains our config marker
                if content.contains("# VailZoomer ALSA PCM device") {
                    // Check if file only contains our config (no other pcm definitions)
                    let has_other_config = content.lines().any(|l| {
                        let trimmed = l.trim();
                        (trimmed.starts_with("pcm.") || trimmed.starts_with("ctl.")) &&
                        !trimmed.contains("vailzoomer")
                    });

                    if !has_other_config {
                        // File only contains our config, safe to remove
                        let _ = std::fs::remove_file(&asoundrc_path);
                        eprintln!("[linux_audio] Removed .asoundrc");
                    } else {
                        eprintln!("[linux_audio] .asoundrc contains other configs, not removing");
                    }
                }
            }
        }
    }

    // Remove any persistent pipewire config
    if let Some(config_dir) = dirs::config_dir() {
        let vail_config = config_dir
            .join("pipewire")
            .join("pipewire.conf.d")
            .join("vail-zoomer.conf");
        if vail_config.exists() {
            let _ = std::fs::remove_file(&vail_config);
            eprintln!("[linux_audio] Removed persistent pipewire config");
        }
    }

    if modules_to_unload.is_empty() {
        eprintln!("[linux_audio] No VailZoomer modules found to unload");
    } else {
        eprintln!("[linux_audio] Cleaned up {} modules", modules_to_unload.len());
    }

    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn cleanup_virtual_audio_devices() -> Result<(), String> {
    Ok(())
}
