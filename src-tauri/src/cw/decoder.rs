use std::collections::VecDeque;

/// Morse code lookup table
const MORSE_TABLE: &[(char, &str)] = &[
    ('A', ".-"),
    ('B', "-..."),
    ('C', "-.-."),
    ('D', "-.."),
    ('E', "."),
    ('F', "..-."),
    ('G', "--."),
    ('H', "...."),
    ('I', ".."),
    ('J', ".---"),
    ('K', "-.-"),
    ('L', ".-.."),
    ('M', "--"),
    ('N', "-."),
    ('O', "---"),
    ('P', ".--."),
    ('Q', "--.-"),
    ('R', ".-."),
    ('S', "..."),
    ('T', "-"),
    ('U', "..-"),
    ('V', "...-"),
    ('W', ".--"),
    ('X', "-..-"),
    ('Y', "-.--"),
    ('Z', "--.."),
    ('1', ".----"),
    ('2', "..---"),
    ('3', "...--"),
    ('4', "....-"),
    ('5', "....."),
    ('6', "-...."),
    ('7', "--..."),
    ('8', "---.."),
    ('9', "----."),
    ('0', "-----"),
    ('.', ".-.-.-"),
    (',', "--..--"),
    ('?', "..--.."),
    ('/', "-..-."),
    ('=', "-...-"),
    ('+', ".-.-."),
    ('-', "-....-"),
    ('@', ".--.-."),
    ('!', "-.-.--"),
    ('\'', ".----."),
    ('(', "-.--."),
    (')', "-.--.-"),
    ('&', ".-..."),
    (':', "---..."),
    (';', "-.-.-."),
    ('"', ".-..-."),
    ('$', "...-..-"),
    ('_', "..--.-"),
];

/// Adaptive CW decoder based on morse-pro algorithm
/// Uses weighted averaging of recent dit lengths to adapt to sender's speed
pub struct CwDecoder {
    /// Current element pattern being built (dits and dahs)
    current_pattern: String,
    /// Buffer of recent dit length estimates for adaptive timing
    dit_buffer: VecDeque<f32>,
    /// Maximum size of dit buffer
    dit_buffer_size: usize,
    /// Current estimated dit length in ms
    dit_length_ms: f32,
    /// Noise threshold - durations below this are ignored
    noise_threshold_ms: f32,
    /// Pending output characters
    output_buffer: String,
}

impl CwDecoder {
    pub fn new() -> Self {
        Self {
            current_pattern: String::new(),
            dit_buffer: VecDeque::with_capacity(30),
            dit_buffer_size: 30,
            dit_length_ms: 60.0, // Default to ~20 WPM (1200/20 = 60ms)
            noise_threshold_ms: 2.0,
            output_buffer: String::new(),
        }
    }

    /// Add a timing to the decoder
    /// Positive values = tone on (key down duration)
    /// Negative values = silence (gap duration)
    pub fn add_timing(&mut self, timing_ms: f32) -> Option<String> {
        // Filter noise
        if timing_ms.abs() < self.noise_threshold_ms {
            return None;
        }

        if timing_ms > 0.0 {
            // Tone on - this is a dit or dah
            self.process_tone(timing_ms);
        } else {
            // Silence - this is a gap
            self.process_gap(-timing_ms);
        }

        // Return any completed output
        if !self.output_buffer.is_empty() {
            let output = self.output_buffer.clone();
            self.output_buffer.clear();
            Some(output)
        } else {
            None
        }
    }

    /// Process a tone (key down) duration
    fn process_tone(&mut self, duration_ms: f32) {
        // Determine if this is a dit or dah based on threshold
        // Threshold is 2x dit length (midpoint between 1x dit and 3x dah)
        let threshold = self.dit_length_ms * 2.0;

        let (symbol, dit_estimate) = if duration_ms < threshold {
            // Dit - use duration directly as dit estimate
            ('.', duration_ms)
        } else {
            // Dah - divide by 3 to get dit estimate
            ('-', duration_ms / 3.0)
        };

        self.current_pattern.push(symbol);

        // Update dit length estimate
        self.add_dit_sample(dit_estimate);
    }

    /// Process a gap (silence) duration
    fn process_gap(&mut self, duration_ms: f32) {
        // Threshold for character boundary is 2x dit (midpoint between 1x and 3x)
        let char_threshold = self.dit_length_ms * 2.0;

        // Threshold for word boundary is 5x dit (midpoint between 3x and 7x)
        let word_threshold = self.dit_length_ms * 5.0;

        if duration_ms >= char_threshold {
            // Character boundary - decode current pattern
            if !self.current_pattern.is_empty() {
                if let Some(ch) = self.lookup_pattern(&self.current_pattern) {
                    self.output_buffer.push(ch);
                }
                self.current_pattern.clear();
            }

            // Word boundary - add space
            if duration_ms >= word_threshold {
                if !self.output_buffer.is_empty() && !self.output_buffer.ends_with(' ') {
                    self.output_buffer.push(' ');
                }
            }

            // Update dit estimate from inter-character gap (divide by 3)
            if duration_ms < word_threshold {
                self.add_dit_sample(duration_ms / 3.0);
            }
        }
        // Intra-character gaps (< char_threshold) are ignored - they don't affect the pattern
    }

    /// Add a dit length sample to the adaptive buffer
    fn add_dit_sample(&mut self, dit_ms: f32) {
        // Sanity check - ignore extreme values
        if dit_ms < 10.0 || dit_ms > 500.0 {
            return;
        }

        self.dit_buffer.push_back(dit_ms);
        if self.dit_buffer.len() > self.dit_buffer_size {
            self.dit_buffer.pop_front();
        }

        // Update dit length estimate using linear weighted average
        // Newer samples get higher weight
        if !self.dit_buffer.is_empty() {
            let mut weighted_sum = 0.0;
            let mut total_weight = 0.0;

            for (i, &dit) in self.dit_buffer.iter().enumerate() {
                let weight = (i + 1) as f32; // Linear weighting
                weighted_sum += dit * weight;
                total_weight += weight;
            }

            self.dit_length_ms = weighted_sum / total_weight;
        }
    }

    /// Force flush any pending pattern (call after timeout)
    pub fn flush(&mut self) -> Option<String> {
        if !self.current_pattern.is_empty() {
            if let Some(ch) = self.lookup_pattern(&self.current_pattern) {
                self.output_buffer.push(ch);
            }
            self.current_pattern.clear();
        }

        if !self.output_buffer.is_empty() {
            let output = self.output_buffer.clone();
            self.output_buffer.clear();
            Some(output)
        } else {
            None
        }
    }

    /// Look up a Morse pattern and return the character
    fn lookup_pattern(&self, pattern: &str) -> Option<char> {
        MORSE_TABLE
            .iter()
            .find(|(_, p)| *p == pattern)
            .map(|(c, _)| *c)
    }

    /// Get estimated WPM based on current dit length
    pub fn estimate_wpm(&self) -> f32 {
        // PARIS standard: 50 dits per word
        // dit_ms = 1200 / wpm
        // wpm = 1200 / dit_ms
        if self.dit_length_ms > 0.0 {
            1200.0 / self.dit_length_ms
        } else {
            20.0
        }
    }

    /// Reset the decoder state
    pub fn reset(&mut self) {
        self.current_pattern.clear();
        self.output_buffer.clear();
        // Keep dit_buffer for speed continuity
    }

    /// Get the current pattern being built (for debugging)
    pub fn current_pattern(&self) -> &str {
        &self.current_pattern
    }

    /// Get current dit length estimate
    pub fn dit_length_ms(&self) -> f32 {
        self.dit_length_ms
    }
}

impl Default for CwDecoder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lookup_common_letters() {
        let decoder = CwDecoder::new();
        assert_eq!(decoder.lookup_pattern("."), Some('E'));
        assert_eq!(decoder.lookup_pattern("-"), Some('T'));
        assert_eq!(decoder.lookup_pattern(".-"), Some('A'));
        assert_eq!(decoder.lookup_pattern("..."), Some('S'));
        assert_eq!(decoder.lookup_pattern("---"), Some('O'));
    }

    #[test]
    fn test_decode_sos() {
        let mut decoder = CwDecoder::new();
        // S: ... (3 dits)
        decoder.add_timing(60.0);  // dit
        decoder.add_timing(-60.0); // intra-char gap
        decoder.add_timing(60.0);  // dit
        decoder.add_timing(-60.0); // intra-char gap
        decoder.add_timing(60.0);  // dit
        decoder.add_timing(-180.0); // char gap (3x dit)

        // O: --- (3 dahs)
        decoder.add_timing(180.0); // dah
        decoder.add_timing(-60.0); // intra-char gap
        decoder.add_timing(180.0); // dah
        decoder.add_timing(-60.0); // intra-char gap
        decoder.add_timing(180.0); // dah
        decoder.add_timing(-180.0); // char gap

        // S: ...
        decoder.add_timing(60.0);
        decoder.add_timing(-60.0);
        decoder.add_timing(60.0);
        decoder.add_timing(-60.0);
        decoder.add_timing(60.0);

        let result = decoder.flush();
        assert_eq!(result, Some("SOS".to_string()));
    }
}
