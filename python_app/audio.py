"""
audio.py — Microphone recording helper for voice commands
"""

import os
import io
import wave
import logging
import threading
import numpy as np

logger = logging.getLogger(__name__)


class AudioRecorder:
    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        self.sample_rate = sample_rate
        self.channels = channels
        self.is_recording = False
        self._frames = []
        self._stream = None

    def start(self):
        """Start recording microphone audio in background."""
        if self.is_recording:
            return
        
        try:
            import sounddevice as sd
            self._frames = []
            self.is_recording = True

            def callback(indata, frames, time, status):
                if status:
                    logger.warning(f"Audio record status: {status}")
                if self.is_recording:
                    self._frames.append(indata.copy())

            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="int16",
                callback=callback,
            )
            self._stream.start()
            logger.info("🎤 Audio recording started...")
        except Exception as e:
            logger.error(f"Failed to start audio recording: {e}")
            self.is_recording = False

    def stop(self) -> bytes:
        """Stop recording and return WAV audio bytes."""
        if not self.is_recording:
            return b""

        self.is_recording = False
        try:
            if self._stream:
                self._stream.stop()
                self._stream.close()
                self._stream = None
        except Exception as e:
            logger.error(f"Error stopping stream: {e}")

        if not self._frames:
            logger.warning("No audio frames recorded")
            return b""

        try:
            audio_data = np.concatenate(self._frames, axis=0)
            buffer = io.BytesIO()
            with wave.open(buffer, "wb") as wf:
                wf.setnchannels(self.channels)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(self.sample_rate)
                wf.writeframes(audio_data.tobytes())

            wav_bytes = buffer.getvalue()
            logger.info(f"🎤 Recorded {len(wav_bytes)} bytes of WAV audio")
            return wav_bytes
        except Exception as e:
            logger.error(f"Failed to encode WAV audio: {e}")
            return b""
