"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CookieJar } = require("tough-cookie");
const { decryptSessionDump, parseEncryptionKey } = require("../lib/session-persistence");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cqjtu-backend-test-"));
const encryptionKey = require("node:crypto").randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";
process.env.DATA_DIR = dataDir;
process.env.GRAY_ENABLED = "0";
process.env.SESSION_ENCRYPTION_KEY = encryptionKey;
delete process.env.GRAY_ADMIN_TOKEN;
delete process.env.GRAY_ADMIN_IPS;
process.env.APP_RELEASE_FILE = path.join(dataDir, "app-release.json");

const nativeFetch = global.fetch;
let upstreamCalls = [];
let omitSelectedOnGet = false;
global.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  upstreamCalls.push({ url, method });
  const selectedTerm = "2026-2027-1";
  const alternateTerm = "2025-2026-2";
  const selected = method === "GET" && omitSelectedOnGet ? "" : " selected";
  const html = `<!doctype html><select id="xnxq01id"><option value="${selectedTerm}"${selected}>2026-2027学年第一学期</option><option value="${alternateTerm}">2025-2026学年第二学期</option></select><table id="timetable"><tr><th>节次</th><th>周一</th><th>周二</th><th>周三</th></tr><tr><td>第1讲 [01-02节]</td><td><div class="kbcontent"><font>离散数学</font><font>张老师</font><font>10周</font></div></td><td><div class="kbcontent"><font>数据结构</font><font>周老师</font><font>1,3,5周</font></div></td><td><div class="kbcontent"><font>专业实习</font><font>王老师</font><font>待确认</font></div></td></tr></table>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
const { app, testHooks } = require("../server");
global.fetch = nativeFetch;

const server = app.listen(0, "127.0.0.1");
let baseUrl;

test.before(async () => {
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test("requested schedule fallback reports the selected actual term and configured date", async () => {
  const cm = new testHooks.CookieManager(new CookieJar());
  testHooks.rememberSession("schedule-session", cm, { username: "fixture-student", studentName: "演示" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const response = await nativeFetch(`${baseUrl}/api/schedule?sessionId=schedule-session&xnxq=2025-2026-2`);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.semester, "2026-2027-1");
  assert.equal(body.semesterStart, "2026-09-07");
  assert.equal(body.semesterStartKnown, true);
  assert.ok(Number.isInteger(body.currentWeek));
  assert.deepEqual(body.courses.map((course) => course.weekRanges), [
    [{ start: 10, end: 10 }],
    [{ start: 1, end: 1 }, { start: 3, end: 3 }, { start: 5, end: 5 }],
    [],
  ]);
  assert.equal(body.courses[0].weeks, "10");
  assert.equal(body.courses[1].weeks, "1,3,5");
  assert.equal(body.courses[2].weeks, "待确认");
  assert.equal(body.courses[1].teacher, "周老师");
  assert.deepEqual(upstreamCalls.map((call) => call.method), ["POST", "GET"]);
  assert.ok(upstreamCalls.every((call) => call.url.startsWith("https://")));
});

test("schedule fallback fails when the response does not identify its selected term", async () => {
  upstreamCalls = [];
  omitSelectedOnGet = true;
  try {
    const response = await nativeFetch(`${baseUrl}/api/schedule?sessionId=schedule-session&xnxq=2025-2026-2`);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.match(body.message, /无法确认课表所属学期/);
    assert.deepEqual(upstreamCalls.map((call) => call.method), ["POST", "GET"]);
  } finally {
    omitSelectedOnGet = false;
  }
});

test("logout removes an encrypted session immediately from memory and disk", async () => {
  const sessionFile = path.join(dataDir, "sessions.json");
  const before = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  assert.equal(before.algorithm, "aes-256-gcm");
  assert.deepEqual(decryptSessionDump(before, parseEncryptionKey(encryptionKey)).map((item) => item.id), ["schedule-session"]);
  assert.equal(fs.statSync(sessionFile).mode & 0o777, 0o600);

  const response = await nativeFetch(`${baseUrl}/api/logout`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": "schedule-session" },
    body: JSON.stringify({}),
  });
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(testHooks.getSession("schedule-session"), null);
  const after = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  assert.deepEqual(decryptSessionDump(after, parseEncryptionKey(encryptionKey)), []);
});

test("unconfigured gray management is unavailable", async () => {
  const response = await nativeFetch(`${baseUrl}/api/gray/control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).message, "演示管理未配置");
  assert.equal((await (await nativeFetch(`${baseUrl}/api/gray/status`)).json()).enabled, false);
});

test("test release metadata gates updates and compatibility links redirect to the canonical route", async () => {
  const releaseFile = process.env.APP_RELEASE_FILE;
  const assetUrl = "https://github.com/xuediner-source/xuedu/releases/download/v0.0.1/xuedu-test-0.0.1.apk";
  const release = {
    version: "0.0.1",
    versionCode: 250,
    channel: "test",
    published: true,
    downloadUrl: assetUrl,
    releaseNotes: "测试版 0.0.1",
  };
  fs.writeFileSync(releaseFile, JSON.stringify(release));

  const outdated = await nativeFetch(`${baseUrl}/api/app/check-update?version=2.2.28&versionCode=249&channel=test`);
  const outdatedBody = await outdated.json();
  assert.equal(outdatedBody.latestVersion, "0.0.1");
  assert.equal(outdatedBody.versionCode, 250);
  assert.equal(outdatedBody.channel, "test");
  assert.equal(outdatedBody.updateAvailable, true, "version code must handle test-version naming reset");
  assert.equal(outdatedBody.downloadUrl, "/download/app-test.apk");
  assert.equal(outdatedBody.fullDownloadUrl, assetUrl);

  const current = await (await nativeFetch(`${baseUrl}/api/app/check-update?version=2.2.28&versionCode=250`)).json();
  assert.equal(current.updateAvailable, false);
  const olderByName = await (await nativeFetch(`${baseUrl}/api/app/check-update?version=0.0.0`)).json();
  assert.equal(olderByName.updateAvailable, true, "semantic version comparison is the fallback when a code is absent");
  const newerByName = await (await nativeFetch(`${baseUrl}/api/app/check-update?version=2.2.28`)).json();
  assert.equal(newerByName.updateAvailable, false);

  const canonical = await nativeFetch(`${baseUrl}/download/app-test.apk`, { redirect: "manual" });
  assert.equal(canonical.status, 302);
  assert.equal(canonical.headers.get("location"), assetUrl);
  const oldGray = await nativeFetch(`${baseUrl}/download/app-gray.apk`, { redirect: "manual" });
  const oldLatest = await nativeFetch(`${baseUrl}/download/app-latest.apk`, { redirect: "manual" });
  assert.equal(oldGray.headers.get("location"), "/download/app-test.apk");
  assert.equal(oldLatest.headers.get("location"), "/download/app-test.apk");

  fs.writeFileSync(releaseFile, JSON.stringify({ ...release, published: false }));
  const unpublished = await (await nativeFetch(`${baseUrl}/api/app/check-update?version=2.2.28&versionCode=249`)).json();
  assert.equal(unpublished.updateAvailable, false);
  assert.equal(unpublished.downloadUrl, "");
  assert.equal(unpublished.fullDownloadUrl, "");
  assert.equal(unpublished.apkName, "");
  assert.equal((await nativeFetch(`${baseUrl}/download/app-test.apk`)).status, 404);

  fs.writeFileSync(releaseFile, JSON.stringify({ ...release, published: true, downloadUrl: "http://github.com/owner/repo/releases/download/v0.0.1/app.apk" }));
  const invalidUrl = await (await nativeFetch(`${baseUrl}/api/app/check-update?version=2.2.28&versionCode=249`)).json();
  assert.equal(invalidUrl.updateAvailable, false);
  assert.equal(invalidUrl.fullDownloadUrl, "");
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});
