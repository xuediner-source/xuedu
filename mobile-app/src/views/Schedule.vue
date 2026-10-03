<template>
  <div ref="pageRef" class="page-container schedule-page">
    <!-- Dedicated single-token probes to resolve CSS variables into computed pixels without padding interference -->
    <div class="schedule-probe-wrap" aria-hidden="true">
      <div ref="safeBottomProbeRef" class="probe-safe-bottom"></div>
      <div ref="dockClearanceProbeRef" class="probe-dock-clearance"></div>
    </div>

    <!-- Compact Top Bar (44pt) -->
    <header class="compact-top-bar">
      <div class="compact-bar-left">
        <button v-if="widgetExpand.page" class="compact-icon-btn" @click="closeSchedule" aria-label="返回首页">
          <Icon name="arrow-left" :size="20" color="#000000" />
        </button>
        <h1 class="compact-title-text">我的课表</h1>
      </div>

      <div class="compact-bar-actions">
        <button class="compact-icon-btn" @click="refresh" title="同步教务" aria-label="同步教务">
          <Icon name="refresh" :size="17" color="#000000" />
        </button>
        <button
          class="compact-view-toggle-btn"
          @click="viewMode = (viewMode === 'week' ? 'day' : 'week')"
          :aria-label="viewMode === 'week' ? '切换为今日日程' : '切换为周课表'"
        >
          <span class="toggle-text-full">{{ viewMode === 'week' ? '今日日程' : '周课表' }}</span>
          <span class="toggle-text-short">{{ viewMode === 'week' ? '日程' : '周表' }}</span>
        </button>
        <button class="compact-icon-btn" @click="showMoreMenu = true" title="更多选项与设置" aria-label="更多选项与设置">
          <Icon name="more" :size="20" color="#000000" />
        </button>
      </div>
    </header>

    <!-- Quick Week Switcher Rail (左右周平滑轻轨，整合周次与导航) -->
    <div class="compact-week-rail">
      <button class="week-arrow-btn" @click="prevWeek" aria-label="上一周">
        <Icon name="chevron-left" :size="14" color="#8E8E93" />
        <span>上一周</span>
      </button>
      <button class="week-range-label" @click="showWeekPickerSheet = true" aria-label="选择教学周次">
        第 {{ displayWeek }} 周 ({{ weekRange }})
      </button>
      <button class="week-arrow-btn" @click="nextWeek" aria-label="下一周">
        <span>下一周</span>
        <Icon name="chevron-right" :size="14" color="#8E8E93" />
      </button>
    </div>
    <ScheduleSyncStatus
      :synced-at="store.scheduleSyncedAt"
      :loading="scheduleLoading"
      :offline="store.isOffline"
      :error="scheduleError"
      :session-expired="store.sessionExpired"
      @login="openLoginModal"
    />
    <div v-if="semesterStatusMessage" class="semester-status-notice">{{ semesterStatusMessage }}</div>

    <!-- Loading State -->
    <div v-if="scheduleLoading && !allCourses.length" class="loading-state">
      <div class="state-icon-box">
        <van-loading type="spinner" color="var(--primary, #007AFF)" size="28px" />
      </div>
      <p>正在加载中</p>
      <span class="empty-sub">正在同步教务课表</span>
    </div>

    <div v-else-if="!allCourses.length" class="empty-day-card schedule-empty-card">
      <div class="state-icon-box">
        <Icon name="schedule" :size="36" color="var(--primary, #007AFF)" />
      </div>
      <h3>{{ scheduleError || '暂无课表数据' }}</h3>
      <p v-if="isSessionError">登录已过期，请重新登录以同步最新课表</p>
      <p v-else>请确认当前学期有课，或点击右上角切换学期</p>
      <button v-if="isSessionError" class="primary-fast-login-btn" @click="openLoginModal">立即重新登录</button>
      <button v-else class="compact-week-chip" @click="refresh">重新同步</button>
    </div>

    <template v-else>
      <!-- ================= 1. 学习通同款 1-10 小节高精度网格 (Weekly Grid) ================= -->
      <transition name="tab-slide" @after-enter="onTabTransitionAfterEnter">
        <section v-if="viewMode === 'week'" ref="exportRoot" class="grid-timetable-view" :style="{ '--schedule-day-count': visibleWeekdays.length }">
          <div v-if="hiddenWeekendCourseCount" class="weekend-course-notice">
            周末还有 {{ hiddenWeekendCourseCount }} 门课
            <button type="button" @click="showWeekendCourses">显示周末</button>
          </div>
          <div v-if="unplacedCourses.length" class="weekend-course-notice">
            {{ unplacedCourses.length }} 门课的周次无法排进网格
            <span>{{ unplacedLabel }}</span>
          </div>
          <!-- Weekday Header Row (5 or 7 days, with today's highlight) -->
          <div class="timetable-weekday-header">
            <!-- Left Corner Week Box -->
            <button class="corner-week-box" @click="showWeekPickerSheet = true" aria-label="周次切换">
              <span class="corner-week-num">{{ displayWeek }}</span>
              <span class="corner-week-lbl">周</span>
            </button>

            <!-- 7 Columns (Mon - Sun) with Capsule Highlight for Today -->
            <div class="weekday-columns-header">
              <button
                v-for="day in visibleWeekdays"
                :key="day.index"
                class="header-day-cell"
                :class="{ 'today-capsule': day.isToday }"
                @click="switchToDay(day.index)"
                :aria-label="`${day.name} ${day.dateNumber}${day.isToday ? '，今日' : ''}`"
              >
                <span class="h-day-name">{{ day.name }}</span>
                <span class="h-day-date">{{ day.dateNumber }}</span>
              </button>
            </div>
          </div>

          <!-- Timetable Canvas (Section-based, 1-10 or 1-13 sections) -->
          <div ref="gridRef" class="timetable-canvas">
            <!-- Left Time Column (Sections 1 ~ 10, or 1 ~ 13) -->
            <div class="periods-time-rail">
              <div
                v-for="period in periodSlots"
                :key="period.index"
                class="time-rail-item"
                :style="{ height: slotH + 'px' }"
              >
                <span class="time-slot-index">{{ period.label }}</span>
                <div class="time-range-lines">
                  <span>{{ period.start }}</span>
                  <span>{{ period.end }}</span>
                </div>
              </div>
            </div>

          <!-- 5 or 7 day grid tracks -->
            <div class="timetable-grid-tracks">
              <div
              v-for="day in visibleWeekdays"
              :key="day.index"
              class="track-column"
              :class="{ 'today-track': day.isToday }"
                :style="{ height: gridHeight + 'px' }"
              >
                <!-- Background Empty Slots -->
                <div
                  v-for="period in periodSlots"
                  :key="'slot-' + period.index"
                  class="period-cell-slot"
                  :style="{ height: slotH + 'px' }"
                ></div>

                <!-- Floating Course Cards (Spanning sections, e.g. 3-5 spans 3 slots) -->
                <div
                  v-for="course in dayBlocks[day.index] || []"
                  :key="course.layoutKey"
                  v-fit-course="course.layoutKey"
                  class="campus-course-card interactive"
                  :class="{ 'multi-span': course.span > 1 }"
                  :style="{
                    top: course.top,
                    height: course.height,
                    left: course.layoutLeft,
                    width: course.layoutWidth,
                    right: 'auto',
                    background: course.palette.bg,
                    '--course-ink': course.palette.ink,
                    '--conflict-lane': course.conflictLane,
                    '--conflict-count': course.conflictLanes
                  }"
                  role="button"
                  tabindex="0"
                  :aria-label="`${course.name}，${course.room || '教室待定'}，${course.periodName}，查看详情`"
                  @click="showDetail(course)"
                  @keydown.enter.prevent="showDetail(course)"
                  @keydown.space.prevent="showDetail(course)"
                >
                  <div class="card-course-name">{{ course.name }}</div>
                  <div class="card-room-badge" v-if="course.formattedRoom">{{ course.formattedRoom }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="weekConflictCourseCount" class="conflict-notice">
            {{ weekConflictCourseCount }} 门课程与同日同节课程重叠；卡片已分栏，可逐门点选查看详情。
          </div>

          <!-- 长课名溢出详情完整展示索引列表 -->
          <div v-if="overflowCourses.length" class="course-name-index">
            <div class="course-index-heading">
              <span>课程详情</span>
              <small>长名称完整展示</small>
            </div>
            <button
              v-for="course in overflowCourses"
              :key="course.layoutKey"
              class="course-index-row"
              @click="showDetail(course)"
            >
              <span class="course-index-time">
                {{ weekdays[course.dayIndex]?.name }}
                <small>{{ course.periodName }}</small>
              </span>
              <span class="course-index-content">
                <strong>{{ course.name }}</strong>
                <small>{{ course.room || '教室待定' }}</small>
              </span>
              <Icon name="chevron-right" :size="14" color="#C7C7CC" />
            </button>
          </div>
          <ul v-if="store.scheduleDays === 7 && readableWeekCourses.length" class="week-readout">
            <li v-for="course in readableWeekCourses" :key="course.layoutKey">
              <span>{{ weekdays[course.dayIndex]?.name }} {{ course.periodTime }}</span>
              <strong>{{ course.name }}</strong>
              <span>{{ course.formattedRoom || course.room || '地点待定' }}</span>
            </li>
          </ul>
        </section>

        <!-- ================= 2. 单日日程视图 (Day View) ================= -->
        <section v-else ref="exportRoot" class="day-timeline-view">
          <div v-if="hiddenWeekendCourseCount" class="weekend-course-notice">
            周末还有 {{ hiddenWeekendCourseCount }} 门课
            <button type="button" @click="showWeekendCourses">显示周末</button>
          </div>
          <!-- Day Selector Strip -->
          <div class="day-pill-nav">
            <button
              v-for="day in visibleWeekdays"
              :key="day.index"
              class="nav-day-item"
              :class="{ active: activeDay === day.index, 'is-today': day.isToday }"
              @click="activeDay = day.index"
              :aria-label="`${day.name} ${day.dateNumber}`"
            >
              <span class="item-weekday">{{ day.short }}</span>
              <span class="item-date">{{ day.dateNumber }}</span>
              <span class="item-badge-dot" v-if="day.count > 0"></span>
            </button>
          </div>

          <!-- Cards for selected day: Inset Grouped Agenda List -->
          <div class="day-cards-flow">
            <div v-if="dayConflictCourseCount" class="conflict-notice">
              {{ dayConflictCourseCount }} 门课程与同节课程重叠，已分开展示；点选课程可查看详情。
            </div>
            <div v-if="visibleDayCourses.length === 0" class="empty-day-card">
              <div class="state-icon-box">
                <Icon name="sparkles" :size="32" color="var(--primary, #007AFF)" />
              </div>
              <h3>{{ weekdays[activeDay]?.name }}暂无课程</h3>
              <p>可以自习充电或外出休闲</p>
            </div>

            <div
              v-for="(course, ci) in visibleDayCourses"
              :key="course.layoutKey || ci"
              class="agenda-card-box interactive"
              @click="showDetail(course)"
              role="button"
              tabindex="0"
              :aria-label="`${course.name}，${course.periodName}，${course.formattedRoom || '教室待定'}`"
              @keydown.enter.prevent="showDetail(course)"
              @keydown.space.prevent="showDetail(course)"
            >
              <div class="agenda-time-side">
                <span class="agenda-time-big">{{ course.periodName }}</span>
                <span class="agenda-time-sub">{{ course.periodTime }}</span>
              </div>
              <div class="agenda-main-side">
                <h3 class="agenda-course-title">{{ course.name }}</h3>
                <div class="agenda-meta-sub">
                  <span class="agenda-tag" v-if="course.formattedRoom">{{ course.formattedRoom }}</span>
                  <span class="agenda-tag" v-if="course.teacher">{{ course.teacher }}</span>
                  <span class="agenda-tag" v-if="course.date">{{ course.date }}</span>
                  <span class="agenda-tag" v-else-if="course.weeks">第{{ course.weeks }}周</span>
                </div>
              </div>
              <Icon name="chevron-right" :size="16" color="#C7C7CC" />
            </div>
          </div>
        </section>
      </transition>
    </template>

    <!-- Week Picker Bottom Sheet (点击直接切换周次) -->
    <van-action-sheet v-model:show="showWeekPickerSheet" title="选择教学周次">
      <div class="week-picker-grid">
        <button
          v-for="w in maxTeachingWeek"
          :key="w"
          class="picker-week-btn"
          :class="{ active: displayWeek === w, current: store.currentWeek === w }"
          @click="selectWeek(w)"
        >
          <span>第 {{ w }} 周</span>
          <span class="current-sub" v-if="store.currentWeek === w">本周</span>
        </button>
      </div>
    </van-action-sheet>

    <!-- ================= 3. 课表选项菜单 ================= -->
    <van-action-sheet v-model:show="showMoreMenu" title="课表">
      <div class="menu-sections-container">
        <!-- Section: 日程 -->
        <div class="menu-group-block">
          <div class="menu-group-header">日程</div>
          <div class="menu-row-card" @click="openAddSchedule">
            <div class="m-left-icon ico-add">
              <Icon name="plus" :size="18" color="var(--primary, #007AFF)" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">添加日程</span>
              <span class="m-sub-text">同步显示在日程页与课表页</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>
        </div>

        <!-- Section: 下载与导出 -->
        <div class="menu-group-block">
          <div class="menu-group-header">导出课表</div>
          <div class="menu-row-card" @click="exportScheduleTableImage">
            <div class="m-left-icon ico-image">
              <Icon name="image" :size="18" color="#34C759" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">保存课表图片</span>
              <span class="m-sub-text">生成周课表图，可分享或长按存相册</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>

          <div class="menu-row-card" @click="exportScheduleList">
            <div class="m-left-icon ico-list">
              <Icon name="list" :size="18" color="#007AFF" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">复制本周清单</span>
              <span class="m-sub-text">生成文字课表，一键复制发给同学</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>

          <div class="menu-row-card" @click="exportScheduleCalendar">
            <div class="m-left-icon ico-cal">
              <Icon name="calendar-export" :size="18" color="#8A7A68" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">导入系统日历</span>
              <span class="m-sub-text">生成日历文件，用系统日历打开</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>
        </div>

        <!-- Section: 设置 -->
        <div class="menu-group-block">
          <div class="menu-group-header">设置</div>
          <div class="menu-row-card schedule-days-row">
            <div class="m-left-icon ico-cal">
              <Icon name="calendar-grid" :size="18" color="var(--primary, #007AFF)" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">周课表显示天数</span>
              <span class="m-sub-text">五日视图遇到周末课程时可一键显示</span>
            </div>
            <div class="days-toggle" role="group" aria-label="选择课表显示天数">
              <button type="button" :class="{ active: store.scheduleDays === 5 }" @click.stop="setScheduleDays(5)">五日</button>
              <button type="button" :class="{ active: store.scheduleDays === 7 }" @click.stop="setScheduleDays(7)">七日</button>
            </div>
          </div>
          <div class="menu-row-card" @click="openSemesterPicker">
            <div class="m-left-icon ico-cal">
              <Icon name="calendar-grid" :size="18" color="var(--primary, #007AFF)" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">选择学年学期</span>
              <span class="m-sub-text">{{ currentSemesterLabel }}</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>

          <div class="menu-row-card" @click="openDensityPicker">
            <div class="m-left-icon ico-slider">
              <Icon name="sliders" :size="18" color="#34C759" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">课表密度</span>
              <span class="m-sub-text">{{ densityLabel }}</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>

          <div class="menu-row-card" @click="openThemePicker">
            <div class="m-left-icon ico-theme">
              <Icon name="palette" :size="18" color="#007AFF" />
            </div>
            <div class="m-texts-col">
              <span class="m-main-title">页面背景</span>
              <span class="m-sub-text">更换配色方案（当前：{{ themeLabel }}）</span>
            </div>
            <Icon name="chevron-right" :size="16" color="#C7C7CC" />
          </div>
        </div>

        <button class="menu-close-btn" @click="showMoreMenu = false">关 闭</button>
      </div>
    </van-action-sheet>

    <!-- Semester Picker Sheet -->
    <van-action-sheet v-model:show="showSemesterSheet" title="选择学年学期">
      <div class="semester-list">
        <button
          v-for="sem in semesterOptions"
          :key="sem.value"
          class="semester-item"
          :class="{ active: store.semester === sem.value }"
          @click="selectSemester(sem.value)"
        >
          <span>{{ sem.text || sem.value }}</span>
          <span class="current-sub" v-if="store.semester === sem.value">当前</span>
        </button>
        <p v-if="!semesterOptions.length" class="semester-empty">暂无学期列表，请先同步课表</p>
      </div>
    </van-action-sheet>

    <!-- Density Picker Sheet -->
    <van-action-sheet v-model:show="showDensitySheet" title="选择课表密度">
      <div class="density-list">
        <button
          v-for="d in densityOptions"
          :key="d.val"
          class="semester-item"
          :class="{ active: store.density === d.val }"
          @click="selectDensity(d.val)"
        >
          <span>{{ d.title }}</span>
          <span class="current-sub">{{ d.desc }}</span>
        </button>
      </div>
    </van-action-sheet>

    <!-- Theme Picker Sheet -->
    <van-action-sheet v-model:show="showThemeSheet" title="选择课表配色方案">
      <div class="density-list">
        <button
          v-for="t in themeOptions"
          :key="t.id"
          class="semester-item"
          :class="{ active: store.theme === t.id }"
          @click="selectTheme(t.id)"
        >
          <span>{{ t.title }}</span>
          <span class="current-sub">{{ t.desc }}</span>
        </button>
      </div>
    </van-action-sheet>

    <!-- Add / Edit Schedule Modal -->
    <van-dialog
      v-model:show="showAddScheduleDialog"
      :title="editingScheduleId !== null ? '编辑自定义日程' : '添加自定义日程'"
      show-cancel-button
      :confirm-button-text="editingScheduleId !== null ? '保存修改' : '保存日程'"
      cancel-button-text="取消"
      confirm-button-color="var(--primary, #007AFF)"
      :before-close="handleCustomScheduleClose"
    >
      <div class="custom-schedule-form">
        <div class="cs-field">
          <label>日程/课程名称</label>
          <input v-model="newSchedule.name" placeholder="如：英语四级冲刺 / 实验室组会" />
        </div>
        <div class="cs-field">
          <label>地点 / 教室</label>
          <input v-model="newSchedule.room" placeholder="如：20416 / 图书馆研讨室" />
        </div>
        <div class="cs-field">
          <label>日程类型</label>
          <select v-model="newSchedule.repeatMode">
            <option value="weekly">每周 / 按周次重复</option>
            <option value="once">单次日期</option>
          </select>
        </div>
          <div v-if="newSchedule.repeatMode === 'once'" class="cs-field">
            <label>日期</label>
            <input v-model="newSchedule.date" type="date" />
            <small class="cs-hint">{{ dateWeekdayLabel || '选择日期后显示星期' }}</small>
        </div>
        <div v-else class="cs-recurring-fields">
          <div class="cs-row-fields cs-week-fields">
            <div class="cs-field">
              <label>开始周</label>
              <input v-model.number="newSchedule.weekStart" type="number" min="1" :max="maxTeachingWeek" />
            </div>
            <div class="cs-field">
              <label>结束周</label>
              <input v-model.number="newSchedule.weekEnd" type="number" min="1" :max="maxTeachingWeek" />
            </div>
            <div class="cs-field">
              <label>单双周</label>
              <select v-model="newSchedule.weekType">
                <option value="all">每周</option>
                <option value="odd">单周</option>
                <option value="even">双周</option>
              </select>
            </div>
          </div>
        </div>
        <div class="cs-row-fields">
          <div v-if="newSchedule.repeatMode === 'weekly'" class="cs-field">
            <label>星期</label>
            <select v-model.number="newSchedule.dayIndex">
              <option :value="0">周一</option>
              <option :value="1">周二</option>
              <option :value="2">周三</option>
              <option :value="3">周四</option>
              <option :value="4">周五</option>
              <option :value="5">周六</option>
              <option :value="6">周日</option>
            </select>
          </div>
          <div v-else class="cs-field">
            <label>星期</label>
            <div class="cs-readonly">{{ dateWeekdayLabel || '—' }}</div>
          </div>
          <div class="cs-field">
            <label>开始小节</label>
            <select v-model.number="newSchedule.startPeriod">
              <option v-for="n in 13" :key="n" :value="n">第{{ n }}节</option>
            </select>
          </div>
          <div class="cs-field">
            <label>结束小节</label>
            <select v-model.number="newSchedule.endPeriod">
              <option v-for="n in 13" :key="n" :value="n">第{{ n }}节</option>
            </select>
          </div>
        </div>
      </div>
    </van-dialog>

    <van-dialog
      v-model:show="showDeleteScheduleDialog"
      title="删除自定义日程"
      show-cancel-button
      confirm-button-text="删除"
      cancel-button-text="保留"
      confirm-button-color="#E5484D"
      @confirm="confirmDeleteCustomCourse"
    >
      <p class="delete-schedule-copy">确定删除“{{ pendingDeleteCourse?.name }}”吗？</p>
    </van-dialog>

    <!-- Image Export Dialog -->
    <van-dialog
      v-model:show="showImageExportDialog"
      title="课表图片"
      confirm-button-text="分享保存"
      confirm-button-color="var(--primary, #007AFF)"
      cancel-button-text="关闭"
      show-cancel-button
      @confirm="shareExportedImage"
    >
      <div class="img-export-box">
        <p class="le-title">长按图片可存到相册，或点下方分享</p>
        <img v-if="exportedImageUrl" class="img-export-preview" :src="exportedImageUrl" alt="课表" />
      </div>
    </van-dialog>

    <!-- List Export Dialog -->
    <van-dialog
      v-model:show="showListExportDialog"
      title="本周课程清单"
      confirm-button-text="复制文本"
      confirm-button-color="var(--primary, #007AFF)"
      @confirm="copyListText"
    >
      <div class="list-export-box">
        <p class="le-title">重庆交通大学 · 第 {{ displayWeek }} 周课表</p>
        <div v-for="(day, di) in weekdays" :key="di" class="le-day-group">
          <strong class="le-day-head">{{ day.name }} ({{ day.dateNumber }})</strong>
          <div v-if="!dayBlocks[di]?.length" class="le-empty-day">无课程</div>
          <div v-for="(c, ci) in dayBlocks[di] || []" :key="ci" class="le-course-row">
            <span>{{ c.periodName }}</span>
            <strong>{{ c.name }}</strong>
            <small>{{ c.formattedRoom }} {{ c.teacher }}</small>
          </div>
        </div>
      </div>
    </van-dialog>

    <!-- In-page Fast Login Dialog -->
    <van-dialog
      v-model:show="showLoginDialog"
      title="登录教务系统"
      show-cancel-button
      confirm-button-text="安全登录"
      cancel-button-text="取消"
      confirm-button-color="var(--primary, #007AFF)"
      :before-close="handleFastLogin"
    >
      <div class="custom-schedule-form">
        <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px;">登录已过期，请输入密码后继续同步课表：</p>
        <div class="cs-field">
          <label>学号</label>
          <input v-model="fastLoginForm.username" placeholder="请输入学号" />
        </div>
        <div class="cs-field">
          <label>密码</label>
          <input v-model="fastLoginForm.password" type="password" placeholder="请输入教务密码" />
        </div>
      </div>
    </van-dialog>

    <!-- Course Detail Dialog (Standard Apple HIG Clean Sheet) -->
    <van-dialog
      v-model:show="detailVisible"
      :title="detailCourse?.name"
      theme="round-button"
      confirm-button-text="了解"
      confirm-button-color="var(--primary, #007AFF)"
    >
      <div class="detail-dialog-body">
        <div class="dialog-row"><span class="dl-label">授课教室</span><span class="dl-val highlight">{{ detailCourse?.room || '未知' }}</span></div>
        <div class="dialog-row"><span class="dl-label">任课教师</span><span class="dl-val">{{ detailCourse?.teacher || '暂无信息' }}</span></div>
        <div class="dialog-row"><span class="dl-label">小节时段</span><span class="dl-val">{{ detailCourse?.periodName }} ({{ detailCourse?.periodTime }})</span></div>
        <div class="dialog-row"><span class="dl-label">授课周次</span><span class="dl-val">{{ detailCourse?.date ? `单次 · ${detailCourse.date}` : `第 ${detailCourse?.weeks || '全'} 周 · ${detailCourse?.weekType === 'even' ? '双周' : detailCourse?.weekType === 'odd' ? '单周' : '全周'}` }}</span></div>
        <div v-if="isCustomCourse(detailCourse)" class="detail-actions">
          <button type="button" class="detail-edit-btn" @click="editCustomCourse(detailCourse)">编辑日程</button>
          <button type="button" class="detail-delete-btn" @click="deleteCustomCourse(detailCourse)">删除日程</button>
        </div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onDeactivated, reactive, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showToast, closeToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import ScheduleSyncStatus from '@/components/ScheduleSyncStatus.vue'
import { widgetExpand } from '@/composables/useWidgetExpand'
import { useWidgetPage } from '@/composables/useWidgetPage'
import { shareFileNative, isNativeApp } from '@/utils/nativeShare'
import { Clipboard } from '@capacitor/clipboard'
import { cleanRoomShort, formatRoomBadge } from '@/utils/roomShort'
import { courseTitleLayout, laneSpan } from '@/utils/courseCardLayout'
import { CQJTU_PERIODS, calcWeekNumber, isCourseInWeek, parseDateOnly, parseWeekRanges } from '@/utils/scheduleModel'
import { buildCalendarIcs } from '@/utils/calendarExport'
import {
  computeSlotHeight,
  getBottomClearance,
  getChromeHeight,
  resolveSafeAreaBottom,
  DEFAULT_TOKENS
} from '@/utils/scheduleViewport'

const router = useRouter()
const store = useAppStore()
const { closeToWidget } = useWidgetPage()

// View elements for measurement
const pageRef = ref(null)
const gridRef = ref(null)
const safeBottomProbeRef = ref(null)
const dockClearanceProbeRef = ref(null)
const isLayoutStale = ref(false)

// View states
const displayWeek = ref(1)
const isFollowingCurrentWeek = ref(true)
const activeDay = ref(0)
const viewMode = ref('week') // 'week' | 'day'
const detailVisible = ref(false)
const detailCourse = ref(null)
const exportRoot = ref(null)

// Measure actual card geometry, including narrow phones and larger system fonts.
// Overflow titles also appear in full below the grid, without altering period positions.
const overflowKeys = reactive(new Set())
const cardObservers = new WeakMap()

function fitCourseCard(el, key) {
  const name = el.querySelector('.card-course-name')
  const room = el.querySelector('.card-room-badge')
  if (!name || !el.clientWidth || !el.clientHeight) return

  // 课名字体优先 12px，禁止 10.5 缩小回退
  name.style.fontSize = '12px'
  if (room) {
    room.style.fontSize = '11px'
    room.style.display = '-webkit-box'
    room.style.maxHeight = 'none'
    room.style.webkitLineClamp = 'unset'
  }
  const roomHeight = room?.getBoundingClientRect().height || 0
  const roomLineHeight = room ? (parseFloat(getComputedStyle(room).lineHeight) || 13.2) : 13.2

  function sizeTitle(fontSize) {
    name.style.fontSize = `${fontSize}px`
    const actualFont = parseFloat(getComputedStyle(name).fontSize) || fontSize
    const layout = courseTitleLayout(el.clientHeight, roomHeight, actualFont, roomLineHeight)
    name.style.lineHeight = `${layout.lineHeight}px`
    name.style.webkitLineClamp = String(layout.lines)
    name.style.maxHeight = `${layout.maxHeight}px`
    if (room) {
      room.style.display = layout.roomLines ? '-webkit-box' : 'none'
      room.style.webkitLineClamp = String(Math.max(1, layout.roomLines))
      room.style.maxHeight = `${layout.reservedRoom}px`
    }
    return name.scrollHeight > name.clientHeight + 1 || roomHeight > layout.reservedRoom + 1
  }

  // 优先 12px，不缩小回退，溢出记入 overflowKeys
  const overflow = sizeTitle(12)
  if (overflow) overflowKeys.add(key)
  else overflowKeys.delete(key)
}

const vFitCourse = {
  mounted(el, binding) {
    const state = { key: binding.value, frame: 0, observer: null }
    const schedule = () => {
      cancelAnimationFrame(state.frame)
      state.frame = requestAnimationFrame(() => fitCourseCard(el, state.key))
    }
    state.schedule = schedule
    state.observer = new ResizeObserver(schedule)
    state.observer.observe(el)
    cardObservers.set(el, state)
    schedule()
  },
  updated(el, binding) {
    const state = cardObservers.get(el)
    if (!state) return
    const width = el.clientWidth
    const height = el.clientHeight
    const sameKey = state.key === binding.value
    if (sameKey && state.width === width && state.height === height) return
    if (!sameKey) overflowKeys.delete(state.key)
    state.key = binding.value
    state.width = width
    state.height = height
    state.schedule()
  },
  unmounted(el) {
    const state = cardObservers.get(el)
    if (!state) return
    state.observer.disconnect()
    cancelAnimationFrame(state.frame)
    overflowKeys.delete(state.key)
    cardObservers.delete(el)
  }
}

// Sheets & Modals
const showWeekPickerSheet = ref(false)
const showMoreMenu = ref(false)
const showSemesterSheet = ref(false)
const showDensitySheet = ref(false)
const showThemeSheet = ref(false)
const showAddScheduleDialog = ref(false)
const showDeleteScheduleDialog = ref(false)
const pendingDeleteCourse = ref(null)
const editingScheduleId = ref(null)
const showListExportDialog = ref(false)
const showImageExportDialog = ref(false)
const exportedImageUrl = ref('')
const exportedImageName = ref('交大课表.png')
const showLoginDialog = ref(false)
const fastLoginForm = reactive({
  username: '',
  password: ''
})

const isSessionError = computed(() => {
  const err = store.authError || scheduleError.value || ''
  return err.includes('未登录') || err.includes('过期') || err.includes('重新登录')
})

function openLoginModal() {
  fastLoginForm.username = store.studentId || ''
  fastLoginForm.password = ''
  showLoginDialog.value = true
}

async function handleFastLogin(action) {
  if (action !== 'confirm') return true
  if (!fastLoginForm.username.trim() || !fastLoginForm.password) {
    showToast('请输入学号和密码')
    return false
  }
  showToast({ message: '正在安全登录教务...', duration: 0, forbidClick: true })
  try {
    const ok = await store.login(fastLoginForm.username.trim(), fastLoginForm.password)
    if (ok) {
      showToast('登录成功，正在同步课表...')
      await store.fetchSchedule()
      displayWeek.value = boundedWeek(currentWeek.value)
      isFollowingCurrentWeek.value = true
      return true
    }
      showToast(store.authError || '登录失败，请检查密码')
    return false
  } catch (e) {
    closeToast()
    showToast((e && e.message) || '登录失败，请检查密码')
    return false
  }
}

// Add schedule form
const newSchedule = reactive({
  name: '',
  room: '',
  dayIndex: 0,
  startPeriod: 1,
  endPeriod: 2,
  repeatMode: 'weekly',
  date: '',
  weekStart: 1,
  weekEnd: 20,
  weekType: 'all'
})

// Palettes: 柔色低饱和粉彩底色 + 高对比深色文字，无阴影/彩轨
const THEMES = {
  "pastel": [
    { "bg": "#E8F1FD", "ink": "#0C4CB5", "shadow": "transparent" },
    { "bg": "#EAF5E9", "ink": "#1A5E26", "shadow": "transparent" },
    { "bg": "#F1EDFA", "ink": "#51358E", "shadow": "transparent" },
    { "bg": "#FDF0E6", "ink": "#803D14", "shadow": "transparent" },
    { "bg": "#E4F5F4", "ink": "#0E5652", "shadow": "transparent" }
  ],
  "morandi": [
    { "bg": "#DFE2DB", "ink": "#475142", "shadow": "transparent" },
    { "bg": "#D9E3DD", "ink": "#365749", "shadow": "transparent" },
    { "bg": "#E6DFD9", "ink": "#675347", "shadow": "transparent" },
    { "bg": "#DDDDE4", "ink": "#55536B", "shadow": "transparent" },
    { "bg": "#E4E3D5", "ink": "#605E3D", "shadow": "transparent" }
  ],
  "macaron": [
    { "bg": "#F1DFD2", "ink": "#824D2D", "shadow": "transparent" },
    { "bg": "#F2E8CB", "ink": "#745A22", "shadow": "transparent" },
    { "bg": "#DFE9D6", "ink": "#4A6337", "shadow": "transparent" },
    { "bg": "#EEDCDA", "ink": "#88463F", "shadow": "transparent" },
    { "bg": "#E4DEEC", "ink": "#65517D", "shadow": "transparent" }
  ]
}

function getPalette(name = '') {
  const list = THEMES[store.theme] || THEMES.pastel
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return list[Math.abs(hash) % list.length]
}

function pad(n) { return String(n).padStart(2, '0') }
function fmtMD(d) { return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function fmtYMD(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function weekStartDate(week) {
  const startIso = parseDateOnly(store.semesterStart)
  if (!startIso) return null
  const start = new Date(`${startIso}T00:00:00`)
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const offset = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - offset + (week - 1) * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function dateForWeekDay(week, dayIndex) {
  const index = Number(dayIndex)
  if (!Number.isInteger(index) || index < 0 || index > 6) return ''
  const date = weekStartDate(week)
  if (!date) return ''
  date.setDate(date.getDate() + index)
  return fmtYMD(date)
}

const currentClock = computed(() => store.clock instanceof Date ? store.clock : new Date())
const todayKey = computed(() => fmtYMD(currentClock.value))
const scheduleLoading = computed(() => store.scheduleLoading ?? store.loading)
const scheduleError = computed(() => store.scheduleError ?? '')

const allCourses = computed(() => {
  const courses = Array.isArray(store.allCourses) ? store.allCourses : [...(store.courses || []), ...(store.customCourses || [])]
  return courses.filter(course => !course.semester || !store.semester || String(course.semester) === String(store.semester))
})

const activeCoursesInWeek = computed(() => {
  const hasSemesterStart = !!parseDateOnly(store.semesterStart)
  const weekDates = hasSemesterStart
    ? new Set(Array.from({ length: 7 }, (_, dayIndex) => dateForWeekDay(displayWeek.value, dayIndex)))
    : null
  return allCourses.value.filter(course => {
    const dayIndex = course.date ? ((new Date(`${course.date}T00:00:00`).getDay() + 6) % 7) : Number(course.dayIndex)
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return false
    if (course.date && hasSemesterStart && !weekDates.has(parseDateOnly(course.date))) return false
    if (course.date && !hasSemesterStart && parseDateOnly(course.date) !== fmtYMD(currentClock.value)) return false
    const date = course.date || dateForWeekDay(displayWeek.value, dayIndex) || undefined
    return isCourseInWeek(course, displayWeek.value, {
      date,
      semester: store.semester,
      semesterStart: store.semesterStart
    })
  })
})

const unplacedCourses = computed(() => {
  const limit = Math.min(maxTeachingWeek.value || 30, 30)
  return allCourses.value.filter(course => {
    if (course.date) return false
    const label = String(course.weeks || '').trim()
    if (!label) return false
    for (let week = 1; week <= limit; week += 1) {
      if (isCourseInWeek(course, week, { semester: store.semester, semesterStart: store.semesterStart })) return false
    }
    return true
  }).slice(0, 8)
})
const unplacedLabel = computed(() => unplacedCourses.value.map(course => `${course.name}（${course.weeks}）`).join('、'))

const currentWeek = computed(() => Number.isInteger(store.currentWeek) ? store.currentWeek : null)
const dataWeekLimit = computed(() => allCourses.value.reduce((max, course) => {
  if (course.date) return Math.max(max, calcWeekNumber(course.date, store.semesterStart) || 0)
  const ranges = parseWeekRanges(course.weekRanges?.length ? course.weekRanges : course.weeks)
  return Math.max(max, ...ranges.map(range => range.end))
}, Number(store.calendar?.totalWeeks || store.calendar?.totalWeek || 0)))
const maxTeachingWeek = computed(() => Math.max(30, currentWeek.value || 0, dataWeekLimit.value))
function boundedWeek(week) {
  if (week === null || !Number.isFinite(Number(week))) return 1
  return Math.min(maxTeachingWeek.value, Math.max(1, Number(week)))
}
const semesterStatusMessage = computed(() => {
  if (currentWeek.value === null) return `教学周未知（学期起始日期待同步），当前浏览第 ${displayWeek.value} 周`
  if (currentWeek.value < 1) return '本学期尚未开始，当前显示第 1 周'
  if (dataWeekLimit.value && currentWeek.value > dataWeekLimit.value) return `本学期课程安排已结束，当前浏览第 ${currentWeek.value} 周`
  if (currentWeek.value > 30) return `当前为第 ${currentWeek.value} 教学周，已超出常用课表范围`
  return ''
})

watch(currentWeek, (week, previousWeek) => {
  if (!isFollowingCurrentWeek.value || week === null) return
  const previousBounded = previousWeek === null ? null : boundedWeek(previousWeek)
  if (previousBounded === null || displayWeek.value === previousBounded) displayWeek.value = boundedWeek(week)
})

watch(() => store.scheduleDays, days => {
  if (Number(days) === 5 && activeDay.value > 4) activeDay.value = 4
})

const hasEveningCourses = computed(() => {
  return activeCoursesInWeek.value.some(c => {
    const nums = c.periods || []
    return nums.some(n => n >= 11) || c.rowIndex >= 4
  })
})

const periodSlots = computed(() => {
  return hasEveningCourses.value ? CQJTU_PERIODS : CQJTU_PERIODS.slice(0, 10)
})

// Dynamic Viewport and Layout measurements (Replacing hardcoded chrome 208 and bottom 64/20)
const viewportH = ref(0)
const measuredChrome = ref(DEFAULT_TOKENS.defaultChrome)
const measuredBottom = ref(82)

function measureViewport(options = {}) {
  if (typeof window === 'undefined') return

  const page = pageRef.value
  const grid = gridRef.value

  // display:none 期间跳过测量并标 stale，禁止把回退值当实测值消费
  if (page) {
    const pageStyle = window.getComputedStyle(page)
    const pageRect = page.getBoundingClientRect()
    if (pageStyle.display === 'none' || pageStyle.visibility === 'hidden' || pageRect.height === 0) {
      isLayoutStale.value = true
      return
    }
  }

  isLayoutStale.value = false
  viewportH.value = window.visualViewport?.height || window.innerHeight || 0

  const isOverlay = widgetExpand.page === 'schedule'
  // 改查 .floating-dock (其 offsetParent 为 fixed wrap 非 null)
  const dockEl = document.querySelector('.floating-dock') || document.querySelector('.floating-dock-wrap') || document.querySelector('.capsule-dock')
  
  // Safe-bottom resolution via dedicated single-token probe element pixels
  const safeBottom = resolveSafeAreaBottom(safeBottomProbeRef.value)

  measuredBottom.value = getBottomClearance({
    isOverlay,
    dockElement: dockEl,
    safeBottom,
    windowInnerHeight: window.innerHeight
  })

  if (grid) {
    const measured = getChromeHeight({
      pageElement: page,
      gridElement: grid,
      defaultChrome: DEFAULT_TOKENS.defaultChrome
    })
    measuredChrome.value = measured
  } else if (options.force) {
    measuredChrome.value = DEFAULT_TOKENS.defaultChrome
  }
}

// 在 markWidgetSettled / watch(widgetExpand.settled) 后强制重测一次
watch(() => widgetExpand.settled, (settled) => {
  if (settled) {
    nextTick(() => {
      requestAnimationFrame(() => {
        measureViewport({ force: true })
      })
    })
  }
})

watch(() => widgetExpand.page, (page) => {
  if (page === 'schedule') {
    nextTick(() => {
      requestAnimationFrame(() => {
        measureViewport({ force: true })
      })
    })
  }
})

// 重挂后再校准一次：transition after-enter 钩子或 requestAnimationFrame 双帧后重测或 watch(gridRef) 到位即测
function onTabTransitionAfterEnter() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      measureViewport({ force: true })
    })
  })
}

watch(gridRef, (newGrid) => {
  if (newGrid) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measureViewport({ force: true })
      })
    })
  }
})

watch(viewMode, (newVal) => {
  if (newVal === 'week') {
    nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measureViewport({ force: true })
        })
      })
    })
  }
})

// Slot height: preferred density, dynamically capped to viewport height above dock
const slotH = computed(() => {
  const preferred = store.density || 58
  const vh = viewportH.value || (typeof window === 'undefined' ? 844 : (window.visualViewport?.height || window.innerHeight || 844))
  return computeSlotHeight({
    viewportHeight: vh,
    chromeHeight: measuredChrome.value,
    bottomClearance: measuredBottom.value,
    periodCount: periodSlots.value.length,
    preferredDensity: preferred
  })
})

const gridHeight = computed(() => periodSlots.value.length * slotH.value)

const weekdays = computed(() => {
  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const shorts = ['一', '二', '三', '四', '五', '六', '日']
  const monday = weekStartDate(displayWeek.value)
  const today = todayKey.value

  return names.map((name, i) => {
    const d = monday ? new Date(monday) : null
    if (d) d.setDate(d.getDate() + i)
    const count = activeCoursesInWeek.value.filter(c => courseDayIndex(c) === i).length
    return {
      name,
      short: shorts[i],
      index: i,
      dateNumber: d ? String(d.getDate()) : '—',
      monthDay: d ? fmtMD(d) : '日期待确认',
      fullDate: d ? fmtYMD(d) : '',
      isToday: !!d && fmtYMD(d) === today,
      count
    }
  })
})

function courseDayIndex(course) {
  if (course?.date && parseDateOnly(course.date)) return (new Date(`${course.date}T00:00:00`).getDay() + 6) % 7
  return Number(course?.dayIndex)
}

const visibleWeekdays = computed(() => weekdays.value.slice(0, Number(store.scheduleDays) === 5 ? 5 : 7))
const hiddenWeekendCourseCount = computed(() => Number(store.scheduleDays) === 5
  ? activeCoursesInWeek.value.filter(course => courseDayIndex(course) > 4).length
  : 0)

const weekRange = computed(() => {
  if (!parseDateOnly(store.semesterStart)) return '日期待确认'
  if (!weekdays.value.length) return ''
  return `${weekdays.value[0].monthDay} — ${weekdays.value[6].monthDay}`
})

// Calculate start & end section (1-indexed) for course
function getCourseSectionSpan(c) {
  if (Array.isArray(c.periods) && c.periods.length) {
    const sorted = [...c.periods].sort((a, b) => a - b)
    return {
      start: Math.max(1, sorted[0]),
      end: Math.min(13, sorted[sorted.length - 1]),
      span: Math.max(1, sorted[sorted.length - 1] - sorted[0] + 1)
    }
  }
  const fallback = [
    { start: 1, end: 2 },
    { start: 3, end: 5 },
    { start: 6, end: 7 },
    { start: 8, end: 10 },
    { start: 11, end: 13 },
  ]
  const m = fallback[c.rowIndex] || { start: 1, end: 2 }
  return { start: m.start, end: m.end, span: m.end - m.start + 1 }
}

function sameCourse(a, b) {
  return a && b
    && ((!a.id && !b.id) || (a.id && b.id && String(a.id) === String(b.id)))
    && (a.date || '') === (b.date || '')
    && a.name === b.name
    && courseDayIndex(a) === courseDayIndex(b)
    && (a.teacher || '') === (b.teacher || '')
    && (a.room || '') === (b.room || '')
}

function overlapCount(course, courses) {
  return courses.filter(other => other !== course && course.secStart <= other.secEnd && other.secStart <= course.secEnd).length
}

// 7 Days Grid Blocks: overlapping courses receive separate side-by-side lanes.
const dayBlocks = computed(() => {
  const blocks = Array.from({ length: 7 }, () => [])
  const maxSlots = periodSlots.value.length

  for (let d = 0; d < 7; d++) {
    const dayCourses = activeCoursesInWeek.value
      .filter(c => courseDayIndex(c) === d)
      .map(c => {
        const sec = getCourseSectionSpan(c)
        return {
          ...c,
          secStart: sec.start,
          secEnd: sec.end,
          secSpan: sec.span
        }
      })
      .sort((a, b) => a.secStart - b.secStart || a.secEnd - b.secEnd || String(a.id || '').localeCompare(String(b.id || '')))

    // Merge adjacent identical courses
    const merged = []
    let i = 0
    while (i < dayCourses.length) {
      let cur = { ...dayCourses[i] }
      let j = i + 1
      while (j < dayCourses.length && sameCourse(cur, dayCourses[j]) && dayCourses[j].secStart <= cur.secEnd + 1) {
        cur.secEnd = Math.max(cur.secEnd, dayCourses[j].secEnd)
        cur.secSpan = cur.secEnd - cur.secStart + 1
        j++
      }
      merged.push(cur)
      i = j
    }

    // Greedy interval coloring assigns colliding classes to disjoint lanes.
    const laneEnds = []
    const laneAssigned = merged.map(course => {
      let lane = laneEnds.findIndex(end => end < course.secStart)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = course.secEnd
      return { ...course, conflictLane: lane }
    })

    // Decorate cards with layout geometry (top, height, conflict lane).
    blocks[d] = laneAssigned.map((c, index) => {
      const startClamped = Math.min(c.secStart, maxSlots)
      const endClamped = Math.min(c.secEnd, maxSlots)
      const span = Math.max(1, endClamped - startClamped + 1)
      const topPx = (startClamped - 1) * slotH.value + 2
      const heightPx = span * slotH.value - 4
      const pStart = CQJTU_PERIODS[startClamped - 1]
      const pEnd = CQJTU_PERIODS[endClamped - 1]
      const conflictCount = overlapCount(c, laneAssigned)
      const placed = laneSpan({ ...c, conflictLane: conflictCount ? c.conflictLane : 0 }, conflictCount ? laneAssigned : [c])

      return {
        ...c,
        layoutKey: c.id
          ? `id-${c.id}-${displayWeek.value}-${d}-${startClamped}-${endClamped}`
          : `${displayWeek.value}-${d}-${startClamped}-${endClamped}-${c.name}-${c.room || ''}-${index}`,
        span,
        top: topPx + 'px',
        height: heightPx + 'px',
        conflictCount,
        conflictLane: placed.lane,
        conflictLanes: placed.lanes,
        layoutLeft: `calc(${placed.lane * 100 / placed.lanes}% + 1.5px)`,
        layoutWidth: `calc(${100 / placed.lanes}% - 3px)`,
        palette: getPalette(c.name),
        shortRoom: cleanRoomShort(c.room),
        formattedRoom: formatRoomBadge(c.room),
        periodName: `第${startClamped}-${endClamped}节`,
        periodTime: (pStart?.start || '') + '-' + (pEnd?.end || '')
      }
    })
  }

  return blocks
})

const visibleDayCourses = computed(() => {
  return dayBlocks.value[activeDay.value] || []
})
const readableWeekCourses = computed(() => dayBlocks.value.slice(0, visibleWeekdays.value.length).flat())

function countConflictingCourses(courses) {
  return courses.filter(course => course.conflictCount > 0).length
}

const dayConflictCourseCount = computed(() => countConflictingCourses(visibleDayCourses.value))
const weekConflictCourseCount = computed(() => countConflictingCourses(
  dayBlocks.value.slice(0, visibleWeekdays.value.length).flat()
))

const overflowCourses = computed(() => dayBlocks.value.slice(0, visibleWeekdays.value.length).flat().filter(c => overflowKeys.has(c.layoutKey)))

// Menu labels
const currentSemesterLabel = computed(() => {
  return store.semesterText || store.semester || '2026-2027 学年 · 第1学期'
})

const densityLabel = computed(() => {
  if (store.density <= 48) return '紧凑'
  if (store.density >= 70) return '宽松'
  return '标准'
})

const themeLabel = computed(() => {
  if (store.theme === 'morandi') return '雅致莫兰迪'
  if (store.theme === 'macaron') return '暖土马卡龙'
  return '经典粉彩（默认）'
})

const semesterOptions = computed(() => {
  return store.scheduleSemesters?.length ? store.scheduleSemesters : store.semesters || []
})

const densityOptions = [
  { val: 48, title: '紧凑模式', desc: '每节 48px · 视野更开阔' },
  { val: 58, title: '标准模式', desc: '每节 58px · 推荐手机首选' },
  { val: 70, title: '宽松模式', desc: '每节 70px · 字号更大' },
]

const themeOptions = [
  { id: 'pastel', title: '经典粉彩（默认）', desc: 'Apple HIG 低饱和粉彩与深色墨字' },
  { id: 'morandi', title: '雅致莫兰迪', desc: '低饱和暖灰与赭石' },
  { id: 'macaron', title: '暖土马卡龙', desc: '陶土/杏金/苔绿' },
]

function closeSchedule() {
  if (widgetExpand.page) {
    closeToWidget()
    return
  }
  router.push('/home')
}

function switchToDay(dayIndex) {
  activeDay.value = dayIndex
  viewMode.value = 'day'
}

function selectWeek(w) {
  displayWeek.value = boundedWeek(w)
  isFollowingCurrentWeek.value = currentWeek.value !== null && displayWeek.value === boundedWeek(currentWeek.value)
  showWeekPickerSheet.value = false
}

function prevWeek() {
  if (displayWeek.value > 1) displayWeek.value--
  isFollowingCurrentWeek.value = currentWeek.value !== null && displayWeek.value === boundedWeek(currentWeek.value)
}
function nextWeek() {
  if (displayWeek.value < maxTeachingWeek.value) displayWeek.value++
  isFollowingCurrentWeek.value = currentWeek.value !== null && displayWeek.value === boundedWeek(currentWeek.value)
}

function setScheduleDays(days) {
  store.setScheduleDays(days)
}

function showWeekendCourses() {
  store.setScheduleDays(7)
  showToast('已显示周末课程')
}

function showDetail(course) {
  detailCourse.value = course
  detailVisible.value = true
}

async function refresh() {
  showToast({ message: '正在同步教务课表...', duration: 0 })
  await store.fetchSchedule()
  if (scheduleError.value) showToast(scheduleError.value)
  else showToast('课表已同步')
}

function openSemesterPicker() {
  showMoreMenu.value = false
  showSemesterSheet.value = true
}

async function selectSemester(xnxq) {
  showSemesterSheet.value = false
  isFollowingCurrentWeek.value = true
  showToast({ message: '正在切换学期...', duration: 0 })
  await store.fetchSchedule(xnxq)
  displayWeek.value = boundedWeek(currentWeek.value)
  if (scheduleError.value) showToast(scheduleError.value)
  else showToast('已切换至 ' + (store.semesterText || xnxq))
}

function openDensityPicker() {
  showMoreMenu.value = false
  showDensitySheet.value = true
}

function selectDensity(d) {
  store.setDensity(d)
  showDensitySheet.value = false
  showToast('课表密度已设为 ' + densityLabel.value)
}

function openThemePicker() {
  showMoreMenu.value = false
  showThemeSheet.value = true
}

function selectTheme(t) {
  store.setTheme(t)
  showThemeSheet.value = false
  showToast('配色已更新')
}

function openAddSchedule() {
  showMoreMenu.value = false
  editingScheduleId.value = null
  newSchedule.name = ''
  newSchedule.room = ''
  newSchedule.dayIndex = activeDay.value
  newSchedule.startPeriod = 1
  newSchedule.endPeriod = 2
  newSchedule.repeatMode = 'weekly'
  const todayIndex = store.weekdayIndex(currentClock.value)
  newSchedule.date = weekdays.value[activeDay.value]?.fullDate
    || dateForWeekDay(displayWeek.value, activeDay.value)
    || (activeDay.value === todayIndex ? fmtYMD(currentClock.value) : '')
  newSchedule.weekStart = 1
  newSchedule.weekEnd = 20
  newSchedule.weekType = 'all'
  showAddScheduleDialog.value = true
}

const dateWeekdayLabel = computed(() => {
  const iso = parseDateOnly(newSchedule.date)
  if (!iso) return ''
  const date = new Date(`${iso}T00:00:00`)
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
})

function isCustomCourse(course) {
  if (!course) return false
  const custom = store.customCourses || []
  if (course.id !== undefined && course.id !== null) return custom.some(item => String(item.id) === String(course.id))
  return custom.some(item => item === course || (
    item.name === course.name && item.dayIndex === course.dayIndex && item.date === course.date
    && item.room === course.room && JSON.stringify(item.periods || []) === JSON.stringify(course.periods || [])
  ))
}

function editCustomCourse(course) {
  if (!isCustomCourse(course)) return
  const target = (store.customCourses || []).find(item => (
    item.id !== undefined && course.id !== undefined && String(item.id) === String(course.id)
  ) || (
    item.name === course.name && item.dayIndex === course.dayIndex && item.date === course.date
    && item.room === course.room && JSON.stringify(item.periods || []) === JSON.stringify(course.periods || [])
  ))
  const raw = target || course
  const ranges = parseWeekRanges(raw.weekRanges?.length ? raw.weekRanges : raw.weeks)
  editingScheduleId.value = raw.id !== undefined && raw.id !== null
    ? raw.id
    : `legacy-index:${Math.max(0, (store.customCourses || []).indexOf(raw))}`
  newSchedule.name = raw.name || ''
  newSchedule.room = raw.room || ''
  newSchedule.dayIndex = Number.isInteger(Number(raw.dayIndex)) ? Number(raw.dayIndex) : courseDayIndex(raw)
  newSchedule.startPeriod = getCourseSectionSpan(raw).start
  newSchedule.endPeriod = getCourseSectionSpan(raw).end
  newSchedule.repeatMode = raw.date ? 'once' : 'weekly'
  newSchedule.date = parseDateOnly(raw.date) || weekdays.value[activeDay.value]?.fullDate || ''
  newSchedule.weekStart = ranges[0]?.start || 1
  newSchedule.weekEnd = ranges[ranges.length - 1]?.end || 20
  newSchedule.weekType = raw.weekType === 'odd' || raw.weekType === 'even' ? raw.weekType : 'all'
  detailVisible.value = false
  showAddScheduleDialog.value = true
}

function saveCustomCourse() {
  if (!newSchedule.name.trim()) {
    showToast('请输入日程名称')
    return false
  }
  const date = newSchedule.repeatMode === 'once' ? parseDateOnly(newSchedule.date) : ''
  if (newSchedule.repeatMode === 'once' && !date) {
    showToast('请选择有效日期')
    return false
  }
  const startWeek = Number(newSchedule.weekStart)
  const endWeek = Number(newSchedule.weekEnd)
  if (newSchedule.repeatMode === 'weekly' && (!Number.isInteger(startWeek) || !Number.isInteger(endWeek) || startWeek < 1 || endWeek < startWeek || endWeek > maxTeachingWeek.value)) {
    showToast(`请检查开始周和结束周（1 至 ${maxTeachingWeek.value} 周）`)
    return false
  }
  const swappedPeriods = newSchedule.startPeriod > newSchedule.endPeriod
  const s = Math.min(newSchedule.startPeriod, newSchedule.endPeriod)
  const e = Math.max(newSchedule.startPeriod, newSchedule.endPeriod)
  const nums = []
  for (let i = s; i <= e; i++) nums.push(i)

  const dayIndex = date ? (new Date(`${date}T00:00:00`).getDay() + 6) % 7 : newSchedule.dayIndex
  const item = {
    name: newSchedule.name.trim(),
    room: newSchedule.room.trim(),
    teacher: '自定义',
    dayIndex,
    periods: nums,
    date,
    semester: store.semester,
    weeks: date ? '' : `${startWeek}-${endWeek}`,
    weekRanges: date ? [] : [{ start: startWeek, end: endWeek }],
    weekType: date ? 'all' : newSchedule.weekType
  }
  if (editingScheduleId.value !== null) {
    const id = typeof editingScheduleId.value === 'string' && editingScheduleId.value.startsWith('legacy-index:')
      ? Number(editingScheduleId.value.slice('legacy-index:'.length))
      : editingScheduleId.value
    store.updateCustomCourse(id, item)
    showToast(swappedPeriods ? '已按较早节次到较晚节次保存' : '日程已更新')
  } else {
    store.addCustomCourse(item)
    showToast(swappedPeriods ? '已按较早节次到较晚节次保存' : '日程添加成功')
  }
  return true
}

async function handleCustomScheduleClose(action) {
  if (action !== 'confirm') return true
  return saveCustomCourse()
}

function deleteCustomCourse(course) {
  if (!isCustomCourse(course)) return
  pendingDeleteCourse.value = course
  showDeleteScheduleDialog.value = true
}

function confirmDeleteCustomCourse() {
  const course = pendingDeleteCourse.value
  if (!course) return
  const custom = store.customCourses || []
  let id = course.id
  if (id === undefined || id === null) {
    id = custom.findIndex(item => item === course || (
      item.name === course.name && item.dayIndex === course.dayIndex && item.room === course.room
    ))
  }
  if (id !== -1 && id !== undefined) {
    store.removeCustomCourse(id)
    showToast('日程已删除')
  }
  detailVisible.value = false
  pendingDeleteCourse.value = null
}

function dataUrlToFile(dataUrl, filename) {
  const parts = String(dataUrl).split(',')
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png'
  const bin = atob(parts[1] || '')
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], filename, { type: mime })
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function shareBlob(file, title, text, nativeOpts) {
  if (nativeOpts) {
    const native = await shareFileNative(nativeOpts)
    if (native.ok) return true
  }
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text })
    return true
  }
  if (navigator.share) {
    await navigator.share({ title, text })
    return true
  }
  return false
}

async function exportScheduleTableImage() {
  showMoreMenu.value = false
  const prevMode = viewMode.value
  if (prevMode !== 'week') viewMode.value = 'week'
  await nextTick()
  const el = exportRoot.value
  if (!el) {
    viewMode.value = prevMode
    return showToast('暂无可导出的课表内容')
  }
  showToast({ message: '正在生成课表图片...', duration: 0, forbidClick: true })
  try {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(el, {
      backgroundColor: '#FFFFFF',
      scale: (navigator.hardwareConcurrency || 8) <= 4 ? 1 : 2,
      useCORS: true,
      logging: false,
      foreignObjectRendering: false
    })
    exportedImageName.value = `交大课表_第${displayWeek.value}周.png`
    exportedImageUrl.value = canvas.toDataURL('image/png')
    showImageExportDialog.value = true
    showToast('长按图片可保存，也可点分享')
  } catch (e) {
    showToast('生成失败: ' + (e.message || '请稍后重试'))
  } finally {
    if (prevMode !== 'week') viewMode.value = prevMode
    document.querySelectorAll('.html2canvas-container, iframe.html2canvas-container').forEach((n) => {
      try { n.remove() } catch (err) {}
    })
  }
}

async function shareExportedImage() {
  if (!exportedImageUrl.value) return
  try {
    const file = dataUrlToFile(exportedImageUrl.value, exportedImageName.value)
    const ok = await shareBlob(file, '交大课表', '学渡课表图片', {
      fileName: exportedImageName.value,
      base64: String(exportedImageUrl.value).split(',')[1] || '',
      title: '交大课表',
      dialogTitle: '分享课表图片'
    })
    if (!ok) {
      if (isNativeApp()) {
        showToast('请长按上方图片保存到相册')
      } else {
        const link = document.createElement('a')
        link.download = exportedImageName.value
        link.href = exportedImageUrl.value
        link.click()
        showToast('已尝试下载，若没有文件请长按图片保存')
      }
    }
  } catch (e) {
    showToast('请长按上方图片保存到相册')
  }
}

function exportScheduleList() {
  showMoreMenu.value = false
  showListExportDialog.value = true
}

async function copyListText() {
  const lines = [`重庆交通大学 · 第 ${displayWeek.value} 周课程清单:`]
  weekdays.value.forEach((d, di) => {
    lines.push(`\n【${d.name} (${d.dateNumber})】`)
    const list = dayBlocks.value[di] || []
    if (!list.length) lines.push('  暂无课程')
    list.forEach(c => {
      lines.push(`  ${c.periodName} ${c.name} ${c.formattedRoom} ${c.teacher}`)
    })
  })
  const text = lines.join('\n')
  if (isNativeApp()) {
    try {
      await Clipboard.write({ string: text })
      showToast('已复制本周课程清单')
      return
    } catch (e) {
      showToast('复制失败，请截图保存')
      return
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      showToast('已复制本周课程清单')
      return
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    showToast('已复制本周课程清单')
  } catch (e) {
    showToast('复制失败，请截图保存')
  }
}

async function exportScheduleCalendar() {
  showMoreMenu.value = false
  const totalWeeks = Number(store.calendar?.totalWeeks || store.calendar?.totalWeek || 0)
  const hasUnexportableRecurringCourses = allCourses.value.some(course => {
    if (parseDateOnly(course.date)) return false
    if (!parseDateOnly(store.semesterStart)) return true
    const hasRanges = Array.isArray(course.weekRanges) && course.weekRanges.length > 0
    const text = String(course.weeks || '').trim()
    const ranges = parseWeekRanges(hasRanges ? course.weekRanges : text)
    if (ranges.length) return false
    if (hasRanges || (text && !/单|双/.test(text))) return true
    return !(Number.isInteger(totalWeeks) && totalWeeks > 0)
  })
  const ics = buildCalendarIcs({
    courses: allCourses.value,
    semester: store.semester,
    semesterStart: store.semesterStart,
    totalWeeks,
    now: currentClock.value
  })
  const incompleteMessage = '学期日期或重复周次不完整，已跳过重复课程；同步校历与课表后可重新导出完整日历'
  if (!ics.includes('BEGIN:VEVENT')) {
    showToast(hasUnexportableRecurringCourses ? incompleteMessage : '暂无可导出的日程')
    return
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  try {
    const file = new File([blob], '交大课表.ics', { type: 'text/calendar' })
    const base64Data = await blobToBase64(blob)
    const shared = await shareBlob(file, '交大课表', '导入系统日历', {
      fileName: '交大课表.ics',
      base64: base64Data,
      mimeType: 'text/calendar',
      title: '交大课表日历',
      dialogTitle: '导入到日历应用'
    })
    if (shared) {
      showToast(hasUnexportableRecurringCourses
        ? `已唤起分享；${incompleteMessage}`
        : '已唤起分享，请选择日历应用打开')
      return
    }
  } catch (e) {}
  if (isNativeApp()) {
    showToast('生成失败，请稍后重试')
    return
  }
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '交大课表.ics'
  link.click()
  URL.revokeObjectURL(link.href)
  showToast(hasUnexportableRecurringCourses
    ? `已生成日历文件；${incompleteMessage}`
    : '已生成日历文件，若没有弹窗请到下载目录查看')
}

onMounted(async () => {
  measureViewport()
  window.addEventListener('resize', measureViewport)
  window.visualViewport?.addEventListener('resize', measureViewport)
  nextTick(() => {
    measureViewport()
  })
  displayWeek.value = boundedWeek(currentWeek.value)
  activeDay.value = store.weekdayIndex(currentClock.value)
  if (!store.courses.length) {
    await store.fetchSchedule()
    displayWeek.value = boundedWeek(currentWeek.value)
  }
  nextTick(() => {
    measureViewport()
  })
})

onDeactivated(() => {
  showWeekPickerSheet.value = false
  showMoreMenu.value = false
  showSemesterSheet.value = false
  showDensitySheet.value = false
  showThemeSheet.value = false
  showAddScheduleDialog.value = false
  showDeleteScheduleDialog.value = false
  showListExportDialog.value = false
  showImageExportDialog.value = false
  showLoginDialog.value = false
  detailVisible.value = false
})

onUnmounted(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('resize', measureViewport)
  window.visualViewport?.removeEventListener('resize', measureViewport)
})
</script>

<style scoped>
.schedule-page {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(var(--safe-top, 0px) + 12px) 12px calc(var(--dock-clearance, 82px) + 8px);
  position: relative;
}

.semester-status-notice,
.weekend-course-notice,
.conflict-notice {
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary, #62626A);
  background: rgba(0, 122, 255, 0.07);
}

.semester-status-notice {
  margin: -6px 2px 10px;
}

.weekend-course-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 2px 2px 8px;
  color: var(--text-primary, #1c1c1e);
}

.weekend-course-notice button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 7px;
  min-height: 44px;
  padding: 6px 10px;
  background: var(--primary, #007AFF);
  color: #fff;
  font: inherit;
  font-weight: 600;
}

.conflict-notice {
  margin: 10px 2px 0;
  color: #8B4A16;
  background: rgba(255, 149, 0, 0.11);
}

.week-readout {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  background: var(--bg-surface, #fff);
  border-radius: 12px;
}
.week-readout li {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 2px 8px;
  padding: 10px 12px;
  border-top: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  font-size: 13px;
}
.week-readout li span:first-child {
  grid-row: span 2;
  color: var(--text-secondary, #62626a);
}
.week-readout strong {
  font-size: 15px;
}

/* Dedicated single-token probes to resolve CSS variables into computed pixels without padding interference */
.schedule-probe-wrap {
  position: fixed;
  top: -9999px;
  left: -9999px;
  width: 0;
  height: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
}

.probe-safe-bottom {
  box-sizing: content-box !important;
  width: 0 !important;
  height: var(--safe-bottom, 0px) !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
}

.probe-dock-clearance {
  box-sizing: content-box !important;
  width: 0 !important;
  height: var(--dock-clearance, 82px) !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
}

/* 44pt Compact Top Bar */
.compact-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  margin-bottom: 6px;
  padding: 0 2px;
}

.compact-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.compact-title-text {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  letter-spacing: -0.4px;
  margin: 0;
  white-space: nowrap;
}

.compact-bar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.compact-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-primary, #000000);
  transition: background 0.15s ease;
}
.compact-icon-btn:active {
  background: rgba(0, 0, 0, 0.05);
}

.compact-view-toggle-btn {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 999px;
  border: none;
  background: var(--bg-surface, #FFFFFF);
  color: var(--text-primary, #000000);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease;
  white-space: nowrap;
}
.compact-view-toggle-btn:active {
  opacity: 0.7;
}

.toggle-text-full {
  display: inline;
}
.toggle-text-short {
  display: none;
}

@media (max-width: 380px) {
  .toggle-text-full {
    display: none;
  }
  .toggle-text-short {
    display: inline;
  }
}

/* Quick Week Switcher Rail */
.compact-week-rail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  margin-bottom: 8px;
  padding: 0 2px;
}

.week-arrow-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: none;
  background: transparent;
  min-height: 44px;
  min-width: 44px;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #8E8E93);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.week-arrow-btn:active {
  background: rgba(0, 0, 0, 0.05);
}

.week-range-label {
  min-height: 44px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #8E8E93);
  border: none;
  background: transparent;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  padding: 0 10px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
.week-range-label:active {
  background: rgba(0, 0, 0, 0.05);
}

.primary-fast-login-btn {
  border: none;
  background: var(--primary, #007AFF);
  color: #ffffff;
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 122, 255, 0.25);
  margin-top: 6px;
}
.primary-fast-login-btn:active {
  opacity: 0.8;
}

/* Loading & Empty State */
.loading-state,
.empty-day-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  gap: 10px;
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary, #8E8E93);
  text-align: center;
}

.empty-day-card h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  margin: 0;
}

.empty-day-card p {
  font-size: 12px;
  margin: 0;
}

.state-icon-box {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(0, 122, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-sub {
  font-size: 12px;
  color: var(--text-tertiary, #C7C7CC);
}

/* ================= 1. 学习通同款 1-10 小节大网格 (Apple Calendar Opaque Canvas) ================= */
.grid-timetable-view {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  padding: 8px 4px 10px;
  overflow: hidden;
}

/* Weekday Header Row */
.timetable-weekday-header {
  display: flex;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  margin-bottom: 6px;
}

.corner-week-box {
  width: 34px;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0;
}

.corner-week-num {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #000000);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.corner-week-lbl {
  font-size: 10px;
  color: var(--text-secondary, #8E8E93);
  font-weight: 500;
  margin-top: 2px;
}

.weekday-columns-header {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(var(--schedule-day-count, 7), minmax(0, 1fr));
  gap: 2px;
}

.header-day-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 2px 0;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.h-day-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #8E8E93);
  margin-bottom: 2px;
}

.h-day-date {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}

/* Today Capsule: 实心蓝色胶囊圆点，白字 */
.header-day-cell.today-capsule .h-day-date {
  background: var(--primary, #007AFF);
  color: #FFFFFF;
  font-weight: 700;
}

/* Timetable Canvas */
.timetable-canvas {
  display: flex;
}

.periods-time-rail {
  width: 40px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  margin-right: 2px;
  border-right: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
}

.time-rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2px 0;
}

.time-slot-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary, #8E8E93);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.time-range-lines {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-secondary, #62626a);
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

/* Grid Tracks */
.timetable-grid-tracks {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(var(--schedule-day-count, 7), minmax(0, 1fr));
  gap: 2px;
}

.track-column {
  display: flex;
  flex-direction: column;
  position: relative;
}

.track-column.today-track {
  background: rgba(0, 122, 255, 0.03);
  border-radius: 4px;
}

.period-cell-slot {
  padding: 2px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-bottom: 0.5px solid var(--separator, rgba(60, 60, 67, 0.08));
}

/* Floating Spanning Course Cards (Apple HIG Pastel Flat Squircles) */
.campus-course-card {
  position: absolute;
  left: 1.5px;
  right: 1.5px;
  border-radius: var(--radius-course, 8px);
  padding: 4px 3px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
  z-index: 2;
  border: none;
  box-shadow: none;
  transition: transform 0.1s ease;
}

.campus-course-card:active {
  transform: scale(0.96);
}

.card-course-name {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--course-ink, #000000);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: normal;
  overflow-wrap: anywhere;
}

.card-room-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--course-ink, #000000);
  opacity: 0.92;
  margin-top: auto;
  flex: 0 0 auto;
  margin-bottom: 0;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
  overflow: hidden;
  overflow-wrap: anywhere;
}

/* Long Course Name Index */
.course-name-index {
  margin-top: 14px;
  border-top: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  text-align: left;
}

.course-index-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #000000);
}
.course-index-heading small {
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
  font-weight: 400;
}

.course-index-row {
  width: 100%;
  border: none;
  border-bottom: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  background: transparent;
  color: var(--text-primary, #000000);
  padding: 12px 4px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s ease;
}
.course-index-row:last-child {
  border-bottom: none;
}
.course-index-row:active {
  background: rgba(0, 0, 0, 0.03);
}

.course-index-time {
  flex: 0 0 52px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #8E8E93);
}
.course-index-time small {
  display: block;
  font-size: 10px;
  margin-top: 2px;
}

.course-index-content {
  flex: 1;
  min-width: 0;
}
.course-index-content strong {
  display: block;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.course-index-content small {
  display: block;
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
  margin-top: 2px;
  overflow-wrap: anywhere;
}

/* ================= 2. 单日日程视图 (Day View Agenda) ================= */
.day-timeline-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.day-pill-nav {
  display: flex;
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  padding: 6px 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  gap: 2px;
}

.nav-day-item {
  flex: 1;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
}

.nav-day-item.active {
  background: var(--primary, #007AFF);
  color: #FFFFFF;
}

.nav-day-item.is-today:not(.active) {
  background: rgba(0, 122, 255, 0.08);
}

.nav-day-item.active .item-weekday,
.nav-day-item.active .item-date {
  color: #FFFFFF;
  font-weight: 700;
}

.item-weekday {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #8E8E93);
}

.item-date {
  font-size: 10px;
  color: var(--text-tertiary, #C7C7CC);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

.item-badge-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary, #007AFF);
  position: absolute;
  bottom: 3px;
}

.day-cards-flow {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Agenda Card Box: Inset Grouped White Card */
.agenda-card-box {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  padding: 14px 16px;
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  transition: background 0.1s ease;
}
.agenda-card-box:active {
  background: rgba(0, 0, 0, 0.03);
}

.agenda-time-side {
  width: 66px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  padding-right: 10px;
}

.agenda-time-big {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #000000);
}

.agenda-time-sub {
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
  margin-top: 2px;
}

.agenda-main-side {
  flex: 1;
  min-width: 0;
}

.agenda-course-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  margin: 0 0 4px;
  line-height: 1.35;
}

.agenda-meta-sub {
  font-size: 13px;
  color: var(--text-secondary, #8E8E93);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agenda-tag {
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

/* ================= Sheets & Modals ================= */
.week-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 16px;
}

.picker-week-btn {
  height: 48px;
  border-radius: 10px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  background: var(--bg-surface, #FFFFFF);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  cursor: pointer;
  transition: all 0.15s ease;
}

.picker-week-btn.active {
  background: var(--primary, #007AFF);
  color: #ffffff;
  border-color: var(--primary, #007AFF);
}

.picker-week-btn.current:not(.active) {
  border-color: var(--primary, #007AFF);
  color: var(--primary, #007AFF);
}

.current-sub {
  font-size: 9px;
  margin-top: 2px;
  opacity: 0.85;
}

.menu-sections-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.menu-group-block {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
}

.menu-group-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #8E8E93);
  padding: 10px 16px 4px;
}

.menu-row-card {
  padding: 12px 16px;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border-bottom: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  transition: background 0.1s ease;
}

.schedule-days-row {
  cursor: default;
}

.days-toggle {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: rgba(118, 118, 128, 0.12);
  flex-shrink: 0;
}

.days-toggle button {
  border: 0;
  border-radius: 7px;
  min-height: 44px;
  padding: 0 9px;
  background: transparent;
  color: var(--text-secondary, #6e6e73);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
}

.days-toggle button.active {
  color: var(--primary, #007AFF);
  background: var(--bg-surface, #fff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.menu-row-card:last-child {
  border-bottom: none;
}
.menu-row-card:active {
  background: rgba(0, 0, 0, 0.03);
}

.m-left-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.m-texts-col {
  flex: 1;
}

.m-main-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #000000);
}

.m-sub-text {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #8E8E93);
  margin-top: 2px;
}

.menu-close-btn {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: none;
  background: var(--bg-surface, #FFFFFF);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.semester-list,
.density-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.semester-item {
  height: 48px;
  border-radius: 10px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  background: var(--bg-surface, #FFFFFF);
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  cursor: pointer;
}

.semester-item.active {
  border-color: var(--primary, #007AFF);
  color: var(--primary, #007AFF);
  background: rgba(0, 122, 255, 0.04);
}

.semester-empty {
  text-align: center;
  color: var(--text-secondary, #8E8E93);
  font-size: 13px;
  padding: 20px;
}

/* Custom Schedule Dialog Form */
.custom-schedule-form {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cs-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #8E8E93);
}

.cs-field input,
.cs-field select {
  height: 40px;
  border-radius: 8px;
  border: 0.5px solid rgba(0, 0, 0, 0.15);
  padding: 0 12px;
  font-size: 14px;
  background: var(--bg-surface, #FFFFFF);
}

.cs-field input[type="number"] {
  min-width: 0;
}

.cs-hint {
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
}

.cs-readonly {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 8px;
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  background: rgba(118, 118, 128, 0.08);
  font-size: 14px;
  color: var(--text-secondary, #6e6e73);
}

.cs-row-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

/* Image Export Box */
.img-export-box {
  padding: 16px;
  text-align: center;
}

.le-title {
  font-size: 12px;
  color: var(--text-secondary, #8E8E93);
  margin-bottom: 12px;
}

.img-export-preview {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

/* List Export Box */
.list-export-box {
  padding: 16px 20px;
  max-height: 360px;
  overflow-y: auto;
}

.le-day-group {
  margin-bottom: 14px;
}

.le-day-head {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #000000);
  margin-bottom: 6px;
}

.le-empty-day {
  font-size: 12px;
  color: var(--text-tertiary, #C7C7CC);
  padding-left: 8px;
}

.le-course-row {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary, #8E8E93);
  padding: 4px 8px;
  border-left: 2px solid var(--primary, #007AFF);
  margin-bottom: 4px;
}

.le-course-row strong {
  font-size: 13px;
  color: var(--text-primary, #000000);
}

/* Course Detail Dialog Body */
.detail-dialog-body {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.detail-actions button {
  flex: 1;
  min-height: 40px;
  border: 0;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.detail-edit-btn {
  color: var(--primary, #007AFF);
  background: rgba(0, 122, 255, 0.1);
}

.detail-delete-btn {
  color: #D9383E;
  background: rgba(229, 72, 77, 0.1);
}

.delete-schedule-copy {
  margin: 0;
  padding: 20px 24px;
  color: var(--text-primary, #1c1c1e);
  font-size: 14px;
  text-align: center;
  overflow-wrap: anywhere;
}

.dialog-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  padding-bottom: 8px;
  border-bottom: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
}

.dialog-row:last-child {
  border-bottom: none;
}

.dl-label {
  color: var(--text-secondary, #8E8E93);
}

.dl-val {
  font-weight: 600;
  color: var(--text-primary, #000000);
}

.dl-val.highlight {
  color: var(--primary, #007AFF);
}
</style>
