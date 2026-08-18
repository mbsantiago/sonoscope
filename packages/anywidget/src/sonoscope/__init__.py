import importlib.metadata
import pathlib

import anywidget
import traitlets

try:
    __version__ = importlib.metadata.version("sonoscope")
except importlib.metadata.PackageNotFoundError:
    __version__ = "unknown"


class Sonoscope(anywidget.AnyWidget):
    """High-performance audio visualization widget with coordinated Spectrogram, Waveform, Frequency Ruler, and Time Ruler."""

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

    # Frequency Ruler traitlets
    show_frequency_ruler = traitlets.Bool(default_value=True).tag(sync=True)
    freq_ruler_program = traitlets.Unicode(default_value="ticks").tag(sync=True)
    freq_ruler_width = traitlets.CInt(default_value=56).tag(sync=True)

    # Time Ruler traitlets
    show_time_ruler = traitlets.Bool(default_value=True).tag(sync=True)
    time_ruler_program = traitlets.Unicode(default_value="ticks").tag(sync=True)
    time_ruler_height = traitlets.CInt(default_value=24).tag(sync=True)

    # Waveform traitlets
    show_waveform = traitlets.Bool(default_value=True).tag(sync=True)
    waveform_height = traitlets.CInt(default_value=80).tag(sync=True)

    # Playback follow traitlet
    follow_playback = traitlets.Unicode(default_value="page").tag(sync=True)


# Keep Spectrogram as an alias for backwards compatibility
Spectrogram = Sonoscope
