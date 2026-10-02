const api = require('../../utils/api');
const util = require('../../utils/util');

const COLORS = ['#e8f0fe', '#fce8e6', '#e6f4ea', '#fef7e0', '#f3e8fd', '#e0f7fa', '#fce4ec'];

Page({
  data: {
    studentName: '',
    semester: '',
    semesterText: '',
    semesterStart: '',
    semesterStartKnown: false,
    currentWeek: null,
    currentWeekLabel: '学期开课日期未配置',
    displayWeek: 1,
    weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    periodNames: ['第一讲', '第二讲', '第三讲', '第四讲', '第五讲', '第六讲', '第七讲'],
    periods: ['1-2', '3-4', '5-6', '7-8', '9-10', '11-12', '13-14'],
    courses: [],
    maxWeek: 30,
    offline: false,
    offlineMessage: '',
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
    this.loadSchedule();
  },

  async loadSchedule(semester) {
    this.setData({ loading: true, errorMsg: '', offline: false, offlineMessage: '' });
    try {
      const schedule = await api.getSchedule(semester);
      const week = schedule.offline
        ? util.getCurrentWeek(schedule.semesterStart)
        : util.getCurrentWeek(schedule.semesterStart, schedule.currentWeek);
      const weekKnown = week !== null;
      const timetablePeriods = Array.isArray(schedule.periods) ? schedule.periods : [];
      const courses = Array.isArray(schedule.courses) ? schedule.courses : [];
      const maxWeek = this.getMaxWeek(courses, week);
      const keepDisplayWeek = !!semester && this.data.semester === semester;
      const displayWeek = keepDisplayWeek
        ? this.data.displayWeek
        : (weekKnown && week > 0 ? week : 1);
      this.setData({
        courses,
        semester: schedule.semester || '',
        semesterText: schedule.semesterText || '',
        semesterStart: schedule.semesterStart || '',
        semesterStartKnown: schedule.semesterStartKnown === true,
        currentWeek: week,
        currentWeekLabel: !weekKnown
          ? '学期开课日期未配置'
          : (week < 1 ? '尚未开学' : '第 ' + week + ' 周'),
        displayWeek,
        maxWeek,
        periodNames: timetablePeriods.length ? timetablePeriods.map(item => item.name || '') : this.data.periodNames,
        periods: timetablePeriods.length ? timetablePeriods.map(item => item.time || item.period || '') : this.data.periods,
        offline: !!schedule.offline,
        offlineMessage: schedule.offlineMessage || '',
      });
    } catch (err) {
      this.setData({ errorMsg: err.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  getCoursesForCell(dayIndex, periodIndex) {
    const { courses, displayWeek } = this.data;
    return courses.filter(c => c.dayIndex === dayIndex && c.rowIndex === periodIndex)
      .map((c, i) => ({
        ...c,
        // Check if the course is active this week
        active: this.isCourseActive(c, displayWeek),
        color: COLORS[(c.name.length + i) % COLORS.length],
      }));
  },

  getMaxWeek(courses, currentWeek) {
    let maxWeek = Number.isInteger(currentWeek) && currentWeek > 0 ? currentWeek : 0;
    (courses || []).forEach(course => {
      const ranges = Array.isArray(course.weekRanges) && course.weekRanges.length
        ? course.weekRanges
        : util.parseWeekRanges(course.weeks);
      ranges.forEach(range => {
        if (Number.isInteger(range.end) && range.end > maxWeek) maxWeek = range.end;
      });
    });
    return maxWeek || 30;
  },

  isCourseActive(course, week) {
    const ranges = Array.isArray(course.weekRanges) && course.weekRanges.length
      ? course.weekRanges
      : util.parseWeekRanges(course.weeks);
    const label = String(course.weeks || '').trim();
    const hasParityLabel = course.weekType === 'odd' && label.indexOf('单周') >= 0
      || course.weekType === 'even' && label.indexOf('双周') >= 0;
    if (!ranges.length && label && !hasParityLabel) return false;
    if (ranges.length && !ranges.some(range => week >= range.start && week <= range.end)) return false;
    if (course.weekType === 'odd' && week % 2 === 0) return false;
    if (course.weekType === 'even' && week % 2 !== 0) return false;
    return true;
  },

  onPrevWeek() {
    const week = this.data.displayWeek - 1;
    if (week > 0) {
      this.setData({ displayWeek: week });
    }
  },

  onNextWeek() {
    const week = this.data.displayWeek + 1;
    if (week <= this.data.maxWeek) {
      this.setData({ displayWeek: week });
    }
  },

  showCourseDetail(e) {
    const courseName = e.currentTarget.dataset.course;
    const { courses, displayWeek } = this.data;
    const course = courses.find(c => c.name === courseName);
    if (!course) return;
    
    const weekTypeMap = { all: '每周', odd: '单周', even: '双周' };
    const active = this.isCourseActive(course, displayWeek);
    
    wx.showModal({
      title: course.name,
      content: [
        '教师: ' + (course.teacher || '未知'),
        '时间: ' + course.day + ' ' + course.periodName + '(' + course.period + '节)',
        '教室: ' + (course.room || '未知'),
        '周次: 第' + (course.weeks || '?') + '周' + (weekTypeMap[course.weekType] ? ' (' + weekTypeMap[course.weekType] + ')' : ''),
        '本周: ' + (active ? '✓ 有课' : '✗ 无课'),
      ].join('\n'),
      showCancel: false,
      confirmText: '关闭',
    });
  },

  onRefresh() {
    this.loadSchedule();
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
