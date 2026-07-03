const twilio = require('twilio');

let client = null;

// Lazy init — only create if credentials are present
const getClient = () => {
  if (!client && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    if (
      !process.env.TWILIO_ACCOUNT_SID.startsWith('ACxxx') &&
      !process.env.TWILIO_AUTH_TOKEN.startsWith('your_')
    ) {
      client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
  }
  return client;
};

/**
 * Send a WhatsApp alert to a donor.
 * @param {string} phone - Donor's phone (10-digit Indian number)
 * @param {object} data - Alert details
 */
const sendWhatsAppAlert = async (phone, data) => {
  const twilioClient = getClient();

  if (!twilioClient) {
    console.warn('Twilio not configured — skipping WhatsApp alert');
    return;
  }

  const { donorName, bloodGroup, units, hospital, district, contactName, contactPhone, urgency } = data;

  const urgencyTag = urgency === 'emergency' ? '🚨 EMERGENCY ALERT' : '🩸 Blood Donation Request';

  const messageBody = `${urgencyTag} — RedConnect DYFI Mokeri East

Hello ${donorName},

*${units} unit(s) of ${bloodGroup} blood* needed urgently at:
🏥 *${hospital}*, ${district}

To coordinate, please contact DYFI Coordinators:
📞 Rahul Tacholi — 9946709455
📞 Abhinav PP — 8606839418
📞 Shinantu — 8086849291

Please respond if you are available to donate.
Your help can save a life. 🙏

— RedConnect, DYFI Mokeri East MC`;

  try {
    const whatsappTo = `whatsapp:+91${phone}`;
    const result = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: whatsappTo,
      body: messageBody,
    });

    console.log(`WhatsApp sent to ${phone}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error(`WhatsApp failed for ${phone}:`, error.message);
    throw error;
  }
};

/**
 * Send an SMS alert (fallback if WhatsApp is unavailable)
 */
const sendSMSAlert = async (phone, data) => {
  const twilioClient = getClient();

  if (!twilioClient) {
    console.warn('Twilio not configured — skipping SMS alert');
    return;
  }

  const { bloodGroup, units, hospital, district, contactPhone, urgency } = data;
  const urgencyTag = urgency === 'emergency' ? 'EMERGENCY' : 'Request';

  const messageBody = `RedConnect DYFI: ${units}u of ${bloodGroup} needed at ${hospital}, ${district}. Coordinate via DYFI coordinators: Rahul Tacholi (9946709455), Abhinav PP (8606839418).`;

  try {
    const result = await twilioClient.messages.create({
      from: process.env.TWILIO_SMS_FROM,
      to: `+91${phone}`,
      body: messageBody,
    });

    console.log(`SMS sent to ${phone}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error(`SMS failed for ${phone}:`, error.message);
    throw error;
  }
};

module.exports = { sendWhatsAppAlert, sendSMSAlert };
