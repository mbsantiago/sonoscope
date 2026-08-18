import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    from sonoscope import Sonoscope
    from pathlib import Path

    return (Sonoscope,)


@app.cell
def _():
    import numpy as np

    return (np,)


@app.cell
def _(np):
    sr = 22050
    y = np.sin(2 * np.pi * 440 * np.linspace(0, 5, sr * 5, endpoint=False))
    return sr, y


@app.cell
def _(Sonoscope, sr, y):
    Sonoscope.from_array(
        audio=y,
        sample_rate=sr,
        frequency_scale="linear",
        min_db=-60,
        max_db=0,
    )
    return


@app.cell
def _():
 
    return


if __name__ == "__main__":
    app.run()
