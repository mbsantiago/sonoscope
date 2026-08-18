import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    from sonoscope import Sonoscope, Spectrogram

    return (Spectrogram,)


@app.cell
def _(Spectrogram):
    Spectrogram(
        url="https://xeno-canto.org/510976/download",
        frequency_scale="linear",
        min_db=-100,
        max_db=-20,
        cmap="jet"
    )
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
