"""
brain.py — Core AI brain for Vishal
Groq (openai/gpt-oss-120b) = primary
Google Gemini (gemini-2.5-flash) = fallback
"""

import os
import logging
from dotenv import load_dotenv
from agents.personality import VISHAL_PERSONALITY

load_dotenv()

logger = logging.getLogger(__name__)

# Conversation memory
conversation_history = []
MAX_HISTORY = 10

GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.8-flash"]


def _get_groq_client():
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not set")
        return Groq(api_key=api_key)
    except Exception as e:
        logger.warning(f"Groq client init failed: {e}")
        return None


def _get_gemini_client():
    try:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        return genai
    except Exception as e:
        logger.warning(f"Gemini client init failed: {e}")
        return None


def _ask_groq(user_message: str) -> str:
    client = _get_groq_client()
    if not client:
        raise RuntimeError("Groq client unavailable")

    messages = [{"role": "system", "content": VISHAL_PERSONALITY}]
    messages.extend(conversation_history)

    last_error = None
    for model_name in GROQ_MODELS:
        try:
            logger.info(f"Sending to Groq ({model_name}), messages count: {len(messages)}")
            completion = client.chat.completions.create(
                messages=messages,
                model=model_name,
                temperature=0.7,
                max_tokens=300,
            )
            content = completion.choices[0].message.content
            if content and content.strip():
                return content.strip()
        except Exception as e:
            logger.warning(f"Groq model {model_name} failed: {e}")
            last_error = e

    raise RuntimeError(f"All Groq models failed: {last_error}")


def _ask_gemini(user_message: str) -> str:
    genai = _get_gemini_client()
    if not genai:
        raise RuntimeError("Gemini client unavailable")

    last_error = None
    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=VISHAL_PERSONALITY,
            )

            # Build chat history
            history = []
            for msg in conversation_history[:-1]:
                role = "model" if msg["role"] == "assistant" else "user"
                history.append({"role": role, "parts": [msg["content"]]})

            logger.info(f"Sending to Gemini ({model_name}), history count: {len(history)}")
            chat = model.start_chat(history=history)
            result = chat.send_message(user_message)
            if result.text and result.text.strip():
                return result.text.strip()
        except Exception as e:
            logger.warning(f"Gemini model {model_name} failed: {e}")
            last_error = e

    raise RuntimeError(f"All Gemini models failed: {last_error}")


def ask_vishal(user_message: str) -> dict:
    """Main entry point — returns {success, response, source}"""
    global conversation_history

    logger.info(f"Brain: Processing: {user_message}")

    conversation_history.append({"role": "user", "content": user_message})
    if len(conversation_history) > MAX_HISTORY:
        conversation_history = conversation_history[-MAX_HISTORY:]

    # Try Groq first
    try:
        response = _ask_groq(user_message)
        conversation_history.append({"role": "assistant", "content": response})
        logger.info(f"Groq replied: {response[:80]}")
        return {"success": True, "response": response, "source": "groq"}
    except Exception as e:
        logger.warning(f"Groq failed: {e}. Trying Gemini fallback...")

    # Gemini fallback
    try:
        response = _ask_gemini(user_message)
        conversation_history.append({"role": "assistant", "content": response})
        logger.info(f"Gemini replied: {response[:80]}")
        return {"success": True, "response": response, "source": "gemini"}
    except Exception as e:
        logger.error(f"Both APIs failed. Gemini error: {e}")
        if conversation_history and conversation_history[-1]["role"] == "user":
            conversation_history.pop()
        return {
            "success": False,
            "response": "Sorry boss, I'm having trouble connecting right now. Try again in a sec?",
            "source": "fallback",
        }


def clear_memory():
    global conversation_history
    conversation_history = []
    logger.info("Memory cleared")
