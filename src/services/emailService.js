/**
 * Brevo Transactional Email REST API Service
 * 
 * Replaces legacy Nodemailer SMTP with Brevo's v3 Transactional Email REST API over HTTPS (Port 443).
 * Eliminates cloud egress SMTP connection timeouts (ETIMEDOUT) on Render.
 */

const fmtDateOnly = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const fmtTimeOnly = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

const fmtDate = (d) => `${fmtDateOnly(d)}, ${fmtTimeOnly(d)}`;

/**
 * Helper to extract name and email from EMAIL_FROM environment variable.
 * Example: '"RedConnect Blood Bank" <akash.ad@lead.ac.in>' -> { name: 'RedConnect Blood Bank', email: 'akash.ad@lead.ac.in' }
 */
const getSender = () => {
  const rawSender = process.env.EMAIL_FROM;
  if (!rawSender) {
    return { name: 'RedConnect Blood Bank', email: 'no-reply@redconnect.in' };
  }
  const match = rawSender.match(/^(?:"?([^"]*)"?\s+)?<?([^>]+)>?$/);
  if (match) {
    const name = match[1] ? match[1].trim() : 'RedConnect Blood Bank';
    const email = match[2].trim();
    return { name, email };
  }
  return { name: 'RedConnect Blood Bank', email: rawSender.trim() };
};

/**
 * Dispatches an email via Brevo's Transactional Email REST API (https://api.brevo.com/v3/smtp/email).
 * 
 * @param {Object} params
 * @param {Object} params.sender - { name, email }
 * @param {Array<Object>} params.to - Array of recipient objects [{ email, name? }]
 * @param {String} params.subject - Email subject
 * @param {String} params.textContent - Plain text content
 * @param {String} [params.requestId] - Associated blood request ID for diagnostics
 */
const sendBrevoEmail = async ({ sender, to, subject, textContent, requestId }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('[emailService] BREVO_API_KEY environment variable is missing. Skipping email notification.');
    return null;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender,
      to,
      subject,
      textContent,
    }),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[emailService] Brevo API Email Delivery Failed:', {
      status: response.status,
      statusText: response.statusText,
      requestId: requestId || 'N/A',
      recipients: to.map(r => r.email).join(', '),
      brevoResponse: responseData,
    });
    return null;
  }

  const messageId = responseData.messageId || responseData.messageIds?.[0] || 'N/A';

  return responseData;
};

/**
 * Sends a notification email to official coordinators about a new blood request.
 * Designed to be fire-and-forget (caller does not need to await).
 * 
 * @param {Object} request - The blood request document
 * @param {Array<String>} emails - Array of coordinator email addresses
 */
const sendNewRequestEmail = async (request, emails) => {
  const timestamp = new Date().toISOString();
  const reqId = String(request._id);
  const createdById = request.createdBy?._id ? String(request.createdBy._id) : String(request.createdBy || 'UNKNOWN');

  try {
    if (!emails || emails.length === 0) {

      return;
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn(`[${timestamp}] [USER:${createdById}] [REQ:${reqId}] Step 11 WARN: BREVO_API_KEY environment variable is missing in process.env. Skipping.`);
      return;
    }

    const requesterName = request.createdBy?.name || request.contactName || 'A requester';
    const urgencyText = request.urgency === 'emergency' ? 'Urgent' : 'Normal';
    const requestDate = request.createdAt ? fmtDate(request.createdAt) : fmtDate(new Date());

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

    const sender = getSender();
    const to = emails.map((email) => ({ email: email.trim() }));



    const result = await sendBrevoEmail({
      sender,
      to,
      subject,
      textContent: textBody,
      requestId: reqId,
    });

    if (result) {

    }
  } catch (error) {
    console.error(`[${timestamp}] [USER:${createdById}] [REQ:${reqId}] Error sending new request email via Brevo API:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
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

      return;
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn('[emailService] BREVO_API_KEY environment variable is missing. Skipping confirmation email.');
      return;
    }

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

    const sender = getSender();
    const to = [{ email: userEmail.trim() }];

    await sendBrevoEmail({
      sender,
      to,
      subject,
      textContent: textBody,
      requestId: String(request._id),
    });
  } catch (error) {
    console.error('[emailService] Error sending requester confirmation email via Brevo API:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }
};

module.exports = {
  sendNewRequestEmail,
  sendRequesterConfirmationEmail,
};
