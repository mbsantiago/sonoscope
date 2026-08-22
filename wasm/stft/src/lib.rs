use std::alloc::{alloc, dealloc, Layout};
use std::convert::TryFrom;
use std::f32::consts::PI;

const ALLOC_ALIGN: usize = 8;
const STFT_ERR_NULL_POINTER: i32 = -1;
const STFT_ERR_INVALID_ARGUMENT: i32 = -2;
const STFT_ERR_OUTPUT_TOO_SMALL: i32 = -3;
const STFT_ERR_OVERFLOW: i32 = -4;
const STFT_ERR_FRAME_COUNT: i32 = -5;

#[repr(u32)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WindowType {
    Hann = 0,
    Hamming = 1,
    Blackman = 2,
    Rectangular = 3,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum StftError {
    InvalidWindowType,
    InvalidFftSize,
    WindowExceedsFft,
}

impl TryFrom<u32> for WindowType {
    type Error = StftError;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Hann),
            1 => Ok(Self::Hamming),
            2 => Ok(Self::Blackman),
            3 => Ok(Self::Rectangular),
            _ => Err(StftError::InvalidWindowType),
        }
    }
}

pub fn generate_window(window_type: WindowType, size: usize) -> Vec<f32> {
    if size == 0 {
        return Vec::new();
    }
    if size == 1 {
        return vec![1.0];
    }

    let mut window = Vec::with_capacity(size);
    let size_f = (size - 1) as f32;
    for n in 0..size {
        let n_f = n as f32;
        let value = match window_type {
            WindowType::Rectangular => 1.0,
            WindowType::Hann => 0.5 * (1.0 - (2.0 * PI * n_f / size_f).cos()),
            WindowType::Hamming => 0.54 - 0.46 * (2.0 * PI * n_f / size_f).cos(),
            WindowType::Blackman => {
                0.42 - 0.5 * (2.0 * PI * n_f / size_f).cos()
                    + 0.08 * (4.0 * PI * n_f / size_f).cos()
            }
        };
        window.push(value);
    }
    window
}

pub struct FftContext {
    n: usize,
    bit_rev: Vec<usize>,
    twiddles_cos: Vec<Vec<f32>>,
    twiddles_sin: Vec<Vec<f32>>,
}

impl FftContext {
    pub fn try_new(n: usize) -> Result<Self, StftError> {
        if n == 0 || !n.is_power_of_two() {
            return Err(StftError::InvalidFftSize);
        }

        let mut bit_rev = vec![0; n];
        for (i, slot) in bit_rev.iter_mut().enumerate() {
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
            *slot = rev;
        }

        let mut twiddles_cos = Vec::new();
        let mut twiddles_sin = Vec::new();
        let mut len = 2;
        while len <= n {
            let half_len = len / 2;
            let angle = -2.0 * PI / len as f32;
            let mut cos_table = Vec::with_capacity(half_len);
            let mut sin_table = Vec::with_capacity(half_len);
            for j in 0..half_len {
                let angle = angle * j as f32;
                cos_table.push(angle.cos());
                sin_table.push(angle.sin());
            }
            twiddles_cos.push(cos_table);
            twiddles_sin.push(sin_table);
            len <<= 1;
        }

        Ok(Self {
            n,
            bit_rev,
            twiddles_cos,
            twiddles_sin,
        })
    }

    #[inline]
    pub fn compute_magnitudes(
        &self,
        real_input: &[f32],
        real: &mut [f32],
        imag: &mut [f32],
        out_mag: &mut [f32],
    ) {
        for i in 0..self.n {
            let rev = self.bit_rev[i];
            real[rev] = real_input[i];
            imag[rev] = 0.0;
        }

        let mut stage = 0;
        let mut len = 2;
        while len <= self.n {
            let half_len = len / 2;
            let cos_table = &self.twiddles_cos[stage];
            let sin_table = &self.twiddles_sin[stage];

            for i in (0..self.n).step_by(len) {
                for j in 0..half_len {
                    let odd_idx = i + j + half_len;
                    let even_idx = i + j;
                    let odd_real = real[odd_idx] * cos_table[j] - imag[odd_idx] * sin_table[j];
                    let odd_imag = real[odd_idx] * sin_table[j] + imag[odd_idx] * cos_table[j];
                    let even_real = real[even_idx];
                    let even_imag = imag[even_idx];

                    real[even_idx] = even_real + odd_real;
                    imag[even_idx] = even_imag + odd_imag;
                    real[odd_idx] = even_real - odd_real;
                    imag[odd_idx] = even_imag - odd_imag;
                }
            }
            stage += 1;
            len <<= 1;
        }

        let inv_n = 1.0 / self.n as f32;
        for i in 0..self.n / 2 {
            out_mag[i] = (real[i] * real[i] + imag[i] * imag[i]).sqrt() * inv_n;
        }
    }
}

pub struct StftContext {
    window_size: usize,
    fft: FftContext,
    window: Vec<f32>,
}

impl StftContext {
    fn try_new(window_type: u32, window_size: usize, fft_size: usize) -> Result<Self, StftError> {
        let window_type = WindowType::try_from(window_type)?;
        if window_size == 0 || window_size > fft_size {
            return Err(StftError::WindowExceedsFft);
        }
        let fft = FftContext::try_new(fft_size)?;
        Ok(Self {
            window_size,
            fft,
            window: generate_window(window_type, window_size),
        })
    }
}

#[repr(C, align(8))]
struct AllocationHeader {
    allocation_size: usize,
}

#[no_mangle]
pub extern "C" fn stft_alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return std::ptr::null_mut();
    }
    let allocation_size = match size.checked_add(std::mem::size_of::<AllocationHeader>()) {
        Some(size) => size,
        None => return std::ptr::null_mut(),
    };
    let layout = match Layout::from_size_align(allocation_size, ALLOC_ALIGN) {
        Ok(layout) => layout,
        Err(_) => return std::ptr::null_mut(),
    };

    unsafe {
        let allocation = alloc(layout);
        if allocation.is_null() {
            return std::ptr::null_mut();
        }
        let header = allocation.cast::<AllocationHeader>();
        header.write(AllocationHeader { allocation_size });
        allocation.add(std::mem::size_of::<AllocationHeader>())
    }
}

#[no_mangle]
pub extern "C" fn stft_dealloc(ptr: *mut u8) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        let allocation = ptr.sub(std::mem::size_of::<AllocationHeader>());
        let allocation_size = allocation.cast::<AllocationHeader>().read().allocation_size;
        if let Ok(layout) = Layout::from_size_align(allocation_size, ALLOC_ALIGN) {
            dealloc(allocation, layout);
        }
    }
}

#[no_mangle]
pub extern "C" fn stft_context_create(
    window_type: u32,
    window_size: usize,
    fft_size: usize,
) -> *mut StftContext {
    match StftContext::try_new(window_type, window_size, fft_size) {
        Ok(context) => Box::into_raw(Box::new(context)),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn stft_context_destroy(context: *mut StftContext) {
    if !context.is_null() {
        unsafe { drop(Box::from_raw(context)) };
    }
}

#[no_mangle]
pub extern "C" fn stft_process(
    context: *const StftContext,
    samples_ptr: *const f32,
    samples_len: usize,
    hop_size: usize,
    out_mag_ptr: *mut f32,
    out_mag_len: usize,
    out_power_ptr: *mut f32,
    out_power_len: usize,
    out_db_ptr: *mut f32,
    out_db_len: usize,
) -> i32 {
    if context.is_null() {
        return STFT_ERR_NULL_POINTER;
    }
    if hop_size == 0 {
        return STFT_ERR_INVALID_ARGUMENT;
    }

    let context = unsafe { &*context };
    if samples_len < context.window_size {
        return 0;
    }
    if samples_ptr.is_null() || out_mag_ptr.is_null() {
        return STFT_ERR_NULL_POINTER;
    }

    let frame_count = (samples_len - context.window_size) / hop_size + 1;
    let bin_count = context.fft.n / 2;
    let total_bins = match frame_count.checked_mul(bin_count) {
        Some(total_bins) => total_bins,
        None => return STFT_ERR_OVERFLOW,
    };
    if frame_count > i32::MAX as usize {
        return STFT_ERR_FRAME_COUNT;
    }
    if out_mag_len < total_bins
        || (!out_power_ptr.is_null() && out_power_len < total_bins)
        || (!out_db_ptr.is_null() && out_db_len < total_bins)
        || (out_power_ptr.is_null() && out_power_len != 0)
        || (out_db_ptr.is_null() && out_db_len != 0)
    {
        return STFT_ERR_OUTPUT_TOO_SMALL;
    }

    let samples = unsafe { std::slice::from_raw_parts(samples_ptr, samples_len) };
    let out_mag = unsafe { std::slice::from_raw_parts_mut(out_mag_ptr, total_bins) };
    let mut out_power = (!out_power_ptr.is_null())
        .then(|| unsafe { std::slice::from_raw_parts_mut(out_power_ptr, total_bins) });
    let mut out_db = (!out_db_ptr.is_null())
        .then(|| unsafe { std::slice::from_raw_parts_mut(out_db_ptr, total_bins) });

    let mut frame_real_input = vec![0.0; context.fft.n];
    let mut real = vec![0.0; context.fft.n];
    let mut imag = vec![0.0; context.fft.n];
    const MIN_DB_FLOOR: f32 = 1e-12;

    for frame_idx in 0..frame_count {
        frame_real_input.fill(0.0);
        let sample_offset = frame_idx * hop_size;
        for i in 0..context.window_size {
            frame_real_input[i] = samples[sample_offset + i] * context.window[i];
        }

        let output_offset = frame_idx * bin_count;
        let magnitude = &mut out_mag[output_offset..output_offset + bin_count];
        context
            .fft
            .compute_magnitudes(&frame_real_input, &mut real, &mut imag, magnitude);

        if let Some(power) = out_power.as_deref_mut() {
            for (power, magnitude) in power[output_offset..output_offset + bin_count]
                .iter_mut()
                .zip(magnitude.iter())
            {
                *power = magnitude * magnitude;
            }
        }
        if let Some(db) = out_db.as_deref_mut() {
            for (db, magnitude) in db[output_offset..output_offset + bin_count]
                .iter_mut()
                .zip(magnitude.iter())
            {
                *db = 20.0 * magnitude.max(MIN_DB_FLOOR).log10();
            }
        }
    }

    frame_count as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_types_reject_unknown_discriminants() {
        assert_eq!(WindowType::try_from(4), Err(StftError::InvalidWindowType));
    }

    #[test]
    fn generates_expected_windows_and_degenerate_sizes() {
        assert_eq!(generate_window(WindowType::Hann, 0), Vec::<f32>::new());
        assert_eq!(generate_window(WindowType::Hann, 1), vec![1.0]);
        assert_eq!(generate_window(WindowType::Rectangular, 4), vec![1.0; 4]);

        let hamming = generate_window(WindowType::Hamming, 4);
        assert!((hamming[0] - 0.08).abs() < 1e-6);
        assert!((hamming[3] - 0.08).abs() < 1e-6);
        let blackman = generate_window(WindowType::Blackman, 4);
        assert!(blackman[0].abs() < 1e-6);
        assert!(blackman[3].abs() < 1e-6);
    }

    #[test]
    fn fft_context_rejects_invalid_sizes() {
        assert!(matches!(
            FftContext::try_new(0),
            Err(StftError::InvalidFftSize)
        ));
        assert!(matches!(
            FftContext::try_new(3),
            Err(StftError::InvalidFftSize)
        ));
        assert_eq!(FftContext::try_new(4).unwrap().n, 4);
    }

    #[test]
    fn stft_context_rejects_window_larger_than_fft() {
        assert!(matches!(
            StftContext::try_new(WindowType::Hann as u32, 8, 4),
            Err(StftError::WindowExceedsFft)
        ));
    }

    #[test]
    fn fft_magnitudes_match_impulse_response() {
        let fft = FftContext::try_new(4).unwrap();
        let mut real = vec![0.0; 4];
        let mut imag = vec![0.0; 4];
        let mut output = vec![0.0; 2];
        fft.compute_magnitudes(&[1.0, 0.0, 0.0, 0.0], &mut real, &mut imag, &mut output);
        assert!((output[0] - 0.25).abs() < 1e-6);
        assert!((output[1] - 0.25).abs() < 1e-6);
    }

    #[test]
    fn stft_process_rejects_small_output_and_computes_valid_input() {
        let context = StftContext::try_new(WindowType::Rectangular as u32, 4, 4).unwrap();
        let samples = vec![1.0; 8];
        let mut output = vec![0.0; 6];
        assert_eq!(
            stft_process(
                &context,
                samples.as_ptr(),
                samples.len(),
                2,
                output.as_mut_ptr(),
                output.len() - 1,
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                0,
            ),
            STFT_ERR_OUTPUT_TOO_SMALL
        );
        assert_eq!(
            stft_process(
                &context,
                samples.as_ptr(),
                samples.len(),
                2,
                output.as_mut_ptr(),
                output.len(),
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                0,
            ),
            3
        );
        assert!((output[0] - 1.0).abs() < 1e-6);
    }
}
