const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
require('dotenv').config();

// ===== SEND EMAIL =====
function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

async function sendEmail(to, subject, body) {
  const user = process.env.GMAIL_USER;

  if (!to) return { success: false, error: 'No recipient specified' };
  if (!subject) return { success: false, error: 'No subject specified' };
  if (!body) return { success: false, error: 'No body specified' };

  let transporter;
  try {
    transporter = createTransporter();
  } catch (err) {
    return { success: false, error: `Gmail not configured: ${err.message}` };
  }

  try {
    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);

    const info = await transporter.sendMail({
      from: user,
      to,
      subject,
      text: body,
    });

    console.log(`📧 Email sent: ${info.messageId}`);
    return { success: true, message: `Email sent to ${to}` };
  } catch (err) {
    console.error('❌ Gmail send error:', err.message);
    return { success: false, error: `Failed to send: ${err.message}` };
  }
}

// ===== IMAP CONNECTION =====
function createImapConnection() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env');
  }

  return new Imap({
    user,
    password: pass,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
  });
}

function openInbox(imap) {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', true, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}

function searchMessages(imap, criteria) {
  return new Promise((resolve, reject) => {
    imap.search(criteria, (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

function fetchMessages(imap, uids, options) {
  return new Promise((resolve, reject) => {
    if (!uids || uids.length === 0) return resolve([]);

    const messages = [];
    const fetch = imap.fetch(uids, options);

    fetch.on('message', (msg) => {
      const chunks = [];
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          messages.push(Buffer.concat(chunks));
        });
      });
    });

    fetch.once('error', reject);
    fetch.once('end', () => resolve(messages));
  });
}

// ===== CHECK INBOX — summary of unread count + recent senders =====
async function checkEmailInbox() {
  console.log('📧 Checking Gmail inbox via IMAP...');

  return new Promise((resolve) => {
    let imap;
    try {
      imap = createImapConnection();
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    imap.once('ready', async () => {
      try {
        await openInbox(imap);

        // Get unread count
        const unreadUids = await searchMessages(imap, ['UNSEEN']);
        const totalUids = await searchMessages(imap, ['ALL']);

        let recentSenders = [];
        let recentSubjects = [];

        if (unreadUids.length > 0) {
          // Fetch the 5 most recent unread emails
          const slice = unreadUids.slice(-5).reverse();
          const rawMessages = await fetchMessages(imap, slice, { bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)', struct: false });

          for (const rawBuf of rawMessages) {
            try {
              const parsed = await simpleParser(rawBuf);
              const fromAddress = parsed.from && parsed.from.text ? parsed.from.text : 'Unknown';
              const subject = parsed.subject || '(no subject)';
              recentSenders.push(fromAddress);
              recentSubjects.push(subject);
            } catch (_) { /* skip parse errors */ }
          }
        }

        imap.end();

        const unreadCount = unreadUids.length;
        const totalCount = totalUids.length;

        let message = `📧 Gmail Inbox:\n• ${unreadCount} unread of ${totalCount} total`;
        if (recentSenders.length > 0) {
          message += `\n\nRecent unread emails:`;
          for (let i = 0; i < recentSenders.length; i++) {
            message += `\n• From: ${recentSenders[i]}\n  Subject: ${recentSubjects[i]}`;
          }
        } else {
          message += `\n✅ All caught up — no unread emails!`;
        }

        resolve({ success: true, message });
      } catch (err) {
        console.error('❌ Gmail IMAP error:', err.message);
        imap.end();
        resolve({ success: false, error: `Could not read inbox: ${err.message}` });
      }
    });

    imap.once('error', (err) => {
      console.error('❌ IMAP connection error:', err.message);
      resolve({ success: false, error: `Gmail connection failed: ${err.message}` });
    });

    imap.connect();
  });
}

// ===== GET UNREAD EMAILS — detailed list =====
async function getUnreadEmails() {
  console.log('📧 Fetching unread emails via IMAP...');

  return new Promise((resolve) => {
    let imap;
    try {
      imap = createImapConnection();
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    imap.once('ready', async () => {
      try {
        await openInbox(imap);
        const unreadUids = await searchMessages(imap, ['UNSEEN']);

        if (unreadUids.length === 0) {
          imap.end();
          return resolve({ success: true, message: '📭 No unread emails! Your inbox is clear, boss.' });
        }

        // Fetch up to 8 most recent unread
        const slice = unreadUids.slice(-8).reverse();
        const rawMessages = await fetchMessages(imap, slice, { bodies: '', struct: false });

        imap.end();

        const emails = [];
        for (const rawBuf of rawMessages) {
          try {
            const parsed = await simpleParser(rawBuf);
            emails.push({
              from: parsed.from && parsed.from.text ? parsed.from.text : 'Unknown',
              subject: parsed.subject || '(no subject)',
              date: parsed.date ? parsed.date.toLocaleDateString() : 'Unknown date',
              preview: (parsed.text || '').slice(0, 120).replace(/\s+/g, ' ').trim(),
            });
          } catch (_) { /* skip */ }
        }

        let message = `📬 ${unreadUids.length} unread email${unreadUids.length > 1 ? 's' : ''}:\n`;
        emails.forEach((email, i) => {
          message += `\n${i + 1}. From: ${email.from}\n   Subject: ${email.subject}\n   Date: ${email.date}`;
          if (email.preview) message += `\n   Preview: ${email.preview}...`;
        });

        resolve({ success: true, message });
      } catch (err) {
        console.error('❌ Gmail IMAP error:', err.message);
        imap.end();
        resolve({ success: false, error: `Could not fetch emails: ${err.message}` });
      }
    });

    imap.once('error', (err) => {
      console.error('❌ IMAP connection error:', err.message);
      resolve({ success: false, error: `Gmail connection failed: ${err.message}` });
    });

    imap.connect();
  });
}

// ===== SEARCH EMAILS =====
async function searchEmails(query) {
  if (!query) return { success: false, error: 'No search query provided' };
  console.log(`📧 Searching Gmail for: ${query}`);

  return new Promise((resolve) => {
    let imap;
    try {
      imap = createImapConnection();
    } catch (err) {
      return resolve({ success: false, error: err.message });
    }

    imap.once('ready', async () => {
      try {
        await openInbox(imap);

        // Search by subject OR sender
        let uids = [];
        try {
          const bySubject = await searchMessages(imap, [['SUBJECT', query]]);
          const byFrom = await searchMessages(imap, [['FROM', query]]);
          // Merge and deduplicate
          const combined = [...new Set([...bySubject, ...byFrom])];
          uids = combined.sort((a, b) => b - a).slice(0, 8);
        } catch (_) {
          uids = [];
        }

        if (uids.length === 0) {
          imap.end();
          return resolve({ success: true, message: `📭 No emails found matching "${query}"` });
        }

        const rawMessages = await fetchMessages(imap, uids, { bodies: '', struct: false });
        imap.end();

        const emails = [];
        for (const rawBuf of rawMessages) {
          try {
            const parsed = await simpleParser(rawBuf);
            emails.push({
              from: parsed.from && parsed.from.text ? parsed.from.text : 'Unknown',
              subject: parsed.subject || '(no subject)',
              date: parsed.date ? parsed.date.toLocaleDateString() : 'Unknown date',
              preview: (parsed.text || '').slice(0, 100).replace(/\s+/g, ' ').trim(),
            });
          } catch (_) { /* skip */ }
        }

        let message = `🔍 Found ${emails.length} email${emails.length !== 1 ? 's' : ''} matching "${query}":\n`;
        emails.forEach((email, i) => {
          message += `\n${i + 1}. From: ${email.from}\n   Subject: ${email.subject}\n   Date: ${email.date}`;
          if (email.preview) message += `\n   Preview: ${email.preview}...`;
        });

        resolve({ success: true, message });
      } catch (err) {
        console.error('❌ Gmail IMAP search error:', err.message);
        imap.end();
        resolve({ success: false, error: `Search failed: ${err.message}` });
      }
    });

    imap.once('error', (err) => {
      console.error('❌ IMAP connection error:', err.message);
      resolve({ success: false, error: `Gmail connection failed: ${err.message}` });
    });

    imap.connect();
  });
}

module.exports = { sendEmail, checkEmailInbox, getUnreadEmails, searchEmails };
