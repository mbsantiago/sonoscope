import importlib.metadata
import io
import pathlib
import struct
import wave
from typing import Any, Sequence, Union

import anywidget
import traitlets

try:
    __version__ = importlib.metadata.version("sonoscope")
except importlib.metadata.PackageNotFoundError:
    __version__ = "unknown"


def _detect_mime_type(path: pathlib.Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".wav", ".wave"):
        return "audio/wav"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix in (".ogg", ".oga"):
        return "audio/ogg"
    if suffix == ".flac":
        return "audio/flac"
    if suffix in (".m4a", ".aac"):
        return "audio/mp4"
    return "audio/wav"


def _encode_audio_to_wav(audio: Any, sample_rate: int) -> bytes:
    """Encode a 1D or 2D audio array/sequence into 16-bit PCM WAV bytes."""
    if sample_rate <= 0:
        raise ValueError(f"Invalid sample_rate: {sample_rate}")

    # Check if numpy is available and audio is an ndarray
    try:
        import numpy as np

        if isinstance(audio, np.ndarray):
            if audio.ndim == 1:
                channels = 1
                n_samples = len(audio)
                if audio.dtype in (np.float32, np.float64):
                    clamped = np.clip(audio, -1.0, 1.0)
                    pcm16 = (clamped * 32767.0).astype(np.int16)
                elif audio.dtype == np.int16:
                    pcm16 = audio
                else:
                    pcm16 = audio.astype(np.int16)
                raw_bytes = pcm16.tobytes()
            elif audio.ndim == 2:
                # Shape can be (channels, samples) or (samples, channels)
                if audio.shape[0] <= 8 and audio.shape[0] < audio.shape[1]:
                    channels = audio.shape[0]
                    n_samples = audio.shape[1]
                    # Transpose to (samples, channels) for interleaving
                    audio_transposed = audio.T
                else:
                    channels = audio.shape[1]
                    n_samples = audio.shape[0]
                    audio_transposed = audio

                if audio_transposed.dtype in (np.float32, np.float64):
                    clamped = np.clip(audio_transposed, -1.0, 1.0)
                    pcm16 = (clamped * 32767.0).astype(np.int16)
                elif audio_transposed.dtype == np.int16:
                    pcm16 = audio_transposed
                else:
                    pcm16 = audio_transposed.astype(np.int16)
                raw_bytes = pcm16.tobytes()
            else:
                raise ValueError(f"Audio array must be 1D or 2D, got {audio.ndim}D")

            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(channels)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.setnframes(n_samples)
                wf.writeframes(raw_bytes)
            return buf.getvalue()
    except ImportError:
        pass

    # Pure python sequence fallback
    if isinstance(audio, (list, tuple)):
        if len(audio) > 0 and isinstance(audio[0], (list, tuple)):
            # 2D list: [[ch0...], [ch1...]]
            channels = len(audio)
            n_samples = len(audio[0])
            pcm_frames = bytearray()
            for i in range(n_samples):
                for ch in range(channels):
                    sample = max(-1.0, min(1.0, float(audio[ch][i])))
                    int16 = int(sample * 32767.0)
                    pcm_frames.extend(struct.pack("<h", int16))
        else:
            channels = 1
            n_samples = len(audio)
            pcm_frames = bytearray()
            for val in audio:
                sample = max(-1.0, min(1.0, float(val)))
                int16 = int(sample * 32767.0)
                pcm_frames.extend(struct.pack("<h", int16))

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.setnframes(n_samples)
            wf.writeframes(pcm_frames)
        return buf.getvalue()

    raise TypeError(f"Unsupported audio data type: {type(audio)}")


class Sonoscope(anywidget.AnyWidget):
    """High-performance audio visualization widget with coordinated Spectrogram, Waveform, Frequency Ruler, and Time Ruler."""

    _esm = pathlib.Path(__file__).parent / "static" / "widget.js"
    _css = pathlib.Path(__file__).parent / "static" / "widget.css"

    url = traitlets.Unicode(default_value="").tag(sync=True)
    audio_bytes = traitlets.Bytes(default_value=b"").tag(sync=True)
    mime_type = traitlets.Unicode(default_value="audio/wav").tag(sync=True)

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
    freq_ruler_renderer = traitlets.Unicode(default_value="ticks").tag(sync=True)
    freq_ruler_width = traitlets.CInt(default_value=56).tag(sync=True)

    # Time Ruler traitlets
    show_time_ruler = traitlets.Bool(default_value=True).tag(sync=True)
    time_ruler_renderer = traitlets.Unicode(default_value="ticks").tag(sync=True)
    time_ruler_height = traitlets.CInt(default_value=24).tag(sync=True)

    # Waveform traitlets
    show_waveform = traitlets.Bool(default_value=True).tag(sync=True)
    waveform_height = traitlets.CInt(default_value=80).tag(sync=True)

    # Playback follow traitlet
    follow_playback = traitlets.Unicode(default_value="page").tag(sync=True)

    def __init__(
        self,
        *args: Any,
        url: str = "",
        path: Union[str, pathlib.Path, None] = None,
        audio: Any = None,
        sample_rate: Union[int, None] = None,
        **kwargs: Any,
    ):
        if path is not None:
            p = pathlib.Path(path)
            kwargs["audio_bytes"] = p.read_bytes()
            kwargs["mime_type"] = _detect_mime_type(p)
        elif audio is not None:
            if sample_rate is None:
                raise ValueError("sample_rate is required when providing audio data as an array")
            kwargs["audio_bytes"] = _encode_audio_to_wav(audio, sample_rate)
            kwargs["mime_type"] = "audio/wav"
        elif url:
            kwargs["url"] = url

        super().__init__(*args, **kwargs)

    @classmethod
    def from_file(
        cls,
        path: Union[str, pathlib.Path],
        **kwargs: Any,
    ) -> "Sonoscope":
        """Create a Sonoscope widget from a local audio file path."""
        return cls(path=path, **kwargs)

    @classmethod
    def from_array(
        cls,
        audio: Any,
        sample_rate: int,
        **kwargs: Any,
    ) -> "Sonoscope":
        """Create a Sonoscope widget from audio samples (NumPy array or sequence) and sample rate."""
        return cls(audio=audio, sample_rate=sample_rate, **kwargs)

    @classmethod
    def from_url(
        cls,
        url: str,
        **kwargs: Any,
    ) -> "Sonoscope":
        """Create a Sonoscope widget from a remote audio URL."""
        return cls(url=url, **kwargs)


# Keep Spectrogram as an alias for backwards compatibility
Spectrogram = Sonoscope


