import io
import math
import pathlib
import sys
import tempfile
import unittest
import wave

# Add src to path so sonoscope can be imported directly
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))

from sonoscope import Sonoscope, _encode_audio_to_wav


class TestSonoscopeAnywidget(unittest.TestCase):
    def test_from_url(self):
        w = Sonoscope.from_url("https://example.com/audio.wav")
        self.assertEqual(w.url, "https://example.com/audio.wav")
        self.assertEqual(len(w.audio_bytes), 0)

        w2 = Sonoscope.fromURL("https://example.com/audio2.wav")
        self.assertEqual(w2.url, "https://example.com/audio2.wav")

        w3 = Sonoscope.from_URL("https://example.com/audio3.wav")
        self.assertEqual(w3.url, "https://example.com/audio3.wav")

    def test_from_array_python_list_mono(self):
        sr = 8000
        # 1-second 440Hz sine wave as python list
        audio = [math.sin(2 * math.pi * 440 * i / sr) for i in range(sr)]
        w = Sonoscope.from_array(audio, sample_rate=sr)

        self.assertGreater(len(w.audio_bytes), 44)
        self.assertEqual(w.mime_type, "audio/wav")
        with wave.open(io.BytesIO(w.audio_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 1)
            self.assertEqual(wf.getframerate(), 8000)
            self.assertEqual(wf.getnframes(), sr)
            self.assertEqual(wf.getsampwidth(), 2)

    def test_from_array_python_list_stereo(self):
        sr = 16000
        left = [0.0] * 500
        right = [0.5] * 500
        w = Sonoscope.from_array([left, right], sample_rate=sr)
        with wave.open(io.BytesIO(w.audio_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 2)
            self.assertEqual(wf.getframerate(), 16000)
            self.assertEqual(wf.getnframes(), 500)

    def test_from_array_numpy_if_available(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy not installed")

        sr = 22050
        audio = np.sin(2 * np.pi * 440 * np.linspace(0, 1, sr, endpoint=False)).astype(np.float32)
        w = Sonoscope.from_array(audio, sample_rate=sr)

        self.assertGreater(len(w.audio_bytes), 44)
        self.assertEqual(w.mime_type, "audio/wav")
        with wave.open(io.BytesIO(w.audio_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 1)
            self.assertEqual(wf.getframerate(), 22050)
            self.assertEqual(wf.getnframes(), sr)

        # 2D stereo numpy array
        stereo = np.zeros((2, 1000), dtype=np.float32)
        w_stereo = Sonoscope.from_array(stereo, sample_rate=44100)
        with wave.open(io.BytesIO(w_stereo.audio_bytes), "rb") as wf:
            self.assertEqual(wf.getnchannels(), 2)
            self.assertEqual(wf.getframerate(), 44100)
            self.assertEqual(wf.getnframes(), 1000)

    def test_from_file(self):
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            with wave.open(temp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(b"\x00\x00" * 100)

        try:
            w = Sonoscope.from_file(temp_path)
            self.assertEqual(len(w.audio_bytes), pathlib.Path(temp_path).stat().st_size)
            self.assertEqual(w.mime_type, "audio/wav")
        finally:
            pathlib.Path(temp_path).unlink()

    def test_from_array_requires_sample_rate(self):
        with self.assertRaises(ValueError):
            Sonoscope(audio=[0.1, 0.2])
