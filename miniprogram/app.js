const config = require('./config');

App({
  globalData: {
    backendUrl: config.backendUrl,
    sessionId: '',
    studentName: '',
    studentId: '',
    userInfo: null,
  },

  onLaunch() {
    const sessionId = wx.getStorageSync('sessionId');
    const studentName = wx.getStorageSync('studentName');
    const studentId = wx.getStorageSync('studentId');
    if (sessionId) {
      this.globalData.sessionId = sessionId;
      this.globalData.studentName = studentName;
      this.globalData.studentId = studentId || '';
    }
    this.flushPendingRevocations();
  },

  setLoginInfo(sessionId, studentName, studentId) {
    this.globalData.sessionId = sessionId;
    this.globalData.studentName = studentName;
    this.globalData.studentId = studentId || '';
    wx.setStorageSync('sessionId', sessionId);
    wx.setStorageSync('studentName', studentName);
    wx.setStorageSync('studentId', this.globalData.studentId);
  },

  savePendingRevocation(sessionId) {
    if (!sessionId) return;
    let pending = wx.getStorageSync('pendingSessionRevocations') || [];
    if (!Array.isArray(pending)) pending = [];
    if (pending.indexOf(sessionId) < 0) pending.push(sessionId);
    wx.setStorageSync('pendingSessionRevocations', pending);
  },

  removePendingRevocation(sessionId) {
    let pending = wx.getStorageSync('pendingSessionRevocations') || [];
    if (!Array.isArray(pending)) pending = [];
    pending = pending.filter(id => id !== sessionId);
    if (pending.length) wx.setStorageSync('pendingSessionRevocations', pending);
    else wx.removeStorageSync('pendingSessionRevocations');
  },

  requestSessionRevocation(sessionId) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.backendUrl + '/api/logout',
        method: 'POST',
        data: { sessionId },
        timeout: 10000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.success) resolve();
          else reject(new Error((res.data && res.data.message) || '服务端未确认退出'));
        },
        fail: () => reject(new Error('网络请求失败')),
      });
    });
  },

  async flushPendingRevocations() {
    let pending = wx.getStorageSync('pendingSessionRevocations') || [];
    if (!Array.isArray(pending) || !pending.length) return;
    for (const sessionId of pending.slice()) {
      try {
        await this.requestSessionRevocation(sessionId);
        this.removePendingRevocation(sessionId);
      } catch (e) {
        // Keep the server-side revocation request until connectivity returns.
      }
    }
  },

  async logout() {
    const sessionId = this.globalData.sessionId;
    let serverRevoked = !sessionId;
    if (sessionId) {
      try {
        await this.requestSessionRevocation(sessionId);
        serverRevoked = true;
        this.removePendingRevocation(sessionId);
      } catch (e) {
        serverRevoked = false;
        this.savePendingRevocation(sessionId);
      }
    }
    this.globalData.sessionId = '';
    this.globalData.studentName = '';
    this.globalData.studentId = '';
    wx.removeStorageSync('sessionId');
    wx.removeStorageSync('studentName');
    wx.removeStorageSync('studentId');
    return { serverRevoked };
  },
});
