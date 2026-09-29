"""
ui.py — PyQt6 Desktop Assistant UI for Vishal (Light Responsive Theme + Dynamic Scaling)
"""

import os
import sys
import math
import time
import logging
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from PyQt6.QtCore import (
    Qt, QPoint, QSize, QTimer, pyqtSignal, QObject, QRect, QPropertyAnimation,
    QEasingCurve, pyqtProperty
)
from PyQt6.QtGui import (
    QPixmap, QPainter, QColor, QFont, QIcon, QAction, QCursor, QKeySequence,
    QLinearGradient, QBrush, QPen
)
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QLineEdit, QPushButton, QVBoxLayout,
    QHBoxLayout, QTextEdit, QScrollArea, QFrame, QMenu, QSystemTrayIcon,
    QDialog, QTabWidget, QCheckBox, QSpinBox, QDoubleSpinBox, QFormLayout,
    QMessageBox, QTableWidget, QTableWidgetItem, QHeaderView, QGraphicsDropShadowEffect,
    QSizePolicy
)

from agents import brain, intent_parser, tools, whisper_agent, contacts, system_agent
from agents.github_watcher import GitHubWatcher, format_notification
import settings as settings_mgr
from audio import AudioRecorder

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")

POSE_FILES = {
    "idle": "character-casual.png",
    "casual": "character-casual.png",
    "thinking": "character-thinking.png",
    "pointingRight": "character-pointing-right.png",
    "pointingLeft": "character-pointing-left.png",
    "excited": "character-excited.png",
    "thumbsUp": "character-thumbs-up.png",
    "waving": "character-waving.png",
    "laptop": "character-laptop.png",
    "ok": "character-ok.png",
    "armsCrossed": "character-arms-crossed.png",
    "phone": "character-phone.png",
    "headphones": "character-headphones.png",
    "presenting": "character-presenting.png",
}


class SignalBridge(QObject):
    """Thread-safe signal dispatcher for UI updates."""
    chat_response = pyqtSignal(str, str)           # response_text, source
    tool_confirmation = pyqtSignal(str, dict, str) # action, params, description
    tool_executed = pyqtSignal(bool, str)          # success, message
    voice_transcribed = pyqtSignal(str)            # transcribed_text
    voice_error = pyqtSignal(str)                  # error message
    github_alert = pyqtSignal(str, str)            # title, message
    mood_change = pyqtSignal(str, int)             # mood_name, duration_ms
    change_scale = pyqtSignal(float, bool)         # value, is_delta
    summon_requested = pyqtSignal()
    voice_requested = pyqtSignal()
    github_requested = pyqtSignal()


bridge = SignalBridge()


class ThoughtBubble(QFrame):
    """Modern, responsive Light Theme Thought/Chat Bubble for Vishal."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.SubWindow
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        
        # Responsive sizing constraints
        self.setMinimumWidth(320)
        self.setMaximumWidth(420)
        self.resize(360, 320)
        self.setMinimumHeight(240)
        self.setMaximumHeight(500)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Expanding)

        self.pending_tool = None
        self.pending_params = {}

        self.init_ui()

    def init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(10, 10, 10, 10)
        main_layout.setSpacing(0)

        # Card container with clean light theme styling
        self.card = QFrame(self)
        self.card.setObjectName("card")
        self.card.setStyleSheet("""
            QFrame#card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 18px;
            }
        """)
        card_layout = QVBoxLayout(self.card)
        card_layout.setContentsMargins(14, 14, 14, 14)
        card_layout.setSpacing(10)

        # Header Row
        header_layout = QHBoxLayout()
        header_layout.setContentsMargins(0, 0, 0, 0)
        header_layout.setSpacing(8)

        self.avatar_badge = QLabel("✨", self.card)
        self.avatar_badge.setStyleSheet("font-size: 16px;")

        self.title_label = QLabel("Vishal", self.card)
        self.title_label.setStyleSheet("color: #0f172a; font-weight: 700; font-size: 14px;")

        self.status_dot = QLabel("●", self.card)
        self.status_dot.setStyleSheet("color: #10b981; font-size: 10px; margin-left: 2px;")

        self.status_label = QLabel("Ready", self.card)
        self.status_label.setStyleSheet("color: #64748b; font-size: 11px;")

        self.close_btn = QPushButton("✕", self.card)
        self.close_btn.setFixedSize(24, 24)
        self.close_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.close_btn.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #64748b;
                border: none;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: #fee2e2;
                color: #ef4444;
            }
        """)
        self.close_btn.clicked.connect(self.hide_bubble)

        header_layout.addWidget(self.avatar_badge)
        header_layout.addWidget(self.title_label)
        header_layout.addWidget(self.status_dot)
        header_layout.addWidget(self.status_label)
        header_layout.addStretch()
        header_layout.addWidget(self.close_btn)
        card_layout.addLayout(header_layout)

        # Scrollable Chat Area
        self.scroll_area = QScrollArea(self.card)
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setStyleSheet("""
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                border: none;
                background: #f8fafc;
                width: 6px;
                border-radius: 3px;
            }
            QScrollBar::handle:vertical {
                background: #cbd5e1;
                border-radius: 3px;
            }
            QScrollBar::handle:vertical:hover {
                background: #94a3b8;
            }
        """)

        self.messages_container = QWidget()
        self.messages_container.setStyleSheet("background: transparent;")
        self.messages_layout = QVBoxLayout(self.messages_container)
        self.messages_layout.setContentsMargins(2, 4, 2, 4)
        self.messages_layout.setSpacing(8)
        self.messages_layout.addStretch()
        self.scroll_area.setWidget(self.messages_container)
        card_layout.addWidget(self.scroll_area, 1)

        # Confirmation Action Card (Light theme)
        self.confirm_box = QFrame(self.card)
        self.confirm_box.setObjectName("confirm_box")
        self.confirm_box.setStyleSheet("""
            QFrame#confirm_box {
                background: #f8fafc;
                border: 1px solid #bfdbfe;
                border-radius: 12px;
                padding: 6px;
            }
        """)
        confirm_layout = QVBoxLayout(self.confirm_box)
        confirm_layout.setContentsMargins(10, 10, 10, 10)
        confirm_layout.setSpacing(8)

        self.confirm_title = QLabel("⚡ Confirm Action", self.confirm_box)
        self.confirm_title.setStyleSheet("color: #1e40af; font-weight: 700; font-size: 12px;")
        
        self.confirm_desc = QLabel("", self.confirm_box)
        self.confirm_desc.setWordWrap(True)
        self.confirm_desc.setStyleSheet("color: #334155; font-size: 11px;")

        btn_row = QHBoxLayout()
        btn_row.setSpacing(8)

        self.btn_yes = QPushButton("✅ Yes, Do It", self.confirm_box)
        self.btn_yes.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.btn_yes.setStyleSheet("""
            QPushButton {
                background: #10b981;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 6px 14px;
                font-weight: 600;
                font-size: 11px;
            }
            QPushButton:hover {
                background: #059669;
            }
        """)
        self.btn_yes.clicked.connect(self.on_confirm_yes)

        self.btn_no = QPushButton("❌ Cancel", self.confirm_box)
        self.btn_no.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.btn_no.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 6px 14px;
                font-weight: 600;
                font-size: 11px;
            }
            QPushButton:hover {
                background: #fee2e2;
                color: #dc2626;
                border-color: #fca5a5;
            }
        """)
        self.btn_no.clicked.connect(self.on_confirm_no)

        btn_row.addWidget(self.btn_yes)
        btn_row.addWidget(self.btn_no)

        confirm_layout.addWidget(self.confirm_title)
        confirm_layout.addWidget(self.confirm_desc)
        confirm_layout.addLayout(btn_row)
        self.confirm_box.hide()
        card_layout.addWidget(self.confirm_box)

        # Quick Suggestion Chips (Clean light pills)
        chips_layout = QHBoxLayout()
        chips_layout.setSpacing(6)
        chips = [
            ("🔍 Search", "Search Google for latest tech news"),
            ("▶️ YouTube", "Open YouTube"),
            ("📸 Screen", "What's on my screen?"),
        ]
        for label, prompt in chips:
            btn = QPushButton(label, self.card)
            btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn.setStyleSheet("""
                QPushButton {
                    background: #f8fafc;
                    color: #475569;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 3px 10px;
                    font-size: 11px;
                    font-weight: 500;
                }
                QPushButton:hover {
                    background: #eff6ff;
                    color: #2563eb;
                    border-color: #bfdbfe;
                }
            """)
            btn.clicked.connect(lambda checked, p=prompt: self.send_user_message(p))
            chips_layout.addWidget(btn)
        chips_layout.addStretch()
        card_layout.addLayout(chips_layout)

        # Input Row
        input_layout = QHBoxLayout()
        input_layout.setSpacing(6)

        self.input_field = QLineEdit(self.card)
        self.input_field.setPlaceholderText("Ask Vishal or give a command...")
        self.input_field.setStyleSheet("""
            QLineEdit {
                background: #f8fafc;
                color: #0f172a;
                border: 1.5px solid #e2e8f0;
                border-radius: 10px;
                padding: 7px 12px;
                font-size: 12px;
            }
            QLineEdit:focus {
                background: #ffffff;
                border: 1.5px solid #2563eb;
            }
        """)
        self.input_field.returnPressed.connect(self.on_submit_input)

        self.mic_btn = QPushButton("🎙️", self.card)
        self.mic_btn.setFixedSize(34, 34)
        self.mic_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.mic_btn.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #2563eb;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                font-size: 14px;
            }
            QPushButton:hover {
                background: #e2e8f0;
            }
        """)
        self.mic_btn.clicked.connect(self.toggle_voice_recording)

        self.send_btn = QPushButton("➤", self.card)
        self.send_btn.setFixedSize(34, 34)
        self.send_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.send_btn.setStyleSheet("""
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 13px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: #1d4ed8;
            }
        """)
        self.send_btn.clicked.connect(self.on_submit_input)

        input_layout.addWidget(self.input_field, 1)
        input_layout.addWidget(self.mic_btn)
        input_layout.addWidget(self.send_btn)
        card_layout.addLayout(input_layout)

        main_layout.addWidget(self.card)

        # Soft Shadow Effect
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(24)
        shadow.setColor(QColor(15, 23, 42, 45))
        shadow.setOffset(0, 6)
        self.card.setGraphicsEffect(shadow)

        # Audio recorder
        self.recorder = AudioRecorder()
        self.is_recording = False

        # Welcome message
        self.add_message("assistant", "Hey boss! I'm Vishal, your desktop AI assistant. How can I help you?")

    def add_message(self, sender: str, text: str):
        """Append a modern styled chat message."""
        bubble = QFrame(self.messages_container)
        bubble_layout = QVBoxLayout(bubble)
        bubble_layout.setContentsMargins(10, 8, 10, 8)

        msg_label = QLabel(text, bubble)
        msg_label.setWordWrap(True)
        msg_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)

        if sender == "user":
            bubble.setStyleSheet("""
                background: #2563eb;
                border-radius: 12px;
                border-bottom-right-radius: 2px;
            """)
            msg_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: 500;")
            bubble_layout.addWidget(msg_label)

            row = QHBoxLayout()
            row.setContentsMargins(0, 0, 0, 0)
            row.addStretch()
            row.addWidget(bubble)
            self.messages_layout.insertLayout(self.messages_layout.count() - 1, row)
        else:
            bubble.setStyleSheet("""
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                border-bottom-left-radius: 2px;
            """)
            msg_label.setStyleSheet("color: #0f172a; font-size: 12px; line-height: 1.4;")
            bubble_layout.addWidget(msg_label)

            row = QHBoxLayout()
            row.setContentsMargins(0, 0, 0, 0)
            row.addWidget(bubble)
            row.addStretch()
            self.messages_layout.insertLayout(self.messages_layout.count() - 1, row)

        QTimer.singleShot(60, self.scroll_to_bottom)

    def scroll_to_bottom(self):
        vsb = self.scroll_area.verticalScrollBar()
        vsb.setValue(vsb.maximum())

    def on_submit_input(self):
        text = self.input_field.text().strip()
        if not text:
            return
        self.input_field.clear()
        self.send_user_message(text)

    def send_user_message(self, text: str):
        self.add_message("user", text)
        self.confirm_box.hide()
        self.status_label.setText("Thinking...")
        self.status_dot.setStyleSheet("color: #f59e0b; font-size: 10px;")
        bridge.mood_change.emit("thinking", 4000)

        threading.Thread(target=self._process_message_async, args=(text,), daemon=True).start()

    def _process_message_async(self, text: str):
        try:
            intent = intent_parser.parse_intent(text)
            action = intent.get("action", "chat")
            params = intent.get("params", {})

            if action == "chat":
                res = brain.ask_vishal(text)
                response_text = res.get("response", "I'm not sure how to answer that boss.")
                source = res.get("source", "groq")
                bridge.chat_response.emit(response_text, source)
            elif action == "set_character_scale":
                if "scale" in params:
                    bridge.change_scale.emit(float(params["scale"]), False)
                    bridge.tool_executed.emit(True, f"Character size set to {int(params['scale']*100)}%!")
                elif "delta" in params:
                    bridge.change_scale.emit(float(params["delta"]), True)
                    bridge.tool_executed.emit(True, "Character size updated!")
            elif action == "check_github":
                res = tools.execute_tool("check_github", {})
                msg = res.get("message", "GitHub checked.")
                bridge.tool_executed.emit(res.get("success", False), msg)
            elif action == "open_youtube":
                res = tools.execute_tool("open_youtube", params)
                bridge.tool_executed.emit(res.get("success", True), res.get("message", "Opened YouTube!"))
            elif action == "google_search":
                res = tools.execute_tool("google_search", params)
                bridge.tool_executed.emit(res.get("success", True), res.get("message", f"Searched Google for '{params.get('query')}'"))
            else:
                desc = self._build_tool_desc(action, params)
                bridge.tool_confirmation.emit(action, params, desc)
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            bridge.chat_response.emit(f"Error: {str(e)}", "error")

    def _build_tool_desc(self, action: str, params: dict) -> str:
        if action == "open_url":
            return f"Open website: {params.get('url', 'URL')}"
        elif action == "open_gmail":
            return "Open Gmail in browser"
        elif action == "send_email":
            return f"Send email to '{params.get('to', '')}':\nSubject: {params.get('subject', '(no subject)')}"
        elif action == "check_email_inbox":
            return "Check Gmail inbox for unread messages"
        elif action == "get_unread_emails":
            return "Fetch unread emails list from Gmail"
        elif action == "search_emails":
            return f"Search emails for '{params.get('query', '')}'"
        elif action == "add_contact":
            return f"Add contact: {params.get('name')} ({params.get('phone', '')}, {params.get('email', '')})"
        elif action == "list_contacts":
            return "Display all contacts from contact book"
        elif action == "remove_contact":
            return f"Remove contact: {params.get('name')}"
        elif action == "search_contact":
            return f"Find contact info for '{params.get('query')}'"
        elif action == "system_shutdown":
            mins = params.get("minutes", 0)
            return f"Shutdown PC in {mins} minutes" if mins > 0 else "Shutdown PC immediately"
        elif action == "system_restart":
            mins = params.get("minutes", 0)
            return f"Restart PC in {mins} minutes" if mins > 0 else "Restart PC immediately"
        elif action == "system_cancel_shutdown":
            return "Cancel scheduled shutdown or restart"
        elif action == "system_lock":
            return "Lock Windows screen now"
        elif action == "system_sleep":
            return "Put computer to sleep"
        elif action == "system_volume":
            return f"Set system volume to {params.get('level')}%"
        elif action == "system_mute":
            return "Toggle system mute/unmute"
        elif action == "analyze_screen":
            q = params.get("question")
            return f"Take screenshot & analyze: '{q}'" if q else "Take screenshot & analyze screen content"
        return f"Execute tool '{action}' with parameters: {params}"

    def show_tool_confirmation(self, action: str, params: dict, desc: str):
        self.pending_tool = action
        self.pending_params = params
        self.confirm_desc.setText(desc)
        self.confirm_box.show()
        self.status_label.setText("Confirmation Needed")
        self.status_dot.setStyleSheet("color: #3b82f6; font-size: 10px;")
        bridge.mood_change.emit("pointingRight", 10000)
        self.scroll_to_bottom()

    def on_confirm_yes(self):
        if not self.pending_tool:
            return
        action = self.pending_tool
        params = self.pending_params
        self.confirm_box.hide()
        self.status_label.setText("Executing...")
        self.status_dot.setStyleSheet("color: #f59e0b; font-size: 10px;")
        bridge.mood_change.emit("excited", 3000)

        threading.Thread(target=self._execute_tool_async, args=(action, params), daemon=True).start()

    def on_confirm_no(self):
        self.pending_tool = None
        self.pending_params = {}
        self.confirm_box.hide()
        self.status_label.setText("Ready")
        self.status_dot.setStyleSheet("color: #10b981; font-size: 10px;")
        self.add_message("assistant", "👍 Action cancelled, boss.")
        bridge.mood_change.emit("ok", 2000)

    def _execute_tool_async(self, action: str, params: dict):
        try:
            res = tools.execute_tool(action, params)
            success = res.get("success", False)
            msg = res.get("message") or res.get("error") or str(res)
            bridge.tool_executed.emit(success, msg)
        except Exception as e:
            logger.error(f"Tool execution error: {e}")
            bridge.tool_executed.emit(False, str(e))

    def toggle_voice_recording(self):
        if not self.is_recording:
            self.is_recording = True
            self.mic_btn.setText("⏹️")
            self.mic_btn.setStyleSheet("""
                QPushButton {
                    background: #ef4444;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 14px;
                }
            """)
            self.status_label.setText("Listening...")
            self.status_dot.setStyleSheet("color: #ef4444; font-size: 10px;")
            bridge.mood_change.emit("headphones", 15000)
            self.recorder.start()
        else:
            self.is_recording = False
            self.mic_btn.setText("🎙️")
            self.mic_btn.setStyleSheet("""
                QPushButton {
                    background: #f1f5f9;
                    color: #2563eb;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 14px;
                }
            """)
            self.status_label.setText("Transcribing...")
            self.status_dot.setStyleSheet("color: #f59e0b; font-size: 10px;")
            bridge.mood_change.emit("thinking", 4000)
            
            def _transcribe():
                wav_bytes = self.recorder.stop()
                if not wav_bytes:
                    bridge.voice_error.emit("No audio recorded")
                    return
                res = whisper_agent.transcribe_audio(wav_bytes, "audio/wav")
                if res.get("success"):
                    bridge.voice_transcribed.emit(res.get("text", ""))
                else:
                    bridge.voice_error.emit(res.get("error", "Transcription failed"))

            threading.Thread(target=_transcribe, daemon=True).start()

    def hide_bubble(self):
        self.hide()


class CharacterOverlay(QWidget):
    """Transparent, frameless, draggable desktop character overlay with dynamic scaling."""
    def __init__(self):
        super().__init__()
        self.settings = settings_mgr.load_settings()

        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating, True)

        self.current_mood = "idle"
        self.pixmaps = {}
        
        # Scale & Dimensions
        self.scale_factor = float(self.settings.get("char_scale", 1.0))
        self.base_width = int(140 * self.scale_factor)
        self.base_height = int(180 * self.scale_factor)
        self.setFixedSize(self.base_width, self.base_height)

        self.load_sprites()

        # Dragging state
        self.dragging = False
        self.drag_position = QPoint()

        # Idle bobbing animation
        self.bob_offset = 0
        self.bob_phase = 0.0
        self.bob_timer = QTimer(self)
        self.bob_timer.timeout.connect(self._update_bobbing)
        self.bob_timer.start(50)

        # Mood reset timer
        self.mood_reset_timer = QTimer(self)
        self.mood_reset_timer.setSingleShot(True)
        self.mood_reset_timer.timeout.connect(lambda: self.set_mood("idle"))

        # Thought bubble instance
        self.bubble = ThoughtBubble()

        # Connect signals
        bridge.chat_response.connect(self.on_chat_response)
        bridge.tool_confirmation.connect(self.on_tool_confirmation)
        bridge.tool_executed.connect(self.on_tool_executed)
        bridge.voice_transcribed.connect(self.on_voice_transcribed)
        bridge.voice_error.connect(self.on_voice_error)
        bridge.github_alert.connect(self.on_github_alert)
        bridge.mood_change.connect(self.set_mood)
        bridge.change_scale.connect(self.on_change_scale_signal)
        bridge.summon_requested.connect(self.summon_chat)
        bridge.voice_requested.connect(self.bubble.toggle_voice_recording)
        bridge.github_requested.connect(self.check_github_now)

        self.restore_saved_position()

    def set_scale(self, scale: float):
        """Set character scale factor and resize widget immediately."""
        self.scale_factor = max(0.4, min(3.0, round(float(scale), 2)))
        self.base_width = int(140 * self.scale_factor)
        self.base_height = int(180 * self.scale_factor)
        
        # Reposition to keep center stable
        center_x = self.x() + self.width() // 2
        center_y = self.y() + self.height() // 2
        
        self.setFixedSize(self.base_width, self.base_height)
        
        screen = QApplication.primaryScreen().geometry()
        new_x = max(0, min(center_x - self.base_width // 2, screen.width() - self.base_width))
        new_y = max(0, min(center_y - self.base_height // 2, screen.height() - self.base_height))
        self.move(int(new_x), int(new_y))

        self.settings["char_scale"] = self.scale_factor
        settings_mgr.save_settings(self.settings)

        self.update_bubble_position()
        self.update()
        logger.info(f"Character scale updated to {self.scale_factor} (size: {self.base_width}x{self.base_height})")

    def on_change_scale_signal(self, val: float, is_delta: bool):
        if is_delta:
            self.set_scale(self.scale_factor + val)
        else:
            self.set_scale(val)

    def wheelEvent(self, event):
        """Ctrl + Mouse Wheel to dynamically scale character size."""
        modifiers = QApplication.keyboardModifiers()
        if modifiers == Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta > 0:
                self.set_scale(self.scale_factor + 0.1)
            elif delta < 0:
                self.set_scale(self.scale_factor - 0.1)
            event.accept()
        else:
            super().wheelEvent(event)

    def load_sprites(self):
        for mood, filename in POSE_FILES.items():
            path = os.path.join(ASSETS_DIR, filename)
            if not os.path.exists(path):
                path = os.path.join(BASE_DIR, filename)
            if os.path.exists(path):
                pm = QPixmap(path)
                if not pm.isNull():
                    self.pixmaps[mood] = pm

        if "idle" not in self.pixmaps and self.pixmaps:
            self.pixmaps["idle"] = next(iter(self.pixmaps.values()))

    def restore_saved_position(self):
        pos = self.settings.get("position", {})
        x = pos.get("x")
        y = pos.get("y")
        screen = QApplication.primaryScreen().geometry()

        if x is None or y is None:
            x = screen.width() - self.width() - 40
            y = screen.height() - self.height() - 80

        x = max(0, min(x, screen.width() - self.width()))
        y = max(0, min(y, screen.height() - self.height()))

        self.move(int(x), int(y))
        self.update_bubble_position()

    def save_position(self):
        pos = {"x": self.x(), "y": self.y()}
        self.settings["position"] = pos
        settings_mgr.save_settings(self.settings)

    def update_bubble_position(self):
        if not self.bubble:
            return
        
        screen = QApplication.primaryScreen().geometry()
        bubble_w = self.bubble.width()
        bubble_h = self.bubble.height()

        if self.x() > bubble_w + 20:
            bx = self.x() - bubble_w - 10
        else:
            bx = self.x() + self.width() + 10

        by = self.y() - 40
        by = max(10, min(by, screen.height() - bubble_h - 40))

        self.bubble.move(int(bx), int(by))

    def set_mood(self, mood: str, duration_ms: int = 0):
        if mood in self.pixmaps:
            self.current_mood = mood
            self.update()
            if duration_ms > 0:
                self.mood_reset_timer.stop()
                self.mood_reset_timer.start(duration_ms)

    def _update_bobbing(self):
        self.bob_phase += 0.1
        self.bob_offset = int(3 * math.sin(self.bob_phase))
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)

        pixmap = self.pixmaps.get(self.current_mood) or self.pixmaps.get("idle")
        if pixmap:
            scaled = pixmap.scaled(
                self.width(),
                self.height() - 10,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
            x = (self.width() - scaled.width()) // 2
            y = (self.height() - scaled.height()) // 2 + self.bob_offset
            painter.drawPixmap(x, y, scaled)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.dragging = True
            self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()
        elif event.button() == Qt.MouseButton.RightButton:
            self.show_context_menu(event.globalPosition().toPoint())

    def mouseMoveEvent(self, event):
        if self.dragging and event.buttons() == Qt.MouseButton.LeftButton:
            new_pos = event.globalPosition().toPoint() - self.drag_position
            screen = QApplication.primaryScreen().geometry()
            nx = max(0, min(new_pos.x(), screen.width() - self.width()))
            ny = max(0, min(new_pos.y(), screen.height() - self.height()))
            self.move(nx, ny)
            self.update_bubble_position()
            event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.dragging = False
            self.save_position()
            self.summon_chat()
            event.accept()

    def summon_chat(self):
        self.update_bubble_position()
        self.bubble.show()
        self.bubble.raise_()
        self.bubble.input_field.setFocus()
        self.set_mood("waving", 2000)

    def show_context_menu(self, pos: QPoint):
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background: #ffffff;
                color: #0f172a;
                border: 1px solid #e2e8f0;
                padding: 4px;
            }
            QMenu::item {
                padding: 6px 20px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background: #eff6ff;
                color: #2563eb;
            }
        """)

        chat_act = menu.addAction("💬 Chat with Vishal (Ctrl+Alt+V)")
        chat_act.triggered.connect(self.summon_chat)

        voice_act = menu.addAction("🎙️ Voice Input (Ctrl+Alt+Space)")
        voice_act.triggered.connect(self.bubble.toggle_voice_recording)

        github_act = menu.addAction("🐙 Check GitHub (Ctrl+Alt+G)")
        github_act.triggered.connect(self.check_github_now)

        screen_act = menu.addAction("📸 Analyze Screen")
        screen_act.triggered.connect(lambda: self.bubble.send_user_message("What is currently on my screen?"))

        # Character Size Submenu
        size_menu = menu.addMenu("🔍 Character Size")
        size_menu.setStyleSheet(menu.styleSheet())
        
        for name, scale_val in [
            ("75% (Small)", 0.75),
            ("100% (Default)", 1.0),
            ("125% (Medium)", 1.25),
            ("150% (Large)", 1.5),
            ("200% (Extra Large)", 2.0),
        ]:
            act = size_menu.addAction(name)
            act.triggered.connect(lambda chk, s=scale_val: self.set_scale(s))

        size_menu.addSeparator()
        inc_act = size_menu.addAction("➕ Increase Size (+20%)")
        inc_act.triggered.connect(lambda: self.set_scale(self.scale_factor + 0.2))
        dec_act = size_menu.addAction("➖ Decrease Size (-20%)")
        dec_act.triggered.connect(lambda: self.set_scale(self.scale_factor - 0.2))

        menu.addSeparator()

        settings_act = menu.addAction("⚙️ Settings")
        settings_act.triggered.connect(self.open_settings)

        quit_act = menu.addAction("❌ Quit Vishal")
        quit_act.triggered.connect(QApplication.instance().quit)

        menu.exec(pos)

    def check_github_now(self):
        self.summon_chat()
        self.bubble.send_user_message("check github")

    def open_settings(self):
        dialog = SettingsDialog(self)
        dialog.exec()

    def on_chat_response(self, text: str, source: str):
        self.bubble.status_label.setText("Ready")
        self.bubble.status_dot.setStyleSheet("color: #10b981; font-size: 10px;")
        self.bubble.add_message("assistant", text)
        self.set_mood("thumbsUp", 3000)

    def on_tool_confirmation(self, action: str, params: dict, desc: str):
        self.summon_chat()
        self.bubble.show_tool_confirmation(action, params, desc)

    def on_tool_executed(self, success: bool, msg: str):
        self.bubble.status_label.setText("Ready")
        self.bubble.status_dot.setStyleSheet("color: #10b981; font-size: 10px;")
        icon = "✅" if success else "ℹ️"
        self.bubble.add_message("assistant", f"{icon} {msg}")
        self.set_mood("thumbsUp" if success else "casual", 3000)

    def on_voice_transcribed(self, text: str):
        self.bubble.status_label.setText("Ready")
        self.bubble.status_dot.setStyleSheet("color: #10b981; font-size: 10px;")
        if text:
            self.bubble.send_user_message(text)
        else:
            self.bubble.add_message("assistant", "Sorry boss, couldn't hear any speech.")

    def on_voice_error(self, err: str):
        self.bubble.status_label.setText("Ready")
        self.bubble.status_dot.setStyleSheet("color: #10b981; font-size: 10px;")
        self.bubble.add_message("assistant", f"⚠️ Voice error: {err}")
        self.set_mood("casual")

    def on_github_alert(self, title: str, msg: str):
        self.summon_chat()
        self.bubble.add_message("assistant", f"🐙 **{title}**\n{msg}")
        self.set_mood("excited", 4000)


class SettingsDialog(QDialog):
    """Settings and Contact Management Dialog (Light Theme with Live Scale Preview)."""
    def __init__(self, overlay: CharacterOverlay = None):
        super().__init__(overlay)
        self.overlay = overlay
        self.setWindowTitle("⚙️ Vishal Settings & Configuration")
        self.setFixedSize(560, 480)
        self.setStyleSheet("""
            QDialog {
                background: #ffffff;
                color: #0f172a;
            }
            QTabWidget::pane {
                border: 1px solid #e2e8f0;
                background: #ffffff;
                border-radius: 8px;
            }
            QTabBar::tab {
                background: #f8fafc;
                color: #64748b;
                padding: 8px 16px;
                border: 1px solid #e2e8f0;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                margin-right: 2px;
            }
            QTabBar::tab:selected {
                background: #ffffff;
                color: #2563eb;
                font-weight: bold;
                border-bottom: 1px solid #ffffff;
            }
            QLabel {
                color: #334155;
                font-size: 12px;
            }
            QLineEdit, QSpinBox, QDoubleSpinBox {
                background: #ffffff;
                color: #0f172a;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 5px 8px;
            }
            QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {
                border: 1px solid #2563eb;
            }
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 6px 14px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: #1d4ed8;
            }
        """)

        self.settings = settings_mgr.load_settings()
        self.initial_scale = float(self.settings.get("char_scale", 1.0))
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        tabs = QTabWidget(self)

        # Tab 1: General
        general_tab = QWidget()
        gen_layout = QFormLayout(general_tab)
        gen_layout.setContentsMargins(16, 16, 16, 16)
        gen_layout.setSpacing(12)

        self.scale_spin = QDoubleSpinBox()
        self.scale_spin.setRange(0.4, 3.0)
        self.scale_spin.setSingleStep(0.1)
        self.scale_spin.setValue(self.initial_scale)
        self.scale_spin.valueChanged.connect(self._on_scale_live_change)
        gen_layout.addRow("Character Scale (0.4x - 3.0x):", self.scale_spin)

        self.hotkey_chat = QLineEdit(self.settings.get("chat_hotkey", "ctrl+alt+v"))
        gen_layout.addRow("Chat Summon Hotkey:", self.hotkey_chat)

        self.hotkey_voice = QLineEdit(self.settings.get("voice_hotkey", "ctrl+alt+space"))
        gen_layout.addRow("Voice Input Hotkey:", self.hotkey_voice)

        self.hotkey_gh = QLineEdit(self.settings.get("github_hotkey", "ctrl+alt+g"))
        gen_layout.addRow("GitHub Check Hotkey:", self.hotkey_gh)

        tabs.addTab(general_tab, "General")

        # Tab 2: GitHub Watcher
        gh_tab = QWidget()
        gh_layout = QFormLayout(gh_tab)
        gh_layout.setContentsMargins(16, 16, 16, 16)
        gh_layout.setSpacing(12)

        self.gh_enable_cb = QCheckBox("Enable Background GitHub Polling (Requires valid GITHUB_TOKEN)")
        self.gh_enable_cb.setChecked(self.settings.get("github_enabled", False))
        gh_layout.addRow("", self.gh_enable_cb)

        self.gh_user_input = QLineEdit(self.settings.get("github_username", ""))
        self.gh_user_input.setPlaceholderText("e.g. vishalhirani978")
        gh_layout.addRow("GitHub Username:", self.gh_user_input)

        self.gh_interval_spin = QSpinBox()
        self.gh_interval_spin.setRange(15, 600)
        self.gh_interval_spin.setValue(int(self.settings.get("github_interval", 60)))
        gh_layout.addRow("Poll Interval (sec):", self.gh_interval_spin)

        self.notify_pr = QCheckBox("Pull Request Alerts")
        self.notify_pr.setChecked(self.settings.get("notify_pr", True))
        gh_layout.addRow("", self.notify_pr)

        self.notify_issues = QCheckBox("Issue Alerts")
        self.notify_issues.setChecked(self.settings.get("notify_issues", True))
        gh_layout.addRow("", self.notify_issues)

        tabs.addTab(gh_tab, "GitHub")

        # Tab 3: Contacts Manager
        contacts_tab = QWidget()
        c_layout = QVBoxLayout(contacts_tab)
        c_layout.setContentsMargins(16, 16, 16, 16)

        self.contacts_table = QTableWidget(0, 3)
        self.contacts_table.setHorizontalHeaderLabels(["Name", "Phone", "Email"])
        self.contacts_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.contacts_table.setStyleSheet("""
            QTableWidget {
                background: #ffffff;
                color: #0f172a;
                gridline-color: #e2e8f0;
            }
            QHeaderView::section {
                background: #f8fafc;
                color: #475569;
                padding: 6px;
                border: 1px solid #e2e8f0;
                font-weight: 600;
            }
        """)
        c_layout.addWidget(self.contacts_table)

        btn_row = QHBoxLayout()
        add_btn = QPushButton("➕ Add Contact")
        add_btn.clicked.connect(self.add_contact_dialog)
        del_btn = QPushButton("🗑️ Delete Selected")
        del_btn.setStyleSheet("background: #ef4444;")
        del_btn.clicked.connect(self.delete_contact)
        btn_row.addWidget(add_btn)
        btn_row.addWidget(del_btn)
        c_layout.addLayout(btn_row)

        self.load_contacts_table()
        tabs.addTab(contacts_tab, "Contacts")

        layout.addWidget(tabs)

        # Bottom Buttons
        bottom_row = QHBoxLayout()
        bottom_row.addStretch()

        save_btn = QPushButton("💾 Save & Apply")
        save_btn.clicked.connect(self.save_and_close)
        cancel_btn = QPushButton("Cancel")
        cancel_btn.setStyleSheet("background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;")
        cancel_btn.clicked.connect(self.cancel_dialog)

        bottom_row.addWidget(save_btn)
        bottom_row.addWidget(cancel_btn)
        layout.addLayout(bottom_row)

    def _on_scale_live_change(self, val: float):
        if self.overlay:
            self.overlay.set_scale(val)

    def cancel_dialog(self):
        # Revert live preview scale on cancel
        if self.overlay:
            self.overlay.set_scale(self.initial_scale)
        self.reject()

    def load_contacts_table(self):
        self.contacts_table.setRowCount(0)
        contacts_list = contacts.get_all_contacts()
        for row, c in enumerate(contacts_list):
            self.contacts_table.insertRow(row)
            self.contacts_table.setItem(row, 0, QTableWidgetItem(c.get("name", "")))
            self.contacts_table.setItem(row, 1, QTableWidgetItem(c.get("phone", "")))
            self.contacts_table.setItem(row, 2, QTableWidgetItem(c.get("email", "")))

    def add_contact_dialog(self):
        d = QDialog(self)
        d.setWindowTitle("Add New Contact")
        d.setFixedSize(300, 200)
        d_layout = QFormLayout(d)
        name_in = QLineEdit()
        phone_in = QLineEdit()
        email_in = QLineEdit()
        d_layout.addRow("Name:", name_in)
        d_layout.addRow("Phone:", phone_in)
        d_layout.addRow("Email:", email_in)
        ok_btn = QPushButton("Save")
        ok_btn.clicked.connect(lambda: [
            contacts.add_contact(name_in.text(), phone_in.text(), email_in.text()) if name_in.text() else None,
            d.accept()
        ])
        d_layout.addRow(ok_btn)
        if d.exec():
            self.load_contacts_table()

    def delete_contact(self):
        row = self.contacts_table.currentRow()
        if row >= 0:
            name = self.contacts_table.item(row, 0).text()
            contacts.remove_contact(name)
            self.load_contacts_table()

    def save_and_close(self):
        new_scale = self.scale_spin.value()
        self.settings["char_scale"] = new_scale
        self.settings["chat_hotkey"] = self.hotkey_chat.text().strip()
        self.settings["voice_hotkey"] = self.hotkey_voice.text().strip()
        self.settings["github_hotkey"] = self.hotkey_gh.text().strip()
        self.settings["github_enabled"] = self.gh_enable_cb.isChecked()
        self.settings["github_username"] = self.gh_user_input.text().strip()
        self.settings["github_interval"] = self.gh_interval_spin.value()
        self.settings["notify_pr"] = self.notify_pr.isChecked()
        self.settings["notify_issues"] = self.notify_issues.isChecked()

        settings_mgr.save_settings(self.settings)
        if self.overlay:
            self.overlay.set_scale(new_scale)
        self.accept()


class SystemTray:
    """System tray icon with menu and alerts."""
    def __init__(self, overlay: CharacterOverlay, app: QApplication):
        self.overlay = overlay
        self.app = app
        self.tray = QSystemTrayIcon()

        icon_path = os.path.join(ASSETS_DIR, "icon.ico")
        if os.path.exists(icon_path):
            self.tray.setIcon(QIcon(icon_path))
        else:
            self.tray.setIcon(self.overlay.windowIcon())

        self.tray.setToolTip("Vishal — Pixel AI Desktop Assistant")
        self.create_menu()
        self.tray.show()

    def create_menu(self):
        menu = QMenu()
        menu.setStyleSheet("""
            QMenu {
                background: #ffffff;
                color: #0f172a;
                border: 1px solid #e2e8f0;
                padding: 4px;
            }
            QMenu::item:selected {
                background: #eff6ff;
                color: #2563eb;
            }
        """)
        menu.addAction("💬 Summon Vishal", self.overlay.summon_chat)
        menu.addAction("🎙️ Voice Input", self.overlay.bubble.toggle_voice_recording)
        menu.addAction("🐙 GitHub Check", self.overlay.check_github_now)
        
        # Size menu in tray
        size_menu = menu.addMenu("🔍 Character Size")
        size_menu.setStyleSheet(menu.styleSheet())
        for name, scale_val in [
            ("75% (Small)", 0.75),
            ("100% (Default)", 1.0),
            ("125% (Medium)", 1.25),
            ("150% (Large)", 1.5),
            ("200% (Extra Large)", 2.0),
        ]:
            act = size_menu.addAction(name)
            act.triggered.connect(lambda chk, s=scale_val: self.overlay.set_scale(s))

        menu.addSeparator()
        menu.addAction("⚙️ Settings", self.overlay.open_settings)
        menu.addSeparator()
        menu.addAction("❌ Quit", self.app.quit)
        self.tray.setContextMenu(menu)
        self.tray.activated.connect(self.on_tray_activated)

    def on_tray_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self.overlay.summon_chat()
