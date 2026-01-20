mod decoder;
mod timing;

use std::time::Instant;
use crate::config::KeyerType;

pub use decoder::CwDecoder;
pub use timing::calculate_dit_duration;

/// CW Engine that handles keying logic and decoding
pub struct CwEngine {
    decoder: CwDecoder,
    keyer_type: KeyerType,
    wpm: f32,
    dit_duration_ms: f32,
    /// When the key went down
    key_down_time: Option<Instant>,
    /// When the key went up (for gap tracking)
    key_up_time: Option<Instant>,
    /// Flush timeout in ms (flush pending char after this much silence)
    flush_timeout_ms: f32,
}

impl CwEngine {
    pub fn new(wpm: f32) -> Self {
        let dit_duration_ms = calculate_dit_duration(wpm);

        Self {
            decoder: CwDecoder::new(),
            keyer_type: KeyerType::Straight,
            wpm,
            dit_duration_ms,
            key_down_time: None,
            key_up_time: None,
            flush_timeout_ms: 1500.0, // 1.5 second timeout to flush pending char
        }
    }

    /// Set WPM and update timing
    pub fn set_wpm(&mut self, wpm: f32) {
        self.wpm = wpm;
        self.dit_duration_ms = calculate_dit_duration(wpm);
    }

    /// Set keyer type
    pub fn set_keyer_type(&mut self, keyer_type: KeyerType) {
        self.keyer_type = keyer_type;
    }

    /// Handle key down event
    pub fn key_down(&mut self, _is_dit: bool) -> Option<DecodedElement> {
        let now = Instant::now();

        // If there was a previous key up, calculate the gap duration
        let result = if let Some(up_time) = self.key_up_time.take() {
            let gap_ms = up_time.elapsed().as_millis() as f32;
            // Feed negative timing (gap) to decoder
            let output = self.decoder.add_timing(-gap_ms);
            self.make_decoded_element(output)
        } else {
            None
        };

        self.key_down_time = Some(now);
        result
    }

    /// Handle key up event - returns decoded character if any
    pub fn key_up(&mut self) -> Option<DecodedElement> {
        let now = Instant::now();

        // Calculate key down duration
        let result = if let Some(down_time) = self.key_down_time.take() {
            let duration_ms = down_time.elapsed().as_millis() as f32;
            // Feed positive timing (tone) to decoder
            let output = self.decoder.add_timing(duration_ms);
            self.make_decoded_element(output)
        } else {
            None
        };

        self.key_up_time = Some(now);
        result
    }

    /// Check for timeout and flush pending characters
    /// Call this periodically (e.g., every 10-50ms)
    pub fn check_timeout(&mut self) -> Option<DecodedElement> {
        if let Some(up_time) = self.key_up_time {
            let gap_ms = up_time.elapsed().as_millis() as f32;

            // If gap exceeds flush timeout, flush pending character
            if gap_ms >= self.flush_timeout_ms {
                // First feed the gap to potentially trigger character boundary
                let gap_result = self.decoder.add_timing(-gap_ms);
                if gap_result.is_some() {
                    self.key_up_time = None; // Reset to prevent repeated flush
                    return self.make_decoded_element(gap_result);
                }

                // Then flush any remaining pattern
                let flush_result = self.decoder.flush();
                if flush_result.is_some() {
                    self.key_up_time = None;
                    return self.make_decoded_element(flush_result);
                }
            }
        }
        None
    }

    /// Convert decoder output string into DecodedElement
    fn make_decoded_element(&self, output: Option<String>) -> Option<DecodedElement> {
        output.map(|text| DecodedElement {
            character: text,
            wpm: self.decoder.estimate_wpm(),
        })
    }

    /// Estimate WPM based on decoder's adaptive timing
    pub fn estimate_wpm(&self) -> f32 {
        self.decoder.estimate_wpm()
    }

    /// Get current WPM setting
    pub fn wpm(&self) -> f32 {
        self.wpm
    }

    /// Get current dit duration in milliseconds
    pub fn dit_duration_ms(&self) -> f32 {
        self.dit_duration_ms
    }
}

/// A decoded CW element with timing info
#[derive(Debug, Clone)]
pub struct DecodedElement {
    pub character: String,
    pub wpm: f32,
}
