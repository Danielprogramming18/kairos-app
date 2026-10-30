import React, { useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Trophy,
  BarChart3,
  Activity,
  PieChart,
  Search,
  ChevronRight,
  ChevronLeft,
  Plus,
  Edit3,
  Trash2,
  Check,
  Sparkles,
} from 'lucide-react';
import { Habit } from '../types';
import {
  toPersianNum,
  getWeekDays,
  getTodayKey,
  formatDateKeyToPersian,
} from '../utils/persianDate';
import {
  calculateHabitWindowRate,
  calculateStreaks,
  computeDailyHabitProgress,
} from '../utils/habitStreaks';

export const HABIT_CATEGORIES: Record<
  string,
  { label: string; iconName: string; color: string }
> = {
  all: { label: 'همه عادت‌ها', iconName: 'layers', color: '#6366f1' },
  health: { label: 'سلامتی و بهداشت', iconName: 'heart-pulse', color: '#10b981' },
  learning: { label: 'مطالعه و یادگیری', iconName: 'book-open', color: '#3b82f6' },
  work: { label: 'کار و بهره‌وری', iconName: 'briefcase', color: '#8b5cf6' },
  mindfulness: { label: 'ذهن‌آگاهی و نظم', iconName: 'sparkles', color: '#f59e0b' },
  finance: { label: 'مدیریت مالی', iconName: 'wallet', color: '#ec4899' },
};

interface HabitsViewProps {
  habits: Habit[];
  onToggleHabitDay: (habitId: string, dateKey: string) => void;
  onOpenHabitModal: (habitId?: string) => void;
  onOpenDeleteModal: (habitId: string, habitTitle: string) => void;
}

export const HabitsView: React.FC<HabitsViewProps> = ({
  habits,
  onToggleHabitDay,
  onOpenHabitModal,
  onOpenDeleteModal,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const todayKey = getTodayKey();
  const weekDays = getWeekDays(weekOffset);
  const weekKeys = weekDays.map((d) => d.key);

  // 1. Canonical Today KPI (respects startDate, targetDaysOfWeek, and archived)
  const todayProgress = computeDailyHabitProgress(habits, todayKey, todayKey);
  const eligibleTodayCount = todayProgress.eligibleCount;
  const completedToday = todayProgress.doneCount;
  const todayPercent = todayProgress.ratePercent;

  let maxCurrentStreak = 0;
  let maxCurrentHabitTitle = 'بدون زنجیرهٔ فعال';
  let maxBestStreak = 0;
  let maxBestHabitTitle = '—';

  habits.forEach((h) => {
    const s = calculateStreaks(h.completedDates, new Date(), h.weeklyGoal, {
      startDate: h.startDate,
    });
    if (s.current > maxCurrentStreak) {
      maxCurrentStreak = s.current;
      maxCurrentHabitTitle = `${h.emoji} ${h.title}`;
    }
    if (s.best > maxBestStreak) {
      maxBestStreak = s.best;
      maxBestHabitTitle = `${h.emoji} ${h.title}`;
    }
  });

  let totalPossibleWeek = 0;
  let totalDoneWeek = 0;
  habits.forEach((h) => {
    const rate = calculateHabitWindowRate(h, weekKeys, todayKey);
    totalDoneWeek += rate.doneCount;
    totalPossibleWeek += rate.expectedCount;
  });
  const weeklyRate =
    totalPossibleWeek > 0
      ? Math.min(100, Math.round((totalDoneWeek / totalPossibleWeek) * 100))
      : 0;

  // Filter habits
  const filteredHabits = habits.filter((h) => {
    const matchesCat = selectedCategory === 'all' || h.category === selectedCategory;
    const matchesSearch = h.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* 1. KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's completion */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              تکمیل‌شدهٔ امروز
            </span>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(completedToday)} از {toPersianNum(eligibleTodayCount)}
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 tabular-nums">
                {toPersianNum(todayPercent)}٪
              </span>
            </div>
            <p className="text-[11px] text-slate-400">هدف روزانهٔ خود را کامل کنید</p>
          </div>
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100 dark:text-slate-800"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
              />
              <path
                className="text-emerald-500 transition-all duration-700 ease-out"
                strokeDasharray={`${todayPercent}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
                strokeLinecap="round"
              />
            </svg>
            <CheckCircle2 className="w-5 h-5 text-emerald-500 absolute" />
          </div>
        </div>

        {/* Highest Current Streak */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              زنجیرهٔ فعلی برتر
            </span>
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(maxCurrentStreak)}
              </h2>
              <span className="text-xs font-semibold text-amber-500">روز متوالی</span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
              {maxCurrentHabitTitle}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Flame className="w-6 h-6" />
          </div>
        </div>

        {/* All-time record */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              بهترین رکورد کل
            </span>
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(maxBestStreak)}
              </h2>
              <span className="text-xs font-semibold text-indigo-500">روز</span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
              {maxBestHabitTitle}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
        </div>

        {/* Weekly Performance */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              عملکرد بازهٔ هفتگی
            </span>
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(weeklyRate)}٪
              </h2>
              <span className="text-xs text-slate-400 tabular-nums">
                ({toPersianNum(totalDoneWeek)} ثبت)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">میانگین تحقق اهداف هفتگی</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* 2. Weekly Bar Chart & Category Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Bar Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                نمودار پیوستگی هفتگی
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                درصد تکمیل عادت‌های فعال در هر یک از روزهای هفتهٔ انتخابی
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {weekOffset === 0
                ? `هفتهٔ جاری (${weekDays[0].dayNumber} ${weekDays[0].monthName} تا ${weekDays[6].dayNumber} ${weekDays[6].monthName})`
                : `${weekDays[0].dayNumber} ${weekDays[0].monthName} تا ${weekDays[6].dayNumber} ${weekDays[6].monthName}`}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 pt-6 px-2 border-b border-slate-100 dark:border-slate-800/80">
            {weekDays.map((day) => {
              const dayProgress = computeDailyHabitProgress(habits, day.key, todayKey);
              const doneCount = dayProgress.doneCount;
              const eligibleCount = dayProgress.eligibleCount;
              const percent = dayProgress.ratePercent;

              let barColor = 'bg-indigo-500';
              if (percent >= 80) barColor = 'bg-emerald-500 shadow-md shadow-emerald-500/20';
              else if (percent === 0) barColor = 'bg-slate-200 dark:bg-slate-800';

              const heightPercent = eligibleCount > 0 ? Math.max(percent, 8) : 0;

              return (
                <div
                  key={day.key}
                  data-testid={`habit-chart-day-${day.key}`}
                  className="flex flex-col items-center justify-end h-full group relative"
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none z-10">
                    {eligibleCount > 0
                      ? `${toPersianNum(doneCount)} از ${toPersianNum(eligibleCount)} (${toPersianNum(percent)}٪)`
                      : 'بدون عادت فعال'}
                  </div>
                  <span
                    className={`text-[11px] font-bold mb-1.5 tabular-nums ${
                      day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                    }`}
                  >
                    {eligibleCount > 0 ? `${toPersianNum(percent)}٪` : '—'}
                  </span>
                  <div className="w-full max-w-[38px] h-28 bg-slate-100 dark:bg-slate-800/70 rounded-xl p-1 flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-lg transition-all duration-500 ease-out ${barColor}`}
                      style={{
                        height: day.isFuture || eligibleCount === 0 ? '0%' : `${heightPercent}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <span
                      className={`block text-xs font-bold ${
                        day.isToday
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {day.weekdayName}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {day.dayNumber} {day.monthName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                تکمیل عالی (+۸۰٪)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                در حال پیشرفت
              </span>
            </div>
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
              روزهای پیش از شروع هر عادت در مخرج محاسبه نمی‌شوند.
            </span>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
              <PieChart className="w-5 h-5 text-violet-500" />
              پیشرفت دسته‌بندی‌ها
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              نرخ تحقق هفتگی به تفکیک هر حوزه
            </p>

            <div className="space-y-4">
              {Object.entries(HABIT_CATEGORIES)
                .filter(([k]) => k !== 'all')
                .map(([catKey, catInfo]) => {
                  const catHabits = habits.filter((h) => h.category === catKey);
                  const count = catHabits.length;
                  let done = 0;
                  let totalPossible = 0;
                  catHabits.forEach((h) => {
                    const wRate = calculateHabitWindowRate(h, weekKeys, todayKey);
                    done += wRate.doneCount;
                    totalPossible += wRate.expectedCount;
                  });
                  const rate =
                    totalPossible > 0
                      ? Math.min(100, Math.round((done / totalPossible) * 100))
                      : 0;

                  return (
                    <div key={catKey} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: catInfo.color }}
                          />
                          {catInfo.label}
                          <span className="text-[11px] font-normal text-slate-400 tabular-nums">
                            ({toPersianNum(count)})
                          </span>
                        </span>
                        <span className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                          {toPersianNum(rate)}٪
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${rate}%`, backgroundColor: catInfo.color }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">مجموع عادت‌ها:</span>
            <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
              {toPersianNum(habits.length)} عادت
            </span>
          </div>
        </div>
      </section>

      {/* 3. Filter Bar, Mobile Habit Cards & Desktop Matrix Table */}
      <section className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
            {Object.entries(HABIT_CATEGORIES).map(([key, cat]) => {
              const isActive = selectedCategory === key;
              const count =
                key === 'all'
                  ? habits.length
                  : habits.filter((h) => h.category === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCategory(key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {toPersianNum(count)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search, New Habit & Week Navigator */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جست‌وجوی عادت..."
                className="w-full sm:w-48 pr-9 pl-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setWeekOffset(weekOffset - 1)}
                title="هفتهٔ قبل"
                aria-label="هفتهٔ قبل"
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-500 transition cursor-pointer"
              >
                امروز
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(weekOffset + 1)}
                disabled={weekOffset >= 0}
                title="هفتهٔ بعد"
                aria-label="هفتهٔ بعد"
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onOpenHabitModal()}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>عادت جدید</span>
            </button>
          </div>
        </div>

        {/* Mobile Habit Cards (< md): Today check + compact 7-day bar */}
        {filteredHabits.length > 0 && (
          <div className="md:hidden space-y-3" data-testid="habits-mobile-list">
            {filteredHabits.map((habit) => {
              const catInfo = HABIT_CATEGORIES[habit.category] || HABIT_CATEGORIES.all;
              const streaks = calculateStreaks(
                habit.completedDates,
                new Date(),
                habit.weeklyGoal,
                { startDate: habit.startDate }
              );
              const isCheckedToday = !!habit.completedDates[todayKey];
              const goal = habit.weeklyGoal || 7;
              const weekDoneCount = weekDays.filter((d) => habit.completedDates[d.key]).length;

              return (
                <div
                  key={habit.id}
                  className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onToggleHabitDay(habit.id, todayKey)}
                        aria-label={`ثبت امروز برای عادت «${habit.title}»`}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0 transition cursor-pointer ${
                          isCheckedToday
                            ? 'text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                        }`}
                        style={
                          isCheckedToday ? { backgroundColor: habit.color } : undefined
                        }
                      >
                        {isCheckedToday ? <Check className="w-5 h-5 stroke-[3]" /> : habit.emoji}
                      </button>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                          {habit.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span
                            className="px-2 py-0.5 rounded-md font-semibold"
                            style={{
                              backgroundColor: `${catInfo.color}15`,
                              color: catInfo.color,
                            }}
                          >
                            {catInfo.label}
                          </span>
                          <span>زنجیرهٔ فعلی: {toPersianNum(streaks.current)} روز</span>
                          <span>بهترین رکورد: {toPersianNum(streaks.best)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenHabitModal(habit.id)}
                        aria-label={`ویرایش عادت «${habit.title}»`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 transition cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDeleteModal(habit.id, habit.title)}
                        aria-label={`حذف عادت «${habit.title}»`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Compact 7-day row */}
                  <div className="grid grid-cols-7 gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                    {weekDays.map((d) => {
                      const isChecked = !!habit.completedDates[d.key];
                      const isBeforeStart = Boolean(habit.startDate && d.key < habit.startDate);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          disabled={d.isFuture}
                          onClick={() => onToggleHabitDay(habit.id, d.key)}
                          className={`py-1.5 rounded-xl flex flex-col items-center justify-center text-[10px] font-bold transition ${
                            d.isFuture
                              ? 'opacity-30 cursor-not-allowed bg-slate-100 dark:bg-slate-800'
                              : isChecked
                              ? 'text-white'
                              : isBeforeStart
                              ? 'opacity-45 bg-slate-100 dark:bg-slate-800/50 text-slate-400'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700'
                          }`}
                          style={isChecked ? { backgroundColor: habit.color } : undefined}
                        >
                          <span>{d.weekdayName}</span>
                          <span className="tabular-nums mt-0.5">{d.dayNumber}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      پیشرفت هفتگی: {toPersianNum(weekDoneCount)} از {toPersianNum(goal)} روز
                    </span>
                    {habit.startDate && (
                      <span>شروع: {formatDateKeyToPersian(habit.startDate)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Desktop Table of Habits (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[760px] text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800/80 text-xs text-slate-400 font-medium">
                <th className="py-3 pl-4 w-72 text-right font-bold text-slate-600 dark:text-slate-300">
                  عنوان عادت
                </th>
                {weekDays.map((d) => (
                  <th key={d.key} className="py-3 px-2 text-center">
                    <div
                      className={`inline-flex flex-col items-center px-2.5 py-1 rounded-xl ${
                        d.isToday
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black ring-1 ring-indigo-500/30'
                          : ''
                      }`}
                    >
                      <span className="text-[11px]">{d.weekdayName}</span>
                      <span className="text-xs font-bold mt-0.5">{d.dayNumber}</span>
                    </div>
                  </th>
                ))}
                <th className="py-3 px-3 text-center">پیشرفت هفتگی</th>
                <th className="py-3 px-3 text-center">زنجیرهٔ فعلی / رکورد</th>
                <th className="py-3 pr-2 text-left w-20">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredHabits.map((habit) => {
                const catInfo = HABIT_CATEGORIES[habit.category] || HABIT_CATEGORIES.all;
                const streaks = calculateStreaks(
                  habit.completedDates,
                  new Date(),
                  habit.weeklyGoal,
                  { startDate: habit.startDate }
                );
                const weekDoneCount = weekDays.filter((d) => habit.completedDates[d.key]).length;
                const goal = habit.weeklyGoal || 7;
                const windowRate = calculateHabitWindowRate(habit, weekKeys, todayKey);
                const goalPercent =
                  weekOffset === 0
                    ? windowRate.ratePercent
                    : Math.min(Math.round((weekDoneCount / goal) * 100), 100);

                return (
                  <tr
                    key={habit.id}
                    className="habit-row group hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-4 pl-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 shadow-sm"
                          style={{
                            backgroundColor: `${habit.color}18`,
                            border: `1px solid ${habit.color}35`,
                          }}
                        >
                          {habit.emoji}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                            {habit.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                              style={{
                                backgroundColor: `${catInfo.color}15`,
                                color: catInfo.color,
                              }}
                            >
                              {catInfo.label}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              هدف: {toPersianNum(goal)} روز در هفته
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {weekDays.map((d) => {
                      const isChecked = !!habit.completedDates[d.key];
                      const isBeforeStart = Boolean(habit.startDate && d.key < habit.startDate);
                      return (
                        <td key={d.key} className="py-4 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => onToggleHabitDay(habit.id, d.key)}
                            disabled={d.isFuture}
                            title={
                              d.isFuture
                                ? 'روزهای آینده قابل ثبت نیستند'
                                : isBeforeStart
                                ? `${d.weekdayFull} ${d.dayNumber} ${d.monthName} (پیش از تاریخ شروع عادت)`
                                : `${d.weekdayFull} ${d.dayNumber} ${d.monthName}`
                            }
                            className={`w-9 h-9 rounded-xl mx-auto flex items-center justify-center transition-all duration-200 ${
                              d.isFuture
                                ? 'opacity-25 cursor-not-allowed bg-slate-100 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700'
                                : isChecked
                                ? 'text-white shadow-md scale-100 hover:opacity-90 animate-pop cursor-pointer'
                                : isBeforeStart
                                ? 'opacity-45 bg-slate-100/70 dark:bg-slate-800/40 text-transparent hover:text-slate-400 cursor-pointer'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-transparent hover:text-slate-400 cursor-pointer'
                            }`}
                            style={
                              isChecked
                                ? {
                                    backgroundColor: habit.color,
                                    boxShadow: `0 4px 12px -2px ${habit.color}66`,
                                  }
                                : undefined
                            }
                          >
                            <Check className="w-5 h-5 stroke-[3]" />
                          </button>
                        </td>
                      );
                    })}

                    <td className="py-4 px-3">
                      <div className="w-28 mx-auto space-y-1">
                        <div className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {toPersianNum(weekDoneCount)}/{toPersianNum(goal)}
                          </span>
                          <span className="text-slate-400">{toPersianNum(goalPercent)}٪</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${goalPercent}%`,
                              backgroundColor: habit.color,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <div
                          className={`flex items-center gap-1 font-black text-xs ${
                            streaks.current > 0 ? 'text-amber-500' : 'text-slate-400'
                          }`}
                        >
                          <Flame
                            className={`w-4 h-4 ${
                              streaks.current > 0 ? 'fill-amber-500/20' : ''
                            }`}
                          />
                          <span>فعلی: {toPersianNum(streaks.current)} روز</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          بهترین رکورد: {toPersianNum(streaks.best)} روز
                        </span>
                      </div>
                    </td>

                    <td className="py-4 pr-2 text-left">
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => onOpenHabitModal(habit.id)}
                          title="ویرایش عادت"
                          aria-label={`ویرایش عادت «${habit.title}»`}
                          className="p-2 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDeleteModal(habit.id, habit.title)}
                          title="حذف عادت"
                          aria-label={`حذف عادت «${habit.title}»`}
                          className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredHabits.length === 0 && (
          <div
            data-testid="habits-empty-state"
            className="py-12 px-4 text-center space-y-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 mt-3"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 mx-auto flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                {habits.length === 0
                  ? 'هنوز هیچ عادتی ثبت نشده است'
                  : 'هیچ عادتی با فیلتر یا جست‌وجوی فعلی مطابقت ندارد'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                {habits.length === 0
                  ? 'برای شروع پیگیری عادت‌ها، اولین عادت روزانه یا هفتگی خود را ایجاد کنید.'
                  : 'می‌توانید فیلتر دسته‌بندی یا عبارت جست‌وجو را پاک کنید یا عادت جدیدی بسازید.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenHabitModal()}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                افزودن عادت جدید
              </button>
              {(selectedCategory !== 'all' || searchQuery.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-2 bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  پاک کردن فیلترها
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
