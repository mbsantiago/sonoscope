use std::alloc::{alloc, dealloc, Layout};
use std::f64::consts::PI;

#[repr(u32)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WindowType {
    Hann = 0,
    Hamming = 1,
    Blackman = 2,
    Rectangular = 3,
}

impl WindowType {
    pub fn from_u32(val: u32) -> Self {
        match val {
            0 => WindowType::Hann,
            1 => WindowType::Hamming,
            2 => WindowType::Blackman,
            _ => WindowType::Rectangular,
        }
    }
}

pub fn generate_window(window_type: WindowType, size: usize) -> Vec<f64> {
    if size == 0 {
        return Vec::new();
    }
    if size == 1 {
        return vec![1.0];
    }
    let mut window = Vec::with_capacity(size);
    let size_f = (size - 1) as f64;
    for n in 0..size {
        let n_f = n as f64;
        let val = match window_type {
            WindowType::Rectangular => 1.0,
            WindowType::Hann => 0.5 * (1.0 - (2.0 * PI * n_f / size_f).cos()),
            WindowType::Hamming => 0.54 - 0.46 * (2.0 * PI * n_f / size_f).cos(),
            WindowType::Blackman => {
                0.42 - 0.5 * (2.0 * PI * n_f / size_f).cos()
                    + 0.08 * (4.0 * PI * n_f / size_f).cos()
            }
        };
        window.push(val);
    }
    window
}

pub struct FftContext {
    pub n: usize,
    pub bit_rev: Vec<usize>,
    pub twiddles_cos: Vec<Vec<f64>>,
    pub twiddles_sin: Vec<Vec<f64>>,
}

impl FftContext {
    pub fn new(n: usize) -> Self {
        assert!(n > 0 && (n & (n - 1)) == 0, "FFT size must be a power of 2");
        let mut bit_rev = vec![0; n];
        for i in 0..n {
            let mut rev = 0;
            let mut temp = i;
            let mut bit = n >> 1;
            while bit > 0 {
                if temp & 1 != 0 {
                    rev |= bit;
                }
                temp >>= 1;
                bit >>= 1;
            }
            bit_rev[i] = rev;
        }

        let mut twiddles_cos = Vec::new();
        let mut twiddles_sin = Vec::new();

        let mut len = 2;
        while len <= n {
            let half_len = len / 2;
            let angle = -2.0 * PI / (len as f64);
            let mut cos_table = Vec::with_capacity(half_len);
            let mut sin_table = Vec::with_capacity(half_len);
            for j in 0..half_len {
                let a = angle * (j as f64);
                cos_table.push(a.cos());
                sin_table.push(a.sin());
            }
            twiddles_cos.push(cos_table);
            twiddles_sin.push(sin_table);
            len <<= 1;
        }

        Self {
            n,
            bit_rev,
            twiddles_cos,
            twiddles_sin,
        }
    }

    pub fn compute_magnitudes(&self, real_input: &[f64], real: &mut [f64], imag: &mut [f64], out_mag: &mut [f32]) {
        let n = self.n;
        for i in 0..n {
            let rev = self.bit_rev[i];
            real[rev] = real_input[i];
            imag[rev] = 0.0;
        }

        let mut stage = 0;
        let mut len = 2;
        while len <= n {
            let half_len = len / 2;
            let cos_table = &self.twiddles_cos[stage];
            let sin_table = &self.twiddles_sin[stage];

            let mut i = 0;
            while i < n {
                for j in 0..half_len {
                    let w_real = cos_table[j];
                    let w_imag = sin_table[j];

                    let odd_idx = i + j + half_len;
                    let even_idx = i + j;

                    let o_r = real[odd_idx];
                    let o_i = imag[odd_idx];

                    let odd_real = o_r * w_real - o_i * w_imag;
                    let odd_imag = o_r * w_imag + o_i * w_real;

                    let even_real = real[even_idx];
                    let even_imag = imag[even_idx];

                    real[even_idx] = even_real + odd_real;
                    imag[even_idx] = even_imag + odd_imag;
                    real[odd_idx] = even_real - odd_real;
                    imag[odd_idx] = even_imag - odd_imag;
                }
                i += len;
            }
            stage += 1;
            len <<= 1;
        }

        let inv_n = 1.0 / (n as f64);
        let half_n = n / 2;
        for i in 0..half_n {
            let r = real[i];
            let im = imag[i];
            let mag = (r * r + im * im).sqrt() * inv_n;
            out_mag[i] = mag as f32;
        }
    }
}

// Memory allocation exports for JS/WASM
#[no_mangle]
pub extern "C" fn stft_alloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc(layout) }
}

#[no_mangle]
pub extern "C" fn stft_dealloc(ptr: *mut u8, size: usize) {
    if !ptr.is_null() && size > 0 {
        let layout = Layout::from_size_align(size, 8).unwrap();
        unsafe { dealloc(ptr, layout) }
    }
}

#[no_mangle]
pub extern "C" fn stft_process(
    samples_ptr: *const f32,
    samples_len: usize,
    window_type_u32: u32,
    window_size: usize,
    hop_size: usize,
    fft_size: usize,
    out_mag_ptr: *mut f32,
    out_power_ptr: *mut f32,
    out_db_ptr: *mut f32,
) -> usize {
    if samples_ptr.is_null() || out_mag_ptr.is_null() || window_size == 0 || hop_size == 0 || fft_size == 0 {
        return 0;
    }
    if samples_len < window_size {
        return 0;
    }

    let samples = unsafe { std::slice::from_raw_parts(samples_ptr, samples_len) };
    let frame_count = (samples_len - window_size) / hop_size + 1;
    let bin_count = fft_size / 2;
    let total_bins = frame_count * bin_count;

    let out_mag = unsafe { std::slice::from_raw_parts_mut(out_mag_ptr, total_bins) };
    let mut out_power = if !out_power_ptr.is_null() {
        Some(unsafe { std::slice::from_raw_parts_mut(out_power_ptr, total_bins) })
    } else {
        None
    };
    let mut out_db = if !out_db_ptr.is_null() {
        Some(unsafe { std::slice::from_raw_parts_mut(out_db_ptr, total_bins) })
    } else {
        None
    };

    let window_type = WindowType::from_u32(window_type_u32);
    let window = generate_window(window_type, window_size);
    let fft = FftContext::new(fft_size);

    let mut frame_real_input = vec![0.0f64; fft_size];
    let mut real = vec![0.0f64; fft_size];
    let mut imag = vec![0.0f64; fft_size];

    let min_db_floor = 1e-12f32;

    for frame_idx in 0..frame_count {
        frame_real_input.fill(0.0);
        let sample_offset = frame_idx * hop_size;
        for i in 0..window_size {
            frame_real_input[i] = (samples[sample_offset + i] as f64) * window[i];
        }

        let mag_offset = frame_idx * bin_count;
        let mag_slice = &mut out_mag[mag_offset..mag_offset + bin_count];
        fft.compute_magnitudes(&frame_real_input, &mut real, &mut imag, mag_slice);

        if let Some(ref mut power) = out_power {
            let power_slice = &mut power[mag_offset..mag_offset + bin_count];
            for (p, &m) in power_slice.iter_mut().zip(mag_slice.iter()) {
                *p = m * m;
            }
        }

        if let Some(ref mut db) = out_db {
            let db_slice = &mut db[mag_offset..mag_offset + bin_count];
            for (d, &m) in db_slice.iter_mut().zip(mag_slice.iter()) {
                let clamped = if m > min_db_floor { m } else { min_db_floor };
                *d = 20.0 * clamped.log10();
            }
        }
    }

    frame_count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_generation() {
        let hann = generate_window(WindowType::Hann, 4);
        assert_eq!(hann.len(), 4);
        assert!((hann[0] - 0.0).abs() < 1e-6);
        assert!((hann[3] - 0.0).abs() < 1e-6);

        let rect = generate_window(WindowType::Rectangular, 4);
        assert_eq!(rect, vec![1.0, 1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_fft_magnitudes() {
        let fft = FftContext::new(4);
        let mut real = vec![0.0; 4];
        let mut imag = vec![0.0; 4];
        let mut out = vec![0.0f32; 2];

        // Impulse input: [1, 0, 0, 0] -> FFT is flat 1/4 = 0.25
        let input = vec![1.0, 0.0, 0.0, 0.0];
        fft.compute_magnitudes(&input, &mut real, &mut imag, &mut out);
        assert!((out[0] - 0.25).abs() < 1e-6);
        assert!((out[1] - 0.25).abs() < 1e-6);
    }

    #[test]
    fn test_stft_process() {
        let samples = vec![1.0f32; 8];
        let mut mag = vec![0.0f32; 8];
        let mut power = vec![0.0f32; 8];
        let mut db = vec![0.0f32; 8];

        let count = stft_process(
            samples.as_ptr(),
            samples.len(),
            3, // Rectangular
            4, // window_size
            2, // hop_size
            4, // fft_size
            mag.as_mut_ptr(),
            power.as_mut_ptr(),
            db.as_mut_ptr(),
        );

        // (8 - 4) / 2 + 1 = 3 frames
        assert_eq!(count, 3);
        // bin_count = 4 / 2 = 2
        // All DC frame of 4 ones: DC bin magnitude = 4 / 4 = 1.0
        assert!((mag[0] - 1.0).abs() < 1e-5);
        assert!((power[0] - 1.0).abs() < 1e-5);
        assert!((db[0] - 0.0).abs() < 1e-5);
    }
}
