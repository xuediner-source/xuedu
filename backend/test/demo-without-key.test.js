"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cqjtu-demo-test-"));
process.env.NODE_ENV = "test";
process.env.DATA_DIR = dataDir;
process.env.GRAY_ENABLED = "1";
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

test("fictional gray demo login works without a real-session encryption key", async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "xuedu_demo", password: "xuedu2026" }),
  });
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.demo, true);
  assert.equal(body.sessionPersistent, false);
  assert.ok(testHooks.getSession(body.sessionId));
  assert.equal(fs.existsSync(path.join(dataDir, "sessions.json")), false);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});
