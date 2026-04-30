const twilio = require('twilio');

let client = null;

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
 * Send an SMS message using Twilio
 * @param {string} to - The phone number to send the SMS to (will be formatted to E.164 +91...)
 * @param {string} message - The content of the SMS
 */
const sendSMS = async (to, message) => {
  try {
    const twilioClient = getClient();
    
    if (!twilioClient || !process.env.TWILIO_SMS_FROM) {
      console.warn('Twilio not configured — skipping SMS notification');
      return;
    }

    // Ensure E.164 format for India (+91)
    let formattedPhone = to.trim();
    if (formattedPhone.length === 10) {
      formattedPhone = `+91${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    const result = await twilioClient.messages.create({
      from: process.env.TWILIO_SMS_FROM,
      to: formattedPhone,
      body: message,
    });

    console.log(`Status SMS sent to ${formattedPhone}: ${result.sid}`);
    return result;
  } catch (error) {
    // Catch error so we don't break the main API flow
    console.error(`Status SMS failed for ${to}:`, error.message);
  }
};

module.exports = { sendSMS };
