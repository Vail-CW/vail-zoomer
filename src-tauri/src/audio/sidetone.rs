use std::f32::consts::PI;

/// Sidetone generator: a sine oscillator shaped by a raised-cosine envelope.
///
/// A linear ramp has a derivative discontinuity at both ends, which shows up
/// as a faint "tick" (spectral splatter) on every dit. A half-Hann ramp has
/// zero slope at 0 and 1, so keying is click-free at any rise time.
///
/// The generator is owned by exactly one audio callback; parameters are pushed
/// in with the `set_*` methods (each is a no-op when nothing changed), so no
/// locking is ever needed.
pub struct SidetoneGenerator {
    phase: f32,
    phase_increment: f32,
    sample_rate: f32,
    frequency: f32,
    /// Requested volume; `volume` chases it to avoid zipper noise on changes.
    target_volume: f32,
    volume: f32,
    volume_coef: f32,
    /// Position along the rise/fall ramp, 0.0 (silent) ..= 1.0 (full).
    /// Reversing mid-ramp just walks the same curve backwards, so a quick
    /// key-up during the attack stays continuous.
    progress: f32,
    rise_ms: f32,
    progress_step: f32,
}

impl SidetoneGenerator {
    pub fn new(frequency: f32, volume: f32, sample_rate: f32) -> Self {
        let mut g = Self {
            phase: 0.0,
            phase_increment: 0.0,
            sample_rate,
            frequency,
            target_volume: volume.clamp(0.0, 1.0),
            volume: volume.clamp(0.0, 1.0),
            volume_coef: 0.0,
            progress: 0.0,
            rise_ms: 5.0,
            progress_step: 0.0,
        };
        g.recompute();
        g
    }

    fn recompute(&mut self) {
        self.phase_increment = 2.0 * PI * self.frequency / self.sample_rate;
        self.progress_step = 1.0 / (self.rise_ms * 0.001 * self.sample_rate).max(1.0);
        // ~5 ms one-pole smoothing for volume changes.
        self.volume_coef = 1.0 - (-1.0 / (0.005 * self.sample_rate)).exp();
    }

    /// Generate the next audio sample
    pub fn next_sample(&mut self, key_down: bool) -> f32 {
        if key_down {
            self.progress = (self.progress + self.progress_step).min(1.0);
        } else {
            self.progress = (self.progress - self.progress_step).max(0.0);
        }

        self.volume += (self.target_volume - self.volume) * self.volume_coef;

        // Raised cosine: 0.5 * (1 - cos(pi * p)). Skip the trig at the flat ends.
        let envelope = if self.progress <= 0.0 {
            0.0
        } else if self.progress >= 1.0 {
            1.0
        } else {
            0.5 * (1.0 - (PI * self.progress).cos())
        };

        // Keep the oscillator running while silent so phase stays continuous.
        let sample = if envelope > 0.0 {
            self.phase.sin() * envelope * self.volume
        } else {
            0.0
        };

        self.phase += self.phase_increment;
        if self.phase >= 2.0 * PI {
            self.phase -= 2.0 * PI;
        }

        sample
    }

    /// Update the frequency
    pub fn set_frequency(&mut self, frequency: f32) {
        if frequency != self.frequency {
            self.frequency = frequency;
            self.recompute();
        }
    }

    /// Update the volume (0.0 - 1.0)
    pub fn set_volume(&mut self, volume: f32) {
        self.target_volume = volume.clamp(0.0, 1.0);
    }

    /// Update the rise/fall time in milliseconds (clamped to 1..=20)
    pub fn set_rise_ms(&mut self, rise_ms: f32) {
        let rise_ms = rise_ms.clamp(1.0, 20.0);
        if rise_ms != self.rise_ms {
            self.rise_ms = rise_ms;
            self.recompute();
        }
    }
}
