"""
settings.py — Application settings persistence
"""

import os
import json
import logging

logger = logging.getLogger(__name__)

SETTINGS_DIR = os.path.join(os.path.expanduser("~"), "AppData", "Local", "PixelPM")
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")

DEFAULT_SETTINGS = {
    "position": {"x": None, "y": None},
    "snoozed_until": None,
    "personality": "friendly",
    "char_scale": 1.0,
    "chat_hotkey": "ctrl+alt+v",
    "github_hotkey": "ctrl+alt+g",
    "voice_hotkey": "ctrl+alt+space",
    "github_enabled": True,
    "github_interval": 60,
    "github_username": os.getenv("GITHUB_USERNAME", ""),
    "notify_pr": True,
    "notify_issues": True,
    "notify_mentions": True,
    "notify_builds": True,
    "auto_start": False,
    "voice_enabled": False,
}


def load_settings() -> dict:
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            merged = {**DEFAULT_SETTINGS, **saved}
            return merged
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
    return dict(DEFAULT_SETTINGS)


def save_settings(settings: dict) -> bool:
    try:
        os.makedirs(SETTINGS_DIR, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
        logger.info("Settings saved")
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False


def get_settings_path() -> str:
    return SETTINGS_FILE
