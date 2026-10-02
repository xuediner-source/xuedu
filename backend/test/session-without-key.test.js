"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cqjtu-session-test-"));
process.env.NODE_ENV = "test";
process.env.DATA_DIR = dataDir;
process.env.GRAY_ENABLED = "1";
process.env.DEMO_ENABLED = "1";
delete process.env.SESSION_ENCRYPTION_KEY;

const { app, testHooks } = require("../server");
const server = app.listen(0, "127.0.0.1");
let baseUrl;

test.before(async () => {
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test("unkeyed real sessions stay in memory and never create a cookie-jar file", async () => {
  const cm = { jar: { serializeSync: () => ({ cookies: [] }) } };
  testHooks.rememberSession("memory-only-session", cm, { username: "fictional-student" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(testHooks.getSession("memory-only-session"));
  assert.equal(fs.existsSync(path.join(dataDir, "sessions.json")), false);
});

test("retired test account cannot log in even when old demo environment switches are set", async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "xuedu_demo", password: "xuedu2026" }),
  });
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.message, /测试账号已停用/);
  assert.equal(body.sessionId, undefined);
  assert.equal(testHooks.sessions.size, 1);
  assert.equal(fs.existsSync(path.join(dataDir, "sessions.json")), false);
});

test("old demo session records expire without returning fictional data", async () => {
  testHooks.sessions.set("retired-demo", { demo: true, username: "legacy-demo", createdAt: Date.now() });
  const body = await (await fetch(`${baseUrl}/api/schedule?sessionId=retired-demo`)).json();
  assert.equal(body.success, false);
  assert.equal(body.sessionExpired, true);
  assert.equal(testHooks.sessions.has("retired-demo"), false);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});
