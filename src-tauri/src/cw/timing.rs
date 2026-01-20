/// Calculate dit duration in milliseconds from WPM
///
/// Standard Morse timing: 1 word = 50 dit-lengths
/// "PARIS" is the standard word used for WPM measurement
/// WPM = (dit duration in ms) / 1200
pub fn calculate_dit_duration(wpm: f32) -> f32 {
    1200.0 / wpm
}

/// Calculate dah duration (3x dit)
pub fn calculate_dah_duration(wpm: f32) -> f32 {
    calculate_dit_duration(wpm) * 3.0
}

/// Calculate inter-element gap (1x dit)
pub fn calculate_element_gap(wpm: f32) -> f32 {
    calculate_dit_duration(wpm)
}

/// Calculate inter-character gap (3x dit)
pub fn calculate_character_gap(wpm: f32) -> f32 {
    calculate_dit_duration(wpm) * 3.0
}

/// Calculate inter-word gap (7x dit)
pub fn calculate_word_gap(wpm: f32) -> f32 {
    calculate_dit_duration(wpm) * 7.0
}

/// Estimate WPM from a dit duration in milliseconds
pub fn estimate_wpm_from_dit(dit_ms: f32) -> f32 {
    1200.0 / dit_ms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dit_duration_at_common_speeds() {
        // At 12 WPM, dit should be 100ms
        assert!((calculate_dit_duration(12.0) - 100.0).abs() < 0.1);

        // At 20 WPM, dit should be 60ms
        assert!((calculate_dit_duration(20.0) - 60.0).abs() < 0.1);

        // At 25 WPM, dit should be 48ms
        assert!((calculate_dit_duration(25.0) - 48.0).abs() < 0.1);
    }

    #[test]
    fn test_dah_is_3x_dit() {
        for wpm in [10.0, 15.0, 20.0, 25.0, 30.0] {
            let dit = calculate_dit_duration(wpm);
            let dah = calculate_dah_duration(wpm);
            assert!((dah - dit * 3.0).abs() < 0.01);
        }
    }
}
