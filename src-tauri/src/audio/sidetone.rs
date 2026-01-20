use std::f32::consts::PI;

/// Sidetone generator that produces a sine wave with attack/decay envelope
pub struct SidetoneGenerator {
    phase: f32,
    phase_increment: f32,
    sample_rate: f32,
    frequency: f32,
    volume: f32,
    envelope: f32,
    attack_rate: f32,
    decay_rate: f32,
}

impl SidetoneGenerator {
    pub fn new(frequency: f32, volume: f32, sample_rate: f32) -> Self {
        let phase_increment = 2.0 * PI * frequency / sample_rate;

        // Attack/decay rates for ~5ms rise/fall at 48kHz
        let attack_rate = 1.0 / (0.005 * sample_rate);
        let decay_rate = 1.0 / (0.005 * sample_rate);

        Self {
            phase: 0.0,
            phase_increment,
            sample_rate,
            frequency,
            volume,
            envelope: 0.0,
            attack_rate,
            decay_rate,
        }
    }

    /// Generate the next audio sample
    pub fn next_sample(&mut self, key_down: bool) -> f32 {
        // Update envelope with attack/decay
        if key_down {
            self.envelope = (self.envelope + self.attack_rate).min(1.0);
        } else {
            self.envelope = (self.envelope - self.decay_rate).max(0.0);
        }

        // Generate sine wave
        let sample = self.phase.sin() * self.envelope * self.volume;

        // Advance phase
        self.phase += self.phase_increment;
        if self.phase >= 2.0 * PI {
            self.phase -= 2.0 * PI;
        }

        sample
    }

    /// Update the sample rate
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate;
        self.phase_increment = 2.0 * PI * self.frequency / sample_rate;
        self.attack_rate = 1.0 / (0.005 * sample_rate);
        self.decay_rate = 1.0 / (0.005 * sample_rate);
    }

    /// Update the frequency
    pub fn set_frequency(&mut self, frequency: f32) {
        self.frequency = frequency;
        self.phase_increment = 2.0 * PI * frequency / self.sample_rate;
    }

    /// Update the volume (0.0 - 1.0)
    pub fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
    }
}
