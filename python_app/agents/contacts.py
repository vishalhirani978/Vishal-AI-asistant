"""
contacts.py — Simple contact book stored as JSON
"""

import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

_CONTACTS_FILE = os.path.join(os.path.expanduser("~"), "AppData", "Local", "PixelPM", "contacts.json")


def _ensure_dir():
    os.makedirs(os.path.dirname(_CONTACTS_FILE), exist_ok=True)


def load_contacts() -> list:
    _ensure_dir()
    try:
        if os.path.exists(_CONTACTS_FILE):
            with open(_CONTACTS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
    except Exception as e:
        logger.error(f"Contacts load error: {e}")
    return []


def save_contacts(contacts: list) -> bool:
    _ensure_dir()
    try:
        with open(_CONTACTS_FILE, "w", encoding="utf-8") as f:
            json.dump(contacts, f, indent=2)
        logger.info(f"Saved {len(contacts)} contacts")
        return True
    except Exception as e:
        logger.error(f"Contacts save error: {e}")
        return False


def lookup_contact(name_or_id: str) -> dict | None:
    contacts = load_contacts()
    lower = name_or_id.lower().strip()
    for c in contacts:
        if (c["name"].lower() == lower
                or lower in c["name"].lower()
                or (c.get("phone") and c["phone"].replace(" ", "").replace("-", "") == lower.replace(" ", "").replace("-", ""))
                or (c.get("email") and c["email"].lower() == lower)):
            return c
    return None


def resolve_recipient(input_str: str) -> dict:
    contact = lookup_contact(input_str)
    if contact:
        return {
            "resolved": True,
            "contact": contact,
            "name": contact["name"],
            "phone": contact.get("phone") or None,
            "email": contact.get("email") or None,
        }
    return {"resolved": False, "contact": None, "name": input_str, "phone": None, "email": None}


def add_contact(name: str, phone: str = None, email: str = None, notes: str = None) -> dict:
    if not name or not name.strip():
        return {"success": False, "error": "Name is required"}

    contacts = load_contacts()
    lower = name.strip().lower()
    existing_idx = next((i for i, c in enumerate(contacts) if c["name"].lower() == lower), -1)

    now = datetime.utcnow().isoformat()

    if existing_idx != -1:
        c = contacts[existing_idx]
        if phone is not None:
            c["phone"] = phone
        if email is not None:
            c["email"] = email
        if notes is not None:
            c["notes"] = notes
        c["updatedAt"] = now
        save_contacts(contacts)
        return {"success": True, "message": f"Updated contact \"{c['name']}\"", "contact": c}

    contact = {
        "name": name.strip(),
        "phone": phone or "",
        "email": email or "",
        "notes": notes or "",
        "createdAt": now,
        "updatedAt": now,
    }
    contacts.append(contact)
    save_contacts(contacts)
    return {"success": True, "message": f"Added contact \"{contact['name']}\"", "contact": contact}


def remove_contact(name: str) -> dict:
    contacts = load_contacts()
    lower = name.lower().strip()
    idx = next((i for i, c in enumerate(contacts) if c["name"].lower() == lower), -1)
    if idx == -1:
        return {"success": False, "error": f"Contact \"{name}\" not found"}
    removed = contacts.pop(idx)
    save_contacts(contacts)
    return {"success": True, "message": f"Removed contact \"{removed['name']}\""}


def search_contact(query: str) -> dict:
    c = lookup_contact(query)
    if c:
        return {"success": True, "contact": c, "message": f"Found: {c['name']} (Phone: {c.get('phone', 'N/A')}, Email: {c.get('email', 'N/A')})"}
    return {"success": False, "message": f"No contact found matching '{query}'"}


def get_all_contacts() -> list:
    return load_contacts()

