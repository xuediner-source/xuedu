"use strict";

const DEFAULT_CAS_BASE_URL = "https://ids.cqjtu.edu.cn";
const DEFAULT_EDU_BASE_URL = "https://jwgln.cqjtu.edu.cn";
const DEFAULT_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const MIN_SESSION_TTL_SECONDS = 60;
const MAX_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

function httpsBaseUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTPS base URL without credentials, query, or fragment`);
  }
  return parsed.href.replace(/\/$/, "");
}

function loadRuntimeConfig(env = process.env) {
  const casBaseUrl = httpsBaseUrl(env.CAS_BASE_URL || DEFAULT_CAS_BASE_URL, "CAS_BASE_URL");
  const eduBaseUrl = httpsBaseUrl(env.EDU_BASE_URL || DEFAULT_EDU_BASE_URL, "EDU_BASE_URL");
  const rawTtl = env.SESSION_TTL_SECONDS == null || env.SESSION_TTL_SECONDS === ""
    ? DEFAULT_SESSION_TTL_SECONDS
    : Number(env.SESSION_TTL_SECONDS);
  if (!Number.isInteger(rawTtl) || rawTtl < MIN_SESSION_TTL_SECONDS || rawTtl > MAX_SESSION_TTL_SECONDS) {
    throw new Error(`SESSION_TTL_SECONDS must be an integer between ${MIN_SESSION_TTL_SECONDS} and ${MAX_SESSION_TTL_SECONDS}`);
  }
  const timeout = env.UPSTREAM_TIMEOUT_MS == null || env.UPSTREAM_TIMEOUT_MS === ""
    ? 15000
    : Number(env.UPSTREAM_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    throw new Error("UPSTREAM_TIMEOUT_MS must be an integer between 1000 and 120000");
  }
  return {
    casBaseUrl,
    eduBaseUrl,
    sessionTtlMs: rawTtl * 1000,
    upstreamTimeoutMs: timeout,
  };
}

module.exports = {
  DEFAULT_CAS_BASE_URL,
  DEFAULT_EDU_BASE_URL,
  DEFAULT_SESSION_TTL_SECONDS,
  MIN_SESSION_TTL_SECONDS,
  MAX_SESSION_TTL_SECONDS,
  httpsBaseUrl,
  loadRuntimeConfig,
};
