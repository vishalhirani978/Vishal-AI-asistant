"""
whisper_agent.py — Audio transcription using Groq Whisper
"""

import os
import logging
import tempfile
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """Transcribe audio bytes using Groq Whisper API."""
    try:
        from groq import Groq

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"success": False, "error": "GROQ_API_KEY not set"}

        client = Groq(api_key=api_key)

        ext = "webm" if "webm" in mime_type else "wav"
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        logger.info(f"Transcribing {len(audio_bytes)} bytes via Groq Whisper...")

        with open(tmp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3-turbo",
                language="en",
                response_format="json",
                temperature=0.0,
            )

        try:
            os.unlink(tmp_path)
        except Exception:
            pass

        text = transcription.text.strip() if transcription.text else ""
        logger.info(f"Transcription: {text}")
        return {"success": True, "text": text}

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return {"success": False, "error": str(e)}
