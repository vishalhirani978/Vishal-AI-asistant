const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const CONTACTS_FILE = 'vishal-contacts.json';

function getContactsPath() {
  return path.join(app.getPath('userData'), CONTACTS_FILE);
}

function loadContacts() {
  try {
    const filePath = getContactsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const contacts = JSON.parse(data);
      if (Array.isArray(contacts)) return contacts;
    }
  } catch (err) {
    console.error('❌ Contacts load error:', err.message);
  }
  return [];
}

function saveContacts(contacts) {
  try {
    const filePath = getContactsPath();
    fs.writeFileSync(filePath, JSON.stringify(contacts, null, 2));
    console.log(`📇 Saved ${contacts.length} contacts`);
    return true;
  } catch (err) {
    console.error('❌ Contacts save error:', err.message);
    return false;
  }
}

function lookupContact(nameOrIdentifier) {
  const contacts = loadContacts();
  const lower = nameOrIdentifier.toLowerCase().trim();

  return contacts.find(c =>
    c.name.toLowerCase() === lower ||
    c.name.toLowerCase().includes(lower) ||
    (c.phone && c.phone.replace(/[\s\-\(\)]/g, '') === lower.replace(/[\s\-\(\)]/g, '')) ||
    (c.email && c.email.toLowerCase() === lower)
  ) || null;
}

function resolveRecipient(input) {
  const contact = lookupContact(input);
  if (contact) {
    return {
      resolved: true,
      contact,
      name: contact.name,
      phone: contact.phone || null,
      email: contact.email || null,
    };
  }
  return {
    resolved: false,
    contact: null,
    name: input,
    phone: null,
    email: null,
  };
}

function addContact(name, phone, email, notes) {
  if (!name || !name.trim()) {
    return { success: false, error: 'Name is required' };
  }

  const contacts = loadContacts();
  const lower = name.trim().toLowerCase();

  const existing = contacts.findIndex(c => c.name.toLowerCase() === lower);
  if (existing !== -1) {
    if (phone !== undefined) contacts[existing].phone = phone || '';
    if (email !== undefined) contacts[existing].email = email || '';
    if (notes !== undefined) contacts[existing].notes = notes || '';
    contacts[existing].updatedAt = new Date().toISOString();
    saveContacts(contacts);
    return { success: true, message: `Updated contact "${contacts[existing].name}"`, contact: contacts[existing] };
  }

  const contact = {
    name: name.trim(),
    phone: phone || '',
    email: email || '',
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  contacts.push(contact);
  saveContacts(contacts);
  return { success: true, message: `Added contact "${contact.name}"`, contact };
}

function removeContact(name) {
  const contacts = loadContacts();
  const lower = name.toLowerCase().trim();
  const index = contacts.findIndex(c => c.name.toLowerCase() === lower);
  if (index === -1) {
    return { success: false, error: `Contact "${name}" not found` };
  }
  const removed = contacts.splice(index, 1)[0];
  saveContacts(contacts);
  return { success: true, message: `Removed contact "${removed.name}"` };
}

function getAllContacts() {
  return loadContacts();
}

module.exports = {
  lookupContact,
  resolveRecipient,
  addContact,
  removeContact,
  getAllContacts,
  loadContacts,
  saveContacts,
};
