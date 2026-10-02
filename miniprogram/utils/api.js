const app = getApp();
const SCHEDULE_CACHE_PREFIX = 'scheduleCache:v1:';
const LAST_SEMESTER_PREFIX = 'scheduleLastSemester:v1:';

function getBackendUrl() {
  return app.globalData.backendUrl;
}

function request(path, options) {
  const opts = options || {};
  const headers = Object.assign({}, opts.header || {});
  if (app.globalData.sessionId) headers['x-session-id'] = app.globalData.sessionId;
  return new Promise((resolve, reject) => {
    wx.request({
      url: getBackendUrl() + path,
      method: opts.method || 'GET',
      data: opts.data,
      header: headers,
      timeout: opts.timeout || 20000,
      success: (res) => {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }
        const error = new Error(body.message || '服务器暂时无法完成请求');
        error.statusCode = res.statusCode;
        error.sessionExpired = !!body.sessionExpired;
        reject(error);
      },
      fail: (err) => {
        const error = new Error('网络请求失败，请检查网络后重试');
        error.network = true;
        error.cause = err && err.errMsg;
        reject(error);
      },
    });
  });
}

function redirectToLoginIfExpired(data) {
  if (data && data.sessionExpired) {
    wx.redirectTo({ url: '/pages/login/login' });
  }
}

function scheduleCacheKey(studentId, semester) {
  return SCHEDULE_CACHE_PREFIX + encodeURIComponent(String(studentId)) + ':' + encodeURIComponent(String(semester));
}

function lastSemesterKey(studentId) {
  return LAST_SEMESTER_PREFIX + encodeURIComponent(String(studentId));
}

function currentStudentId() {
  return String(app.globalData.studentId || '');
}

function readScheduleCache(studentId, semester, reason) {
  if (!studentId) return null;
  try {
    let term = semester;
    if (!term) term = wx.getStorageSync(lastSemesterKey(studentId));
    if (!term) return null;
    const cached = wx.getStorageSync(scheduleCacheKey(studentId, term));
    if (!cached || !Array.isArray(cached.courses)) return null;
    return Object.assign({}, cached, { offline: true, offlineMessage: reason || '' });
  } catch (e) {
    return null;
  }
}

function writeScheduleCache(studentId, payload) {
  if (!studentId || !payload || !payload.semester || !Array.isArray(payload.courses)) return;
  const safePayload = Object.assign({}, payload, {
    courses: payload.courses,
    cachedAt: Date.now(),
    offline: false,
  });
  try {
    wx.setStorageSync(scheduleCacheKey(studentId, payload.semester), safePayload);
    wx.setStorageSync(lastSemesterKey(studentId), payload.semester);
  } catch (e) {
    // A full device cache should not block displaying the live schedule.
  }
}

function login(username, password) {
  return request('/api/login', {
    method: 'POST',
    data: { username, password },
  }).then((data) => {
    if (data.success) {
      app.setLoginInfo(data.sessionId, data.studentName, data.studentId || username);
      return data;
    }
    if (data.grayClosed) throw new Error(data.message || '演示功能已关闭');
    throw new Error(data.message || '登录失败');
  });
}

async function getSchedule(semester) {
  const requestedSemester = String(semester || '').trim();
  const query = requestedSemester ? '?xnxq=' + encodeURIComponent(requestedSemester) : '';
  const studentId = currentStudentId();
  try {
    const data = await request('/api/schedule' + query);
    if (!data.success) {
      redirectToLoginIfExpired(data);
      const error = new Error(data.message || '获取课表失败');
      error.sessionExpired = !!data.sessionExpired;
      error.grayClosed = !!data.grayClosed;
      error.scheduleUnavailable = /无法确认课表所属学期/.test(error.message);
      throw error;
    }
    writeScheduleCache(studentId, data);
    return data;
  } catch (error) {
    if (error.sessionExpired || error.grayClosed) throw error;
    if (error.network || Number(error.statusCode) >= 500 || error.scheduleUnavailable) {
      const cached = readScheduleCache(studentId, requestedSemester, error.message);
      if (cached) return cached;
    }
    throw error;
  }
}

async function getGrades() {
  const data = await request('/api/grades');
  if (!data.success) {
    redirectToLoginIfExpired(data);
    throw new Error(data.message || '获取成绩失败');
  }
  return { grades: data.grades, semesters: data.semesters };
}

function logout(sessionId) {
  return request('/api/logout', {
    method: 'POST',
    data: { sessionId: sessionId || app.globalData.sessionId },
    timeout: 10000,
  });
}

module.exports = { login, getSchedule, getGrades, logout };
