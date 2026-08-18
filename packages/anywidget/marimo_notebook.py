import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    from sonogram import Spectrogram

    return (Spectrogram,)


@app.cell
def _(Spectrogram):
    Spectrogram(url="https://upload.wikimedia.org/wikipedia/commons/0/01/After_You%27ve_Gone_%28Harris_1918_recording%29.wav?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original", program="dither", cmap="gray_r", min_db=-100, max_db=-20)
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
