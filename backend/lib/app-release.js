"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_RELEASE_FILE = path.join(__dirname, "..", "app-release.json");

function isValidReleaseAssetUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && url.hostname === "github.com"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+\.apk$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function readAppRelease(file = DEFAULT_RELEASE_FILE, fsImpl = fs) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const version = String(parsed.version || "").trim();
    const versionCode = Number(parsed.versionCode);
    if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(versionCode) || versionCode < 1) return null;
    const assetUrl = isValidReleaseAssetUrl(parsed.downloadUrl) ? new URL(parsed.downloadUrl).href : "";
    const published = parsed.published === true;
    return {
      version,
      versionCode,
      channel: parsed.channel === "test" ? "test" : "",
      downloadUrl: assetUrl,
      published,
      available: published && parsed.channel === "test" && !!assetUrl,
      releaseNotes: String(parsed.releaseNotes || ""),
      publishDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.publishDate || "")) ? parsed.publishDate : "",
    };
  } catch {
    return null;
  }
}

function compareVersions(left, right) {
  const a = String(left || "").split(".").map((part) => Number(part) || 0);
  const b = String(right || "").split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function releaseAssetName(assetUrl) {
  if (!isValidReleaseAssetUrl(assetUrl)) return "";
  const pathname = new URL(assetUrl).pathname;
  try { return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1)); }
  catch { return pathname.slice(pathname.lastIndexOf("/") + 1); }
}

module.exports = { DEFAULT_RELEASE_FILE, isValidReleaseAssetUrl, readAppRelease, compareVersions, releaseAssetName };
