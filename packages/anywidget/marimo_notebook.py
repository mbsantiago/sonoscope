import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    from sonoscope import Sonoscope
    from pathlib import Path

    return Path, Sonoscope


@app.cell
def _():
    import numpy as np

    return


@app.cell
def _():
    return


@app.cell
def _(Path, Sonoscope):
    Sonoscope.from_file(
        Path("~/Datasets/martyn_cooke_2021/audio/myomys_surrey_audiomoth_1_20210608_215003_0_1000.wav").expanduser(),
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
