"use strict";

function createLoginLimiter({ maxAttempts = 8, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const attempts = new Map();
  return function allowLogin(key) {
    const time = now();
    for (const [candidate, entry] of attempts) {
      if (time - entry.startedAt >= windowMs) attempts.delete(candidate);
    }
    const normalized = String(key || "unknown");
    let entry = attempts.get(normalized);
    if (!entry || time - entry.startedAt >= windowMs) {
      entry = { startedAt: time, count: 0 };
      attempts.set(normalized, entry);
    }
    entry.count += 1;
    return entry.count <= maxAttempts;
  };
}

module.exports = { createLoginLimiter };
