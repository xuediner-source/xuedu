const api = require('../../utils/api');

Page({
  data: {
    studentName: '',
    grades: [],
    totalCourses: 0,
    totalCredits: 0,
    averageGrade: '0.0',
    loading: true,
    errorMsg: '',
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.sessionId) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({
      studentName: app.globalData.studentName || '同学',
    });
    this.loadGrades();
  },

  async loadGrades() {
    this.setData({ loading: true, errorMsg: '' });
    try {
      const result = await api.getGrades();
      this.processGrades(result.grades || []);
    } catch (err) {
      this.setData({ errorMsg: err.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  processGrades(grades) {
    if (!grades || grades.length === 0) {
      this.setData({ grades: [], totalCourses: 0, totalCredits: 0, averageGrade: '0.0' });
      return;
    }

    let totalCredits = 0;
    let totalScore = 0;
    let scoreCount = 0;

    grades.forEach(g => {
      const credit = parseFloat(g.credit || 0);
      const score = g.score ? parseFloat(g.score) : NaN;
      if (credit) totalCredits += credit;
      if (!isNaN(score)) {
        totalScore += score;
        scoreCount++;
      }
    });

    this.setData({
      grades,
      totalCourses: grades.length,
      totalCredits: totalCredits.toFixed(1),
      averageGrade: scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : '0.0',
    });
  },

  getGradeClass(score) {
    const num = parseFloat(score);
    if (isNaN(num)) return 'grade-pass';
    if (num >= 90) return 'grade-excellent';
    if (num >= 80) return 'grade-good';
    if (num >= 60) return 'grade-pass';
    return 'grade-fail';
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: async (res) => {
        if (res.confirm) {
          const app = getApp();
          const result = await app.logout();
          if (!result.serverRevoked) {
            wx.showToast({ title: '本机已退出，服务端撤销待联网重试', icon: 'none', duration: 2500 });
          }
          wx.redirectTo({ url: '/pages/login/login' });
        }
      },
    });
  },
});
