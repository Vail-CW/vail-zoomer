use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::sync::mpsc::{self, Receiver, Sender};

/// MIDI event types
#[derive(Debug, Clone)]
pub enum MidiEvent {
    NoteOn { note: u8, velocity: u8 },
    NoteOff { note: u8 },
    ControlChange { controller: u8, value: u8 },
}

/// Vail adapter MIDI constants (from MIDI_INTEGRATION_SPEC.md)
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

/// MIDI handler for receiving input from and sending commands to Vail adapter
pub struct MidiHandler {
    input_connection: Option<MidiInputConnection<()>>,
    output_connection: Option<MidiOutputConnection>,
    event_rx: Receiver<MidiEvent>,
    event_tx: Sender<MidiEvent>,
}

impl MidiHandler {
    pub fn new() -> Result<Self, String> {
        let (event_tx, event_rx) = mpsc::channel();

        Ok(Self {
            input_connection: None,
            output_connection: None,
            event_rx,
            event_tx,
        })
    }

    /// List available MIDI input devices
    pub fn list_devices(&self) -> Vec<String> {
        // Create a temporary MidiInput just for listing devices
        match MidiInput::new("Vail Zoomer List") {
            Ok(midi_in) => {
                midi_in
                    .ports()
                    .iter()
                    .filter_map(|p| midi_in.port_name(p).ok())
                    .collect()
            }
            Err(_) => vec![],
        }
    }

    /// Connect to a MIDI device by name (both input and output)
    pub fn connect(&mut self, device_name: &str) -> Result<(), String> {
        // Disconnect existing connections
        self.input_connection = None;
        self.output_connection = None;

        // Create fresh MIDI input/output for this connection
        // (midir consumes the MidiInput/MidiOutput when connecting)
        let midi_in = MidiInput::new("Vail Zoomer Input")
            .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

        let midi_out = MidiOutput::new("Vail Zoomer Output")
            .map_err(|e| format!("Failed to create MIDI output: {}", e))?;

        // Find and connect to input port
        let in_port = midi_in
            .ports()
            .into_iter()
            .find(|p| midi_in.port_name(p).map(|n| n == device_name).unwrap_or(false))
            .ok_or_else(|| format!("MIDI input device '{}' not found", device_name))?;

        let tx = self.event_tx.clone();

        let input_connection = midi_in
            .connect(
                &in_port,
                "vail-zoomer-input",
                move |_timestamp, message, _| {
                    if let Some(event) = parse_midi_message(message) {
                        let _ = tx.send(event);
                    }
                },
                (),
            )
            .map_err(|e| format!("Failed to connect MIDI input: {}", e))?;

        self.input_connection = Some(input_connection);

        // Find and connect to output port
        if let Some(out_port) = midi_out
            .ports()
            .into_iter()
            .find(|p| midi_out.port_name(p).map(|n| n == device_name).unwrap_or(false))
        {
            match midi_out.connect(&out_port, "vail-zoomer-output") {
                Ok(mut conn) => {
                    // Send mode switch command to enable MIDI mode on Vail adapter
                    // CC0 (0xB0 0x00) with value 127 (0x7F) = MIDI mode
                    let mode_switch = [0xB0, vail::CC_MODE, vail::MODE_MIDI];
                    if let Err(e) = conn.send(&mode_switch) {
                        eprintln!("Warning: Failed to send MIDI mode switch: {}", e);
                    } else {
                        println!("Sent MIDI mode switch command to Vail adapter");
                    }
                    self.output_connection = Some(conn);
                }
                Err(e) => {
                    eprintln!("Warning: Could not connect MIDI output: {}", e);
                    // Don't fail - input-only is still useful
                }
            }
        } else {
            eprintln!("Warning: MIDI output port '{}' not found", device_name);
        }

        Ok(())
    }

    /// Send keyer type to Vail adapter (Program Change)
    pub fn send_keyer_type(&mut self, keyer_type: u8) -> Result<(), String> {
        if let Some(ref mut conn) = self.output_connection {
            let message = [0xC0, keyer_type.min(9)];  // Program Change, clamp to valid range
            conn.send(&message).map_err(|e| e.to_string())
        } else {
            Err("MIDI output not connected".to_string())
        }
    }

    /// Send WPM to Vail adapter (CC1 = dit duration)
    /// Formula: dit_duration_ms = value * 2
    /// WPM ≈ 1200 / dit_duration_ms
    pub fn send_wpm(&mut self, wpm: u8) -> Result<(), String> {
        if let Some(ref mut conn) = self.output_connection {
            // Convert WPM to dit duration: dit_ms = 1200 / wpm
            // CC value = dit_ms / 2
            let dit_ms = 1200u16 / (wpm.max(5) as u16);
            let cc_value = (dit_ms / 2).min(127) as u8;
            let message = [0xB0, vail::CC_DIT_DURATION, cc_value];
            conn.send(&message).map_err(|e| e.to_string())
        } else {
            Err("MIDI output not connected".to_string())
        }
    }

    /// Send sidetone note to Vail adapter (CC2)
    pub fn send_sidetone_note(&mut self, note: u8) -> Result<(), String> {
        if let Some(ref mut conn) = self.output_connection {
            let message = [0xB0, vail::CC_SIDETONE_NOTE, note.min(127)];
            conn.send(&message).map_err(|e| e.to_string())
        } else {
            Err("MIDI output not connected".to_string())
        }
    }

    /// Try to receive a pending MIDI event (non-blocking)
    pub fn try_recv(&self) -> Option<MidiEvent> {
        self.event_rx.try_recv().ok()
    }

    /// Check if connected to a MIDI device
    pub fn is_connected(&self) -> bool {
        self.input_connection.is_some()
    }
}

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
