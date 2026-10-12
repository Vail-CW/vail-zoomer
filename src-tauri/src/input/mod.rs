use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use crossbeam_channel::{unbounded, Receiver, Sender};
use std::time::{Duration, Instant};

/// A parsed MIDI message plus the best estimate of when it actually happened.
#[derive(Debug, Clone)]
pub struct TimedMidiEvent {
    pub event: MidiEvent,
    pub at: Instant,
}

/// How long after we send CC1/CC2 an identical incoming value counts as the
/// adapter echoing our own change rather than a user edit on the device.
const ECHO_WINDOW: Duration = Duration::from_millis(200);

/// Maximum amount the mapped midir timestamp may lag behind "now".
const MAX_TIMESTAMP_LAG: Duration = Duration::from_millis(50);

/// Name fragments (lowercase) that identify a Vail adapter's MIDI port.
const ADAPTER_NAME_HINTS: &[&str] = &["vail", "xiao", "seeed", "samd21", "qt py", "qtpy"];

/// Pick the port to auto-connect to: the saved device if it is present,
/// otherwise the first port that looks like a Vail adapter.
pub fn pick_auto_device(ports: &[String], preferred: Option<&str>) -> Option<String> {
    if let Some(name) = preferred {
        if ports.iter().any(|p| p == name) {
            return Some(name.to_string());
        }
    }
    ports
        .iter()
        .find(|p| {
            let lower = p.to_lowercase();
            ADAPTER_NAME_HINTS.iter().any(|h| lower.contains(h))
        })
        .cloned()
}

/// Lists MIDI input ports. Kept alive for the life of the poll thread because
/// recreating CoreMIDI clients each cycle stops macOS reporting hot-plugs.
pub struct PortLister {
    client: Option<MidiInput>,
}

impl PortLister {
    pub fn new() -> Self {
        Self { client: MidiInput::new("Vail Zoomer List").ok() }
    }

    pub fn list(&mut self) -> Vec<String> {
        if self.client.is_none() {
            self.client = MidiInput::new("Vail Zoomer List").ok();
        }
        match self.client {
            Some(ref midi_in) => midi_in
                .ports()
                .iter()
                .filter_map(|p| midi_in.port_name(p).ok())
                .collect(),
            None => vec![],
        }
    }
}

/// MIDI event types
#[derive(Debug, Clone)]
pub enum MidiEvent {
    NoteOn { note: u8, velocity: u8 },
    NoteOff { note: u8 },
    ControlChange { controller: u8, value: u8 },
}

/// Vail adapter MIDI constants (from MIDI_INTEGRATION_SPEC.md)
#[allow(dead_code)] // protocol reference: not every constant is used yet
mod vail {
    /// Control Change 0: Mode Control
    /// Values 0-63: MIDI mode (sends Note events), 64-127: Keyboard mode (sends HID)
    /// Note: The spec example says 0x7F but the values say 0-63 for MIDI mode
    pub const CC_MODE: u8 = 0x00;
    pub const MODE_MIDI: u8 = 0x00;  // 0 = MIDI mode (per spec values, not example)

    /// Control Change 1: Dit Duration (speed)
    /// Formula: dit_duration_ms = value * 2
    pub const CC_DIT_DURATION: u8 = 0x01;

    /// Control Change 2: Sidetone Note
    pub const CC_SIDETONE_NOTE: u8 = 0x02;

    /// Program Change: Keyer Type
    pub const KEYER_PASSTHROUGH: u8 = 0;
    pub const KEYER_STRAIGHT: u8 = 1;
    pub const KEYER_BUG: u8 = 2;
    pub const KEYER_ELECTRIC_BUG: u8 = 3;
    pub const KEYER_SINGLE_DOT: u8 = 4;
    pub const KEYER_ULTIMATIC: u8 = 5;
    pub const KEYER_PLAIN_IAMBIC: u8 = 6;
    pub const KEYER_IAMBIC_A: u8 = 7;
    pub const KEYER_IAMBIC_B: u8 = 8;
    pub const KEYER_KEYAHEAD: u8 = 9;
}

/// Per-connection state for mapping midir's arbitrary-origin microsecond
/// timestamps onto `Instant`s.
struct ClockMap {
    /// (first timestamp in us, Instant when it arrived)
    origin: Option<(u64, Instant)>,
}

impl ClockMap {
    fn map(&mut self, timestamp_us: u64) -> Instant {
        let now = Instant::now();
        let (ts0, t0) = *self.origin.get_or_insert((timestamp_us, now));
        let mapped = t0 + Duration::from_micros(timestamp_us.saturating_sub(ts0));
        // A driver clock that drifts or restarts must never place an edge in
        // the future or far in the past, so clamp to [now - 50 ms, now].
        let earliest = now.checked_sub(MAX_TIMESTAMP_LAG).unwrap_or(now);
        mapped.clamp(earliest, now)
    }
}

/// MIDI handler for receiving input from and sending commands to Vail adapter
pub struct MidiHandler {
    input_connection: Option<MidiInputConnection<()>>,
    output_connection: Option<MidiOutputConnection>,
    connected_name: Option<String>,
    event_rx: Receiver<TimedMidiEvent>,
    event_tx: Sender<TimedMidiEvent>,
    /// Last CC1 / CC2 values we sent, for echo suppression.
    sent_cc1: Option<(u8, Instant)>,
    sent_cc2: Option<(u8, Instant)>,
}

impl MidiHandler {
    pub fn new() -> Self {
        let (event_tx, event_rx) = unbounded();
        Self {
            input_connection: None,
            output_connection: None,
            connected_name: None,
            event_rx,
            event_tx,
            sent_cc1: None,
            sent_cc2: None,
        }
    }

    /// A receiver for incoming events. Cloneable so the event loop can block
    /// on it without holding the handler's lock.
    pub fn event_receiver(&self) -> Receiver<TimedMidiEvent> {
        self.event_rx.clone()
    }

    /// Name of the connected input port, if any.
    pub fn connected_name(&self) -> Option<&str> {
        self.input_connection.as_ref().and(self.connected_name.as_deref())
    }

    /// Drop both connections.
    pub fn disconnect(&mut self) {
        self.input_connection = None;
        self.output_connection = None;
        self.connected_name = None;
    }

    /// Connect to a MIDI device by name (both input and output)
    pub fn connect(&mut self, device_name: &str) -> Result<(), String> {
        self.disconnect();

        // midir consumes the MidiInput/MidiOutput when connecting, so make
        // fresh ones for every connection.
        let midi_in = MidiInput::new("Vail Zoomer Input")
            .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

        let midi_out = MidiOutput::new("Vail Zoomer Output")
            .map_err(|e| format!("Failed to create MIDI output: {}", e))?;

        let in_port = midi_in
            .ports()
            .into_iter()
            .find(|p| midi_in.port_name(p).map(|n| n == device_name).unwrap_or(false))
            .ok_or_else(|| format!("MIDI input device '{}' not found", device_name))?;

        let tx = self.event_tx.clone();
        let mut clock = ClockMap { origin: None };

        let input_connection = midi_in
            .connect(
                &in_port,
                "vail-zoomer-input",
                move |timestamp_us, message, _| {
                    if let Some(event) = parse_midi_message(message) {
                        let at = clock.map(timestamp_us);
                        let _ = tx.send(TimedMidiEvent { event, at });
                    }
                },
                (),
            )
            .map_err(|e| format!("Failed to connect MIDI input: {}", e))?;

        self.input_connection = Some(input_connection);
        self.connected_name = Some(device_name.to_string());

        // Output is optional: input-only is still useful.
        if let Some(out_port) = midi_out
            .ports()
            .into_iter()
            .find(|p| midi_out.port_name(p).map(|n| n == device_name).unwrap_or(false))
        {
            match midi_out.connect(&out_port, "vail-zoomer-output") {
                Ok(mut conn) => {
                    // CC0 = 0 switches the adapter into MIDI mode
                    let mode_switch = [0xB0, vail::CC_MODE, vail::MODE_MIDI];
                    if let Err(e) = conn.send(&mode_switch) {
                        eprintln!("Warning: Failed to send MIDI mode switch: {}", e);
                    } else {
                        println!("Sent MIDI mode switch command to Vail adapter");
                    }
                    self.output_connection = Some(conn);
                }
                Err(e) => eprintln!("Warning: Could not connect MIDI output: {}", e),
            }
        } else {
            eprintln!("Warning: MIDI output port '{}' not found", device_name);
        }

        Ok(())
    }

    fn send(&mut self, message: &[u8]) -> Result<(), String> {
        match self.output_connection {
            Some(ref mut conn) => conn.send(message).map_err(|e| e.to_string()),
            None => Err("MIDI output not connected".to_string()),
        }
    }

    /// Send keyer type to Vail adapter (Program Change)
    pub fn send_keyer_type(&mut self, keyer_type: u8) -> Result<(), String> {
        self.send(&[0xC0, keyer_type.min(9)])
    }

    /// Send WPM to Vail adapter (CC1 = dit duration, dit_ms = value * 2)
    pub fn send_wpm(&mut self, wpm: u8) -> Result<(), String> {
        let dit_ms = 1200u16 / (wpm.max(5) as u16);
        let cc_value = (dit_ms / 2).min(127) as u8;
        self.sent_cc1 = Some((cc_value, Instant::now()));
        self.send(&[0xB0, vail::CC_DIT_DURATION, cc_value])
    }

    /// Send sidetone note to Vail adapter (CC2). The adapter expects a raw
    /// MIDI note number (0-127) where 69 = A4 = 440 Hz.
    pub fn send_sidetone_note(&mut self, note: u8) -> Result<(), String> {
        let note = note.min(127);
        self.sent_cc2 = Some((note, Instant::now()));
        self.send(&[0xB0, vail::CC_SIDETONE_NOTE, note])
    }

    /// Set the adapter's hardware sidetone frequency in Hz. The Vail adapter's
    /// MIDI protocol only accepts a 7-bit MIDI note number, so frequencies are
    /// quantized to the nearest semitone.
    pub fn send_sidetone_frequency_hz(&mut self, hz: f32) -> Result<(), String> {
        self.send_sidetone_note(hz_to_note(hz))
    }

    /// True if an incoming CC1/CC2 just repeats a value we sent moments ago.
    pub fn is_echo(&self, controller: u8, value: u8) -> bool {
        let sent = match controller {
            vail::CC_DIT_DURATION => self.sent_cc1,
            vail::CC_SIDETONE_NOTE => self.sent_cc2,
            _ => None,
        };
        matches!(sent, Some((v, at)) if v == value && at.elapsed() < ECHO_WINDOW)
    }
}

/// Nearest MIDI note for a frequency (69 = A4 = 440 Hz).
pub fn hz_to_note(hz: f32) -> u8 {
    let note = (69.0 + 12.0 * (hz.max(1.0) / 440.0).log2()).round();
    note.clamp(0.0, 127.0) as u8
}

/// Frequency in Hz for a MIDI note number.
pub fn note_to_hz(note: u8) -> f32 {
    440.0 * 2f32.powf((note as f32 - 69.0) / 12.0)
}

/// Adapter CC1 value (dit duration = value * 2 ms) to words per minute.
pub fn cc_dit_to_wpm(value: u8) -> Option<f32> {
    if value == 0 {
        return None;
    }
    Some(1200.0 / (value as f32 * 2.0))
}

pub const CC_DIT_DURATION: u8 = vail::CC_DIT_DURATION;
pub const CC_SIDETONE_NOTE: u8 = vail::CC_SIDETONE_NOTE;
pub const CC_VOLUME: u8 = 0x07;

/// Parse raw MIDI bytes into a MidiEvent
fn parse_midi_message(message: &[u8]) -> Option<MidiEvent> {
    if message.is_empty() {
        return None;
    }

    let status = message[0];
    let message_type = status & 0xF0;

    match message_type {
        0x90 if message.len() >= 3 => {
            // Note On
            let note = message[1];
            let velocity = message[2];
            if velocity > 0 {
                Some(MidiEvent::NoteOn { note, velocity })
            } else {
                // Note On with velocity 0 is treated as Note Off
                Some(MidiEvent::NoteOff { note })
            }
        }
        0x80 if message.len() >= 2 => {
            // Note Off
            Some(MidiEvent::NoteOff { note: message[1] })
        }
        0xB0 if message.len() >= 3 => {
            // Control Change
            Some(MidiEvent::ControlChange {
                controller: message[1],
                value: message[2],
            })
        }
        _ => None,
    }
}
