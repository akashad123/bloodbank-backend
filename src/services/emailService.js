const nodemailer = require('nodemailer');

// Check if SMTP is configured
const isSmtpConfigured = () => {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
};

// Create reusable transporter object using the default SMTP transport
const createTransporter = () => {
  if (!isSmtpConfigured()) return null;
  
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const fmtDateOnly = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtTimeOnly = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

const fmtDate = (d) => `${fmtDateOnly(d)}, ${fmtTimeOnly(d)}`;

/**
 * Sends a notification email to official coordinators about a new blood request.
 * Designed to be fire-and-forget (caller does not need to await).
 * 
 * @param {Object} request - The blood request document
 * @param {Array<String>} emails - Array of coordinator email addresses
 */
const sendNewRequestEmail = async (request, emails) => {
  try {
    if (!emails || emails.length === 0) {
      console.log('[emailService] No valid coordinator emails found. Skipping email notification.');
      return;
    }

    if (!isSmtpConfigured()) {
      console.warn('[emailService] SMTP credentials are not configured in .env. Skipping email notification.');
      return;
    }

    const transporter = createTransporter();
    
    // Fallback requester name if createdBy is not populated yet
    const requesterName = request.createdBy?.name || request.contactName || 'A requester';
    const urgencyText = request.urgency === 'emergency' ? 'Urgent' : 'Normal';
    const requestDate = request.createdAt ? fmtDate(request.createdAt) : fmtDate(new Date());

    // Generate request link using APP_URL
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const requestLink = `${appUrl}/requests/${request._id}`;

    const subject = `🩸 New Blood Request | ${request.bloodGroup} | ${request.district} | ${urgencyText}`;
    
    const textBody = `Hello,

A new blood request has been created in RedConnect.

Requester:
${requesterName}

Blood Group:
${request.bloodGroup}

Units Required:
${request.units}

Hospital:
${request.hospital}

District:
${request.district}

Urgency:
${urgencyText}

Date Created:
${requestDate}

View Request:
${requestLink}

Please log in to the RedConnect Admin Panel and assign a suitable donor as soon as possible.

Regards,
RedConnect`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"RedConnect BloodBank" <no-reply@redconnect.in>',
      to: emails.join(', '), // send to all coordinators
      subject: subject,
      text: textBody,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[emailService] New request email sent successfully. MessageId: ${info.messageId}`);
    
  } catch (error) {
    // Log the error but do not throw, as this is fire-and-forget
    console.error('[emailService] Error sending new request email:', error.message);
  }
};

/**
 * Sends a confirmation email to the requester after successfully submitting a request.
 * Designed to be fire-and-forget.
 * 
 * @param {Object} request - The blood request document
 * @param {String} userEmail - The email address of the requester
 */
const sendRequesterConfirmationEmail = async (request, userEmail) => {
  try {
    if (!userEmail) {
      console.log('[emailService] No requester email found. Skipping confirmation email.');
      return;
    }

    if (!isSmtpConfigured()) {
      console.warn('[emailService] SMTP credentials are not configured in .env. Skipping confirmation email.');
      return;
    }

    const transporter = createTransporter();
    
    // Fallback requester name
    const requesterName = request.createdBy?.name || request.contactName || 'Requester';

    const subject = `Blood Request Submitted Successfully`;
    
    const textBody = `Hello ${requesterName},

Your blood request has been successfully registered.

Blood Group: ${request.bloodGroup}
Hospital: ${request.hospital}
District: ${request.district}

Our coordinators have been notified and will begin searching for suitable donors.

You can track the request from your dashboard.

Thank you,
RedConnect`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"RedConnect BloodBank" <no-reply@redconnect.in>',
      to: userEmail,
      subject: subject,
      text: textBody,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[emailService] Requester confirmation email sent successfully. MessageId: ${info.messageId}`);
    
  } catch (error) {
    console.error('[emailService] Error sending requester confirmation email:', error.message);
  }
};

module.exports = {
  sendNewRequestEmail,
  sendRequesterConfirmationEmail
};
