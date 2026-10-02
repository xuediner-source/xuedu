const api = require('../../utils/api');

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    errorMsg: '',
  },

  onLoad() {
    const app = getApp();
    if (app.globalData.sessionId) {
      wx.switchTab({ url: '/pages/schedule/schedule' });
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value, errorMsg: '' });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, errorMsg: '' });
  },

  async onLogin() {
    const { username, password } = this.data;
    if (!username.trim()) {
      this.setData({ errorMsg: '请输入学号' });
      return;
    }
    if (!password.trim()) {
      this.setData({ errorMsg: '请输入密码' });
      return;
    }

    this.setData({ loading: true, errorMsg: '' });

    try {
      const result = await api.login(username.trim(), password);
      if (result.sessionPersistent === false && !result.demo) {
        wx.showModal({
          title: '登录成功',
          content: result.persistenceMessage || '当前会话只保存在服务器内存中，服务器重启后需要重新登录。',
          showCancel: false,
          success: () => wx.switchTab({ url: '/pages/schedule/schedule' }),
        });
        return;
      }
      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.switchTab({ url: '/pages/schedule/schedule' });
    } catch (err) {
      this.setData({ errorMsg: err.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});
