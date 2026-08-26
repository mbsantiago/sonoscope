import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    from sonoscope import Sonoscope
    from pathlib import Path
    import numpy as np
    import soundfile as sf

    return Sonoscope, np


@app.cell
def _(np):
    def logarithmic_chirp(t, f0, t1, f1, phi0=0):
        """
        Generate a logarithmic (geometric/exponential) chirp signal using NumPy.

        Parameters:
            t    : Array of time points (seconds)
            f0   : Start frequency at t=0 (Hz)
            t1   : Target time (seconds)
            f1   : Target frequency at t1 (Hz)
            phi0 : Initial phase in degrees (optional)
        """
        beta = np.log(f1 / f0)
        phase = 2 * np.pi * f0 * t1 * (np.power(f1 / f0, t / t1) - 1) / beta
        phase_rad = phase + np.deg2rad(phi0)
        return np.sin(phase_rad)

    # Example usage
    sample_rate = 44100
    duration = 5.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    # Sweep from 20 Hz to 20,000 Hz over 5 seconds
    signal = logarithmic_chirp(t, f0=20.0, t1=duration, f1=20000.0)
    return sample_rate, signal


@app.cell
def _(Sonoscope, sample_rate, signal):
    Sonoscope.from_array(
        audio=signal,
        sample_rate=sample_rate,
        frequency_scale="log",
        min_db=-60,
        max_db=0,
    )
    return


@app.cell
def _(Sonoscope, sample_rate, signal):
    def get_widget(min_db):
        return Sonoscope.from_array(
            audio=signal,
            sample_rate=sample_rate,
            frequency_scale="log",
            min_db=min_db,
            max_db=0,
        )

    return (get_widget,)


@app.cell
def _(get_widget):
    get_widget(-20)
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
