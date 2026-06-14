// Linux Virtual Audio Device Setup
//
// Strategy (Ubuntu / Debian / Arch / Fedora / SUSE / derivatives):
//   1. Use `pactl load-module` to create VailZoomer (null sink) and VailZoomerMic
//      (remap source) immediately so the current session has them.
//   2. Write a systemd user unit at ~/.config/systemd/user/vail-zoomer-audio.service
//      that re-runs those `pactl load-module` calls on every login. This makes the
//      devices persistent across reboots without writing distro-specific PipeWire
//      or PulseAudio config files.
//   3. At app startup, sweep any orphan VailZoomer modules left by crashed previous
//      runs and only then load fresh.
//   4. We never tear modules down on app exit — the whole point is for devices to
//      survive between launches. The user can explicitly remove them via the UI.
//
// This works identically on pure-PulseAudio systems and on PipeWire-with-pulse-compat
// (which is the Ubuntu 22.04+ default) because both implement the same `pactl`
// load-module ABI.

#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::process::Command;

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
    pub log: Vec<String>,
    pub devices_created: Vec<String>,
}

/// Result of an auto-install attempt
#[derive(Debug, Clone, Serialize)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
    pub log: Vec<String>,
    /// True if pkexec / a graphical-auth helper was found and used. When false,
    /// the user has no GUI sudo and we couldn't install — surface the manual
    /// fallback command in the UI.
    pub used_graphical_auth: bool,
}

#[cfg(target_os = "linux")]
const ASOUNDRC_BEGIN: &str = "# >>> vail-zoomer >>>";
#[cfg(target_os = "linux")]
const ASOUNDRC_END: &str = "# <<< vail-zoomer <<<";

/// The systemd user unit that reloads the virtual devices on every login.
/// `pactl load-module` is idempotent enough for our purposes — if the module
/// already exists, pactl exits non-zero with "module already loaded"; we use
/// `sh -c` with `|| true` so the unit still succeeds.
#[cfg(target_os = "linux")]
const SYSTEMD_UNIT: &str = r#"[Unit]
Description=Vail Zoomer virtual audio devices
# Socket-activated services — be ordered after them if they're enabled, but
# don't hard-require them (PipeWire-only systems have no pulseaudio.service).
After=pipewire-pulse.service pulseaudio.service default.target
PartOf=default.target

[Service]
Type=oneshot
RemainAfterExit=yes
# Wait briefly for the PulseAudio/PipeWire-Pulse socket to be ready, then load
# the modules. Idempotent: if a module is already present, pactl errors and
# we shrug it off so the unit still succeeds.
ExecStart=/bin/sh -c 'for i in 1 2 3 4 5 6 7 8 9 10; do pactl info >/dev/null 2>&1 && break; sleep 0.5; done; pactl load-module module-null-sink sink_name=VailZoomer sink_properties=device.description=Vail_Zoomer_Output >/dev/null 2>&1 || true; pactl load-module module-remap-source master=VailZoomer.monitor source_name=VailZoomerMic source_properties=device.description=Vail_Zoomer_Microphone >/dev/null 2>&1 || true'

[Install]
WantedBy=default.target
"#;

/// Distribution family — determines which package manager / package names to use.
#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DistroFamily {
    Debian,
    Arch,
    Fedora,
    Suse,
    Other,
}

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

#[cfg(target_os = "linux")]
fn has_command(name: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {} >/dev/null 2>&1", name)])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn install_hint_for(capability: &str) -> String {
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

#[cfg(target_os = "linux")]
pub fn is_pactl_installed() -> bool {
    has_command("pactl")
}

#[cfg(not(target_os = "linux"))]
pub fn is_pactl_installed() -> bool {
    false
}

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

/// `pipewire-alsa` drops a config file into `/usr/share/alsa/alsa.conf.d/` —
/// that's the most distro-agnostic signal that it's installed.
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

/// Detect whether the active audio server is PipeWire or PulseAudio.
///
/// Order matters here: on Ubuntu 22.04+ `pactl info` reports
/// `Server Name: PulseAudio (on PipeWire X.Y)` — the string contains BOTH
/// "pipewire" and "pulseaudio", so we must check for "pipewire" first.
///
/// We also fall back to checking the user runtime socket directly, since `pactl`
/// may not be installed yet at first launch.
#[cfg(target_os = "linux")]
pub fn detect_audio_system() -> AudioSystem {
    if let Ok(output) = Command::new("pactl").args(["info"]).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if stdout.contains("pipewire") {
                return AudioSystem::PipeWire;
            } else if stdout.contains("pulseaudio") {
                return AudioSystem::PulseAudio;
            } else {
                return AudioSystem::PulseAudio;
            }
        }
    }

    // No pactl (or it failed) — peek at user runtime sockets.
    if let Ok(uid) = std::env::var("UID").or_else(|_| {
        Command::new("id")
            .arg("-u")
            .output()
            .map_err(|e| e.to_string())
            .and_then(|o| {
                if o.status.success() {
                    Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    Err("id -u failed".to_string())
                }
            })
    }) {
        let pipewire_sock = format!("/run/user/{}/pipewire-0", uid);
        if std::path::Path::new(&pipewire_sock).exists() {
            return AudioSystem::PipeWire;
        }
        let pulse_sock = format!("/run/user/{}/pulse/native", uid);
        if std::path::Path::new(&pulse_sock).exists() {
            return AudioSystem::PulseAudio;
        }
    }

    // Last-resort: process check.
    if Command::new("pgrep")
        .args(["-x", "pipewire"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return AudioSystem::PipeWire;
    }

    AudioSystem::Unknown
}

#[cfg(not(target_os = "linux"))]
pub fn detect_audio_system() -> AudioSystem {
    AudioSystem::Unknown
}

/// Check whether VailZoomer (sink) and VailZoomerMic (source) currently exist.
#[cfg(target_os = "linux")]
pub fn check_virtual_audio_device() -> Result<VirtualAudioStatus, String> {
    let pactl_installed = is_pactl_installed();
    let audio_system = detect_audio_system();

    if !pactl_installed {
        return Ok(VirtualAudioStatus {
            exists: false,
            audio_system,
            pactl_installed: false,
        });
    }

    let source_output = Command::new("pactl")
        .args(["list", "sources", "short"])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;
    let source_stdout = String::from_utf8_lossy(&source_output.stdout);
    let source_exists = source_stdout
        .lines()
        .any(|l| l.contains("VailZoomerMic"));

    let sink_output = Command::new("pactl")
        .args(["list", "sinks", "short"])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;
    let sink_stdout = String::from_utf8_lossy(&sink_output.stdout);
    let sink_exists = sink_stdout
        .lines()
        .any(|l| l.contains("VailZoomer") && !l.contains("VailZoomerMic"));

    Ok(VirtualAudioStatus {
        exists: source_exists && sink_exists,
        audio_system,
        pactl_installed: true,
    })
}

#[cfg(not(target_os = "linux"))]
pub fn check_virtual_audio_device() -> Result<VirtualAudioStatus, String> {
    Ok(VirtualAudioStatus {
        exists: true,
        audio_system: AudioSystem::Unknown,
        pactl_installed: true,
    })
}

#[cfg(target_os = "linux")]
fn systemd_unit_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"))
        .join("systemd")
        .join("user")
        .join("vail-zoomer-audio.service")
}

/// Write (or refresh) the systemd user unit that re-creates devices on login.
#[cfg(target_os = "linux")]
fn install_systemd_unit(log: &mut Vec<String>) -> Result<(), String> {
    let path = systemd_unit_path();
    let dir = path.parent().ok_or("Bad systemd unit path")?;
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create {:?}: {}", dir, e))?;

    let needs_write = match fs::read_to_string(&path) {
        Ok(existing) => existing != SYSTEMD_UNIT,
        Err(_) => true,
    };

    if needs_write {
        fs::write(&path, SYSTEMD_UNIT)
            .map_err(|e| format!("Failed to write systemd unit {:?}: {}", path, e))?;
        log.push(format!("✓ Installed systemd user unit at {:?}", path));
    } else {
        log.push("✓ systemd user unit already up to date".to_string());
    }

    // daemon-reload so systemd sees the new/updated unit.
    let _ = Command::new("systemctl")
        .args(["--user", "daemon-reload"])
        .output();

    // Enable so it auto-starts on every login. We do NOT call `start` here —
    // we've already loaded the modules manually below for the current session,
    // and `start` on a oneshot unit that's already had its work done is noisy.
    match Command::new("systemctl")
        .args(["--user", "enable", "vail-zoomer-audio.service"])
        .output()
    {
        Ok(o) if o.status.success() => {
            log.push("✓ Enabled vail-zoomer-audio.service for auto-start on login".to_string());
            Ok(())
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            // systemd-less environments (some containers) — devices still work
            // for this session, they just won't survive a reboot.
            log.push(format!(
                "⚠ Couldn't enable systemd unit ({}). Devices will work this session but may not persist across reboots.",
                stderr.trim()
            ));
            Ok(())
        }
        Err(e) => {
            log.push(format!(
                "⚠ systemctl unavailable ({}). Devices will work this session but may not persist across reboots.",
                e
            ));
            Ok(())
        }
    }
}

/// Unload any VailZoomer modules currently loaded. Safe to call at any time.
#[cfg(target_os = "linux")]
fn unload_vailzoomer_modules() -> usize {
    let output = match Command::new("pactl")
        .args(["list", "modules", "short"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return 0,
    };
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let mut ids: Vec<String> = stdout
        .lines()
        .filter(|l| l.contains("VailZoomer") || l.contains("Vail_Zoomer"))
        .filter_map(|l| l.split_whitespace().next().map(|s| s.to_string()))
        .collect();
    // Unload sources first, then sinks (reverse declaration order).
    ids.reverse();
    let mut unloaded = 0usize;
    for id in &ids {
        if let Ok(o) = Command::new("pactl").args(["unload-module", id]).output() {
            if o.status.success() {
                unloaded += 1;
            }
        }
    }
    unloaded
}

#[cfg(target_os = "linux")]
fn load_modules_now(log: &mut Vec<String>, devices_created: &mut Vec<String>) -> Result<(), String> {
    log.push("Loading VailZoomer null sink...".to_string());
    let sink = Command::new("pactl")
        .args([
            "load-module",
            "module-null-sink",
            "sink_name=VailZoomer",
            "sink_properties=device.description=\"Vail_Zoomer_Output\"",
        ])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;
    if sink.status.success() {
        let id = String::from_utf8_lossy(&sink.stdout).trim().to_string();
        log.push(format!("✓ VailZoomer sink loaded (module {})", id));
        devices_created.push(format!("VailZoomer (sink, module {})", id));
    } else {
        let err = String::from_utf8_lossy(&sink.stderr);
        if err.contains("already") || err.contains("exists") {
            log.push("✓ VailZoomer sink already present".to_string());
        } else {
            return Err(format!("Failed to load VailZoomer sink: {}", err.trim()));
        }
    }

    log.push("Loading VailZoomerMic remap source...".to_string());
    let src = Command::new("pactl")
        .args([
            "load-module",
            "module-remap-source",
            "master=VailZoomer.monitor",
            "source_name=VailZoomerMic",
            "source_properties=device.description=\"Vail_Zoomer_Microphone\"",
        ])
        .output()
        .map_err(|e| format!("Failed to run pactl: {}", e))?;
    if src.status.success() {
        let id = String::from_utf8_lossy(&src.stdout).trim().to_string();
        log.push(format!("✓ VailZoomerMic source loaded (module {})", id));
        devices_created.push(format!("VailZoomerMic (source, module {})", id));
    } else {
        let err = String::from_utf8_lossy(&src.stderr);
        if err.contains("already") || err.contains("exists") {
            log.push("✓ VailZoomerMic source already present".to_string());
        } else {
            return Err(format!("Failed to load VailZoomerMic source: {}", err.trim()));
        }
    }
    Ok(())
}

/// Append a VailZoomer ALSA config block to ~/.asoundrc, bracketed with markers
/// so we can cleanly remove it later. Only used on pure-PulseAudio systems —
/// on PipeWire, the `pipewire-alsa` package already exposes everything through
/// the `pipewire` ALSA PCM, so a custom .asoundrc only risks colliding with the
/// user's existing JACK / USB-DAC setup.
#[cfg(target_os = "linux")]
fn ensure_asoundrc_block(log: &mut Vec<String>) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "Could not determine $HOME".to_string())?;
    let path = PathBuf::from(&home).join(".asoundrc");

    let block = format!(
        "{begin}\npcm.vailzoomer {{\n    type pulse\n    device \"VailZoomerMic\"\n    hint {{ show on description \"Vail Zoomer Microphone\" }}\n}}\nctl.vailzoomer {{ type pulse; device \"VailZoomerMic\" }}\n{end}\n",
        begin = ASOUNDRC_BEGIN,
        end = ASOUNDRC_END,
    );

    let existing = fs::read_to_string(&path).unwrap_or_default();
    if existing.contains(ASOUNDRC_BEGIN) && existing.contains(ASOUNDRC_END) {
        log.push("✓ ALSA config already present in ~/.asoundrc".to_string());
        return Ok(());
    }

    let new_contents = if existing.is_empty() {
        block
    } else if existing.ends_with('\n') {
        format!("{}{}", existing, block)
    } else {
        format!("{}\n{}", existing, block)
    };

    fs::write(&path, new_contents)
        .map_err(|e| format!("Failed to update ~/.asoundrc: {}", e))?;
    log.push("✓ Added VailZoomer ALSA block to ~/.asoundrc".to_string());
    Ok(())
}

#[cfg(target_os = "linux")]
fn remove_asoundrc_block() {
    let Ok(home) = std::env::var("HOME") else {
        return;
    };
    let path = PathBuf::from(&home).join(".asoundrc");
    let Ok(content) = fs::read_to_string(&path) else {
        return;
    };
    if !content.contains(ASOUNDRC_BEGIN) {
        return;
    }
    let mut out = String::with_capacity(content.len());
    let mut skipping = false;
    for line in content.lines() {
        if line.trim() == ASOUNDRC_BEGIN {
            skipping = true;
            continue;
        }
        if line.trim() == ASOUNDRC_END {
            skipping = false;
            continue;
        }
        if !skipping {
            out.push_str(line);
            out.push('\n');
        }
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        let _ = fs::remove_file(&path);
    } else {
        let _ = fs::write(&path, format!("{}\n", trimmed));
    }
}

/// Main entry point — install persistence and create the devices now.
#[cfg(target_os = "linux")]
pub fn setup_virtual_audio_device() -> Result<SetupResult, String> {
    let mut log: Vec<String> = Vec::new();
    let mut devices_created: Vec<String> = Vec::new();

    // 1. Hard prerequisite: pactl.
    if !is_pactl_installed() {
        let hint = install_hint_for("pactl");
        log.push(format!("✗ `pactl` not found. Install with: {}", hint));
        return Err(format!(
            "`pactl` is required to create the virtual audio devices. Install it with: {}",
            hint
        ));
    }
    log.push("✓ pactl installed".to_string());

    let audio_system = detect_audio_system();
    log.push(format!("Detected audio system: {:?}", audio_system));

    // 2. PipeWire systems also need pipewire-alsa so ALSA-only apps (and cpal)
    //    can reach the PipeWire-Pulse devices.
    if audio_system == AudioSystem::PipeWire && !is_pipewire_alsa_installed() {
        let hint = install_hint_for("pipewire-alsa");
        log.push(format!("✗ pipewire-alsa not detected. Install with: {}", hint));
        return Err(format!(
            "pipewire-alsa is required so apps can see the virtual devices. Install with: {}",
            hint
        ));
    }
    if audio_system == AudioSystem::PipeWire {
        log.push("✓ pipewire-alsa installed".to_string());
    }

    // 3. Sweep any stale VailZoomer modules from a previous crashed run.
    let cleared = unload_vailzoomer_modules();
    if cleared > 0 {
        log.push(format!("Cleared {} stale VailZoomer module(s)", cleared));
    }

    // 4. Load fresh modules so this session has the devices immediately.
    load_modules_now(&mut log, &mut devices_created)?;

    // 5. Install the systemd user unit so devices come back on every login.
    install_systemd_unit(&mut log)?;

    // 6. On pure-PulseAudio (no pipewire-alsa available), also drop an .asoundrc
    //    block so ALSA-only apps can find VailZoomerMic. Skipped on PipeWire —
    //    the `pipewire` ALSA PCM already covers that case.
    if audio_system == AudioSystem::PulseAudio {
        if is_alsa_pulse_plugin_installed() {
            match ensure_asoundrc_block(&mut log) {
                Ok(()) => {}
                Err(e) => log.push(format!("⚠ Could not update ~/.asoundrc: {}", e)),
            }
        } else {
            let hint = install_hint_for("alsa-pulse-plugin");
            log.push(format!(
                "⚠ ALSA pulse plugin missing — some ALSA-only apps may not see VailZoomer. Install with: {}",
                hint
            ));
        }
    } else {
        log.push("Skipping ~/.asoundrc (PipeWire exposes devices via pipewire-alsa)".to_string());
    }

    // 7. Verify.
    let status = check_virtual_audio_device()?;
    if status.exists {
        log.push("✓ All devices verified".to_string());
        Ok(SetupResult {
            success: true,
            message: "Virtual audio devices created. They'll come back automatically on every login.".to_string(),
            log,
            devices_created,
        })
    } else {
        log.push("✗ Devices not visible after load — try logging out and back in".to_string());
        Err("Modules were loaded but verification failed. Try logging out and back in.".to_string())
    }
}

#[cfg(not(target_os = "linux"))]
pub fn setup_virtual_audio_device() -> Result<SetupResult, String> {
    Err("Virtual audio setup is only available on Linux".to_string())
}

/// Called once at app launch. Sweeps any orphan VailZoomer modules left by a
/// previous crashed run so we don't accumulate duplicate sinks/sources over
/// time. Does NOT remove the systemd unit — that's the user's call.
#[cfg(target_os = "linux")]
pub fn cleanup_orphan_modules_at_startup() {
    if !is_pactl_installed() {
        return;
    }
    // Count current modules; if there's exactly one each of sink+source, we're
    // in a clean state and shouldn't touch anything. If there are dupes (>1),
    // collapse to a single instance.
    let Ok(output) = Command::new("pactl").args(["list", "modules", "short"]).output() else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let sink_count = stdout
        .lines()
        .filter(|l| l.contains("module-null-sink") && l.contains("VailZoomer"))
        .count();
    let source_count = stdout
        .lines()
        .filter(|l| l.contains("module-remap-source") && l.contains("VailZoomerMic"))
        .count();

    if sink_count > 1 || source_count > 1 {
        eprintln!(
            "[linux_audio] Found duplicate VailZoomer modules (sinks={}, sources={}); collapsing",
            sink_count, source_count
        );
        unload_vailzoomer_modules();
        // Reload a single canonical instance.
        let mut log = Vec::new();
        let mut created = Vec::new();
        let _ = load_modules_now(&mut log, &mut created);
    }
}

#[cfg(not(target_os = "linux"))]
pub fn cleanup_orphan_modules_at_startup() {}

/// User-initiated removal: disable the systemd unit, unload modules now, strip
/// the .asoundrc block. Called only when the user explicitly removes virtual
/// audio — NOT on every app exit.
#[cfg(target_os = "linux")]
pub fn remove_virtual_audio_devices() -> Result<(), String> {
    let _ = Command::new("systemctl")
        .args(["--user", "disable", "--now", "vail-zoomer-audio.service"])
        .output();

    let unit = systemd_unit_path();
    if unit.exists() {
        let _ = fs::remove_file(&unit);
    }
    let _ = Command::new("systemctl")
        .args(["--user", "daemon-reload"])
        .output();

    let unloaded = unload_vailzoomer_modules();
    eprintln!("[linux_audio] Removed {} VailZoomer module(s)", unloaded);

    remove_asoundrc_block();
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn remove_virtual_audio_devices() -> Result<(), String> {
    Ok(())
}

/// Which audio prerequisites are currently missing? Used by the UI to decide
/// whether to even offer "Install now" and what to install.
#[cfg(target_os = "linux")]
pub fn missing_prerequisites() -> Vec<&'static str> {
    let mut missing = Vec::new();
    if !is_pactl_installed() {
        missing.push("pactl");
    }
    let audio = detect_audio_system();
    if audio == AudioSystem::PipeWire && !is_pipewire_alsa_installed() {
        missing.push("pipewire-alsa");
    }
    if audio == AudioSystem::PulseAudio && !is_alsa_pulse_plugin_installed() {
        missing.push("alsa-pulse-plugin");
    }
    missing
}

#[cfg(not(target_os = "linux"))]
pub fn missing_prerequisites() -> Vec<&'static str> {
    Vec::new()
}

#[cfg(target_os = "linux")]
fn graphical_auth_command() -> Option<&'static str> {
    // pkexec (polkit) is what every mainstream desktop ships. Fall back to
    // gnome-terminal / kdialog wrappers if some derivative is exotic, but
    // honestly: if pkexec isn't here, the user is on a custom setup and we
    // shouldn't pretend to know better.
    for cmd in &["pkexec"] {
        if has_command(cmd) {
            return Some(*cmd);
        }
    }
    None
}

/// Per-distro packages we need installed for audio routing to work.
#[cfg(target_os = "linux")]
fn packages_for_distro(family: DistroFamily) -> Vec<&'static str> {
    match family {
        DistroFamily::Debian => vec!["pulseaudio-utils", "pipewire-alsa", "libasound2-plugins"],
        DistroFamily::Arch => vec!["libpulse", "pipewire-alsa", "alsa-plugins"],
        DistroFamily::Fedora => vec!["pulseaudio-utils", "pipewire-alsa", "alsa-plugins-pulseaudio"],
        DistroFamily::Suse => vec!["pulseaudio-utils", "pipewire-alsa", "alsa-plugins-pulse"],
        DistroFamily::Other => vec![],
    }
}

/// Try to install the missing audio prerequisites via pkexec + the user's
/// distro package manager. The user authenticates once via the polkit dialog;
/// no terminal needed.
#[cfg(target_os = "linux")]
pub fn install_audio_prerequisites() -> Result<InstallResult, String> {
    let mut log: Vec<String> = Vec::new();
    let family = detect_distro_family();

    let pkgs = packages_for_distro(family);
    if pkgs.is_empty() {
        return Err(
            "Unknown distro — please install pulseaudio-utils, pipewire-alsa, and alsa-plugins-pulseaudio manually."
                .to_string(),
        );
    }

    let auth = match graphical_auth_command() {
        Some(c) => c,
        None => {
            return Ok(InstallResult {
                success: false,
                message: "No graphical-auth helper (pkexec) found. Run the install command shown below in a terminal.".to_string(),
                log,
                used_graphical_auth: false,
            });
        }
    };

    // Build a single shell command that the user authorizes once. Each package
    // manager has its own quirks for non-interactive install:
    //   apt-get: -y; refresh cache if install fails (avoids forcing slow update)
    //   pacman:  -S --needed --noconfirm
    //   dnf:     install -y
    //   zypper:  --non-interactive install
    let install_cmd = match family {
        DistroFamily::Debian => format!(
            "set -e; export DEBIAN_FRONTEND=noninteractive; apt-get install -y {pkgs} || (apt-get update && apt-get install -y {pkgs})",
            pkgs = pkgs.join(" ")
        ),
        DistroFamily::Arch => format!(
            "pacman -S --needed --noconfirm {}",
            pkgs.join(" ")
        ),
        DistroFamily::Fedora => format!(
            "dnf install -y {}",
            pkgs.join(" ")
        ),
        DistroFamily::Suse => format!(
            "zypper --non-interactive install {}",
            pkgs.join(" ")
        ),
        DistroFamily::Other => unreachable!(),
    };

    log.push(format!(
        "Requesting administrator access to install: {}",
        pkgs.join(", ")
    ));
    log.push(format!("$ pkexec sh -c \"{}\"", install_cmd));

    let output = Command::new(auth)
        .args(["sh", "-c", &install_cmd])
        .output()
        .map_err(|e| format!("Failed to run {}: {}", auth, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stdout.lines().chain(stderr.lines()) {
        let line = line.trim_end();
        if !line.is_empty() {
            log.push(line.to_string());
        }
    }

    if !output.status.success() {
        // pkexec returns 126 when the user cancelled the auth dialog, 127 when
        // the command isn't authorized.
        let code = output.status.code().unwrap_or(-1);
        let hint = match code {
            126 => "Authentication was cancelled.",
            127 => "Authentication not authorized.",
            _ => "Installation failed.",
        };
        return Ok(InstallResult {
            success: false,
            message: format!("{} (exit code {})", hint, code),
            log,
            used_graphical_auth: true,
        });
    }

    log.push("✓ Packages installed".to_string());
    Ok(InstallResult {
        success: true,
        message: "Audio prerequisites installed successfully.".to_string(),
        log,
        used_graphical_auth: true,
    })
}

#[cfg(not(target_os = "linux"))]
pub fn install_audio_prerequisites() -> Result<InstallResult, String> {
    Err("Audio prerequisite install is only available on Linux".to_string())
}

/// Capture a full snapshot of the system's audio state so the user can copy
/// it into a bug report when a device isn't showing up. Output is plain text
/// with section headers so a developer can read it without tooling.
#[cfg(target_os = "linux")]
pub fn dump_audio_diagnostics() -> String {
    let mut out = String::new();
    out.push_str("=== Vail Zoomer Audio Diagnostics ===\n");
    out.push_str(&format!("Date: {}\n", chrono_like_timestamp()));

    // OS / distro
    out.push_str("\n--- OS ---\n");
    if let Ok(release) = std::fs::read_to_string("/etc/os-release") {
        for line in release.lines() {
            if line.starts_with("PRETTY_NAME=") || line.starts_with("ID=") || line.starts_with("VERSION_ID=") {
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    out.push_str(&format!("Uname: {}\n", run("uname", &["-a"])));

    // Audio system + sockets
    out.push_str("\n--- Audio System ---\n");
    out.push_str(&format!("detect_audio_system() => {:?}\n", detect_audio_system()));
    out.push_str(&format!("pactl info:\n{}\n", run("pactl", &["info"])));

    // Sinks / sources / cards (no filtering — this is the whole point)
    out.push_str("\n--- All Sinks (short) ---\n");
    out.push_str(&run("pactl", &["list", "sinks", "short"]));
    out.push_str("\n--- All Sources (short, including monitors) ---\n");
    out.push_str(&run("pactl", &["list", "sources", "short"]));
    out.push_str("\n--- All Cards (profile state) ---\n");
    let cards = run("pactl", &["list", "cards"]);
    // Filter to the high-signal lines; the full output is huge.
    for line in cards.lines() {
        let t = line.trim_start();
        if t.starts_with("Card #")
            || t.starts_with("Name:")
            || t.starts_with("Driver:")
            || t.starts_with("Active Profile:")
            || t.starts_with("Description:")
            || t.contains("HSP")
            || t.contains("HFP")
            || t.contains("A2DP")
            || t.contains("head-unit")
        {
            out.push_str(line);
            out.push('\n');
        }
    }

    // Loaded modules — useful for confirming VailZoomer state
    out.push_str("\n--- Loaded Modules (filtered for vail / null-sink / remap) ---\n");
    let mods = run("pactl", &["list", "modules", "short"]);
    for line in mods.lines() {
        if line.contains("VailZoomer")
            || line.contains("Vail_Zoomer")
            || line.contains("null-sink")
            || line.contains("remap-source")
            || line.contains("loopback")
        {
            out.push_str(line);
            out.push('\n');
        }
    }

    // Bluetooth
    out.push_str("\n--- Bluetooth ---\n");
    out.push_str(&format!("systemctl is-active bluetooth: {}", run("systemctl", &["is-active", "bluetooth"])));
    let bt_devices = run("bluetoothctl", &["devices"]);
    out.push_str("All paired devices:\n");
    out.push_str(&bt_devices);
    out.push_str("\nConnected devices (full info):\n");
    let connected = run("bluetoothctl", &["devices", "Connected"]);
    out.push_str(&connected);
    for line in connected.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 && parts[0] == "Device" {
            out.push_str(&format!("\nbluetoothctl info {}:\n", parts[1]));
            let info = run("bluetoothctl", &["info", parts[1]]);
            for il in info.lines() {
                let t = il.trim_start();
                if t.starts_with("Name:")
                    || t.starts_with("Alias:")
                    || t.starts_with("Connected:")
                    || t.starts_with("Trusted:")
                    || t.starts_with("Paired:")
                    || (t.starts_with("UUID:") && (t.contains("Audio") || t.contains("Headset") || t.contains("Hands")))
                {
                    out.push_str(il);
                    out.push('\n');
                }
            }
        }
    }

    // ALSA-level view (what cpal sees)
    out.push_str("\n--- ALSA Capture PCMs (`arecord -L`, top of list) ---\n");
    let arec = run("arecord", &["-L"]);
    for line in arec.lines().take(40) {
        out.push_str(line);
        out.push('\n');
    }
    out.push_str("\n--- ALSA Hardware (`arecord -l`) ---\n");
    out.push_str(&run("arecord", &["-l"]));

    // What our app filters out — useful for debugging the filter itself
    out.push_str("\n--- Vail Zoomer Setup State ---\n");
    out.push_str(&format!("pactl installed: {}\n", is_pactl_installed()));
    out.push_str(&format!("pipewire-alsa installed: {}\n", is_pipewire_alsa_installed()));
    out.push_str(&format!("alsa-pulse-plugin installed: {}\n", is_alsa_pulse_plugin_installed()));
    out.push_str(&format!("systemd unit at: {}\n", systemd_unit_path().display()));
    out.push_str(&format!(
        "systemd unit enabled: {}",
        run("systemctl", &["--user", "is-enabled", "vail-zoomer-audio.service"])
    ));

    out.push_str("\n=== End Diagnostics ===\n");
    out
}

#[cfg(target_os = "linux")]
fn run(cmd: &str, args: &[&str]) -> String {
    match Command::new(cmd).args(args).output() {
        Ok(o) => {
            let mut s = String::from_utf8_lossy(&o.stdout).into_owned();
            let err = String::from_utf8_lossy(&o.stderr);
            if !err.trim().is_empty() {
                s.push_str("[stderr] ");
                s.push_str(&err);
            }
            if !s.ends_with('\n') {
                s.push('\n');
            }
            s
        }
        Err(e) => format!("(failed to run {}: {})\n", cmd, e),
    }
}

#[cfg(target_os = "linux")]
fn chrono_like_timestamp() -> String {
    // Avoid adding a chrono dep just for this. `date -Iseconds` is universally
    // available on Linux and good enough for a diagnostic header.
    run("date", &["-Iseconds"]).trim().to_string()
}

#[cfg(not(target_os = "linux"))]
pub fn dump_audio_diagnostics() -> String {
    "Audio diagnostics are only collected on Linux.".to_string()
}
