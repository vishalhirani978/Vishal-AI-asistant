const nodemailer = require('nodemailer');
require('dotenv').config();

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

  if (!to) {
    return { success: false, error: 'No recipient specified' };
  }
  if (!subject) {
    return { success: false, error: 'No subject specified' };
  }
  if (!body) {
    return { success: false, error: 'No body specified' };
  }

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

module.exports = { sendEmail };
