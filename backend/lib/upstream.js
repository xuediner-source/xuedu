"use strict";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

class UpstreamError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "UpstreamError";
    this.code = code;
    if (status) this.status = status;
  }
}

function assertSecureUrl(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new UpstreamError("UPSTREAM_INVALID_URL", "教务系统地址配置无效");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new UpstreamError("UPSTREAM_INSECURE_URL", "教务系统只允许通过 HTTPS 连接");
  }
  return url.href;
}

function upstreamPublicMessage(error, fallback = "教务系统暂时无法完成请求，请稍后重试") {
  if (error && error.code === "UPSTREAM_TIMEOUT") return "教务系统响应超时，请稍后重试";
  if (error && error.code === "UPSTREAM_HTTP_ERROR") return "教务系统暂时故障，请稍后重试";
  if (error && error.code === "UPSTREAM_INSECURE_URL") return "教务系统地址不安全，请联系管理员检查配置";
  if (error && (error.code === "UPSTREAM_UNAVAILABLE" || error.code === "UPSTREAM_INVALID_URL")) {
    return "教务系统暂时无法连接，请稍后重试";
  }
  if (error && (error.name === "AbortError" || error.name === "TimeoutError")) return "教务系统响应超时，请稍后重试";
  return fallback;
}

function createUpstreamFetcher({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  return async function fetchWithCookies(url, options = {}, cm) {
    const secureUrl = assertSecureUrl(url);
    const headers = { ...(options.headers || {}) };
    headers["User-Agent"] = USER_AGENT;
    headers["Accept-Language"] = "zh-CN,zh;q=0.9,en;q=0.8";
    if (cm && typeof cm.getCookieString === "function") {
      const cookieString = await cm.getCookieString(secureUrl);
      if (cookieString) headers.Cookie = cookieString;
    }

    let signal = options.signal;
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      signal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (timer.unref) timer.unref();
      if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
      signal = controller.signal;
    }

    let response;
    try {
      response = await fetchImpl(secureUrl, { ...options, headers, signal, redirect: "manual" });
    } catch (error) {
      if (error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new UpstreamError("UPSTREAM_TIMEOUT", "Upstream request timed out");
      }
      throw new UpstreamError("UPSTREAM_UNAVAILABLE", "Upstream request failed");
    }

    if (response.status >= 500) {
      throw new UpstreamError("UPSTREAM_HTTP_ERROR", `Upstream returned ${response.status}`, response.status);
    }
    const setCookie = response.headers && typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
    if (cm && setCookie && setCookie.length) await cm.setCookies(secureUrl, setCookie);
    return response;
  };
}

module.exports = { UpstreamError, assertSecureUrl, upstreamPublicMessage, createUpstreamFetcher };
