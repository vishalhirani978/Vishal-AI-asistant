"""
gmail_agent.py — Gmail send/read via SMTP + IMAP
"""

import os
import imaplib
import smtplib
import email
import logging
from email.mime.text import MIMEText
from email.header import decode_header
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_PASS = os.getenv("GMAIL_APP_PASSWORD", "")


def send_email(to: str, subject: str, body: str) -> dict:
    if not to:
        return {"success": False, "error": "No recipient specified"}
    if not subject:
        return {"success": False, "error": "No subject specified"}
    if not body:
        return {"success": False, "error": "No body specified"}
    if not GMAIL_USER or not GMAIL_PASS:
        return {"success": False, "error": "Gmail not configured. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env"}

    try:
        msg = MIMEText(body, "plain")
        msg["Subject"] = subject
        msg["From"] = GMAIL_USER
        msg["To"] = to

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_PASS)
            server.sendmail(GMAIL_USER, [to], msg.as_string())

        logger.info(f"Email sent to {to}")
        return {"success": True, "message": f"Email sent to {to}"}
    except Exception as e:
        logger.error(f"Gmail send error: {e}")
        return {"success": False, "error": f"Failed to send: {e}"}


def _decode_header_value(raw) -> str:
    if raw is None:
        return ""
    parts = decode_header(raw)
    result = []
    for content, charset in parts:
        if isinstance(content, bytes):
            result.append(content.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(content)
    return "".join(result)


def _connect_imap():
    if not GMAIL_USER or not GMAIL_PASS:
        raise RuntimeError("Gmail not configured. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env")
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(GMAIL_USER, GMAIL_PASS)
    return imap


def check_email_inbox() -> dict:
    try:
        imap = _connect_imap()
        imap.select("INBOX")
        _, msgs = imap.search(None, "UNSEEN")
        msg_ids = msgs[0].split()
        count = len(msg_ids)

        senders = []
        for uid in msg_ids[-5:]:  # last 5
            _, data = imap.fetch(uid, "(RFC822.SIZE BODY[HEADER.FIELDS (FROM SUBJECT)])")
            for part in data:
                if isinstance(part, tuple):
                    msg = email.message_from_bytes(part[1])
                    sender = _decode_header_value(msg.get("From", ""))
                    subject = _decode_header_value(msg.get("Subject", "(no subject)"))
                    senders.append(f"• {sender}: {subject}")

        imap.logout()
        message = f"📧 You have {count} unread email(s)."
        if senders:
            message += "\n\nRecent:\n" + "\n".join(reversed(senders))
        return {"success": True, "message": message}
    except Exception as e:
        logger.error(f"check_email_inbox error: {e}")
        return {"success": False, "error": f"Gmail error: {e}"}


def get_unread_emails() -> dict:
    try:
        imap = _connect_imap()
        imap.select("INBOX")
        _, msgs = imap.search(None, "UNSEEN")
        msg_ids = msgs[0].split()

        if not msg_ids:
            imap.logout()
            return {"success": True, "message": "📧 No unread emails! Your inbox is clean 🎉"}

        lines = [f"📧 {len(msg_ids)} unread email(s):\n"]
        for uid in msg_ids[-8:]:
            _, data = imap.fetch(uid, "(BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])")
            msg_obj = None
            for part in data:
                if isinstance(part, tuple):
                    msg_obj = email.message_from_bytes(part[1])
                    break
            if msg_obj:
                sender = _decode_header_value(msg_obj.get("From", "Unknown"))
                subject = _decode_header_value(msg_obj.get("Subject", "(no subject)"))
                lines.append(f"• From: {sender}\n  Subject: {subject}")

        imap.logout()
        return {"success": True, "message": "\n".join(lines)}
    except Exception as e:
        logger.error(f"get_unread_emails error: {e}")
        return {"success": False, "error": f"Gmail error: {e}"}


def search_emails(query: str) -> dict:
    try:
        imap = _connect_imap()
        imap.select("INBOX")
        search_query = f'(OR FROM "{query}" SUBJECT "{query}")'
        _, msgs = imap.search(None, search_query)
        msg_ids = msgs[0].split()

        if not msg_ids:
            imap.logout()
            return {"success": True, "message": f"No emails found matching \"{query}\""}

        lines = [f"📧 Found {len(msg_ids)} email(s) for \"{query}\":\n"]
        for uid in msg_ids[-5:]:
            _, data = imap.fetch(uid, "(BODY[HEADER.FIELDS (FROM SUBJECT)])")
            for part in data:
                if isinstance(part, tuple):
                    msg_obj = email.message_from_bytes(part[1])
                    sender = _decode_header_value(msg_obj.get("From", "Unknown"))
                    subject = _decode_header_value(msg_obj.get("Subject", "(no subject)"))
                    lines.append(f"• From: {sender}\n  Subject: {subject}")

        imap.logout()
        return {"success": True, "message": "\n".join(lines)}
    except Exception as e:
        logger.error(f"search_emails error: {e}")
        return {"success": False, "error": f"Gmail search error: {e}"}
