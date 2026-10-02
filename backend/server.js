const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { CookieJar } = require("tough-cookie");
const { loadRuntimeConfig } = require("./lib/runtime-config");
const { parseWeekType, parseWeekRanges, formatWeekLabel, parseSemesterStart, currentWeekOf } = require("./lib/semester");
const { parseEncryptionKey, decryptSessionDump, writeEncryptedSessionDump, ensurePrivateDirectory, secureExistingFile } = require("./lib/session-persistence");
const { UpstreamError, upstreamPublicMessage, createUpstreamFetcher } = require("./lib/upstream");
const { createLoginLimiter } = require("./lib/login-limiter");
const { readAppRelease, compareVersions, releaseAssetName } = require("./lib/app-release");

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const runtimeConfig = loadRuntimeConfig(process.env);
const BASE_URL = runtimeConfig.casBaseUrl;
const EDU_URL = runtimeConfig.eduBaseUrl;
const SERVICE_URL = EDU_URL + "/jsxsd/framework/xsMain_cqjtdx.htmlx";
const LOGIN_URL = BASE_URL + "/authserver/login?service=" + encodeURIComponent(SERVICE_URL);
const AES_CHARS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";

// Session store persisted to disk so APK updates / process restarts keep logins
const SESSION_TTL_MS = runtimeConfig.sessionTtlMs;
const SESSION_ENCRYPTION_KEY = parseEncryptionKey(process.env.SESSION_ENCRYPTION_KEY);
const sessions = new Map();
const DATA_DIR = process.env.DATA_DIR || (process.platform === "win32" ? "F:\\DPH\\cqjtu-weapp\\backend\\data" : "/opt/cqjtu/backend/data");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");
const SURVEY_FILE = path.join(DATA_DIR, "surveys.jsonl");
const demoData = require("./demo-data");
const DEMO_USER = String(process.env.DEMO_USER || "xuedu_demo").trim();
const DEMO_PASS = String(process.env.DEMO_PASS || "xuedu2026").trim();
const ENV_GRAY_ENABLED = (process.env.DEMO_ENABLED ?? process.env.GRAY_ENABLED) === "1";
const GRAY_ADMIN_TOKEN = String(process.env.GRAY_ADMIN_TOKEN || "");
const GRAY_ADMIN_IPS = new Set(String(process.env.GRAY_ADMIN_IPS || "").split(",").map((ip) => ip.trim()).filter(Boolean));
const allowLoginAttempt = createLoginLimiter();
let persistTimer = null;
let grayDisabledAtRuntime = false;

function isGrayEnabled() {
  return ENV_GRAY_ENABLED && !grayDisabledAtRuntime;
}

function normalizeIp(ip) {
  const value = String(ip || "").trim().replace(/^::ffff:/i, "");
  return value === "::1" ? "127.0.0.1" : value;
}

function isGrayAdminReady() {
  return !!GRAY_ADMIN_TOKEN && GRAY_ADMIN_IPS.size > 0;
}

function safeTokenEquals(expected, actual) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(actual || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hasGrayAdminAccess(req) {
  return isGrayAdminReady()
    && GRAY_ADMIN_IPS.has(normalizeIp(req.ip || req.socket.remoteAddress))
    && safeTokenEquals(GRAY_ADMIN_TOKEN, (req.body && req.body.token) || req.headers["x-gray-token"]);
}

function grayClosedPayload() {
  return { success: false, grayClosed: true, message: "演示功能已关闭" };
}

function sendUpstreamFailure(res, error, fallback) {
  console.error("Upstream operation failed:", error && (error.code || error.name || "error"));
  const status = error instanceof UpstreamError ? 502 : 500;
  return res.status(status).json({ success: false, message: upstreamPublicMessage(error, fallback) });
}

function sessionSnapshot() {
  const dump = [];
  for (const [id, rec] of sessions) {
    if (rec.demo) continue;
    dump.push({
      id,
      jar: rec.cm.jar.serializeSync(),
      createdAt: rec.createdAt,
      username: rec.username || "",
      studentName: rec.studentName || "",
    });
  }
  return dump;
}

function persistSessions(immediate = false) {
  clearTimeout(persistTimer);
  if (!SESSION_ENCRYPTION_KEY) {
    persistTimer = null;
    return;
  }
  const write = () => {
    try {
      writeEncryptedSessionDump(SESSION_FILE, sessionSnapshot(), SESSION_ENCRYPTION_KEY);
    } catch (e) {
      console.error("persistSessions", e.message);
    }
  };
  if (immediate) {
    persistTimer = null;
    write();
    return;
  }
  persistTimer = setTimeout(write, 200);
  if (persistTimer.unref) persistTimer.unref();
}

function loadSessions() {
  try {
    ensurePrivateDirectory(DATA_DIR);
    if (!secureExistingFile(SESSION_FILE)) return;
    let stored = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    let migratedLegacy = false;
    if (Array.isArray(stored)) {
      if (!SESSION_ENCRYPTION_KEY) {
        fs.unlinkSync(SESSION_FILE);
        console.warn("Discarded legacy unencrypted sessions: set SESSION_ENCRYPTION_KEY and log in again to enable encrypted persistence");
        return;
      }
      migratedLegacy = true;
    } else if (!SESSION_ENCRYPTION_KEY) {
      fs.unlinkSync(SESSION_FILE);
      console.warn("Discarded encrypted sessions because SESSION_ENCRYPTION_KEY is missing; log in again after configuring the key");
      return;
    } else {
      stored = decryptSessionDump(stored, SESSION_ENCRYPTION_KEY);
    }
    if (!Array.isArray(stored)) throw new Error("Persisted session data has an invalid format");
    const dump = stored;
    const now = Date.now();
    let discarded = false;
    for (const item of dump || []) {
      if (!item || !item.id || !item.jar) {
        discarded = true;
        continue;
      }
      const createdAt = Number(item.createdAt);
      if (!Number.isFinite(createdAt) || createdAt <= 0 || now - createdAt > SESSION_TTL_MS) {
        discarded = true;
        continue;
      }
      const jar = CookieJar.deserializeSync(item.jar);
      const cm = new CookieManager(jar);
      sessions.set(item.id, {
        cm,
        createdAt,
        username: item.username || "",
        studentName: item.studentName || "",
      });
    }
    if (discarded || migratedLegacy) persistSessions(true);
    console.log("Restored sessions:", sessions.size);
  } catch (e) {
    console.error("loadSessions", e.message);
  }
}

function rememberSession(sessionId, cm, extra = {}) {
  sessions.set(sessionId, { cm, createdAt: Date.now(), username: extra.username || "", studentName: extra.studentName || "", demo: !!extra.demo });
  persistSessions();
}

function isDemoSession(rec) {
  return !!(rec && rec.demo);
}

function deleteSession(sessionId) {
  const deleted = sessions.delete(sessionId);
  if (deleted) persistSessions(true);
  return deleted;
}

function expireSession(sessionId) {
  return deleteSession(sessionId);
}

function getSession(sessionId) {
  const rec = sessions.get(sessionId);
  if (!rec) return null;
  if (Date.now() - rec.createdAt > SESSION_TTL_MS) {
    deleteSession(sessionId);
    return null;
  }
  return rec;
}

function parsePeriodNumbers(text) {
  if (!text) return [];
  const raw = String(text);
  const bracket = raw.match(/\[([^\]]+?)节\]/);
  if (bracket) {
    return [...new Set((bracket[1].match(/\d{1,2}/g) || []).map(n => Number(n)).filter(n => n >= 1 && n <= 14))];
  }
  const section = raw.match(/\((\d{1,2}(?:\s*,\s*\d{1,2})+)小节\)/);
  if (section) {
    return [...new Set((section[1].match(/\d{1,2}/g) || []).map(n => Number(n)).filter(n => n >= 1 && n <= 14))];
  }
  return [];
}

function parseClockRange(text) {
  const m = String(text || "").match(/(\d{1,2}:\d{2})\s*[-~—－]\s*(\d{1,2}:\d{2})/);
  if (!m) return { start: "", end: "", label: "" };
  return { start: m[1], end: m[2], label: m[1] + "-" + m[2] };
}

function parsePeriodHeader(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const nameMatch = raw.match(/第[一二三四五六七八]讲/);
  const clock = parseClockRange(raw);
  const nums = parsePeriodNumbers(raw);
  return {
    name: nameMatch ? nameMatch[0] : raw.split(" ")[0] || "",
    periods: nums,
    period: nums.length ? nums.map(n => String(n).padStart(2, "0")).join("-") : "",
    startTime: clock.start,
    endTime: clock.end,
    time: clock.label,
    raw,
  };
}

function parseTeacher(text) {
  const raw = String(text || "").replace(/★/g, "").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/(副教授|讲师|教授|助教|工程师|实验师|研究员).*$/g, "")
    .trim();
  const m = cleaned.match(/^([\u4e00-\u9fff]{2,4})/);
  return m ? m[1] : cleaned.slice(0, 4);
}

function parseRoom(fields, rawText) {
  const joined = (fields || []).concat(rawText || "").join(" ");
  const m = joined.match(/【([^】]+)】\s*([A-Za-z0-9-]+)?/);
  if (m) return [m[1], m[2]].filter(Boolean).join(" ");
  const fallback = joined.match(/([东南西北]?[\u4e00-\u9fff]*教学楼|[A-Z]?区?)\s*(\d{3,5})/);
  if (fallback) return fallback[0].trim();
  return "";
}

function formatSemesterText(xnxq) {
  const m = String(xnxq || "").match(/(\d{4})-(\d{4})-(\d)/);
  if (!m) return String(xnxq || "");
  return m[1] + "-" + m[2] + "学年第" + (m[3] === "2" ? "二" : "一") + "学期";
}

function isExpiredHtml(html) {
  const s = String(html || "");
  return s.includes("authserver/login") || s.includes("请重新登录") || (s.includes("window.location.href") && s.includes("authserver"));
}

function htmlText(str) {
  return String(str || "").replace(/\s+/g, " ").trim();
}

function resolveEduUrl(path, base) {
  const raw = String(path || "").replace(/&amp;/g, "&").trim();
  if (!raw) return EDU_URL;
  if (/^https?:/i.test(raw)) return raw;
  try {
    return new URL(raw, base || EDU_URL + "/jsxsd/").href;
  } catch (e) {
    return EDU_URL + (raw.startsWith("/") ? raw : "/" + raw);
  }
}

async function eduFetch(cm, path, options = {}) {
  let current = resolveEduUrl(path, options.base || EDU_URL + "/jsxsd/");
  let lastOptions = options;
  for (let i = 0; i < 8; i++) {
    const res = await fetchWithCookies(current, lastOptions, cm);
    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      current = new URL(location, current).href;
      lastOptions = { headers: options.headers || {} };
      continue;
    }
    const html = await res.text();
    return { res, html, url: current };
  }
  return { res: null, html: "", url: current };
}

async function eduPost(cm, path, params, referer) {
  const body = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
  return eduFetch(cm, path, {
    method: "POST",
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: referer || EDU_URL + path,
    },
  });
}

function cheerioRoot(html) {
  return cheerio.load(html || "", { decodeEntities: false });
}

function parseSelectOptions($, selector) {
  const options = [];
  const seen = new Set();
  $(selector).each((_, el) => {
    const $el = $(el);
    if ($el.is("select")) {
      $el.find("option").each((__, opt) => {
        const val = $(opt).attr("value");
        const text = htmlText($(opt).text());
        const key = String(val == null ? "" : val) + "|" + text;
        if (seen.has(key)) return;
        seen.add(key);
        options.push({
          value: val == null ? "" : String(val),
          text: text || String(val || ""),
          selected: $(opt).is(":selected"),
        });
      });
      return;
    }
    const val = $el.attr("value");
    const text = htmlText($el.text());
    const key = String(val == null ? "" : val) + "|" + text;
    if (seen.has(key)) return;
    seen.add(key);
    options.push({
      value: val == null ? "" : String(val),
      text: text || String(val || ""),
      selected: $el.is(":selected"),
    });
  });
  return options;
}

function firstSelect($, names) {
  for (const name of names) {
    const $sel = $("select[name='" + name + "'], select#" + name + ", select[id*='" + name + "']");
    if ($sel.length) return { name, el: $sel.first(), options: parseSelectOptions($, $sel.first()) };
  }
  return { name: names[0], el: null, options: [] };
}

function parseKvMap($) {
  const info = {};
  $("table tr").each((_, row) => {
    const cells = $(row).find("td, th");
    if (cells.length < 2) return;
    for (let i = 0; i + 1 < cells.length; i += 1) {
      const k = htmlText($(cells[i]).text()).replace(/[:：]/g, "");
      const v = htmlText($(cells[i + 1]).text());
      if (!k || !v) continue;
      if (k.length > 18 || v.length > 80) continue;
      if (k === v) continue;
      if (!info[k]) info[k] = v;
    }
  });
  $("label, span, li, p, div").each((_, el) => {
    const t = htmlText($(el).text());
    const m = t.match(/^([一-鿿A-Za-z]{2,8})[：:]\s*(.+)$/);
    if (!m) return;
    const k = m[1];
    const v = htmlText(m[2]).slice(0, 80);
    if (v && !info[k] && k.length <= 8) info[k] = v;
  });
  return info;
}

function pickField(info, keys) {
  for (const key of keys) {
    if (info[key]) return String(info[key]).trim();
  }
  const entries = Object.entries(info || {});
  for (const key of keys) {
    const hit = entries.find(([k]) => k.includes(key));
    if (hit && hit[1]) return String(hit[1]).trim();
  }
  return "";
}

function parseDataTable($, preferred) {
  const selectors = (preferred || []).concat(["#dataList", "#dataList2", "table.Nsb_r_list", "table"]);
  let $table = null;
  for (const sel of selectors) {
    const found = $(sel).filter((_, t) => $(t).find("tr").length > 1);
    if (found.length) {
      $table = found.first();
      break;
    }
  }
  if (!$table || !$table.length) return { headers: [], rows: [] };
  const headers = [];
  const rows = [];
  $table.find("tr").each((i, tr) => {
    const $tr = $(tr);
    const cells = $tr.find("th, td");
    const texts = [];
    cells.each((_, c) => texts.push(htmlText($(c).text())));
    if (!texts.some(Boolean)) return;
    const isHeader = $tr.find("th").length > 0 || i === 0;
    if (isHeader && !headers.length) {
      headers.push(...texts);
      return;
    }
    const joined = texts.join("");
    if (!joined || joined.includes("未查询到") || joined.includes("无记录") || joined.includes("没有数据")) return;
    const obj = { _cells: texts };
    texts.forEach((t, idx) => {
      obj["c" + idx] = t;
      if (headers[idx]) obj[headers[idx]] = t;
    });
    rows.push(obj);
  });
  return { headers, rows };
}

function rowCol(row, names) {
  for (const name of names) {
    if (row[name]) return String(row[name]).trim();
  }
  const keys = Object.keys(row || {});
  for (const name of names) {
    const hit = keys.find((k) => k !== "_cells" && k.includes(name));
    if (hit && row[hit]) return String(row[hit]).trim();
  }
  return "";
}

function iframeSrc(html) {
  const m = String(html || "").match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

function extractLinks(html, re) {
  const out = [];
  const rx = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = rx.exec(String(html || "")))) {
    const href = m[1];
    if (re.test(href)) out.push(href);
  }
  return out;
}

function guessEnrollYear(raw, studentId) {
  const m = String(raw || "").match(/(20\d{2})/);
  if (m) return m[1];
  const id = String(studentId || "");
  if (/^20\d{2}/.test(id)) return id.slice(0, 4);
  if (/^(1[0-9]|2[0-9])\d+/.test(id)) return "20" + id.slice(0, 2);
  return "";
}

function mapStudentProfile(info, fallback) {
  const studentId = pickField(info, ["学号", "学生学号", "xh"]) || fallback.studentId || "";
  const enrollRaw = pickField(info, ["入学年份", "入学时间", "入学日期", "年级", "所属年级"]);
  return {
    school: pickField(info, ["学校", "学校名称"]) || "重庆交通大学",
    college: pickField(info, ["学院", "院系", "所在院系", "学生院系"]),
    className: pickField(info, ["班级", "行政班级", "所在班级"]),
    major: pickField(info, ["专业名称", "专业", "所在专业"]),
    enrollYear: guessEnrollYear(enrollRaw, studentId),
    studentId,
    studentName: pickField(info, ["姓名", "学生姓名"]) || fallback.studentName || "",
    raw: info,
  };
}

function mapProgramCourse(row, index) {
  const name = rowCol(row, ["课程名称", "课程名", "kcmc"]);
  if (!name || name === "课程名称") return null;
  return {
    index: rowCol(row, ["序号"]) || String(index + 1),
    code: rowCol(row, ["课程编号", "课程代码", "课程号", "kch"]),
    name,
    nature: rowCol(row, ["课程性质", "课程属性", "课程类别", "kcxz"]),
    category: rowCol(row, ["课程类别", "课程模块", "模块", "平台"]),
    credit: rowCol(row, ["学分", "xf"]),
    hours: rowCol(row, ["总学时", "学时", "xs"]),
    term: rowCol(row, ["开课学期", "学期", "建议学期", "kkxq"]),
    exam: rowCol(row, ["考核方式", "考核", "考试方式"]),
    department: rowCol(row, ["开课单位", "开课院系", "承担单位"]),
    required: rowCol(row, ["是否必修", "必修"]),
  };
}

function mapClassroom(row) {
  const name = rowCol(row, ["教室", "教室名称", "教室编号", "教室号", "场地", "jsmc"]);
  const building = rowCol(row, ["教学楼", "楼宇", "所在教学楼", "jxl"]);
  const campus = rowCol(row, ["校区", "校区名称"]);
  if (!name && !building) return null;
  if (String(name + building).includes("教室名称")) return null;
  return {
    campus,
    building,
    name: name || building,
    type: rowCol(row, ["教室类型", "类型", "场地类型"]),
    seats: rowCol(row, ["座位数", "容量", "容纳人数", "人数"]),
    examSeats: rowCol(row, ["考试座位数", "考位数"]),
    note: rowCol(row, ["备注", "说明"]),
  };
}

const PROFILE_PATHS = [
  "/jsxsd/grxx/xsxx",
  "/jsxsd/grxx/xsxx.do",
  "/jsxsd/grsz/xsxx",
  "/jsxsd/xjgl/xsxx_query",
  "/jsxsd/xsxj/xsxjxx.do",
  "/jsxsd/framework/xsMain_cqjtdx.htmlx",
];

const PROGRAM_PATHS = [
  "/jsxsd/pyfa/pyfacx",
  "/jsxsd/pyfa/pyfacx.do",
  "/jsxsd/pyfa/pyfakc_query",
  "/jsxsd/pyfa/pyfazd_query",
  "/jsxsd/xsxj/xspyddcx.do",
  "/jsxsd/pyfa/pyfakcsz",
];

const CLASSROOM_PATHS = [
  "/jsxsd/kbcx/kbxx_classroom",
  "/jsxsd/kbcx/kbxx_classroom.do",
  "/jsxsd/kbxx/kbxx_classroom",
  "/jsxsd/kbcx/kbxx_classroom_ifr",
  "/jsxsd/kbxx/kb_idle_iframe.do",
];

// Cookie helper class
class CookieManager {
  constructor(jar) {
    this.jar = jar || new CookieJar();
  }

  async getCookieString(url) {
    const cookies = await this.jar.getCookies(url);
    return cookies.map(c => c.cookieString()).join("; ");
  }

  async setCookies(url, setCookieHeaders) {
    if (!setCookieHeaders) return;
    const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const cookieStr of arr) {
      try {
        await this.jar.setCookie(cookieStr, url);
      } catch (e) {
        // ignore invalid cookies
      }
    }
    persistSessions();
  }
}

loadSessions();

// CAS and academic-system requests use the HTTPS-only fetch helper with a finite timeout.
const fetchWithCookies = createUpstreamFetcher({ timeoutMs: runtimeConfig.upstreamTimeoutMs });

// Follow redirect chain manually
async function followRedirects(url, cm, maxRedirects = 10) {
  let currentUrl = url;
  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetchWithCookies(currentUrl, {}, cm);
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status >= 400) {
      return res;
    }
    currentUrl = new URL(location, currentUrl).href;
  }
  return await fetchWithCookies(currentUrl, {}, cm);
}

// AES encryption for CAS login
function randomString(len) {
  let result = "";
  for (let i = 0; i < len; i++) result += AES_CHARS.charAt(Math.floor(Math.random() * AES_CHARS.length));
  return result;
}

function aesEncrypt(plaintext, key, iv) {
  const keyBuf = Buffer.from(key, "utf8");
  const ivBuf = Buffer.from(iv, "utf8");
  const cipher = crypto.createCipheriv("aes-128-cbc", keyBuf, ivBuf);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function encryptPassword(password, salt) {
  if (!salt) return password;
  const prefix = randomString(64);
  const iv = randomString(16);
  return aesEncrypt(prefix + password, salt, iv);
}

// Login endpoint
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ success: false, message: "用户名和密码不能为空" });
    }
    if (!allowLoginAttempt(req.ip || req.socket.remoteAddress)) {
      return res.status(429).json({ success: false, message: "登录请求过于频繁，请 15 分钟后重试" });
    }

    if (String(username).trim() === DEMO_USER && String(password) === DEMO_PASS) {
      if (!isGrayEnabled()) return res.json(grayClosedPayload());
      const sessionId = crypto.randomBytes(16).toString("hex");
      const dummy = { jar: { serializeSync() { return {}; } } };
      rememberSession(sessionId, dummy, { username: DEMO_USER, studentName: demoData.profile.studentName, demo: true });
      return res.json({
        success: true,
        message: "已进入学渡演示账号",
        sessionId,
        studentName: demoData.profile.studentName,
        studentId: DEMO_USER,
        demo: true,
        sessionPersistent: false,
      });
    }

    const cm = new CookieManager();

    // Step 1: Get login page to extract salt and execution
    const loginPage = await fetchWithCookies(LOGIN_URL, {}, cm);
    const html = await loginPage.text();

    const saltMatch = html.match(/id="pwdEncryptSalt"[^>]*value="([^"]*)"/);
    const execMatch = html.match(/name="execution"[^>]*value="([^"]*)"/);

    if (!saltMatch || !execMatch) {
      return res.json({ success: false, message: "获取登录参数失败" });
    }

    const salt = saltMatch[1];
    const execution = execMatch[1];

    // Step 2: Encrypt password and submit login
    const encryptedPwd = encryptPassword(password, salt);

    const loginData = new URLSearchParams();
    loginData.append("username", username);
    loginData.append("password", encryptedPwd);
    loginData.append("_eventId", "submit");
    loginData.append("cllt", "userNameLogin");
    loginData.append("dllt", "generalLogin");
    loginData.append("execution", execution);

    const loginRes = await fetchWithCookies(LOGIN_URL, {
      method: "POST",
      body: loginData.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: LOGIN_URL },
    }, cm);

    const location = loginRes.headers.get("location") || "";

    if (!location.includes("ticket=")) {
      return res.json({ success: false, message: "登录失败，请检查用户名和密码" });
    }

    // Step 3: Follow ticket redirect chain to complete login
    await followRedirects(location, cm);

    // Step 4: Verify login by fetching main page
    const mainRes = await fetchWithCookies(EDU_URL + "/jsxsd/framework/xsMain_cqjtdx.htmlx", {
      headers: { Referer: SERVICE_URL },
    }, cm);
    const mainHtml = await mainRes.text();

    // Extract student name
    const nameMatch = mainHtml.match(/欢迎您[：:]\s*<[^>]*>([^<]{2,8})/) || mainHtml.match(/<span[^>]*>([\u4e00-\u9fff]{2,4})<\/span>/);
    const studentName = nameMatch ? nameMatch[1] : "未知";

    // Generate a session ID
    const sessionId = crypto.randomBytes(16).toString("hex");
    rememberSession(sessionId, cm, { username, studentName });

    res.json({
      success: true,
      message: "登录成功",
      sessionId: sessionId,
      studentName: studentName,
      studentId: username,
      sessionPersistent: !!SESSION_ENCRYPTION_KEY,
      ...(SESSION_ENCRYPTION_KEY ? {} : { persistenceMessage: "未配置 SESSION_ENCRYPTION_KEY，会话只保存在内存中，服务器重启后需要重新登录" }),
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(502).json({ success: false, message: upstreamPublicMessage(err, "登录暂时失败，请稍后重试") });
  }
});

// Schedule endpoint
app.get("/api/schedule", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) {
      return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    }
    if (isDemoSession(rec)) {
      if (!isGrayEnabled()) return res.json({ success: false, sessionExpired: true, grayClosed: true, message: "演示功能已关闭" });
      return res.json(demoData.schedulePayload(currentWeekOf("2026-09-07")));
    }

    const cm = rec.cm;
    const requested = String(req.query.xnxq || "").trim();

    async function loadScheduleHtml(xnxqId) {
      if (xnxqId) {
        const body = new URLSearchParams();
        body.append("xnxq01id", xnxqId);
        body.append("zc", "");
        body.append("sfFD", "1");
        return fetchWithCookies(EDU_URL + "/jsxsd/xskb/xskb_list.do", {
          method: "POST",
          body: body.toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: EDU_URL + "/jsxsd/xskb/xskb_list.do",
          },
        }, cm);
      }
      return fetchWithCookies(EDU_URL + "/jsxsd/xskb/xskb_list.do", {
        headers: { Referer: EDU_URL + "/jsxsd/framework/xsMain_cqjtdx.htmlx" },
      }, cm);
    }

    let schedRes = await loadScheduleHtml(requested);
    let schedHtml = await schedRes.text();
    let dolla = cheerio.load(schedHtml);
    let timetable = dolla("#timetable");
    let semesters = [];
    const readSemesters = ($) => {
      const found = [];
      $("#xnxq01id option").each((i, el) => {
        const val = $(el).attr("value");
        const text = String($(el).text() || "").trim();
        if (val) found.push({ value: val, text: text || formatSemesterText(val) });
      });
      return found;
    };
    let selectedSemester = dolla("#xnxq01id option[selected]").attr("value") || "";
    semesters = readSemesters(dolla);
    const requestedAvailable = !requested || !semesters.length || semesters.some((term) => term.value === requested);
    const requestedSelected = !selectedSemester || selectedSemester === requested;

    let usedFallback = false;
    if (requested && (!timetable.length || !requestedAvailable || !requestedSelected)) {
      usedFallback = true;
      schedRes = await loadScheduleHtml("");
      schedHtml = await schedRes.text();
      dolla = cheerio.load(schedHtml);
      timetable = dolla("#timetable");
      selectedSemester = dolla("#xnxq01id option[selected]").attr("value") || "";
      semesters = readSemesters(dolla);
    }

    if (!timetable.length) {
      if (schedHtml.includes("authserver/login") || schedHtml.includes("请重新登录") || schedHtml.includes("window.location.href")) {
        deleteSession(sessionId);
        return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期，请重新登录" });
      }
      return res.json({ success: false, message: "未找到课表数据" });
    }

    const xnxq = usedFallback
      ? selectedSemester
      : (requested || selectedSemester || "");
    if (!xnxq) {
      return res.json({ success: false, message: "无法确认课表所属学期，请刷新或重新选择学期" });
    }
    const semesterOptions = semesters.map((term) => ({ ...term, selected: term.value === xnxq }));
    const semesterStart = parseSemesterStart(xnxq);
    const currentWeek = currentWeekOf(semesterStart.iso);
    const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const periodDefs = [];
    const courses = [];
    const rows = timetable.find("tr");

    rows.each((rowIndex, row) => {
      const cells = dolla(row).find("td, th");
      if (rowIndex === 0) return;
      const headerText = dolla(cells[0]).text().replace(/\s+/g, " ").trim();
      if (!headerText || headerText.startsWith("备注")) return;
      const header = parsePeriodHeader(headerText);
      const periodIndex = periodDefs.length;
      periodDefs.push({
        index: periodIndex,
        name: header.name,
        period: header.period,
        periods: header.periods,
        time: header.time,
        startTime: header.startTime,
        endTime: header.endTime,
      });

      cells.each((cellIndex, cell) => {
        if (cellIndex === 0) return;
        const dayIndex = cellIndex - 1;
        if (dayIndex < 0 || dayIndex > 6) return;
        const day = days[dayIndex];
        const contentDivs = dolla(cell).find(".kbcontent");

        contentDivs.each((i, div) => {
          const courseText = dolla(div).text().trim().replace(/\s+/g, " ");
          if (!courseText || courseText === "&nbsp;" || courseText.length <= 3) return;

          const fields = [];
          dolla(div).find("font").each((fi, fontEl) => {
            const ft = dolla(fontEl).text().trim();
            if (ft) fields.push(ft);
          });

          const courseName = (fields[0] || courseText.slice(0, 20)).trim();
          const teacher = parseTeacher(fields[1] || "");
          const explicitWeekField = fields.find((f, index) => index >= 2 && /周|单周|双周/.test(f));
          const rangeWeekField = fields.find((f, index) => index >= 2 && parseWeekRanges(f).length > 0);
          const unknownWeekField = fields.find((f, index) => index >= 2
            && !/教室|教学楼|校区|教学区|楼|区|室|班级|备注/.test(f)
            && !/[A-Za-z]?\d{3,5}/.test(f));
          const wpField = explicitWeekField || rangeWeekField || unknownWeekField || "";
          const weekRanges = parseWeekRanges(wpField);
          const weekType = parseWeekType(wpField);
          const periodNums = parsePeriodNumbers(wpField);
          const room = parseRoom(fields, courseText);
          const noteField = fields.find(f => f.includes("备注")) || "";
          const className = (fields.find(f => f.includes("班级")) || "").replace(/^班级：/, "");

          if (courseName && courseName.length > 1 && courseName !== "&nbsp;") {
            courses.push({
              name: courseName,
              teacher,
              day,
              dayIndex,
              rowIndex: periodIndex,
              periodName: header.name,
              period: periodNums.length ? periodNums.map(n => String(n).padStart(2, "0")).join("-") : header.period,
              periods: periodNums.length ? periodNums : header.periods,
              startTime: header.startTime,
              endTime: header.endTime,
              time: header.time,
              weeks: formatWeekLabel(weekRanges) || wpField,
              weekRanges,
              weekType,
              room,
              className,
              note: noteField,
              raw: courseText,
            });
          }
        });
      });
    });

    res.json({
      success: true,
      semester: xnxq,
      semesterText: formatSemesterText(xnxq),
      semesterStart: semesterStart.iso,
      semesterStartKnown: semesterStart.known,
      currentWeek,
      semesters: semesterOptions.length ? semesterOptions : (xnxq ? [{ value: xnxq, text: formatSemesterText(xnxq), selected: true }] : []),
      periods: periodDefs,
      courses,
    });
  } catch (err) {
    return sendUpstreamFailure(res, err, "获取课表失败，请稍后重试");
  }
});

// Grades endpoint
app.get("/api/grades", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) {
      return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    }
    if (isDemoSession(rec)) {
      if (!isGrayEnabled()) return res.json({ success: false, sessionExpired: true, grayClosed: true, message: "演示功能已关闭" });
      return res.json(demoData.gradesPayload());
    }

    const cm = rec.cm;

    // Fetch grades query page first to get available semesters
    const queryRes = await fetchWithCookies(EDU_URL + "/jsxsd/kscj/cjcx_query", {
      headers: { Referer: EDU_URL + "/jsxsd/framework/xsMain_cqjtdx.htmlx" },
    }, cm);
    const queryHtml = await queryRes.text();
    if (queryHtml.includes("authserver/login") || queryHtml.includes("请重新登录") || queryHtml.includes("window.location.href")) {
      deleteSession(sessionId);
      return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期，请重新登录" });
    }

    // Extract available semesters
    const dolla = cheerio.load(queryHtml);
    const semesters = [];
    dolla("#kksj option").each((i, el) => {
      const val = dolla(el).attr("value");
      const text = dolla(el).text().trim();
      if (val) {
        semesters.push({ value: val, text: text });
      }
    });

    // Submit grades query with all semesters
    const params = new URLSearchParams();
    params.append("kksj", "");
    params.append("kcxz", "");
    params.append("kcsx", "");
    params.append("kcmc", "");
    params.append("xsfs", "all");
    params.append("sfxsbcxq", "");
    params.append("fxkcmc", "");
    params.append("zxsbjg", "");
    params.append("mold", "");

    const gradesRes = await fetchWithCookies(EDU_URL + "/jsxsd/kscj/cjcx_list", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: EDU_URL + "/jsxsd/kscj/cjcx_query",
      },
    }, cm);
    const gradesHtml = await gradesRes.text();

    const gradesDolla = cheerio.load(gradesHtml);
    const grades = [];
    const rows = gradesDolla("#dataList tr");

    rows.each((i, row) => {
      if (i === 0) return; // Skip header row
      const cells = gradesDolla(row).find("td");
      if (cells.length < 9) return;

      const grade = {
        index: gradesDolla(cells[0]).text().trim(),
        semester: gradesDolla(cells[1]).text().trim(),
        courseCode: gradesDolla(cells[2]).text().trim(),
        courseName: gradesDolla(cells[3]).text().trim(),
        score: gradesDolla(cells[4]).text().trim(),
        scoreMark: gradesDolla(cells[5]).text().trim(),
        credit: gradesDolla(cells[6]).text().trim(),
        hours: gradesDolla(cells[7]).text().trim(),
        gpa: gradesDolla(cells[8]).text().trim(),
        retakeSemester: gradesDolla(cells[9]).text().trim(),
        examMethod: gradesDolla(cells[10]).text().trim(),
        examNature: gradesDolla(cells[11]).text().trim(),
        courseAttr: gradesDolla(cells[12]).text().trim(),
        courseNature: cells.length > 13 ? gradesDolla(cells[13]).text().trim() : "",
        electiveType: cells.length > 14 ? gradesDolla(cells[14]).text().trim() : "",
        note: cells.length > 15 ? gradesDolla(cells[15]).text().trim() : "",
      };

      if (grade.courseName) {
        grades.push(grade);
      }
    });

    res.json({
      success: true,
      grades: grades,
      semesters: semesters,
    });
  } catch (err) {
    return sendUpstreamFailure(res, err, "获取成绩失败，请稍后重试");
  }
});

// Exam schedule endpoint
app.get("/api/exams", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) {
      return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    }
    if (isDemoSession(rec)) {
      if (!isGrayEnabled()) return res.json({ success: false, sessionExpired: true, grayClosed: true, message: "演示功能已关闭" });
      return res.json(demoData.examsPayload());
    }

    const cm = rec.cm;

    // Fetch exam schedule page
    const examRes = await fetchWithCookies(EDU_URL + "/jsxsd/xsks/xsksap_list", {
      headers: { Referer: EDU_URL + "/jsxsd/framework/xsMain_cqjtdx.htmlx" },
    }, cm);
    const examHtml = await examRes.text();
    if (examHtml.includes("authserver/login") || examHtml.includes("请重新登录") || examHtml.includes("window.location.href")) {
      deleteSession(sessionId);
      return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期，请重新登录" });
    }

    const dolla = cheerio.load(examHtml);
    const exams = [];
    const rows = dolla("#dataList tr");

    rows.each((i, row) => {
      if (i === 0) return; // Skip header row
      const cells = dolla(row).find("td");
      if (cells.length < 12) {
        return;
      }

      const exam = {
        index: dolla(cells[0]).text().trim(),
        campus: dolla(cells[1]).text().trim(),
        examCampus: dolla(cells[2]).text().trim(),
        examSession: dolla(cells[3]).text().trim(),
        courseCode: dolla(cells[4]).text().trim(),
        courseName: dolla(cells[5]).text().trim(),
        teacher: dolla(cells[6]).text().trim(),
        examTime: dolla(cells[7]).text().trim(),
        examRoom: dolla(cells[8]).text().trim(),
        seatNumber: dolla(cells[9]).text().trim(),
        admissionTicket: dolla(cells[10]).text().trim(),
        remark: dolla(cells[11]).text().trim(),
      };

      if (exam.courseName && exam.courseName !== "未查询到数据") {
        exams.push(exam);
      }
    });

    res.json({
      success: true,
      exams: exams,
    });
  } catch (err) {
    return sendUpstreamFailure(res, err, "获取考试安排失败，请稍后重试");
  }
});

app.get("/api/session", (req, res) => {
  const sessionId = req.query.sessionId || req.headers["x-session-id"];
  const rec = getSession(sessionId);
  if (!rec) return res.json({ success: false, message: "未登录或会话已过期" });
  res.json({
    success: true,
    studentName: rec.studentName || "",
    studentId: rec.username || "",
    demo: isDemoSession(rec),
    sessionPersistent: !isDemoSession(rec) && !!SESSION_ENCRYPTION_KEY,
  });
});
// Student Profile endpoint (from live /jsxsd/grxx/xsxx)
app.get("/api/profile", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    if (isDemoSession(rec)) {
      if (!isGrayEnabled()) return res.json({ success: false, sessionExpired: true, grayClosed: true, message: "演示功能已关闭" });
      return res.json(demoData.profilePayload());
    }
    const cm = rec.cm;

    const got = await eduFetch(cm, "/jsxsd/grxx/xsxx", { headers: { Referer: SERVICE_URL } });
    if (isExpiredHtml(got.html)) {
      expireSession(sessionId);
      return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期，请重新登录" });
    }

    const $ = cheerio.load(got.html || "");
    const info = {};

    // 1. Parse cells with "key: value" or "key：value" pattern (like TR 2)
    $("table tr td, table tr th").each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, " ");
      const m = text.match(/^([一-鿿A-Za-z（）()]{2,10})[：:]\s*(.+)$/);
      if (m) {
        const k = m[1].trim();
        const v = m[2].trim();
        if (k && v && !info[k]) info[k] = v;
      }
    });

    // 2. Parse standard table cell pairs
    $("table tr").each((_, tr) => {
      const cells = $(tr).find("td, th");
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const k = $(cells[i]).text().trim().replace(/[:：\s]/g, "");
        const v = $(cells[i + 1]).text().trim().replace(/\s+/g, " ");
        if (k && v && k.length <= 8 && !k.includes("年月") && !k.includes("关系") && !k.includes("单位") && !info[k]) {
          info[k] = v;
        }
      }
    });

    const studentId = info["学号"] || rec.username || "";
    const college = info["院系"] || info["学院"] || "";
    const major = info["专业"] || info["专业名称"] || "";
    const className = info["班级"] || "";
    const enrollDate = info["入学日期"] || info["入学年份"] || info["年级"] || "";
    const enrollYear = enrollDate.match(/(20\d{2})/)?.[1] || guessEnrollYear(enrollDate, studentId) || "2026";
    const studentName = info["姓名"] || rec.studentName || "";

    const profile = {
      school: "重庆交通大学",
      college,
      className,
      major,
      enrollYear,
      studentId,
      studentName
    };

    if (studentName) rec.studentName = studentName;
    persistSessions();
    res.json({ success: true, profile });
  } catch (err) {
    return sendUpstreamFailure(res, err, "获取个人信息失败，请稍后重试");
  }
});

// Program / Curriculum Plan endpoint (from live /jsxsd/pyfa/pyfa_query)
app.get("/api/program", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    if (isDemoSession(rec)) {
      if (!isGrayEnabled()) return res.json({ success: false, sessionExpired: true, grayClosed: true, message: "演示功能已关闭" });
      return res.json(demoData.programPayload());
    }
    const cm = rec.cm;

    const got = await eduFetch(cm, "/jsxsd/pyfa/pyfa_query", { headers: { Referer: SERVICE_URL } });
    if (isExpiredHtml(got.html)) {
      expireSession(sessionId);
      return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期，请重新登录" });
    }

    const $ = cheerio.load(got.html || "");
    const courses = [];
    $("table tr").slice(1).each((_, tr) => {
      const cells = [];
      $(tr).find("td").each((__, td) => cells.push($(td).text().trim().replace(/\s+/g, " ")));
      if (cells.length >= 7) {
        courses.push({
          index: cells[0] || String(courses.length + 1),
          term: cells[1] || "",
          code: cells[2] || "",
          name: cells[3] || "",
          department: cells[4] || "",
          credit: cells[5] || "",
          hours: cells[6] || "",
          exam: cells[7] || "",
          nature: cells[8] || "",
          required: cells[9] || "",
          isExam: cells[10] || ""
        });
      }
    });

    res.json({
      success: true,
      title: "课程设置总表",
      courses,
      count: courses.length
    });
  } catch (err) {
    return sendUpstreamFailure(res, err, "获取培养方案失败，请稍后重试");
  }
});

// Predefined buildings by campus for fast selection
const CAMPUS_BUILDINGS = {
  "02": [
    { text: "A01教学楼", value: "06372B81F7614E61AB398BFC61878C49" },
    { text: "B01教学楼", value: "20A578DE6FB04CB6BE13DFC39B6B4D92" },
    { text: "D01教学楼", value: "106CD2A13A474B13AA92AC2565D1E7B8" },
    { text: "逸夫楼", value: "0FF08DBB3D9A43139D474C57083FF44E" },
    { text: "航空楼", value: "D153587BAD6E4BD9927AA41E051DFC32" },
    { text: "致远楼", value: "5CE205DEF9E349ABA6E64755BE1C9B5A" },
    { text: "材料实验楼", value: "C3E1894A65D04E5CB4DC8C093A36D081" },
    { text: "国重桥梁结构实验室", value: "8D1536242A9C4073B5F549E8EA963CB7" },
    { text: "科学城实训中心", value: "4A259DA79037422A93B6E9F9111F92C2" }
  ],
  "01": [
    { text: "第一教学楼", value: "7023FEB7ACB54FE7AA01B3906F358E5E" },
    { text: "第二教学楼", value: "DD5F1FA2617A4140B885BB69AB281338" },
    { text: "第三教学楼", value: "5635EAC12059434FAB5858A1965E006D" },
    { text: "第四教学楼", value: "58398956368B46E4A4DF85EA1348B0A8" },
    { text: "第五教学楼", value: "919D0C2D80F44E8EA1F94C525FC17706" },
    { text: "第六教学楼", value: "773349DA361A40DA80250673190EA3B0" },
    { text: "第七教学楼", value: "A1F6BCE03D7245C7962DE6279B9F62D0" },
    { text: "第九教学楼", value: "2BBEE582D1A1458488B3031739E6EEC0" },
    { text: "图书馆", value: "1F18C8EF84EB48A69731524A54FD32F6" },
    { text: "第三办公楼", value: "EA0C20BAF3724899B13FC0D09B10703C" },
    { text: "明德楼B栋", value: "70AF450B4F914284BA79283996120EEA" },
    { text: "交通机电实验楼", value: "D0DCD3DE6E5644BBB5C36EBF228293C5" },
    { text: "南岸实训中心", value: "FAEBCE1A5A234A9FB45501E9CC066FEB" },
    { text: "结构工程实验室", value: "2CD32D33D8214E56993FF91E8098AB84" }
  ]
};

// Free Classrooms endpoint (from live /jsxsd/kbcx/kbxx_classroom_ifr)
// ---------------------------------------------------------------------------
// 空闲教室（正方 kbxx_classroom）真实查询工具
// 之前的实现把学期参数写成 xnxqh，而且写死 kbjcmsid、表头偏移固定 slice(2)，
// 所以正式版一直查不出数据。这里改成：抓表单拿真实参数名 + 多种参数组合 + 通用表格解析。
// ---------------------------------------------------------------------------
function classroomWeekdayToNum(v) {
  const map = { "星期一": "1", "星期二": "2", "星期三": "3", "星期四": "4", "星期五": "5", "星期六": "6", "星期日": "7", "周一": "1", "周二": "2", "周三": "3", "周四": "4", "周五": "5", "周六": "6", "周日": "7" };
  const s = String(v == null ? "" : v).trim();
  if (map[s]) return map[s];
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 7) return String(n);
  return "1";
}

function guessCampusOfRoom(roomName, campusId) {
  if (campusId === "02") return "科学城校区";
  if (campusId === "01") return "南岸校区";
  if (/^A01|^B01|^D01|^逸夫|^航空|^致远|^材料|^国重|^科学城/.test(roomName)) return "科学城校区";
  if (/^第[一二三四五六七八九]|^明德|^南岸|^图书馆|^交通机电|^结构工程|^第三办公/.test(roomName)) return "南岸校区";
  return "";
}

function guessRoomType(roomName) {
  if (/机房|计算机/.test(roomName)) return "机房";
  if (/实验/.test(roomName)) return "实验室";
  if (/绘图|画室/.test(roomName)) return "画室/绘图";
  if (/报告厅|礼堂/.test(roomName)) return "报告厅";
  if (/\d{3,}/.test(roomName)) return "多媒体教室";
  return "普通教室";
}

function guessBuildingOfRoom(roomName) {
  const m = roomName.match(/^([A-Z0-9]+教学楼|第[一二三四五六七八九]教学楼|[A-Z]\d{2}|逸夫楼|航空楼|致远楼|材料实验楼|明德楼B栋|图书馆|国重桥梁结构实验室|科学城实训中心|南岸实训中心|交通机电实验楼|结构工程实验室|第三办公楼)/);
  return m ? m[1] : "";
}

// 展开一行单元格，处理 colspan
function classroomRowCells($, $row) {
  const out = [];
  $row.find("td,th").each((_, cell) => {
    const $c = $(cell);
    const span = Math.max(1, parseInt($c.attr("colspan") || "1", 10) || 1);
    const text = $c.text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    for (let i = 0; i < span; i++) out.push(i === 0 ? text : "");
  });
  return out;
}

// 通用解析：先按“行=教室，列=星期×节次”解析，失败再退回老算法
function parseClassroomTable(html, opts) {
  const $ = cheerio.load(html || "");
  const tables = $("table").toArray();
  if (!tables.length) return { rooms: [], debug: "no-table" };
  let best = null;
  let bestRows = 0;
  tables.forEach(t => {
    const n = $(t).find("tr").length;
    if (n > bestRows) { bestRows = n; best = t; }
  });
  if (!best) return { rooms: [], debug: "no-best-table" };

  const rows = $(best).find("tr").toArray().map(tr => classroomRowCells($, $(tr)));

  // 找表头行（含 星期X / 周X）
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    if (/星期|周[一二三四五六日]/.test(rows[i].join(" "))) { headerIdx = i; break; }
  }

  // 列 -> {weekday, slot}
  let colMap = null;
  if (headerIdx >= 0) {
    const header = rows[headerIdx];
    const map = [];
    let curWeekday = 0;
    let slotSeen = 0;
    let weekdayCount = 0;
    header.forEach((text, idx) => {
      const m = String(text).match(/星期([一二三四五六日])|周([一二三四五六日])/);
      if (m) {
        const ch = m[1] || m[2];
        curWeekday = "一二三四五六日".indexOf(ch) + 1;
        weekdayCount++;
        // 表头里星期几占的是它 5 个节次列的第一列，所以标记列本身算 slot 0
        map[idx] = { weekday: curWeekday, slot: 0 };
        slotSeen = 1;
        return;
      }
      if (curWeekday) {
        map[idx] = { weekday: curWeekday, slot: Math.min(slotSeen, 4) };
        slotSeen++;
      }
    });
    // 只有当每个星期确实铺开了多个节次列时才认为映射可用
    if (weekdayCount >= 6 && header.length >= 30) colMap = map;
  }

  const rooms = [];
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  const legacyCol = 1 + (opts.weekday - 1) * 5 + opts.slot;
  for (let r = startRow; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.length) continue;
    const roomName = String(cells[0] || "").replace(/\u00a0/g, " ").trim();
    if (!roomName || /^备注/.test(roomName) || /星期|节次|教室名称/.test(roomName)) continue;
    let occupied = "";
    if (colMap) {
      const col = colMap.findIndex(m => m && m.weekday === opts.weekday && m.slot === opts.slot);
      if (col < 0) continue;
      occupied = String(cells[col] || "").trim();
    } else {
      if (cells.length <= legacyCol) continue;
      occupied = String(cells[legacyCol] || "").trim();
    }
    if (occupied) continue;
    const type = guessRoomType(roomName);
    if (opts.roomType && !type.includes(opts.roomType) && !roomName.includes(opts.roomType)) continue;
    rooms.push({
      name: roomName,
      campus: guessCampusOfRoom(roomName, opts.campusId),
      building: guessBuildingOfRoom(roomName),
      type,
      seats: 60
    });
  }
  return {
    rooms,
    dataRows: Math.max(0, rows.length - (headerIdx + 1)),
    debug: "tables=" + tables.length + " rows=" + rows.length + " headerIdx=" + headerIdx +
      " cols=" + (rows[headerIdx] ? rows[headerIdx].length : 0) + " colMap=" + (colMap ? "yes" : "no")
  };
}

// 从查询页抓取真实的参数名与 kbjcmsid 选项
async function loadClassroomForm(cm) {
  const out = { fieldNames: [], kbjcmsid: "", semesters: [], kbjcmsidOptions: [] };
  try {
    const got = await eduFetch(cm, "/jsxsd/kbcx/kbxx_classroom", { headers: { Referer: SERVICE_URL } });
    const html = got.html || "";
    if (isExpiredHtml(html)) return { expired: true };
    const $ = cheerio.load(html);
    $("input,select,textarea").each((_, el) => {
      const name = $(el).attr("name");
      if (name) out.fieldNames.push(name);
    });
    out.fieldNames = Array.from(new Set(out.fieldNames));
    const semSel = $("#xnxq").length ? $("#xnxq") : $("#xnxq01id");
    semSel.find("option").each((_, el) => {
      const val = $(el).attr("value");
      if (val) out.semesters.push({ value: val, text: $(el).text().trim() });
    });
    out.selectedSemester = semSel.find("option:selected").attr("value") || (out.semesters[0] && out.semesters[0].value) || "";
    out.campusOptions = $("#xqid option").map((_, el) => ({ value: $(el).attr("value") || "", text: $(el).text().trim() })).get();
    $("#kbjcmsid option").each((_, el) => {
      const val = $(el).attr("value");
      if (val) out.kbjcmsidOptions.push({ value: val, text: $(el).text().trim() });
    });
    out.kbjcmsid = (out.kbjcmsidOptions[0] && out.kbjcmsidOptions[0].value) || "";
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

async function queryClassroomsReal(cm, opts) {
  const referer = EDU_URL + "/jsxsd/kbcx/kbxx_classroom";
  const form = await loadClassroomForm(cm);
  if (form.expired) return { expired: true };
  const sem = opts.xnxq || form.selectedSemester || (form.semesters[0] && form.semesters[0].value) || "2026-2027-1";
  const kbjcmsid = form.kbjcmsid || "";
  const attempts = [];
  const buildParams = (useXnxq01id) => {
    const p = new URLSearchParams();
    p.set(useXnxq01id ? "xnxq01id" : "xnxqh", sem);
    if (kbjcmsid) p.set("kbjcmsid", kbjcmsid);
    p.set("zc1", opts.zc);
    p.set("zc2", opts.zc);
    p.set("skxq1", opts.xq);
    p.set("skxq2", opts.xq);
    if (opts.campusId) p.set("xqid", opts.campusId);
    if (opts.buildingId) p.set("jzwid", opts.buildingId);
    return p;
  };

  const tryOne = async (label, params, method) => {
    const qs = params.toString();
    const got = method === "POST"
      ? await eduFetch(cm, "/jsxsd/kbcx/kbxx_classroom_ifr", { method: "POST", body: qs, headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: referer } })
      : await eduFetch(cm, "/jsxsd/kbcx/kbxx_classroom_ifr?" + qs, { headers: { Referer: referer } });
    if (isExpiredHtml(got.html)) return { expired: true };
    const parsed = parseClassroomTable(got.html, opts);
    attempts.push(label + ":" + parsed.debug + ":rooms=" + parsed.rooms.length);
    return { rooms: parsed.rooms, dataRows: parsed.dataRows, debug: parsed.debug, html: got.html, label };
  };

  const plans = [
    ["GET-xnxq01id", buildParams(true), "GET"],
    ["POST-xnxq01id", buildParams(true), "POST"],
    ["GET-xnxqh", buildParams(false), "GET"],
    ["POST-xnxqh", buildParams(false), "POST"]
  ];
  let firstEmpty = null;
  for (const [label, params, method] of plans) {
    const r = await tryOne(label, params, method);
    if (r.expired) return { expired: true };
    if (r.rooms.length) return { rooms: r.rooms, debug: r.debug, via: label, attempts, form, html: r.html };
    // 表格解析成功但没有空教室，说明是真的没有，不用再换参数重试（省 3 次教务请求）
    if (r.dataRows > 0) return { rooms: [], debug: r.debug, via: label, attempts, form, html: r.html };
    if (!firstEmpty) firstEmpty = r;
  }
  return {
    rooms: [],
    debug: firstEmpty ? firstEmpty.debug : "no-attempt",
    via: "none",
    attempts,
    form,
    html: firstEmpty ? firstEmpty.html : ""
  };
}

app.get("/api/classrooms", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    if (isDemoSession(rec)) {
      if (!isGrayEnabled()) return res.json({ success: false, sessionExpired: true, grayClosed: true, message: "演示功能已关闭" });
      if (String(req.query.query || "") !== "1") {
        return res.json({ success: true, rooms: [], queried: false, filters: {} });
      }
      return res.json(demoData.classroomsPayload(req.query));
    }
    const cm = rec.cm;

    const weekdayMap = { "星期一": "1", "星期二": "2", "星期三": "3", "星期四": "4", "星期五": "5", "星期六": "6", "星期日": "7", "周一": "1", "周二": "2", "周三": "3", "周四": "4", "周五": "5", "周六": "6", "周日": "7" };
    let zc = String(req.query.week || "1").trim();
    const zcNum = parseInt(zc, 10);
    if (!zcNum || zcNum < 1 || zcNum > 20) zc = "1";
    else zc = String(zcNum);
    let xq = String(req.query.weekday || "1").trim();
    if (weekdayMap[xq]) xq = weekdayMap[xq];
    const xqNum = parseInt(xq, 10);
    if (!xqNum || xqNum < 1 || xqNum > 7) xq = "1";
    else xq = String(xqNum);
    const periodSlot = String(req.query.period != null ? req.query.period : "0").trim();
    const campusId = String(req.query.campus || "").trim();
    const buildingId = String(req.query.building || "").trim();
    const roomType = String(req.query.roomType || "").trim();
    const xnxqh = String(req.query.xnxq || "2026-2027-1").trim();
    const doQuery = String(req.query.query || "") === "1";

    const allBuildings = [
      ...CAMPUS_BUILDINGS["02"].map(b => ({ ...b, campus: "科学城校区" })),
      ...CAMPUS_BUILDINGS["01"].map(b => ({ ...b, campus: "南岸校区" }))
    ];

    const filters = {
      weeks: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), text: "第" + (i + 1) + "周" })),
      weekdays: [
        { value: "1", text: "星期一" }, { value: "2", text: "星期二" }, { value: "3", text: "星期三" },
        { value: "4", text: "星期四" }, { value: "5", text: "星期五" }, { value: "6", text: "星期六" }, { value: "7", text: "星期日" }
      ],
      periods: [
        { value: "0", text: "第1-2节 (08:20-09:45)" },
        { value: "1", text: "第3-5节 (10:15-12:35)" },
        { value: "2", text: "第6-7节 (14:00-15:25)" },
        { value: "3", text: "第8-10节 (15:40-18:00)" },
        { value: "4", text: "第11-13节 (晚上)" }
      ],
      campuses: [
        { value: "", text: "全部校区" },
        { value: "02", text: "科学城校区" },
        { value: "01", text: "南岸校区" }
      ],
      buildings: campusId && CAMPUS_BUILDINGS[campusId] ? CAMPUS_BUILDINGS[campusId] : allBuildings,
      roomTypes: [
        { value: "", text: "不限类型" },
        { value: "普通教室", text: "普通教室" },
        { value: "多媒体教室", text: "多媒体教室" },
        { value: "机房", text: "计算机房" },
        { value: "实验室", text: "实验室" }
      ]
    };

    if (!doQuery) {
      return res.json({ success: true, filters, rooms: [], queried: false });
    }

    const result = await queryClassroomsReal(cm, {
      xnxq: xnxqh,
      zc,
      xq,
      campusId,
      buildingId,
      roomType,
      weekday: parseInt(xq, 10) || 1,
      slot: parseInt(periodSlot, 10) >= 0 && parseInt(periodSlot, 10) <= 4 ? parseInt(periodSlot, 10) : 0
    });
    if (result.expired) {
      expireSession(sessionId);
      return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期，请重新登录" });
    }

    res.json({
      success: true,
      filters,
      rooms: result.rooms,
      queried: true,
      count: result.rooms.length,
      via: result.via,
      attempts: result.attempts,
      fieldNames: result.form ? result.form.fieldNames : [],
      kbjcmsid: result.form ? result.form.kbjcmsid : ""
    });
  } catch (err) {
    return sendUpstreamFailure(res, err, "查询空闲教室失败，请稍后重试");
  }
});

// 空闲教室诊断端点：用真实会话跑一次查询，返回结构信息，便于定位教务返回的表格式
app.get("/api/classrooms/debug", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    if (isDemoSession(rec)) return res.json({ success: false, message: "演示账号无法访问教务系统" });
    const cm = rec.cm;
    const xq = classroomWeekdayToNum(req.query.weekday || "1");
    const zc = String(req.query.week || "1");
    const slot = parseInt(req.query.period || "0", 10);
    const result = await queryClassroomsReal(cm, {
      xnxq: req.query.xnxq || "",
      zc,
      xq,
      campusId: String(req.query.campus || ""),
      buildingId: "",
      roomType: "",
      weekday: parseInt(xq, 10),
      slot: slot >= 0 && slot <= 4 ? slot : 0
    });
    if (result.expired) return res.json({ success: false, sessionExpired: true, message: "教务登录会话已过期" });
    const $ = cheerio.load(result.html || "");
    const tables = $("table").toArray().map(t => ({
      rows: $(t).find("tr").length,
      sample: $(t).find("tr").slice(0, 3).toArray().map(tr =>
        $(tr).find("td,th").toArray().map(c => $(c).text().replace(/\s+/g, " ").trim().slice(0, 40))
      )
    }));
    res.json({
      success: true,
      via: result.via,
      attempts: result.attempts,
      debug: result.debug,
      form: result.form,
      htmlLen: (result.html || "").length,
      tables,
      rooms: result.rooms.slice(0, 10)
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// Logout endpoint
app.post("/api/logout", async (req, res) => {
  const sessionId = (req.body && req.body.sessionId) || req.headers["x-session-id"];
  if (sessionId) {
    deleteSession(sessionId);
  }
  res.json({ success: true, message: "已退出登录" });
});

const WEATHER_CAMPUSES = {
  nanan: { id: "nanan", name: "南岸校区", lat: 29.503, lon: 106.575 },
  kexuecheng: { id: "kexuecheng", name: "科学城校区", lat: 29.618, lon: 106.305 },
};
const weatherCache = new Map();

function wmoText(code) {
  const n = Number(code);
  if (n === 0) return "晴";
  if (n <= 3) return "多云";
  if (n === 45 || n === 48) return "雾";
  if (n >= 51 && n <= 57) return "小雨";
  if (n >= 61 && n <= 67) return "雨";
  if (n >= 71 && n <= 77) return "雪";
  if (n >= 80 && n <= 82) return "阵雨";
  if (n >= 95) return "雷雨";
  return "阴";
}

function windDirText(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "";
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const i = Math.round((Number(deg) % 360) / 45) % 8;
  return dirs[i];
}

function clockFromIso(iso) {
  if (!iso) return "";
  const t = String(iso).slice(11, 16);
  return /^\d{2}:\d{2}$/.test(t) ? t : "";
}

function localYmd(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function buildAcademicCalendar(xnxq) {
  const start = parseSemesterStart(xnxq);
  const key = String(xnxq || "2026-2027-1");
  const events = [];
  if (key.startsWith("2026-2027-1") || !xnxq) {
    events.push(
      { date: "2026-09-05", endDate: "2026-09-06", title: "老生报到", type: "admin" },
      { date: "2026-09-07", endDate: "2026-09-07", title: "正式上课", type: "term-start", week: 1 },
      { date: "2026-09-08", endDate: "2026-09-08", title: "研究生迎新", type: "admin" },
      { date: "2026-09-09", endDate: "2026-09-10", title: "本科生迎新", type: "admin" },
      { date: "2026-09-11", endDate: "2026-09-24", title: "新生军训", type: "admin" },
      { date: "2026-09-25", endDate: "2026-09-25", title: "中秋节", type: "holiday" },
      { date: "2026-10-01", endDate: "2026-10-07", title: "国庆放假", type: "holiday" },
      { date: "2026-10-16", endDate: "2026-10-16", title: "新生达标运动会", type: "event" },
      { date: "2026-11-07", endDate: "2026-11-07", title: "校庆日", type: "event" },
      { date: "2027-01-01", endDate: "2027-01-01", title: "元旦", type: "holiday" },
      { date: "2027-01-18", endDate: "2027-02-21", title: "寒假", type: "vacation" }
    );
  } else if (key.startsWith("2026-2027-2")) {
    events.push(
      { date: "2027-02-20", endDate: "2027-02-21", title: "报到注册", type: "admin" },
      { date: "2027-02-22", endDate: "2027-02-22", title: "正式上课", type: "term-start", week: 1 },
      { date: "2027-04-05", endDate: "2027-04-05", title: "清明", type: "holiday" },
      { date: "2027-04-15", endDate: "2027-04-16", title: "春季运动会", type: "event" },
      { date: "2027-05-01", endDate: "2027-05-01", title: "劳动节", type: "holiday" },
      { date: "2027-06-01", endDate: "2027-06-12", title: "本科生毕业答辩", type: "exam" },
      { date: "2027-06-04", endDate: "2027-06-04", title: "传统文化体育节", type: "event" },
      { date: "2027-06-09", endDate: "2027-06-09", title: "端午", type: "holiday" },
      { date: "2027-06-28", endDate: "2027-07-16", title: "夏季学期", type: "term" },
      { date: "2027-07-19", endDate: "2027-09-03", title: "暑假", type: "vacation" }
    );
  } else {
    if (start.known) {
      events.push({ date: start.iso, endDate: start.iso, title: "开学行课", type: "term-start", week: 1 });
    }
  }
  const today = localYmd(new Date());
  const currentWeek = currentWeekOf(start.iso);
  const upcoming = events.filter(e => (e.endDate || e.date) >= today).slice(0, 4);
  return {
    semester: key,
    semesterText: formatSemesterText(key),
    semesterStart: start.iso,
    semesterStartKnown: start.known,
    currentWeek,
    today,
    events,
    upcoming: upcoming.length ? upcoming : events.slice(-2),
    source: "重庆交通大学教务处 2026-2027学年校历",
    sourceUrl: "https://jw.cqjtu.edu.cn/info/1053/10903.htm",
    imageUrl: "https://jw.cqjtu.edu.cn/__local/0/A7/84/E03BD2A59F5C595F2ADFB463BA2_ED11C1EB_5E6CE1.jpg",
  };
}

app.get("/api/weather", async (req, res) => {
  const campusId = WEATHER_CAMPUSES[req.query.campus] ? req.query.campus : "kexuecheng";
  const campus = WEATHER_CAMPUSES[campusId];
  const cached = weatherCache.get(campusId);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return res.json(cached.payload);
  }
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + campus.lat
      + "&longitude=" + campus.lon
      + "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,apparent_temperature"
      + "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset,apparent_temperature_max"
      + "&timezone=Asia%2FShanghai&forecast_days=3";
    const wr = await fetch(url, {
      headers: { "User-Agent": "xuedu-app/2.2.21" },
      signal: AbortSignal.timeout(runtimeConfig.upstreamTimeoutMs),
    });
    if (!wr.ok) throw new Error("Weather upstream failed");
    const data = await wr.json();
    const cur = data.current || {};
    const daily = data.daily || {};
    const days = (daily.time || []).map((d, i) => ({
      date: d,
      tmax: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[i]) : null,
      tmin: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[i]) : null,
      text: wmoText(daily.weather_code ? daily.weather_code[i] : 1),
      precipProb: daily.precipitation_probability_max ? Math.round(daily.precipitation_probability_max[i]) : null,
      precipSum: daily.precipitation_sum ? Number(daily.precipitation_sum[i]) : null,
      wind: daily.wind_speed_10m_max != null ? Math.round(daily.wind_speed_10m_max[i] * 10) / 10 : null,
      uv: daily.uv_index_max != null ? Math.round(daily.uv_index_max[i] * 10) / 10 : null,
      sunrise: clockFromIso(daily.sunrise ? daily.sunrise[i] : ""),
      sunset: clockFromIso(daily.sunset ? daily.sunset[i] : ""),
      apparent: daily.apparent_temperature_max ? Math.round(daily.apparent_temperature_max[i]) : null,
    }));
    const payload = {
      success: true,
      campus: campus.id,
      campusName: campus.name,
      temperature: cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null,
      apparent: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null,
      humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
      wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m * 10) / 10 : null,
      windDir: windDirText(cur.wind_direction_10m),
      weatherCode: cur.weather_code,
      text: wmoText(cur.weather_code),
      days,
      campuses: Object.values(WEATHER_CAMPUSES).map(c => ({ id: c.id, name: c.name })),
    };
    weatherCache.set(campusId, { at: Date.now(), payload });
    res.json(payload);
  } catch (err) {
    const timeout = err && (err.name === "AbortError" || err.name === "TimeoutError");
    res.status(502).json({
      success: false,
      message: timeout ? "天气服务响应超时，请稍后重试" : "天气服务暂时不可用，请稍后重试",
      campus: campus.id,
      campusName: campus.name,
    });
  }
});

app.get("/api/calendar", (req, res) => {
  const xnxq = String(req.query.xnxq || "2026-2027-1");
  res.json({ success: true, ...buildAcademicCalendar(xnxq) });
});

// App Update & APK Download Endpoints
app.get("/api/app/check-update", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  const release = readAppRelease(process.env.APP_RELEASE_FILE || undefined);
  const clientVersion = String(req.query.version || req.get("x-app-version") || "");
  const rawClientCode = req.query.versionCode || req.get("x-app-version-code") || "";
  const clientCode = Number(rawClientCode);
  const hasClientCode = Number.isSafeInteger(clientCode) && clientCode > 0;
  const newerAvailable = !!release && release.available && (hasClientCode
    ? clientCode < release.versionCode
    : compareVersions(clientVersion, release.version) < 0);
  const assetName = release && release.available ? releaseAssetName(release.downloadUrl) : "";
  res.json({
    success: true,
    latestVersion: release ? release.version : "",
    versionCode: release ? release.versionCode : 0,
    channel: release ? release.channel : "test",
    hasUpdate: newerAvailable,
    forceUpdate: false,
    updateAvailable: newerAvailable,
    title: release ? `学渡 测试版 v${release.version}` : "暂无可用测试版",
    releaseNotes: release ? release.releaseNotes : "",
    apkName: assetName,
    apkSize: newerAvailable ? "详见 GitHub Release" : "",
    downloadUrl: newerAvailable ? "/download/app-test.apk" : "",
    fullDownloadUrl: newerAvailable ? release.downloadUrl : "",
    publishDate: release && release.available ? release.publishDate : "",
  });
});

app.get("/download/app-test.apk", (req, res) => {
  const release = readAppRelease(process.env.APP_RELEASE_FILE || undefined);
  if (!release || !release.available) return res.status(404).send("测试版安装包尚未发布");
  res.set("Cache-Control", "no-store");
  return res.redirect(302, release.downloadUrl);
});

app.get(["/download/app-gray.apk", "/download/app-latest.apk"], (req, res) => {
  return res.redirect(302, "/download/app-test.apk");
});

function loadDsConfig() {
  let fileCfg = {};
  try {
    const file = path.join(DATA_DIR, "ds-api.json");
    if (fs.existsSync(file)) fileCfg = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch {}
  return {
    key: String(process.env.DS_API_KEY || fileCfg.key || "").trim(),
    base: String(process.env.DS_API_BASE || fileCfg.base || "https://chat.cqjtu.edu.cn/ds/api/v1").replace(/\/$/, ""),
    model: String(process.env.DS_MODEL || fileCfg.model || "DeepseekV4f").trim()
  };
}

// ---------------------------------------------------------------------------
// 学渡助手：实时数据注入
// 客户端会把课表 / 成绩 / 考试 / 校历 / 培养方案 / 空教室等真实数据带上来，
// 这里把它压成一段紧凑中文，塞进 system prompt，让助手直接给答案而不是让学生自己去翻页面。
// ---------------------------------------------------------------------------
function asstText(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function asstList(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function formatAssistantContext(raw) {
  if (!raw || typeof raw !== "object") return "";
  const lines = [];

  const now = asstText(raw.now, 60);
  if (now) lines.push("现在时间：" + now);

  const st = raw.student && typeof raw.student === "object" ? raw.student : null;
  if (st) {
    const bits = [
      asstText(st.name, 30) && "姓名 " + asstText(st.name, 30),
      asstText(st.studentId, 30) && "学号 " + asstText(st.studentId, 30),
      asstText(st.className, 50) && "班级 " + asstText(st.className, 50),
      asstText(st.major, 60) && "专业 " + asstText(st.major, 60),
      asstText(st.college, 60) && "学院 " + asstText(st.college, 60),
      asstText(st.campus, 30) && "常用校区 " + asstText(st.campus, 30)
    ].filter(Boolean);
    if (bits.length) lines.push("学生：" + bits.join("，"));
  }

  const semester = asstText(raw.semester, 120);
  if (semester) lines.push("学期：" + semester);

  const fmtCourse = (c) => {
    if (!c || typeof c !== "object") return "";
    const parts = [asstText(c.name, 60)];
    if (c.day) parts.push(asstText(c.day, 8));
    if (c.time) parts.push(asstText(c.time, 24));
    if (c.room) parts.push(asstText(c.room, 40));
    if (c.teacher) parts.push(asstText(c.teacher, 20) + "老师");
    return parts.filter(Boolean).join(" ");
  };

  const today = asstList(raw.todayCourses, 20).map(fmtCourse).filter(Boolean);
  lines.push(today.length ? "今天课程：" + today.join("；") : "今天课程：无课");

  const week = asstList(raw.weekCourses, 40).map(fmtCourse).filter(Boolean);
  if (week.length) lines.push("本周全部课程：" + week.join("；"));

  const g = raw.grades && typeof raw.grades === "object" ? raw.grades : null;
  if (g) {
    const head = [];
    if (g.total != null) head.push("已出成绩 " + asstText(g.total, 8) + " 门");
    if (g.credits != null) head.push("累计学分 " + asstText(g.credits, 10));
    if (g.average != null) head.push("平均分 " + asstText(g.average, 10));
    if (g.gpa != null) head.push("平均绩点 " + asstText(g.gpa, 10));
    if (g.passed != null) head.push("及格 " + asstText(g.passed, 8) + " 门");
    if (head.length) lines.push("成绩概览：" + head.join("，"));
    const nat = asstList(g.byNature, 12)
      .map(r => asstText(r.name, 30) + " " + asstText(r.credits, 10) + "学分/" + asstText(r.count, 8) + "门")
      .filter(Boolean);
    if (nat.length) lines.push("按课程性质学分：" + nat.join("；"));
    const failed = asstList(g.failed, 10).map(x => asstText(x, 40)).filter(Boolean);
    if (failed.length) lines.push("未及格课程：" + failed.join("；"));
    const list = asstList(g.list, 60).map(x => {
      const parts = [asstText(x.name, 50)];
      if (x.score) parts.push("成绩" + asstText(x.score, 10));
      if (x.credit) parts.push(asstText(x.credit, 10) + "学分");
      if (x.gpa) parts.push("绩点" + asstText(x.gpa, 10));
      if (x.nature) parts.push(asstText(x.nature, 30));
      if (x.semester) parts.push(asstText(x.semester, 20));
      return parts.filter(Boolean).join(" ");
    }).filter(Boolean);
    if (list.length) lines.push("成绩明细：" + list.join("；"));
  }

  const exams = asstList(raw.exams, 20).map(e => {
    if (!e || typeof e !== "object") return "";
    const parts = [asstText(e.courseName, 50)];
    if (e.examTime) parts.push(asstText(e.examTime, 40));
    if (e.examRoom) parts.push(asstText(e.examRoom, 40));
    if (e.seatNumber) parts.push("座位" + asstText(e.seatNumber, 10));
    if (e.campus) parts.push(asstText(e.campus, 30));
    return parts.filter(Boolean).join(" ");
  }).filter(Boolean);
  if (exams.length) lines.push("考试安排：" + exams.join("；"));

  const cal = asstList(raw.calendar, 10).map(ev => {
    if (!ev || typeof ev !== "object") return "";
    const d = asstText(ev.date, 20);
    const e = asstText(ev.endDate, 20);
    const t = asstText(ev.title, 40);
    const range = d && e && e !== d ? d + "至" + e : d;
    return (range + " " + t).trim();
  }).filter(Boolean);
  if (cal.length) lines.push("校历节点：" + cal.join("；"));

  const cls = raw.classrooms && typeof raw.classrooms === "object" ? raw.classrooms : null;
  if (cls) {
    const q = asstText(cls.query, 90);
    if (cls.error) {
      lines.push("空教室查询（" + q + "）：查询失败 —— " + asstText(cls.error, 120));
    } else {
      const rooms = asstList(cls.rooms, 40).map(r => {
        if (!r || typeof r !== "object") return "";
        const name = asstText(r.name, 40);
        const campus = r.campus ? "(" + asstText(r.campus, 20) + ")" : "";
        const type = r.type ? "/" + asstText(r.type, 20) : "";
        return (name + campus + type).trim();
      }).filter(Boolean);
      lines.push("空教室查询（" + q + "）：共 " + asstText(cls.total, 10) + " 间空闲。清单：" + (rooms.join("、") || "无"));
    }
  }

  const prog = raw.program && typeof raw.program === "object" ? raw.program : null;
  if (prog) {
    const courses = asstList(prog.courses, 80).map(c => {
      if (!c || typeof c !== "object") return "";
      const parts = [asstText(c.name, 50)];
      if (c.credit) parts.push(asstText(c.credit, 10) + "学分");
      if (c.nature) parts.push(asstText(c.nature, 30));
      if (c.semester) parts.push(asstText(c.semester, 20));
      return parts.filter(Boolean).join(" ");
    }).filter(Boolean);
    if (courses.length) lines.push("培养方案（" + asstText(prog.title, 40) + "）：" + courses.join("；"));
  }

  const text = lines.join("\n");
  return text.length > 12000 ? text.slice(0, 12000) + "\n（数据已截断）" : text;
}

function buildAssistantSystemPrompt(rec, liveContext) {
  const who = rec && rec.studentName ? "当前学生：" + rec.studentName + "。" : "";
  const demo = rec && isDemoSession(rec) ? "当前是演示账号，课表成绩考试均为虚构演示数据。" : "";
  return [
    "你是学渡助手，服务重庆交通大学学生。" + who + demo,
    "回答要求：用简洁中文，直接给结论和具体数据（课程名、教室号、时间、成绩、绩点、学分等），不要输出思考过程。",
    "下面【实时数据】是刚刚从严教务系统和学渡数据库取到的该学生真实数据。你必须优先依据它回答；用户问什么就把答案直接列出来，绝对不要回复“请你自己打开某某页面查看”这类把问题推回去的话。",
    "只有【实时数据】里确实没有相关字段时，才简短说明学渡暂时取不到这项数据，并给出最接近的可用信息，不要编造具体教室号或成绩。",
    liveContext
      ? "【实时数据】\n" + liveContext
      : "【实时数据】\n（本次没有附带实时数据。请提示用户重新登录以同步课表成绩，并基于常识回答。）"
  ].join("\n");
}

app.get("/api/assistant/status", (req, res) => {
  const sessionId = req.query.sessionId || req.headers["x-session-id"];
  const rec = getSession(sessionId);
  if (!rec) {
    return res.json({ success: false, sessionExpired: true, configured: false, message: "未登录或会话已过期" });
  }
  if (isDemoSession(rec) && !isGrayEnabled()) return res.json(grayClosedPayload());
  const cfg = loadDsConfig();
  const demoReady = isDemoSession(rec) && !!cfg.key && isGrayEnabled();
  res.json({
    success: true,
    configured: demoReady || !!cfg.key,
    serverKey: demoReady,
    allowUserKey: !demoReady,
    demo: isDemoSession(rec),
    model: cfg.model,
    applyPath: "企业微信 → 工作台 → AI服务 → DS API key申请",
    message: demoReady
      ? "演示账号已接通学院 DeepSeek，可直接提问"
      : "请在企业微信工作台申请自己的 DeepSeek API Key，填入学渡助手后即可使用"
  });
});

app.post("/api/assistant/chat", async (req, res) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId || req.headers["x-session-id"];
    const rec = getSession(sessionId);
    if (!rec) return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
    if (isDemoSession(rec) && !isGrayEnabled()) return res.json(grayClosedPayload());
    const cfg = loadDsConfig();
    const userKey = isDemoSession(rec) ? "" : String(req.body.apiKey || req.headers["x-ds-key"] || "").trim();
    const apiKey = (isDemoSession(rec) ? cfg.key : (userKey || cfg.key));
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        needKey: true,
        message: "请先在企业微信申请 DeepSeek API Key，并在学渡助手页保存"
      });
    }
    const incoming = Array.isArray(req.body.messages) ? req.body.messages : [];
    const cleaned = incoming
      .filter(m => m && (m.role === "user" || m.role === "assistant" || m.role === "system"))
      .slice(-16)
      .map(m => ({ role: m.role, content: String(m.content || "").slice(0, 4000) }));
    if (!cleaned.some(m => m.role === "user")) {
      return res.status(400).json({ success: false, message: "请输入问题" });
    }
    const liveContext = formatAssistantContext(req.body.context);
    const payload = {
      model: cfg.model,
      messages: [
        { role: "system", content: buildAssistantSystemPrompt(rec, liveContext) },
        ...cleaned.filter(m => m.role !== "system")
      ],
      temperature: 0.6,
      max_tokens: 1500,
      stream: req.body.stream !== false,
      thinking: { type: "disabled" }
    };
    const upstream = await fetch(cfg.base + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      let msg = "学院 DeepSeek 接口返回 " + upstream.status;
      try {
        const j = JSON.parse(errText);
        if (j.error && j.error.message) msg = j.error.message;
        else if (j.message) msg = j.message;
      } catch {}
      return res.status(502).json({ success: false, message: msg });
    }
    const ctype = upstream.headers.get("content-type") || "";
    if (payload.stream && ctype.includes("text/event-stream") && upstream.body) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders && res.flushHeaders();
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let carry = "";
      let sawContent = false;
      let reasoning = "";
      const flushLines = (chunk) => {
        carry += chunk;
        const parts = carry.split("\n");
        carry = parts.pop() || "";
        for (const raw of parts) {
          const line = raw.replace(/\r$/, "");
          if (!line.startsWith("data:")) {
            res.write(line + "\n");
            continue;
          }
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") {
            res.write(line + "\n");
            continue;
          }
          try {
            const json = JSON.parse(data);
            const choice = ((json.choices || [])[0] || {});
            const delta = choice.delta || {};
            const msg = choice.message || {};
            const piece = String(delta.content || msg.content || "");
            const think = String(delta.reasoning_content || msg.reasoning_content || "");
            if (think) reasoning += think;
            if (piece) {
              sawContent = true;
              res.write("data: " + JSON.stringify(json) + "\n");
            } else if (think && !sawContent) {
              const cloned = JSON.parse(JSON.stringify(json));
              if (!cloned.choices) cloned.choices = [{}];
              cloned.choices[0].delta = Object.assign({}, delta, { content: think });
              delete cloned.choices[0].delta.reasoning_content;
              res.write("data: " + JSON.stringify(cloned) + "\n");
            }
          } catch {
            res.write(line + "\n");
          }
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) flushLines(decoder.decode(value, { stream: true }));
        }
        if (carry) flushLines("\n");
        if (!sawContent && reasoning.trim()) {
          res.write("data: " + JSON.stringify({
            choices: [{ delta: { content: reasoning.trim(), role: "assistant" }, index: 0 }]
          }) + "\n\n");
        }
      } catch (e) {
        console.error("assistant stream", e.message);
      }
      return res.end();
    }
    const data = await upstream.json();
    const msg = (((data || {}).choices || [])[0] || {}).message || {};
    const content = String(msg.content || msg.reasoning_content || "").trim();
    res.json({ success: true, content: content || "", raw: { id: data.id, model: data.model, usage: data.usage } });
  } catch (err) {
    console.error("assistant chat", err.message);
    res.status(500).json({ success: false, message: "助手暂时不可用: " + err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", sessions: sessions.size, gray: isGrayEnabled() });
});

app.get("/api/gray/status", (req, res) => {
  res.json({ success: true, enabled: isGrayEnabled(), demoUser: isGrayEnabled() ? DEMO_USER : "" });
});

app.post("/api/gray/control", (req, res) => {
  if (!isGrayAdminReady()) {
    return res.status(503).json({ success: false, message: "演示管理未配置" });
  }
  if (!hasGrayAdminAccess(req)) return res.status(403).json({ success: false, message: "无权管理演示功能" });
  if (!req.body || typeof req.body.enabled === "undefined") {
    const enabled = isGrayEnabled();
    return res.json({ success: true, enabled, message: enabled ? "演示功能当前已启用" : "演示功能当前已停用" });
  }
  const raw = req.body.enabled;
  const on = raw === true || raw === "true" || raw === 1 || raw === "1";
  if (on && !ENV_GRAY_ENABLED) {
    return res.status(409).json({ success: false, enabled: false, message: "启用演示功能需要配置 GRAY_ENABLED=1 并重启服务" });
  }
  grayDisabledAtRuntime = !on;
  if (!on) {
    for (const [id, rec] of sessions) {
      if (rec && rec.demo) deleteSession(id);
    }
  }
  res.json({ success: true, enabled: isGrayEnabled(), message: isGrayEnabled() ? "演示功能已启用" : "演示功能已停用" });
});

app.post("/api/survey", (req, res) => {
  if (!isGrayEnabled()) return res.json(grayClosedPayload());
  const sessionId = (req.body && req.body.sessionId) || req.headers["x-session-id"];
  const rec = getSession(sessionId);
  if (!rec) return res.json({ success: false, sessionExpired: true, message: "未登录或会话已过期" });
  const answers = (req.body && req.body.answers && typeof req.body.answers === "object") ? req.body.answers : {};
  const feelMap = { "很难用": 1, "一般": 2, "还行": 3, "好用": 4, "会推荐": 5 };
  let score = Number(req.body && req.body.score);
  if (!score && answers.feel) score = feelMap[String(answers.feel)] || 0;
  if (!score || score < 1 || score > 5) return res.json({ success: false, message: "请先打分" });
  const used = Array.isArray(answers.used) ? answers.used : (Array.isArray(req.body.used) ? req.body.used : []);
  const row = {
    at: new Date().toISOString(),
    studentId: rec.username || "",
    demo: !!rec.demo,
    score,
    used: used.slice(0, 12).map(String),
    answers: {
      feel: String(answers.feel || "").slice(0, 20),
      used: used.slice(0, 12).map(String),
      schedule: String(answers.schedule || "").slice(0, 20),
      pain: String(answers.pain || "").slice(0, 40),
      wish: String(answers.wish || "").slice(0, 40),
      again: String(answers.again || "").slice(0, 20)
    },
    version: String((req.body && req.body.version) || "").slice(0, 20)
  };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(SURVEY_FILE, JSON.stringify(row) + "\n");
    res.json({ success: true, message: "已收到" });
  } catch (e) {
    res.json({ success: false, message: "提交失败" });
  }
});

// Start server
const BIND_HOST = process.env.BIND_HOST || (process.platform === "win32" ? "0.0.0.0" : "127.0.0.1");
let server = null;
if (require.main === module) {
  server = app.listen(PORT, BIND_HOST, () => {
    console.log("Server running on", BIND_HOST + ":" + PORT);
  });
}

module.exports = { app, server };
if (process.env.NODE_ENV === "test") {
  module.exports.testHooks = { sessions, CookieManager, rememberSession, getSession };
}
