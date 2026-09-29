"""
intent_parser.py — Parse user messages into agent intents
"""

import os
import json
import logging
import re
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

AGENT_SYSTEM_PROMPT = """You are an intent parser for Vishal, a desktop AI assistant. The user will give you commands. Your job is to identify which TOOL the user wants to use, or if they just want to CHAT.

AVAILABLE TOOLS:

BROWSER:
1. open_url(url, name?) — Open any website in browser
2. google_search(query) — Search Google for something
3. open_youtube(search?) — Open YouTube, optionally search

EMAIL (Gmail):
4. open_gmail() — Open Gmail in browser
5. send_email(to, subject, body) — Send an email.
6. check_email_inbox() — Check Gmail inbox: unread count + recent senders
7. get_unread_emails() — Get detailed list of unread emails with subject and preview
8. search_emails(query) — Search Gmail by sender name or subject keyword

CONTACTS:
9. add_contact(name, phone?, email?) — Add or update a contact
10. list_contacts() — List all saved contacts
11. remove_contact(name) — Delete a contact by name
12. search_contact(query) — Look up a contact's phone/email

SYSTEM CONTROLS:
13. system_shutdown(minutes?) — Shutdown PC.
14. system_restart(minutes?) — Restart PC.
15. system_cancel_shutdown() — Cancel a scheduled shutdown or restart
16. system_lock() — Lock the Windows screen
17. system_sleep() — Put PC to sleep
18. system_volume(level) — Set system volume 0-100
19. system_mute() — Toggle mute/unmute

SCREEN AWARENESS:
20. analyze_screen(question?) — Take a screenshot and analyze screen content.

GITHUB:
21. check_github() — Check GitHub status, assigned PRs and issues.

RULES:
- Always respond with VALID JSON only — no markdown, no explanation outside JSON
- If user wants to chat/ask question → action: "chat"
- If unsure → action: "chat"
- Extract parameters carefully from natural language

RESPONSE FORMAT:
{
  "action": "tool_name_or_chat",
  "params": { ... },
  "confidence": 0.0-1.0,
  "reasoning": "short explanation"
}"""

GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]


def _match_quick_heuristics(text: str) -> dict | None:
    """Fast pattern matcher for common commands to avoid unnecessary LLM latency/tokens."""
    clean = text.strip().lower()

    # YouTube patterns ("open youtube", "open you", "open yt", "search youtube for X")
    yt_search = re.match(r'^(?:search|play)\s+youtube\s+for\s+(.+)$', clean) or re.match(r'^youtube\s+(?:search\s+)?(.+)$', clean)
    if yt_search:
        return {"action": "open_youtube", "params": {"search": yt_search.group(1).strip()}, "confidence": 1.0, "reasoning": "Direct YouTube search"}

    if clean in ["open youtube", "open you", "open yt", "youtube", "launch youtube"]:
        return {"action": "open_youtube", "params": {}, "confidence": 1.0, "reasoning": "Direct open YouTube request"}

    # Google search patterns ("do search X", "search for X", "search X", "google X", "do google search X")
    g_search = (
        re.match(r'^(?:do\s+)?(?:google\s+)?search\s+(?:for\s+)?["\']?(.+?)["\']?$', clean) or
        re.match(r'^(?:do\s+)?google\s+["\']?(.+?)["\']?$', clean) or
        re.match(r'^find\s+(?:online|on\s+google)\s+(.+)$', clean)
    )
    if g_search:
        query = g_search.group(1).strip().strip('"\'')
        if query and not query.startswith(("youtube", "gmail", "my contacts", "unread")):
            return {"action": "google_search", "params": {"query": query}, "confidence": 1.0, "reasoning": "Direct Google search request"}

    # GitHub checks
    if clean in ["check github", "github status", "github", "check my github", "git status"]:
        return {"action": "check_github", "params": {}, "confidence": 1.0, "reasoning": "Direct GitHub check request"}

    # Lock PC / Sleep PC
    if clean in ["lock pc", "lock screen", "lock my pc", "lock computer", "lock windows"]:
        return {"action": "system_lock", "params": {}, "confidence": 1.0, "reasoning": "Direct PC lock"}
    if clean in ["sleep pc", "put pc to sleep", "sleep computer"]:
        return {"action": "system_sleep", "params": {}, "confidence": 1.0, "reasoning": "Direct PC sleep"}

    # Gmail
    if clean in ["open gmail", "check gmail", "launch gmail"]:
        return {"action": "open_gmail", "params": {}, "confidence": 1.0, "reasoning": "Direct open Gmail"}

    # Screen analysis
    if clean in ["what's on my screen", "what is on my screen", "analyze screen", "check screen", "take screenshot"]:
        return {"action": "analyze_screen", "params": {}, "confidence": 1.0, "reasoning": "Direct screen analysis"}

    # Character size / scaling
    scale_match = re.match(r'^(?:set\s+)?(?:character\s+)?scale\s+to\s+([0-9.]+)', clean) or re.match(r'^(?:set\s+)?(?:character\s+)?scale\s+([0-9.]+)', clean)
    if scale_match:
        try:
            val = float(scale_match.group(1))
            return {"action": "set_character_scale", "params": {"scale": val}, "confidence": 1.0, "reasoning": "Direct scale setting"}
        except ValueError:
            pass

    if any(p in clean for p in ["make character bigger", "increase character size", "increase size", "bigger character", "make him bigger", "zoom in character"]):
        return {"action": "set_character_scale", "params": {"delta": 0.25}, "confidence": 1.0, "reasoning": "Increase character size"}

    if any(p in clean for p in ["make character smaller", "decrease character size", "decrease size", "smaller character", "make him smaller", "zoom out character"]):
        return {"action": "set_character_scale", "params": {"delta": -0.25}, "confidence": 1.0, "reasoning": "Decrease character size"}

    if any(p in clean for p in ["reset character size", "reset size", "default size", "normal size"]):
        return {"action": "set_character_scale", "params": {"scale": 1.0}, "confidence": 1.0, "reasoning": "Reset character size"}

    return None


def parse_intent(user_message: str) -> dict:
    """Parse user message into an intent dict."""
    # 1. Quick regex heuristics
    quick = _match_quick_heuristics(user_message)
    if quick:
        logger.info(f"Intent parsed via quick heuristic: {quick['action']}")
        return quick

    # 2. LLM intent parsing
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if api_key:
            client = Groq(api_key=api_key)
            for model_name in GROQ_MODELS:
                try:
                    completion = client.chat.completions.create(
                        messages=[
                            {"role": "system", "content": AGENT_SYSTEM_PROMPT},
                            {"role": "user", "content": user_message},
                        ],
                        model=model_name,
                        temperature=0.1,
                        max_tokens=300,
                    )

                    text = completion.choices[0].message.content
                    if text:
                        text = text.strip()
                        json_match = re.search(r'\{[\s\S]*\}', text)
                        if json_match:
                            parsed = json.loads(json_match.group(0))
                            return {
                                "action": parsed.get("action", "chat"),
                                "params": parsed.get("params", {}),
                                "confidence": float(parsed.get("confidence", 0.5)),
                                "reasoning": parsed.get("reasoning", "Parsed from user input"),
                            }
                except Exception as model_err:
                    logger.warning(f"Groq intent parse model {model_name} warning: {model_err}")
    except Exception as e:
        logger.warning(f"Intent parse error: {e}")

    # 3. Fallback to Gemini
    try:
        import google.generativeai as genai
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            genai.configure(api_key=gemini_key)
            for g_model in ["gemini-2.5-flash", "gemini-3.8-flash"]:
                try:
                    mod = genai.GenerativeModel(model_name=g_model, system_instruction=AGENT_SYSTEM_PROMPT)
                    res = mod.generate_content(user_message)
                    if res.text:
                        json_match = re.search(r'\{[\s\S]*\}', res.text)
                        if json_match:
                            parsed = json.loads(json_match.group(0))
                            return {
                                "action": parsed.get("action", "chat"),
                                "params": parsed.get("params", {}),
                                "confidence": float(parsed.get("confidence", 0.5)),
                                "reasoning": parsed.get("reasoning", "Parsed via Gemini"),
                            }
                except Exception as ge:
                    logger.warning(f"Gemini intent parse model {g_model} warning: {ge}")
    except Exception as gemini_err:
        logger.warning(f"Gemini fallback intent error: {gemini_err}")

    return {
        "action": "chat",
        "params": {"message": user_message},
        "confidence": 0.5,
        "reasoning": "Fallback: chat",
    }
