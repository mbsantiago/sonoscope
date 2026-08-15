import importlib.metadata
import pathlib

import anywidget
import traitlets

try:
    __version__ = importlib.metadata.version("sonogram")
except importlib.metadata.PackageNotFoundError:
    __version__ = "unknown"


class Spectrogram(anywidget.AnyWidget):
    _esm = pathlib.Path(__file__).parent / "static" / "widget.js"
    _css = pathlib.Path(__file__).parent / "static" / "widget.css"
    url = traitlets.Unicode().tag(sync=True)
    width = traitlets.CInt(default_value=800).tag(sync=True)
    height = traitlets.CInt(default_value=400).tag(sync=True)
    frequency_scale = traitlets.Unicode(default_value="mel").tag(sync=True)
    program = traitlets.Unicode(default_value="normal").tag(sync=True)
    cmap = traitlets.Unicode(default_value="viridis").tag(sync=True)
    min_db = traitlets.Float(default_value=-80).tag(sync=True)
    max_db = traitlets.Float(default_value=0).tag(sync=True)
    window_size = traitlets.CInt(default_value=512).tag(sync=True)
    hop_size = traitlets.CInt(default_value=128).tag(sync=True)
