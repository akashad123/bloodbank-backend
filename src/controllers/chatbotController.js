const axios = require('axios');
const User = require('../models/User');
const { DISTRICT_HOSPITALS, ELIGIBILITY_GAP_DAYS } = require('../config/constants');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-3.1-8b-instruct'; // Better default model
const FALLBACK_MODEL = 'openai/gpt-3.5-turbo';

const userSessions = {};

// 1) STRONG RULE-BASED RESPONSES (NO API)
function ruleReply(msg) {
  const m = msg.toLowerCase();

  if (m.includes("age")) {
    return "You can donate blood between 18–65 years if you're healthy.";
  }

  if (m.includes("precaution") || m.includes("before donation")) {
    return "Before donating: sleep well, eat light, drink water, avoid alcohol, and carry ID.";
  }

  if (m.includes("food") || m.includes("eat")) {
    return "After donation: eat iron-rich foods (spinach, dates, jaggery), and hydrate well.";
  }

  if (m.includes("blood group")) {
    return "O- is universal donor. AB+ can receive from all groups.";
  }
  
  if (m.includes("eligible")) {
    return "You can donate blood if you are 18–65 years old, healthy, and haven't donated in the last 3 months.";
  }

  return null;
}

// 3) AI CALL WITH RETRY + FALLBACK MODEL
async function callAI(messages) {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://bloodbank-kerala.app',
    'X-Title': 'BloodBank Kerala',
  };

  const payload = {
    messages,
    temperature: 0.7
  };

  // Try preferred model
  try {
    return await axios.post(
      OPENROUTER_URL,
      { ...payload, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL },
      { headers }
    );
  } catch (e) {
    // If 429 → fallback to lighter model
    if (e.response?.status === 429) {
      console.warn(`[Chatbot] 429 Rate Limit hit. Falling back to ${FALLBACK_MODEL}`);
      return await axios.post(
        OPENROUTER_URL,
        { ...payload, model: FALLBACK_MODEL },
        { headers }
      );
    }
    throw e;
  }
}

// ─── POST /api/chatbot/message ────────────────────────────────────────
const sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const userId = req.user._id.toString();
    if (!userSessions[userId]) {
      userSessions[userId] = [];
    }

    // Add user message to memory
    userSessions[userId].push({
      role: "user",
      content: message
    });

    // Limit memory to last 6 messages
    userSessions[userId] = userSessions[userId].slice(-6);

    // Add backend debug
    console.log("USER:", message);

    // 2) USE RULE FIRST
    const instant = ruleReply(message);
    if (instant) {
      userSessions[userId].push({ role: "assistant", content: instant });
      return res.json({ reply: instant });
    }

    // 4) CONTROLLER logic for AI Call
    const district = req.user.district || 'Kerala';
    
    let userContext = `User is from ${district}, Kerala. Suggest nearby hospitals if needed.`;
    if (req.user) {
      const user = await User.findById(req.user._id);
      userContext += `\nUser details: Name: ${user.name}, Blood Group: ${user.bloodGroup}.`;
    }

    const messages = [
      {
        role: "system",
        content: `You are RedConnect AI, a smart Kerala-based blood donation assistant.
Rules:
* Be short, human, helpful
* Use context from previous messages
* If location is mentioned → use it
* Avoid repeating same intro
* Sound like a real assistant, not a robot
${userContext}`
      },
      ...userSessions[userId]
    ];

    const aiRes = await callAI(messages);
    const aiReply = aiRes.data.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";

    // Save AI Response to Memory
    userSessions[userId].push({
      role: "assistant",
      content: aiReply
    });

    // Append hospital info for location queries
    let hospitalInfo = null;
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('hospital') || lowerMsg.includes('where') || lowerMsg.includes('nearest')) {
      if (req.user && DISTRICT_HOSPITALS[req.user.district]) {
        hospitalInfo = {
          district: req.user.district,
          hospitals: DISTRICT_HOSPITALS[req.user.district],
        };
      }
    }

    res.json({ reply: aiReply, hospitalInfo });
  } catch (error) {
    console.error('Chatbot error:', error.response?.data || error.message);
    
    // Return friendly fallback message on complete failure
    return res.json({ 
      reply: "I'm a bit busy right now. Here’s a quick tip: stay hydrated and eat well before donation. Try again in a moment.",
      isErrorFallback: true 
    });
  }
};

module.exports = { sendMessage };
