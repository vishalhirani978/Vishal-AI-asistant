"""
tools.py — Tool registry for agent execution
"""

import webbrowser
import logging
import os
from urllib.parse import quote_plus

from agents import contacts, system_agent, gmail_agent

logger = logging.getLogger(__name__)


# ===== DESCRIPTION / ACTION TEMPLATES =====

def _resolve_contact(to: str) -> str:
    r = contacts.resolve_recipient(to)
    if r["resolved"]:
        parts = []
        if r.get("email"):
            parts.append(f"📧 {r['email']}")
        if r.get("phone"):
            parts.append(f"📱 {r['phone']}")
        extra = f" ({', '.join(parts)})" if parts else ""
        return f"{r['name']}{extra}"
    return to


DESCRIPTION_TEMPLATES = {
    "open_url": lambda p: f"Open {p.get('name') or p.get('url')}",
    "google_search": lambda p: f"Search Google for \"{p.get('query')}\"",
    "open_youtube": lambda p: f"Search YouTube for \"{p.get('search')}\"" if p.get("search") else "Open YouTube",
    "open_gmail": lambda p: "Open Gmail",
    "send_email": lambda p: f"Send email to {_resolve_contact(p.get('to', ''))}",
    "check_email_inbox": lambda p: "Check Gmail inbox",
    "get_unread_emails": lambda p: "Fetch unread emails from Gmail",
    "search_emails": lambda p: f"Search Gmail for \"{p.get('query')}\"",
    "add_contact": lambda p: f"Add contact \"{p.get('name')}\"" + (f" 📱 {p['phone']}" if p.get("phone") else "") + (f" 📧 {p['email']}" if p.get("email") else ""),
    "list_contacts": lambda p: "List all contacts",
    "remove_contact": lambda p: f"Remove contact \"{p.get('name')}\"",
    "search_contact": lambda p: f"Look up \"{p.get('query')}\" in contacts",
    "system_shutdown": lambda p: f"Shutdown PC in {p.get('minutes')} minute(s)" if p.get("minutes") else "Shutdown PC now",
    "system_restart": lambda p: f"Restart PC in {p.get('minutes')} minute(s)" if p.get("minutes") else "Restart PC now",
    "system_cancel_shutdown": lambda p: "Cancel scheduled shutdown/restart",
    "system_lock": lambda p: "Lock the screen",
    "system_sleep": lambda p: "Put PC to sleep",
    "system_volume": lambda p: f"Set volume to {p.get('level')}%",
    "system_mute": lambda p: "Mute/unmute audio",
    "analyze_screen": lambda p: "Analyze what's on screen",
}

ACTION_TEMPLATES = {
    "open_url": lambda p: f"I'll open {p.get('url') or p.get('name')}",
    "google_search": lambda p: f"I'll search Google for \"{p.get('query')}\"",
    "open_youtube": lambda p: f"I'll search YouTube for \"{p.get('search')}\"" if p.get("search") else "I'll open https://youtube.com",
    "open_gmail": lambda p: "I'll open https://mail.google.com",
    "send_email": lambda p: f"To: {p.get('to')}\nSubject: {p.get('subject')}\nBody: {p.get('body')}",
    "check_email_inbox": lambda p: "I'll connect to Gmail via IMAP and check your inbox",
    "get_unread_emails": lambda p: "I'll fetch your unread emails with sender, subject, and preview",
    "search_emails": lambda p: f"I'll search your Gmail inbox for \"{p.get('query')}\"",
    "add_contact": lambda p: f"Name: {p.get('name')}" + (f"\nPhone: {p['phone']}" if p.get("phone") else "") + (f"\nEmail: {p['email']}" if p.get("email") else ""),
    "list_contacts": lambda p: "I'll show you all your saved contacts",
    "remove_contact": lambda p: f"I'll permanently delete \"{p.get('name')}\" from your contacts",
    "search_contact": lambda p: f"I'll look up \"{p.get('query')}\" in your contact book",
    "system_shutdown": lambda p: f"⚠️ PC will shut down in {p.get('minutes')} minute(s)" if p.get("minutes") else "⚠️ PC will shut down immediately",
    "system_restart": lambda p: f"⚠️ PC will restart in {p.get('minutes')} minute(s)" if p.get("minutes") else "⚠️ PC will restart immediately",
    "system_cancel_shutdown": lambda p: "I'll cancel the scheduled shutdown/restart",
    "system_lock": lambda p: "I'll lock your Windows screen",
    "system_sleep": lambda p: "I'll put your PC into sleep mode",
    "system_volume": lambda p: f"I'll set system volume to {p.get('level')}%",
    "system_mute": lambda p: "I'll toggle mute on your system audio",
    "analyze_screen": lambda p: "I'll take a screenshot and analyze what you see",
}


def build_confirmation(action: str, params: dict) -> dict:
    title_fn = DESCRIPTION_TEMPLATES.get(action, lambda p: f"Run {action}?")
    desc_fn = ACTION_TEMPLATES.get(action, lambda p: f"Execute: {action}")
    return {
        "needsConfirmation": True,
        "title": f"🎯 {title_fn(params)}?",
        "description": desc_fn(params),
        "toolName": action,
        "params": params,
    }


# ===== TOOL EXECUTION =====

KNOWN_TOOLS = {
    "open_url", "google_search", "open_youtube",
    "open_gmail", "send_email", "check_email_inbox", "get_unread_emails", "search_emails",
    "add_contact", "list_contacts", "remove_contact", "search_contact",
    "system_shutdown", "system_restart", "system_cancel_shutdown",
    "system_lock", "system_sleep", "system_volume", "system_mute",
    "analyze_screen",
}


def find_tool(name: str) -> bool:
    return name in KNOWN_TOOLS


def execute_tool(tool_name: str, params: dict) -> dict:
    logger.info(f"Executing tool: {tool_name} params={params}")

    try:
        # Browser
        if tool_name == "open_url":
            url = params.get("url", "")
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            webbrowser.open(url)
            return {"success": True, "message": f"Opened {params.get('name') or url}"}

        elif tool_name == "google_search":
            q = params.get("query", "")
            webbrowser.open(f"https://www.google.com/search?q={quote_plus(q)}")
            return {"success": True, "message": f"Searched Google for \"{q}\""}

        elif tool_name == "open_youtube":
            if params.get("search"):
                webbrowser.open(f"https://youtube.com/results?search_query={quote_plus(params['search'])}")
                return {"success": True, "message": f"Searching YouTube for \"{params['search']}\""}
            else:
                webbrowser.open("https://youtube.com")
                return {"success": True, "message": "Opened YouTube"}

        # Email
        elif tool_name == "open_gmail":
            webbrowser.open("https://mail.google.com")
            return {"success": True, "message": "Opened Gmail"}

        elif tool_name == "send_email":
            r = contacts.resolve_recipient(params.get("to", ""))
            recipient = r.get("email") or params.get("to", "")
            return gmail_agent.send_email(recipient, params.get("subject", ""), params.get("body", ""))

        elif tool_name == "check_email_inbox":
            return gmail_agent.check_email_inbox()

        elif tool_name == "get_unread_emails":
            return gmail_agent.get_unread_emails()

        elif tool_name == "search_emails":
            return gmail_agent.search_emails(params.get("query", ""))

        # Contacts
        elif tool_name == "add_contact":
            return contacts.add_contact(params.get("name", ""), params.get("phone"), params.get("email"))

        elif tool_name == "list_contacts":
            all_c = contacts.get_all_contacts()
            if not all_c:
                return {"success": True, "message": "📇 No contacts saved yet. Say \"Add contact [name]\" to get started!"}
            lines = [f"📇 {len(all_c)} contact(s):"]
            for i, c in enumerate(all_c, 1):
                line = f"{i}. {c['name']}"
                if c.get("phone"):
                    line += f"  📱 {c['phone']}"
                if c.get("email"):
                    line += f"  📧 {c['email']}"
                lines.append(line)
            return {"success": True, "message": "\n".join(lines)}

        elif tool_name == "remove_contact":
            return contacts.remove_contact(params.get("name", ""))

        elif tool_name == "search_contact":
            r = contacts.resolve_recipient(params.get("query", ""))
            if r["resolved"]:
                c = r["contact"]
                msg = f"📇 Found: {c['name']}"
                if c.get("phone"):
                    msg += f"\n📱 Phone: {c['phone']}"
                if c.get("email"):
                    msg += f"\n📧 Email: {c['email']}"
                return {"success": True, "message": msg}
            return {"success": False, "error": f"No contact found for \"{params.get('query')}\""}

        # System
        elif tool_name == "system_shutdown":
            return system_agent.shutdown_pc(params.get("minutes", 0))

        elif tool_name == "system_restart":
            return system_agent.restart_pc(params.get("minutes", 0))

        elif tool_name == "system_cancel_shutdown":
            return system_agent.cancel_shutdown()

        elif tool_name == "system_lock":
            return system_agent.lock_screen()

        elif tool_name == "system_sleep":
            return system_agent.sleep_pc()

        elif tool_name == "system_volume":
            return system_agent.set_volume(params.get("level", 50))

        elif tool_name == "system_mute":
            return system_agent.mute_audio()

        elif tool_name == "analyze_screen":
            return _analyze_screen(params.get("question"))

        elif tool_name == "check_github":
            from agents import github_watcher
            return github_watcher.get_github_summary()

        else:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return {"success": False, "error": str(e)}


def _analyze_screen(question: str = None) -> dict:
    """Take a screenshot and analyze with Gemini Vision."""
    try:
        import mss
        import base64
        import io
        from PIL import Image

        with mss.mss() as sct:
            monitor = sct.monitors[0]
            screenshot = sct.grab(monitor)
            img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
            img.thumbnail((1280, 720))

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode("utf-8")

        import google.generativeai as genai
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel("gemini-2.5-flash")

        q = question or "Describe what you see on this screen in detail. What application is open? What is the user doing?"

        result = model.generate_content([
            q,
            {"mime_type": "image/png", "data": b64},
        ])
        return {"success": True, "message": result.text}

    except ImportError:
        # Fallback: try PIL screenshot
        try:
            import base64
            import io
            from PIL import ImageGrab
            img = ImageGrab.grab()
            img.thumbnail((1280, 720))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode("utf-8")

            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel("gemini-2.5-flash")

            q = question or "Describe what you see on this screen in detail."
            result = model.generate_content([
                q,
                {"mime_type": "image/png", "data": b64},
            ])
            return {"success": True, "message": result.text}
        except Exception as e2:
            return {"success": False, "error": f"Screen analysis failed: {e2}"}
    except Exception as e:
        return {"success": False, "error": f"Screen analysis failed: {e}"}
