const loginFailures = new Map();

// Helper to clean up memory every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of loginFailures.entries()) {
    // If lock expired and last attempt was > 15 mins ago, remove it
    if (data.lockUntil < now && data.lastAttempt < now - 15 * 60 * 1000) {
      loginFailures.delete(key);
    }
  }
}, 15 * 60 * 1000);

/**
 * Generate a composite key for tracking failed login attempts
 * Combines IP and the provided identity (phone or email)
 */
const getTrackingKey = (ip, identity) => {
  return `${ip}_${identity ? identity.toLowerCase().trim() : 'unknown'}`;
};

/**
 * Middleware to intercept login requests if the specific IP/identity combination is locked
 */
const loginRateLimiter = (req, res, next) => {
  const identity = req.body.phone || req.body.email || '';
  const key = getTrackingKey(req.ip, identity);
  const now = Date.now();
  
  const attemptData = loginFailures.get(key);
  
  if (attemptData && attemptData.lockUntil > now) {
    const remainingSeconds = Math.ceil((attemptData.lockUntil - now) / 1000);
    return res.status(429).json({
      message: 'Too many failed login attempts.',
      retryAfter: remainingSeconds,
      remainingLockTime: remainingSeconds,
      failedAttempts: attemptData.count,
      lockLevel: attemptData.lockLevel
    });
  }
  
  next();
};

/**
 * Increments the failure counter for the given IP and identity.
 * Applies progressive lockouts.
 */
const incrementLoginFailure = (ip, identity) => {
  const key = getTrackingKey(ip, identity);
  const now = Date.now();
  
  if (!loginFailures.has(key)) {
    loginFailures.set(key, { count: 0, lockUntil: 0, lastAttempt: now, lockLevel: 0 });
  }
  
  const attemptData = loginFailures.get(key);
  attemptData.count += 1;
  attemptData.lastAttempt = now;
  
  // Progressive lockouts
  if (attemptData.count >= 10) {
    attemptData.lockUntil = now + 900 * 1000; // 15 mins
    attemptData.lockLevel = 3;
  } else if (attemptData.count >= 8) {
    attemptData.lockUntil = now + 300 * 1000; // 5 mins
    attemptData.lockLevel = 2;
  } else if (attemptData.count >= 5) {
    attemptData.lockUntil = now + 60 * 1000; // 60 secs
    attemptData.lockLevel = 1;
  } else {
    attemptData.lockLevel = 0;
  }

  if (attemptData.lockLevel > 0 && (attemptData.count === 5 || attemptData.count === 8 || attemptData.count === 10)) {
    console.warn(`[Security] Login lockout (Level ${attemptData.lockLevel}) applied for IP: ${ip} after ${attemptData.count} failed attempts.`);
  } else {
    console.log(`[Security] Failed login attempt from IP: ${ip}. Count: ${attemptData.count}`);
  }
};

/**
 * Resets the failure counter on successful login
 */
const resetLoginSuccess = (ip, identity) => {
  const key = getTrackingKey(ip, identity);
  if (loginFailures.has(key)) {
    loginFailures.delete(key);
    console.log(`[Security] Successful login from IP: ${ip}. Cleared rate limit lock.`);
  }
};

module.exports = {
  loginRateLimiter,
  incrementLoginFailure,
  resetLoginSuccess
};
