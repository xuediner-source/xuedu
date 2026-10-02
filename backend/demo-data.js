/** Gray-test fixture. Not a real student. */
const SEMESTER = "2026-2027-1";
const SEMESTER_TEXT = "2026-2027学年第一学期";
const SEMESTER_START = "2026-09-07";
const CLASS_NAME = "物食2601";

const periods = [
  { index: 0, name: "第1讲", period: "01-02", periods: [1, 2], time: "08:20-09:45", startTime: "08:20", endTime: "09:45" },
  { index: 1, name: "第2讲", period: "03-05", periods: [3, 4, 5], time: "10:15-12:35", startTime: "10:15", endTime: "12:35" },
  { index: 2, name: "第3讲", period: "06-07", periods: [6, 7], time: "14:00-15:25", startTime: "14:00", endTime: "15:25" },
  { index: 3, name: "第4讲", period: "08-10", periods: [8, 9, 10], time: "15:40-18:00", startTime: "15:40", endTime: "18:00" },
  { index: 4, name: "第5讲", period: "11-13", periods: [11, 12, 13], time: "19:00-21:25", startTime: "19:00", endTime: "21:25" }
];

function course(partial) {
  return {
    weekRanges: [{ start: 1, end: 16 }],
    weeks: "1-16",
    weekType: "all",
    className: CLASS_NAME,
    note: "",
    raw: "",
    ...partial
  };
}

const courses = [
  course({ name: "高等数学B（上）", teacher: "周衡", day: "周一", dayIndex: 0, rowIndex: 0, periodName: "第1讲", period: "01-02", periods: [1, 2], startTime: "08:20", endTime: "09:45", time: "08:20-09:45", room: "A01教学楼 301" }),
  course({ name: "食品科学导论", teacher: "叶霜", day: "周一", dayIndex: 0, rowIndex: 2, periodName: "第3讲", period: "06-07", periods: [6, 7], startTime: "14:00", endTime: "15:25", time: "14:00-15:25", room: "逸夫楼 205" }),
  course({ name: "思想道德与法治", teacher: "陈岚", day: "周二", dayIndex: 1, rowIndex: 0, periodName: "第1讲", period: "01-02", periods: [1, 2], startTime: "08:20", endTime: "09:45", time: "08:20-09:45", room: "B01教学楼 102" }),
  course({ name: "物流学概论", teacher: "何远", day: "周二", dayIndex: 1, rowIndex: 1, periodName: "第2讲", period: "03-05", periods: [3, 4, 5], startTime: "10:15", endTime: "12:35", time: "10:15-12:35", room: "致远楼 406" }),
  course({ name: "体育（一）", teacher: "马川", day: "周三", dayIndex: 2, rowIndex: 2, periodName: "第3讲", period: "06-07", periods: [6, 7], startTime: "14:00", endTime: "15:25", time: "14:00-15:25", room: "科学城体育馆" }),
  course({ name: "Python程序设计", teacher: "吴桐", day: "周三", dayIndex: 2, rowIndex: 3, periodName: "第4讲", period: "08-10", periods: [8, 9, 10], startTime: "15:40", endTime: "18:00", time: "15:40-18:00", room: "D01教学楼 机房2" }),
  course({ name: "大数据基础", teacher: "沈柯", day: "周四", dayIndex: 3, rowIndex: 1, periodName: "第2讲", period: "03-05", periods: [3, 4, 5], startTime: "10:15", endTime: "12:35", time: "10:15-12:35", room: "A01教学楼 210" }),
  course({ name: "军事理论", teacher: "刘戎", day: "周四", dayIndex: 3, rowIndex: 4, periodName: "第5讲", period: "11-13", periods: [11, 12, 13], startTime: "19:00", endTime: "21:25", time: "19:00-21:25", room: "B01教学楼 报告厅" }),
  course({ name: "食品化学", teacher: "顾宁", day: "周五", dayIndex: 4, rowIndex: 0, periodName: "第1讲", period: "01-02", periods: [1, 2], startTime: "08:20", endTime: "09:45", time: "08:20-09:45", room: "材料实验楼 118" }),
  course({ name: "大学英语（一）", teacher: "林晓", day: "周五", dayIndex: 4, rowIndex: 2, periodName: "第3讲", period: "06-07", periods: [6, 7], startTime: "14:00", endTime: "15:25", time: "14:00-15:25", room: "逸夫楼 108", weekRanges: [{ start: 1, end: 16 }], weeks: "1-16" })
];

const grades = [
  { index: "1", semester: "2025-2026-2", courseCode: "G1001", courseName: "大学语文", score: "87", scoreMark: "", credit: "2.0", hours: "32", gpa: "3.7", retakeSemester: "", examMethod: "考查", examNature: "正常考试", courseAttr: "必修", courseNature: "公共基础课", electiveType: "", note: "" },
  { index: "2", semester: "2025-2026-2", courseCode: "G1002", courseName: "信息技术基础", score: "92", scoreMark: "", credit: "3.0", hours: "48", gpa: "4.0", retakeSemester: "", examMethod: "考试", examNature: "正常考试", courseAttr: "必修", courseNature: "公共基础课", electiveType: "", note: "" },
  { index: "3", semester: "2025-2026-2", courseCode: "G1003", courseName: "线性代数", score: "76", scoreMark: "", credit: "3.0", hours: "48", gpa: "2.7", retakeSemester: "", examMethod: "考试", examNature: "正常考试", courseAttr: "必修", courseNature: "学科基础课", electiveType: "", note: "" },
  { index: "4", semester: "2026-2027-1", courseCode: "F2601", courseName: "物流学概论", score: "88", scoreMark: "", credit: "3.0", hours: "48", gpa: "3.7", retakeSemester: "", examMethod: "考试", examNature: "正常考试", courseAttr: "必修", courseNature: "专业基础课", electiveType: "", note: "" },
  { index: "5", semester: "2026-2027-1", courseCode: "F2602", courseName: "食品科学导论", score: "90", scoreMark: "", credit: "2.0", hours: "32", gpa: "4.0", retakeSemester: "", examMethod: "考查", examNature: "正常考试", courseAttr: "必修", courseNature: "专业基础课", electiveType: "", note: "" },
  { index: "6", semester: "2026-2027-1", courseCode: "F2603", courseName: "Python程序设计", score: "83", scoreMark: "", credit: "3.0", hours: "48", gpa: "3.3", retakeSemester: "", examMethod: "考试", examNature: "正常考试", courseAttr: "必修", courseNature: "专业基础课", electiveType: "", note: "" },
  { index: "7", semester: "2026-2027-1", courseCode: "F2604", courseName: "高等数学B（上）", score: "71", scoreMark: "", credit: "5.0", hours: "80", gpa: "2.3", retakeSemester: "", examMethod: "考试", examNature: "正常考试", courseAttr: "必修", courseNature: "公共基础课", electiveType: "", note: "" }
];

const exams = [
  { index: "1", campus: "科学城校区", examCampus: "科学城校区", examSession: "期末", courseCode: "F2604", courseName: "高等数学B（上）", teacher: "周衡", examTime: "2026-01-12 09:00-11:00", examRoom: "A01教学楼 301", seatNumber: "16", admissionTicket: "DEMO001", remark: "演示数据" },
  { index: "2", campus: "科学城校区", examCampus: "科学城校区", examSession: "期末", courseCode: "F2605", courseName: "食品化学", teacher: "顾宁", examTime: "2026-09-18 14:00-16:00", examRoom: "材料实验楼 118", seatNumber: "09", admissionTicket: "DEMO002", remark: "演示数据" },
  { index: "3", campus: "科学城校区", examCampus: "科学城校区", examSession: "阶段性", courseCode: "F2603", courseName: "Python程序设计", teacher: "吴桐", examTime: "2026-10-09 09:00-11:00", examRoom: "D01教学楼 机房2", seatNumber: "21", admissionTicket: "DEMO003", remark: "演示数据" }
];

const profile = {
  school: "重庆交通大学",
  college: "经济与管理学院",
  className: CLASS_NAME + "班",
  major: "物流与食品工程管理（大数据方向）",
  enrollYear: "2026",
  studentId: "xuedu_demo",
  studentName: "陆薛锐"
};

const programCourses = [
  { index: "1", term: "1", code: "F2601", name: "物流学概论", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业基础", required: "必修", isExam: "是" },
  { index: "2", term: "1", code: "F2602", name: "食品科学导论", department: "经济与管理学院", credit: "2", hours: "32", exam: "考查", nature: "专业基础", required: "必修", isExam: "否" },
  { index: "3", term: "1", code: "F2603", name: "Python程序设计", department: "信息科学与工程学院", credit: "3", hours: "48", exam: "考试", nature: "专业基础", required: "必修", isExam: "是" },
  { index: "4", term: "1", code: "F2604", name: "高等数学B（上）", department: "理学院", credit: "5", hours: "80", exam: "考试", nature: "公共基础", required: "必修", isExam: "是" },
  { index: "5", term: "1", code: "F2605", name: "食品化学", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业基础", required: "必修", isExam: "是" },
  { index: "6", term: "1", code: "F2606", name: "大数据基础", department: "信息科学与工程学院", credit: "3", hours: "48", exam: "考试", nature: "专业基础", required: "必修", isExam: "是" },
  { index: "7", term: "2", code: "F2611", name: "冷链物流", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业课", required: "必修", isExam: "是" },
  { index: "8", term: "2", code: "F2612", name: "食品安全与质量控制", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业课", required: "必修", isExam: "是" },
  { index: "9", term: "2", code: "F2613", name: "数据分析与可视化", department: "信息科学与工程学院", credit: "3", hours: "48", exam: "考查", nature: "专业课", required: "必修", isExam: "否" },
  { index: "10", term: "3", code: "F2621", name: "仓储与配送", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业课", required: "必修", isExam: "是" },
  { index: "11", term: "3", code: "F2622", name: "供应链管理", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业课", required: "必修", isExam: "是" },
  { index: "12", term: "4", code: "F2631", name: "食品工艺学", department: "经济与管理学院", credit: "3", hours: "48", exam: "考试", nature: "专业课", required: "必修", isExam: "是" },
  { index: "13", term: "4", code: "F2632", name: "机器学习基础", department: "信息科学与工程学院", credit: "3", hours: "48", exam: "考试", nature: "专业课", required: "选修", isExam: "是" }
];

const rooms = [
  { name: "A01教学楼 105", campus: "科学城校区", building: "A01教学楼", type: "多媒体教室", seats: 60 },
  { name: "A01教学楼 208", campus: "科学城校区", building: "A01教学楼", type: "普通教室", seats: 48 },
  { name: "B01教学楼 312", campus: "科学城校区", building: "B01教学楼", type: "多媒体教室", seats: 80 },
  { name: "逸夫楼 401", campus: "科学城校区", building: "逸夫楼", type: "普通教室", seats: 40 },
  { name: "致远楼 机房1", campus: "科学城校区", building: "致远楼", type: "机房", seats: 50 },
  { name: "第一教学楼 203", campus: "南岸校区", building: "第一教学楼", type: "多媒体教室", seats: 70 },
  { name: "第三教学楼 118", campus: "南岸校区", building: "第三教学楼", type: "普通教室", seats: 45 },
  { name: "图书馆 研讨室A", campus: "南岸校区", building: "图书馆", type: "普通教室", seats: 16 }
];

function schedulePayload(currentWeek) {
  return {
    success: true,
    semester: SEMESTER,
    semesterText: SEMESTER_TEXT,
    semesterStart: SEMESTER_START,
    semesterStartKnown: true,
    currentWeek: currentWeek || 1,
    semesters: [
      { value: SEMESTER, text: SEMESTER_TEXT, selected: true },
      { value: "2025-2026-2", text: "2025-2026学年第二学期", selected: false }
    ],
    periods,
    courses
  };
}

function gradesPayload() {
  return {
    success: true,
    grades,
    semesters: [
      { value: "2026-2027-1", text: SEMESTER_TEXT },
      { value: "2025-2026-2", text: "2025-2026学年第二学期" }
    ]
  };
}

function examsPayload() {
  return { success: true, exams };
}

function profilePayload() {
  return { success: true, profile };
}

function programPayload() {
  return { success: true, title: "课程设置总表（演示）", courses: programCourses, count: programCourses.length };
}

function classroomsPayload(query) {
  const campusId = String((query && query.campus) || "");
  let list = rooms.slice();
  if (campusId === "02") list = list.filter(r => r.campus === "科学城校区");
  if (campusId === "01") list = list.filter(r => r.campus === "南岸校区");
  const roomType = String((query && query.roomType) || "");
  if (roomType) list = list.filter(r => r.type.includes(roomType) || r.name.includes(roomType));
  return { success: true, rooms: list, queried: true, count: list.length };
}

module.exports = {
  profile,
  schedulePayload,
  gradesPayload,
  examsPayload,
  profilePayload,
  programPayload,
  classroomsPayload
};
