"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadRuntimeConfig,
  httpsBaseUrl,
  DEFAULT_CAS_BASE_URL,
  DEFAULT_EDU_BASE_URL,
} = require("../lib/runtime-config");
const {
  parseWeekType,
  parseWeekRanges,
  formatWeekLabel,
  parseSemesterStart,
  currentWeekOf,
} = require("../lib/semester");
const { createUpstreamFetcher, assertSecureUrl, upstreamPublicMessage } = require("../lib/upstream");
const { createLoginLimiter } = require("../lib/login-limiter");
const {
  parseEncryptionKey,
  encryptSessionDump,
  decryptSessionDump,
} = require("../lib/session-persistence");

test("upstream defaults are HTTPS and insecure CAS configuration is rejected", () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.casBaseUrl, DEFAULT_CAS_BASE_URL);
  assert.equal(config.eduBaseUrl, DEFAULT_EDU_BASE_URL);
  assert.equal(config.sessionTtlMs, 14 * 24 * 60 * 60 * 1000);
  assert.equal(loadRuntimeConfig({ SESSION_TTL_SECONDS: "3600" }).sessionTtlMs, 3600 * 1000);
  assert.match(httpsBaseUrl("https://cas.example.edu/", "CAS_BASE_URL"), /^https:\/\//);
  assert.throws(() => loadRuntimeConfig({ CAS_BASE_URL: "http://cas.example.edu" }), /HTTPS/);
  assert.throws(() => loadRuntimeConfig({ CAS_BASE_URL: "https://user:pass@cas.example.edu" }), /HTTPS/);
  assert.throws(() => loadRuntimeConfig({ SESSION_TTL_SECONDS: "30" }), /SESSION_TTL_SECONDS/);
  assert.throws(() => assertSecureUrl("http://cas.example.edu/authserver/login"), /HTTPS/);
});

test("semester dates are explicit and unknown terms remain unknown", () => {
  const firstTerm = parseSemesterStart("2026-2027-1");
  assert.equal(firstTerm.iso, "2026-09-07");
  assert.equal(firstTerm.known, true);
  assert.equal(currentWeekOf(firstTerm.iso, new Date("2026-09-13T15:59:00Z")), 1);
  assert.equal(currentWeekOf(firstTerm.iso, new Date("2026-09-13T16:00:00Z")), 2);
  assert.equal(currentWeekOf("2026-10-05", new Date("2026-10-02T00:00:00Z")), 0);
  assert.equal(currentWeekOf(firstTerm.iso, new Date("2027-04-19T00:00:00Z")), 33);
  assert.deepEqual(parseSemesterStart("2025-2026-2"), { iso: "", date: null, known: false });
  assert.equal(currentWeekOf(""), null);
});

test("week parsing preserves discrete and separated ranges and parity", () => {
  const ranges = parseWeekRanges("第1-3周，5，7~9周[01-02节]（双周）");
  assert.deepEqual(ranges, [{ start: 1, end: 3 }, { start: 5, end: 5 }, { start: 7, end: 9 }]);
  assert.equal(formatWeekLabel(ranges), "1-3,5,7-9");
  assert.deepEqual(parseWeekRanges("10周"), [{ start: 10, end: 10 }]);
  assert.deepEqual(parseWeekRanges("1,3,5周"), [{ start: 1, end: 1 }, { start: 3, end: 3 }, { start: 5, end: 5 }]);
  assert.deepEqual(parseWeekRanges("31-40周"), [{ start: 31, end: 40 }]);
  assert.equal(parseWeekType("第1-16周（单周）"), "odd");
  assert.equal(parseWeekType("第2-16周（双周）"), "even");
  assert.equal(parseWeekType("1-16周"), "all");
});

test("session encryption requires a supplied 32-byte key and authenticates stored data", () => {
  assert.equal(parseEncryptionKey(""), null);
  const key = Buffer.alloc(32, 7);
  assert.deepEqual(parseEncryptionKey(key.toString("hex")), key);
  assert.throws(() => parseEncryptionKey("short"), /32-byte/);
  const sessions = [{ id: "opaque-session", username: "student-id", jar: { cookies: [] } }];
  const encrypted = encryptSessionDump(sessions, key);
  assert.equal(JSON.stringify(encrypted).includes("student-id"), false);
  assert.deepEqual(decryptSessionDump(encrypted, key), sessions);
  assert.throws(() => decryptSessionDump(encrypted, Buffer.alloc(32, 8)));
});

test("upstream fetch rejects HTTP, applies timeout and reports upstream failures safely", async () => {
  let receivedOptions;
  const fetcher = createUpstreamFetcher({
    timeoutMs: 1200,
    fetchImpl: async (url, options) => {
      receivedOptions = options;
      return { status: 200, headers: { getSetCookie: () => ["sid=secret; Secure"] } };
    },
  });
  const cookieWrites = [];
  await fetcher("https://cas.example.edu/login", {}, {
    getCookieString: async () => "old=1",
    setCookies: async (url, cookies) => cookieWrites.push([url, cookies]),
  });
  assert.equal(receivedOptions.headers.Cookie, "old=1");
  assert.equal(receivedOptions.redirect, "manual");
  assert.ok(receivedOptions.signal);
  assert.equal(cookieWrites.length, 1);
  await assert.rejects(fetcher("http://cas.example.edu/login", {}, null), { code: "UPSTREAM_INSECURE_URL" });

  const timeoutFetcher = createUpstreamFetcher({
    fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); },
  });
  await assert.rejects(timeoutFetcher("https://cas.example.edu/login", {}, null), { code: "UPSTREAM_TIMEOUT" });
  assert.equal(upstreamPublicMessage({ code: "UPSTREAM_TIMEOUT" }), "教务系统响应超时，请稍后重试");

  const failedFetcher = createUpstreamFetcher({ fetchImpl: async () => ({ status: 503, headers: {} }) });
  await assert.rejects(failedFetcher("https://cas.example.edu/login", {}, null), { code: "UPSTREAM_HTTP_ERROR" });
});

test("login limiter bounds attempts per key and resets after its window", () => {
  let now = 1000;
  const allow = createLoginLimiter({ maxAttempts: 2, windowMs: 5000, now: () => now });
  assert.equal(allow("127.0.0.1"), true);
  assert.equal(allow("127.0.0.1"), true);
  assert.equal(allow("127.0.0.1"), false);
  assert.equal(allow("127.0.0.2"), true);
  now += 5000;
  assert.equal(allow("127.0.0.1"), true);
});
