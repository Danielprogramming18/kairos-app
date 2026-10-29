import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  RotateCcw,
  CheckCircle2,
  Split,
  ShieldAlert,
  CalendarCheck,
  Plus,
} from 'lucide-react';
import { Task, Habit, ChatMessage } from '../types';
import { toPersianNum, toEnglishNum, getTodayKey, getTomorrowKey } from '../utils/persianDate';
import { generateLocalCoachResponse } from '../utils/localCoach';

interface AIAssistantViewProps {
  tasks: Task[];
  habits: Habit[];
  onAddTasksBatch: (newTasks: Array<Omit<Task, 'id' | 'completed'>>) => void;
  onSwitchTab: (tab: any) => void;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  tasks,
  habits,
  onAddTasksBatch,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'local_coach' | 'ivy_wizard'>('local_coach');

  // Local Smart Coach State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text:
        'سلام دانیال جان! 👋 من دستیار هوشمند «کایروس» هستم (موتور هوشمند محلی بدون نیاز به اینترنت یا کلید API). می‌تونم در تقسیم پروژه‌های بزرگ به مراحل کوچک، غلبه بر اهمال‌کاری، یا چیدن یک برنامه روزانه دقیق و بدون استرس کمکت کنم. چه موضوعی در اولویت ذهنت است؟',
      timestamp: Date.now(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Ivy Lee Wizard State (BUG-13: initialize priorityCounter from existing today tasks)
  const computeNextPriority = () => {
    const todayKey = getTodayKey();
    const todayTasks = tasks.filter((t) => t.targetDate === todayKey && !t.completed);
    const maxExisting = todayTasks.reduce((max, t) => Math.max(max, Number(t.priority) || 0), 0);
    return Math.min(20, Math.max(1, maxExisting + 1));
  };

  const [wizardStep, setWizardStep] = useState<'ASK_TITLE' | 'ASK_DESC' | 'ASK_TIME' | 'ASK_MORE'>('ASK_TITLE');
  const [priorityCounter, setPriorityCounter] = useState<number>(() => computeNextPriority());
  const [draftTask, setDraftTask] = useState<{ title: string; description?: string; priority: number; duration?: number }>(() => ({
    title: '',
    priority: computeNextPriority(),
  }));
  const [collectedTasks, setCollectedTasks] = useState<Array<{ title: string; description?: string; priority: number; duration: number }>>([]);
  const [wizardChat, setWizardChat] = useState<Array<{ sender: 'bot' | 'user'; text: string }>>([
    {
      sender: 'bot',
      text:
        'سلام دانیال جان! 👋 بیا با متد علمی The One Thing مغزت رو از هرج‌ومرج و عذاب وجدان نجات بدیم.\n\nتصور کن فقط یک کار رو می‌تونستی امروز انجام بدی که بیشترین اثر رو داره؛ اون کار چیه؟ (می‌شه اولویت بعدی تو)',
    },
  ]);
  const [wizardInput, setWizardInput] = useState('');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, wizardChat]);

  // Handle Local Coach Message Submit (100% Client-Side, GitHub Pages Ready)
  const handleLocalCoachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    const result = generateLocalCoachResponse(trimmed, tasks, habits);
    const botMsg: ChatMessage = {
      id: 'bot_' + (Date.now() + 1),
      sender: 'assistant',
      text: result.reply,
      suggestedTasks: result.suggestedTasks,
      timestamp: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInputMessage('');
  };

  // Quick prompt chips
  const handlePromptChip = (text: string) => {
    setInputMessage(text);
  };

  // Wizard Logic
  const handleWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = wizardInput.trim();
    if (!val && wizardStep !== 'ASK_DESC') return;

    if (val) {
      setWizardChat((prev) => [...prev, { sender: 'user', text: val }]);
    }
    setWizardInput('');

    if (wizardStep === 'ASK_TITLE') {
      setDraftTask({
        title: val,
        priority: priorityCounter,
      });
      setWizardStep('ASK_DESC');
      setWizardChat((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `عالیه! ثبت شد به عنوان اولویت ${toPersianNum(priorityCounter)}.\nحالا اگر توضیح یا جزئیاتی برای «${val}» داری بنویس یا دکمه رد شدن را بزن:`,
        },
      ]);
    } else if (wizardStep === 'ASK_DESC') {
      proceedToTimeStep(val || '-');
    } else if (wizardStep === 'ASK_TIME') {
      const num = parseInt(toEnglishNum(val), 10);
      if (isNaN(num) || num <= 0) {
        setWizardChat((prev) => [
          ...prev,
          {
            sender: 'bot',
            text: 'دانیال جان، لطفاً زمان را به صورت عدد (دقیقه) وارد کن؛ مثلاً 45 یا 60:',
          },
        ]);
        return;
      }
      finishDraftTask(num);
    }
  };

  const proceedToTimeStep = (desc: string) => {
    setDraftTask((prev) => ({ ...prev, description: desc }));
    setWizardStep('ASK_TIME');
    setWizardChat((prev) => [
      ...prev,
      {
        sender: 'bot',
        text: `برای اولویت ${toPersianNum(priorityCounter)} (${draftTask.title}) چند دقیقه سهمیه زمانی در نظر بگیریم؟`,
      },
    ]);
  };

  const finishDraftTask = (durationMin: number) => {
    const completedDraft = {
      title: draftTask.title,
      description: draftTask.description,
      priority: draftTask.priority,
      duration: durationMin,
    };
    setCollectedTasks((prev) => [...prev, completedDraft]);
    setWizardStep('ASK_MORE');
    setWizardChat((prev) => [
      ...prev,
      {
        sender: 'bot',
        text: `✅ اولویت ${toPersianNum(completedDraft.priority)}: ${completedDraft.title} (${toPersianNum(durationMin)} دقیقه) آماده شد.\nآیا کار دیگری هست که بخواهی به عنوان اولویت ${toPersianNum(priorityCounter + 1)} اضافه کنی؟`,
      },
    ]);
  };

  const finalizeWizardPlan = (targetDay: 'today' | 'tomorrow') => {
    const targetDate = targetDay === 'tomorrow' ? getTomorrowKey() : getTodayKey();
    const batch = collectedTasks.map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.priority,
      duration: item.duration,
      targetDate,
      category: 'work',
    }));
    onAddTasksBatch(batch);
    setWizardChat((prev) => [
      ...prev,
      {
        sender: 'bot',
        text: `🎉 ${toPersianNum(batch.length)} مأموریت با موفقیت برای «${targetDay === 'tomorrow' ? 'فردا' : 'امروز'}» به میز کارت اضافه شد!`,
      },
    ]);
    setWizardStep('ASK_TITLE');
    setPriorityCounter(1);
    setCollectedTasks([]);
  };

  const resetWizard = () => {
    setWizardStep('ASK_TITLE');
    setPriorityCounter(1);
    setDraftTask({ title: '', priority: 1 });
    setCollectedTasks([]);
    setWizardChat([
      {
        sender: 'bot',
        text:
          'سلام مجدد دانیال جان! 👋 اولویت شماره ۱ تو چیه که اگر فقط همین کار رو انجام بدی روزت موفقه؟',
      },
    ]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Sub-tabs header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('local_coach')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'local_coach'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>دستیار و مربی هوشمند کایروس (لوکال)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ivy_wizard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'ivy_wizard'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ویزارد تعاملی اولویت‌بندی (Ivy Lee)</span>
          </button>
        </div>
      </div>

      {/* Sub-tab 1: Local Smart Coach */}
      {activeSubTab === 'local_coach' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm overflow-hidden flex flex-col h-[70vh] min-h-[500px]">
          {/* Header */}
          <div className="px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-md">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  دستیار هوشمند محلی کایروس
                </h3>
                <p className="text-[11px] text-slate-400">
                  پردازش فوری و ۱۰۰٪ آفلاین روی مرورگر (بدون نیاز به API خارجی)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'init',
                    sender: 'assistant',
                    text: 'گفت‌وگو از نو شروع شد. دانیال جان، در چه زمینه‌ای می‌تونم کمکت کنم؟',
                    timestamp: Date.now(),
                  },
                ])
              }
              title="پاک کردن تاریخچه گفت‌وگو"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Prompts Chips */}
          <div className="px-5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] text-slate-400 whitespace-nowrap pl-1">پیشنهادات سریع:</span>
            <button
              type="button"
              onClick={() =>
                handlePromptChip('لطفاً پروژه بزرگ ساخت نرم‌افزار CRM مغازه رو به چند مرحله ۲۰ تا ۴۵ دقیقه‌ای تقسیم کن.')
              }
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-500 whitespace-nowrap cursor-pointer"
            >
              <Split className="w-3 h-3 inline-block ml-1" />
              تقسیم کار به مراحل کوچک
            </button>
            <button
              type="button"
              onClick={() =>
                handlePromptChip('امروز حسابی بی‌انرژی و دچار اهمال‌کاری شدم، یک راهکار سریع برای شروع اولین قدم چی داری؟')
              }
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-500 whitespace-nowrap cursor-pointer"
            >
              <ShieldAlert className="w-3 h-3 inline-block ml-1" />
              غلبه بر اهمال‌کاری
            </button>
            <button
              type="button"
              onClick={() =>
                handlePromptChip('بر اساس کارهای ناتمام امروز من، یک چینش بهینه زمانی برای بعدازظهر تا شب پیشنهاد بده.')
              }
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-500 whitespace-nowrap cursor-pointer"
            >
              <CalendarCheck className="w-3 h-3 inline-block ml-1" />
              بهینه‌سازی برنامه امروز
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                  }`}
                >
                  {m.sender === 'user' ? 'دانیال' : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed space-y-3 ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tl-none font-medium shadow-md shadow-indigo-600/20'
                      : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-tr-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {m.suggestedTasks && m.suggestedTasks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          مأموریت‌های پیشنهادی دستیار:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const todayKey = getTodayKey();
                            const newTasks = m.suggestedTasks!.map((st, i) => ({
                              title: st.title,
                              description: st.description || 'پیشنهاد دستیار هوشمند کایروس',
                              priority: st.priority || i + 1,
                              duration: st.duration || 45,
                              targetDate: todayKey,
                              category: 'work',
                            }));
                            onAddTasksBatch(newTasks);
                          }}
                          className="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>افزودن به میز کار</span>
                        </button>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {m.suggestedTasks.map((t, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                          >
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              اولویت {toPersianNum(t.priority || idx + 1)}: {t.title}
                            </span>
                            <span className="text-[11px] text-indigo-500 font-semibold">
                              {toPersianNum(t.duration)} دقیقه
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Form */}
          <form
            onSubmit={handleLocalCoachSubmit}
            className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="سؤال یا درخواست برنامه‌ریزی خود را بنویسید..."
              className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition shrink-0 cursor-pointer"
            >
              <span>ارسال</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Sub-tab 2: Traditional Ivy Lee Wizard */}
      {activeSubTab === 'ivy_wizard' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm overflow-hidden flex flex-col h-[70vh] min-h-[500px]">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">
                  ویزارد اولویت‌بندی (Ivy Lee & The One Thing)
                </h3>
                <p className="text-[11px] text-slate-400">
                  چینش گام‌به‌گام کارها از اولویت ۱ تا آخر به همراه زمان‌بندی
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetWizard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>شروع مجدد</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {wizardChat.map((m, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-500/10 text-indigo-500'
                  }`}
                >
                  {m.sender === 'user' ? 'دانیال' : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`max-w-[85%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tl-none font-semibold shadow-md shadow-indigo-600/20'
                      : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-tr-none'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {wizardStep === 'ASK_DESC' && (
            <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => proceedToTimeStep('-')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 cursor-pointer"
              >
                رد شدن (بدون توضیح)
              </button>
            </div>
          )}

          {wizardStep === 'ASK_TIME' && (
            <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
              {[30, 45, 60, 90].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => finishDraftTask(mins)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 cursor-pointer"
                >
                  {toPersianNum(mins)} دقیقه
                </button>
              ))}
            </div>
          )}

          {wizardStep === 'ASK_MORE' && (
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPriorityCounter((p) => p + 1);
                  setWizardStep('ASK_TITLE');
                  setWizardChat((prev) => [
                    ...prev,
                    {
                      sender: 'bot',
                      text: `خب دانیال جان، بعد از کارهای قبلی اولویت شماره ${toPersianNum(priorityCounter + 1)} تو چیه؟`,
                    },
                  ]);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 cursor-pointer"
              >
                ➕ ثبت اولویت {toPersianNum(priorityCounter + 1)}
              </button>
              <button
                type="button"
                onClick={() => finalizeWizardPlan('today')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                🚀 ذخیره برای امروز
              </button>
              <button
                type="button"
                onClick={() => finalizeWizardPlan('tomorrow')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-md cursor-pointer"
              >
                🌙 ذخیره برای برنامه فردا
              </button>
            </div>
          )}

          <form
            onSubmit={handleWizardSubmit}
            className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={wizardInput}
              onChange={(e) => setWizardInput(e.target.value)}
              placeholder={
                wizardStep === 'ASK_TITLE'
                  ? `عنوان اولویت ${toPersianNum(priorityCounter)} را بنویسید...`
                  : wizardStep === 'ASK_DESC'
                  ? 'توضیحات تکمیلی کار...'
                  : wizardStep === 'ASK_TIME'
                  ? 'سهمیه زمان به دقیقه (مثلاً 45)...'
                  : 'یک گزینه از بالا انتخاب کنید...'
              }
              disabled={wizardStep === 'ASK_MORE'}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            <button
              type="submit"
              disabled={wizardStep === 'ASK_MORE'}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition shrink-0 cursor-pointer"
            >
              <span>ارسال</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
