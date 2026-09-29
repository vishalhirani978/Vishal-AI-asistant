"""
main.py — Main Entry Point for Vishal Python Desktop Assistant
"""

import os
import sys
import logging
import threading
from dotenv import load_dotenv

# Configure paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("VishalApp")

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QIcon, QFont

import settings as settings_mgr
from ui import CharacterOverlay, SystemTray, bridge
from agents.github_watcher import GitHubWatcher, format_notification


def setup_global_hotkeys(settings: dict):
    """Setup global hotkeys using the keyboard library in a background worker."""
    def _hotkey_worker():
        try:
            import keyboard

            chat_hk = settings.get("chat_hotkey", "ctrl+alt+v")
            voice_hk = settings.get("voice_hotkey", "ctrl+alt+space")
            gh_hk = settings.get("github_hotkey", "ctrl+alt+g")

            logger.info(f"Binding global hotkeys: Chat={chat_hk}, Voice={voice_hk}, GitHub={gh_hk}")

            keyboard.add_hotkey(chat_hk, lambda: bridge.summon_requested.emit())
            keyboard.add_hotkey(voice_hk, lambda: bridge.voice_requested.emit())
            keyboard.add_hotkey(gh_hk, lambda: bridge.github_requested.emit())

            keyboard.wait()
        except Exception as e:
            logger.warning(f"Global hotkey listener notice: {e}")

    t = threading.Thread(target=_hotkey_worker, daemon=True)
    t.start()


def setup_github_watcher(settings: dict) -> GitHubWatcher:
    """Setup GitHub background monitor thread."""
    def _on_github_event(event):
        formatted = format_notification(event)
        bridge.github_alert.emit(formatted.get("title", "GitHub Alert"), formatted.get("body", ""))

    interval = int(settings.get("github_interval", 60))
    enabled = settings.get("github_enabled", True)

    watcher = GitHubWatcher(callback=_on_github_event, interval=interval)
    if enabled:
        watcher.start()
        logger.info(f"GitHub watcher started with interval {interval}s")
    return watcher


def main():
    logger.info("Starting Vishal Python Desktop Assistant...")

    # Enable High DPI scaling
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    # App icon
    icon_path = os.path.join(BASE_DIR, "assets", "icon.ico")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))

    # App-wide font
    font = QFont("Segoe UI", 10)
    app.setFont(font)

    # Load settings
    settings = settings_mgr.load_settings()

    # Create overlay
    overlay = CharacterOverlay()
    overlay.show()

    # Create system tray
    tray = SystemTray(overlay, app)

    # Setup global hotkeys
    setup_global_hotkeys(settings)

    # Setup GitHub watcher
    watcher = setup_github_watcher(settings)

    logger.info("Vishal Assistant is now running and live on your desktop!")
    
    exit_code = app.exec()
    watcher.stop()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
