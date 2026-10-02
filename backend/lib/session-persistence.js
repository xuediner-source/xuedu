"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ENVELOPE_VERSION = 1;

function parseEncryptionKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("SESSION_ENCRYPTION_KEY must be a 32-byte hex or base64 key");
  }
  return key;
}

function encryptSessionDump(value, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("A 32-byte session encryption key is required");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: ENVELOPE_VERSION,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptSessionDump(envelope, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("A 32-byte session encryption key is required");
  if (!envelope || envelope.version !== ENVELOPE_VERSION || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted session file format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

function writeEncryptedSessionDump(file, value, key, fsImpl = fs) {
  writePrivateJsonAtomic(file, encryptSessionDump(value, key), fsImpl);
}

function ensurePrivateDirectory(dir, fsImpl = fs) {
  fsImpl.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fsImpl.chmodSync(dir, 0o700);
}

function writePrivateJsonAtomic(file, value, fsImpl = fs) {
  const dir = path.dirname(file);
  ensurePrivateDirectory(dir, fsImpl);
  const tempFile = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  let fd;
  try {
    fd = fsImpl.openSync(tempFile, "wx", 0o600);
    fsImpl.writeFileSync(fd, JSON.stringify(value));
    fsImpl.fsyncSync(fd);
    fsImpl.closeSync(fd);
    fd = undefined;
    fsImpl.renameSync(tempFile, file);
    fsImpl.chmodSync(file, 0o600);
    try {
      const dirFd = fsImpl.openSync(dir, "r");
      fsImpl.fsyncSync(dirFd);
      fsImpl.closeSync(dirFd);
    } catch {
      // Some filesystems do not allow fsync on directories; the file write is still atomic.
    }
  } catch (error) {
    if (fd !== undefined) fsImpl.closeSync(fd);
    try { fsImpl.unlinkSync(tempFile); } catch {}
    throw error;
  }
}

function secureExistingFile(file, fsImpl = fs) {
  if (!fsImpl.existsSync(file)) return false;
  fsImpl.chmodSync(file, 0o600);
  return true;
}

module.exports = {
  parseEncryptionKey,
  encryptSessionDump,
  decryptSessionDump,
  writeEncryptedSessionDump,
  ensurePrivateDirectory,
  writePrivateJsonAtomic,
  secureExistingFile,
};
