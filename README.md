# Pixel PM — Vishal (Python Edition)

**Pixel PM** is a Python desktop AI assistant featuring **Vishal**, a pixel-art AI character that lives on your screen as a transparent, always-on-top overlay. He is your always-on AI project manager — chat with him, execute system actions, send emails, manage contacts, analyze your screen, monitor GitHub, and use voice commands.

![Vishal character pixel art](assets/character-front.png)

## Features

- **AI Brain & Chat** — Powered by Groq (`openai/gpt-oss-120b`) with automatic Google Gemini (`gemini-2.5-flash`) fallback
- **Voice Commands** — Real-time push-to-talk voice recording transcribed via Groq Whisper (`Ctrl+Alt+Space`)
- **Intent Parsing & Tool Execution** — Over 20 actions with safety confirmation dialogs (Yes / Cancel)
- **Gmail Automation** — Send emails and read/search inbox with unread counts using native Python SMTP & IMAP
- **GitHub Watcher** — Background monitoring for PR review requests, assigned issues, mentions, and CI build status
- **System Controls** — Shutdown / restart (immediate or scheduled timer), cancel shutdown, lock screen, sleep, and volume/mute controls
- **Screen Awareness** — Take full screenshots and analyze on-screen content using AI vision
- **Contact Book** — Add, search, list, and remove contacts stored locally with name resolution for messaging
- **16 Pixel Art Poses** — Mood-reactive character with idle bobbing animation and expressive reactions
- **Transparent Desktop Overlay** — Always-on-top frameless floating widget with screen boundary clamping and position memory
- **Settings Panel** — Configure character scale, hotkeys, GitHub monitoring filters, and contact book
- **System Tray & Hotkeys**:
  - `Ctrl+Alt+V`: Summon Vishal chat bubble
  - `Ctrl+Alt+G`: Immediate GitHub status check & summary
  - `Ctrl+Alt+Space`: Voice input trigger

## Tech Stack

| Component | Library / Tool |
|---|---|
| **GUI & Overlay** | `PyQt6` (Frameless, translucent window, dark mode UI) |
| **Primary AI** | `groq` (`openai/gpt-oss-120b`, `whisper-large-v3-turbo`) |
| **Fallback AI** | `google-generativeai` (`gemini-2.5-flash`) |
| **GitHub Integration** | `PyGithub` |
| **Email (Gmail)** | Python standard library `smtplib`, `imaplib`, `email` |
| **Global Hotkeys** | `keyboard` |
| **Audio Capture** | `sounddevice`, `wave`, `numpy` |
| **Screen Analysis** | `Pillow`, `pywin32` |
| **System Tray** | `PyQt6.QtWidgets.QSystemTrayIcon` / `pystray` |

## Quick Start

### 1. Prerequisites
- Python 3.10+ (Windows 10 / 11)
- A free Groq API key from [console.groq.com](https://console.groq.com)

### 2. Installation

Install all required Python packages:
```bash
pip install -r requirements.txt
```

### 3. Configuration

Set up your `.env` file in the project root directory:
```env
GROQ_API_KEY=gsk_your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here     # optional fallback
GITHUB_TOKEN=ghp_your_github_token          # optional for GitHub watcher
GITHUB_USERNAME=your_github_username
GMAIL_USER=your_email@gmail.com             # optional for Gmail tools
GMAIL_APP_PASSWORD=your_app_password        # optional for Gmail tools
```

### 4. Running Vishal

Simply double click `run.bat` or run:
```bash
python python_app/main.py
```
or
```bash
python start_assistant.py
```

## Directory Structure

```
VISHAL/
├── python_app/
│   ├── main.py              # Application entry point & lifecycle
│   ├── ui.py                # PyQt6 character overlay, thought bubble & settings dialog
│   ├── audio.py             # Microphone audio recording
│   ├── settings.py          # User settings persistence (AppData/Local/PixelPM)
│   └── agents/
│       ├── personality.py   # System prompt and persona definition
│       ├── brain.py         # AI brain (Groq + Gemini fallback)
│       ├── intent_parser.py # 20+ tool intent parser with JSON extraction
│       ├── tools.py         # Tool registry and execution coordinator
│       ├── contacts.py      # Contact book persistence & lookup
│       ├── system_agent.py  # Windows system controls (shutdown, volume, lock)
│       ├── gmail_agent.py   # Gmail SMTP send and IMAP inbox reader
│       ├── github_watcher.py# GitHub watcher background monitor
│       └── whisper_agent.py # Groq Whisper speech-to-text
├── assets/                  # 16 pixel art pose sprites and icon
├── requirements.txt         # Python package dependencies
├── run.bat                  # One-click launcher script
└── start_assistant.py       # Root Python launcher
```
