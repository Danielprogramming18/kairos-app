import React, { useState, useRef, useEffect } from 'react';
import {
  Bookmark,
  Plus,
  Search,
  Copy,
  Check,
  Pin,
  Trash2,
  Edit3,
  Link2,
  Code2,
  Briefcase,
  UserCheck,
  X,
  Lightbulb,
} from 'lucide-react';
import { UsefulInfoItem, UsefulInfoCategory, Idea, Task } from '../types';
import { toPersianNum } from '../utils/persianDate';
import { NotesAndIdeasView } from './NotesAndIdeasView';

const NOTE_DRAFT_STORAGE_KEY = 'kairos_note_draft_v1';

interface UsefulInfoViewProps {
  items: UsefulInfoItem[];
  onAddItem: (data: Omit<UsefulInfoItem, 'id' | 'createdAt'>) => Promise<boolean> | boolean | void;
  onUpdateItem: (id: string, data: Partial<UsefulInfoItem>) => Promise<boolean> | boolean | void;
  onDeleteItem: (id: string) => void;
  // Unified Ideas tab support
  ideas?: Idea[];
  tasks?: Task[];
  onAddIdea?: (idea: Omit<Idea, 'id' | 'createdAt'>) => Promise<boolean> | boolean | void;
  onUpdateIdea?: (id: string, data: Partial<Idea>) => Promise<boolean> | boolean | void;
  onConvertIdeaToTask?: (ideaId: string) => void;
  onDeleteIdea?: (ideaId: string) => void;
  initialSubTab?: 'notes' | 'ideas';
}

const CATEGORY_META: Record<
  UsefulInfoCategory,
  { label: string; colorClass: string; icon: React.FC<{ className?: string }> }
> = {
  work: {
    label: 'کاری و چک‌لیست',
    colorClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    icon: Briefcase,
  },
  links: {
    label: 'لینک و مرجع',
    colorClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    icon: Link2,
  },
  code: {
    label: 'کد و دستورالعمل',
    colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    icon: Code2,
  },
  personal: {
    label: 'شخصی و ضروری',
    colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    icon: UserCheck,
  },
};

function isSafeExternalUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

export const UsefulInfoView: React.FC<UsefulInfoViewProps> = ({
  items,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  ideas,
  tasks = [],
  onAddIdea,
  onUpdateIdea,
  onConvertIdeaToTask,
  onDeleteIdea,
  initialSubTab = 'notes',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'notes' | 'ideas'>(initialSubTab);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const [title, setTitle] = useState(() => {
    try {
      const saved = sessionStorage.getItem(NOTE_DRAFT_STORAGE_KEY);
      if (saved) return JSON.parse(saved).title || '';
    } catch {
      // ignore
    }
    return '';
  });
  const [content, setContent] = useState(() => {
    try {
      const saved = sessionStorage.getItem(NOTE_DRAFT_STORAGE_KEY);
      if (saved) return JSON.parse(saved).content || '';
    } catch {
      // ignore
    }
    return '';
  });
  const [category, setCategory] = useState<UsefulInfoCategory>(() => {
    try {
      const saved = sessionStorage.getItem(NOTE_DRAFT_STORAGE_KEY);
      if (saved) return JSON.parse(saved).category || 'work';
    } catch {
      // ignore
    }
    return 'work';
  });
  const [pinned, setPinned] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmCancelEdit, setConfirmCancelEdit] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<UsefulInfoCategory | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingId) {
      try {
        sessionStorage.setItem(
          NOTE_DRAFT_STORAGE_KEY,
          JSON.stringify({ title, content, category })
        );
      } catch {
        // ignore
      }
    }
  }, [title, content, category, editingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isSaving) return;

    setIsSaving(true);
    try {
      let ok: boolean | void = true;
      if (editingId) {
        ok = await onUpdateItem(editingId, {
          title: title.trim(),
          content: content.trim(),
          category,
          pinned,
          updatedAt: new Intl.DateTimeFormat('fa-IR', {
            month: 'short',
            day: 'numeric',
          }).format(new Date()),
        });
        if (ok !== false) {
          setEditingId(null);
          setConfirmCancelEdit(false);
        }
      } else {
        ok = await onAddItem({
          title: title.trim(),
          content: content.trim(),
          category,
          pinned,
        });
      }

      if (ok !== false) {
        setTitle('');
        setContent('');
        setCategory('work');
        setPinned(false);
        try {
          sessionStorage.removeItem(NOTE_DRAFT_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (item: UsefulInfoItem) => {
    setEditingId(item.id);
    setConfirmCancelEdit(false);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category);
    setPinned(!!item.pinned);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = (force = false) => {
    if (!force && editingId) {
      const original = items.find((i) => i.id === editingId);
      const isDirty =
        original &&
        (title.trim() !== original.title.trim() ||
          content.trim() !== original.content.trim() ||
          category !== original.category ||
          pinned !== !!original.pinned);
      if (isDirty && !confirmCancelEdit) {
        setConfirmCancelEdit(true);
        return;
      }
    }
    setEditingId(null);
    setConfirmCancelEdit(false);
    setTitle('');
    setContent('');
    setCategory('work');
    setPinned(false);
  };

  const handleCopyContent = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard failed or denied
    }
  };

  const filteredItems = items
    .filter((item) => {
      const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMoreItems = filteredItems.length > visibleCount;

  const hasIdeasSupport = Boolean(ideas && onAddIdea && onConvertIdeaToTask && onDeleteIdea);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Unified Sub-Tab Switcher (Notes & References vs Ideas) */}
      {hasIdeasSupport && (
        <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSubTab('notes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'notes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>یادداشت‌ها و مراجع ({toPersianNum(items.length)})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('ideas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'ideas'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Lightbulb className="w-4 h-4" />
              <span>ایده‌ها ({toPersianNum(ideas?.length ?? 0)})</span>
            </button>
          </div>
          <span className="hidden sm:inline text-[11px] text-slate-400 pl-2">
            ذخیرهٔ آفلاین یادداشت‌ها، لینک‌ها و ایده‌های قابل تبدیل به کار
          </span>
        </div>
      )}

      {activeSubTab === 'ideas' && hasIdeasSupport && ideas && onAddIdea && onConvertIdeaToTask && onDeleteIdea ? (
        <NotesAndIdeasView
          ideas={ideas}
          tasks={tasks}
          onAddIdea={onAddIdea}
          onUpdateIdea={onUpdateIdea}
          onConvertIdeaToTask={onConvertIdeaToTask}
          onDeleteIdea={onDeleteIdea}
        />
      ) : (
        <>
          {/* Header & Quick Add Form */}
          <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-indigo-500" />
                  <span>یادداشت‌ها و مراجع کاربردی</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold tabular-nums">
                    {toPersianNum(items.length)} مورد
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  محلی برای نگهداری نکات مهم، دستورات، لینک‌های پرکاربرد و چک‌لیست‌هایی که همیشه به آن‌ها نیاز دارید.
                </p>
              </div>
              {editingId && (
                <div className="flex items-center gap-2 self-start sm:self-center">
                  {confirmCancelEdit ? (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-xl text-xs">
                      <span className="text-amber-700 dark:text-amber-300 font-bold">
                        تغییرات ذخیره نشده است. لغو شود؟
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCancelEdit(true)}
                        className="px-2 py-0.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                      >
                        بله
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelEdit(false)}
                        className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                      >
                        ادامه ویرایش
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCancelEdit(false)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1 hover:bg-slate-200 transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>انصراف از ویرایش</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label
                    htmlFor="useful-info-title-input"
                    className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    عنوان یادداشت
                  </label>
                  <input
                    id="useful-info-title-input"
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثلاً: دستورات گیت، لینک‌های پروژه، چک‌لیست انتشار یا نکتهٔ مهم..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="useful-info-category-select"
                    className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    دسته‌بندی
                  </label>
                  <select
                    id="useful-info-category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as UsefulInfoCategory)}
                    aria-label="دسته‌بندی یادداشت"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="work">کاری و چک‌لیست</option>
                    <option value="links">لینک و مرجع</option>
                    <option value="code">کد و دستورالعمل</option>
                    <option value="personal">شخصی و ضروری</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="useful-info-content-textarea"
                  className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  متن، جزئیات، کد یا لینک‌ها
                </label>
                <textarea
                  id="useful-info-content-textarea"
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="متن کامل، لینک‌ها، کدها یا نکات مهم را اینجا وارد کنید..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="rounded accent-indigo-600 w-4 h-4"
                  />
                  <Pin className="w-3.5 h-3.5 text-amber-500" />
                  <span>سنجاق شدن در بالای فهرست</span>
                </label>

                <button
                  type="submit"
                  disabled={!title.trim() || !content.trim() || isSaving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {isSaving
                      ? 'در حال ذخیره...'
                      : editingId
                      ? 'ذخیرهٔ تغییرات'
                      : 'ثبت یادداشت'}
                  </span>
                </button>
              </div>
            </form>
          </section>

          {/* Search & Category Filter Bar */}
          <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جست‌وجو در عنوان یا متن یادداشت‌ها..."
                className="w-full pr-10 pl-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                همه ({toPersianNum(items.length)})
              </button>
              {(Object.keys(CATEGORY_META) as UsefulInfoCategory[]).map((catKey) => {
                const meta = CATEGORY_META[catKey];
                const isSelected = selectedCategory === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setSelectedCategory(catKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Cards Grid */}
          {filteredItems.length === 0 ? (
            <div
              data-testid="notes-empty-state"
              className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200/70 dark:border-slate-800 text-center space-y-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 mx-auto flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Bookmark className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                  {items.length === 0
                    ? 'هنوز هیچ یادداشتی ثبت نشده است'
                    : 'موردی با فیلتر یا جست‌وجوی فعلی یافت نشد'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  {items.length === 0
                    ? 'دستورات، لینک‌های پرکاربرد، چک‌لیست‌ها یا نکات مهم خود را ذخیره کنید تا همیشه آفلاین در دسترس باشند.'
                    : 'می‌توانید فیلتر دسته‌بندی یا عبارت جست‌وجو را پاک کنید یا یک یادداشت جدید بسازید.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    titleInputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  ثبت یادداشت جدید
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
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleItems.map((item) => {
                  const meta = CATEGORY_META[item.category] || CATEGORY_META.work;
                  const CatIcon = meta.icon;
                  const isCopied = copiedId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 shadow-sm ${
                        item.pinned
                          ? 'border-amber-500/40 dark:border-amber-500/30 ring-1 ring-amber-500/10'
                          : 'border-slate-200/70 dark:border-slate-800'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${meta.colorClass}`}
                            >
                              <CatIcon className="w-3 h-3" />
                              <span>{meta.label}</span>
                            </span>
                            {item.pinned && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                <Pin className="w-3 h-3" />
                                <span>سنجاق‌شده</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onUpdateItem(item.id, { pinned: !item.pinned })}
                              title={item.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن به بالا'}
                              aria-label={
                                item.pinned
                                  ? `برداشتن سنجاق «${item.title}»`
                                  : `سنجاق کردن «${item.title}»`
                              }
                              className={`p-1.5 rounded-xl transition cursor-pointer ${
                                item.pinned
                                  ? 'bg-amber-500/15 text-amber-500'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-amber-500'
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              title="ویرایش"
                              aria-label={`ویرایش یادداشت «${item.title}»`}
                              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteItem(item.id)}
                              title="حذف"
                              aria-label={`حذف یادداشت «${item.title}»`}
                              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white leading-snug">
                          {item.title}
                        </h3>

                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800/80 text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {item.content
                            .split(/((?:https?:\/\/|mailto:)[^\s]+)/g)
                            .map((part, idx) =>
                              /^(?:https?:\/\/|mailto:)[^\s]+$/.test(part) &&
                              isSafeExternalUrl(part) ? (
                                <a
                                  key={idx}
                                  href={part}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  dir="ltr"
                                  className="text-indigo-600 dark:text-indigo-400 underline break-all font-mono"
                                >
                                  {part}
                                </a>
                              ) : (
                                <React.Fragment key={idx}>{part}</React.Fragment>
                              )
                            )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400">
                        <span>ثبت: {item.updatedAt || item.createdAt}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyContent(item.id, item.content)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>کپی شد!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>کپی متن</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMoreItems && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 50)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    نمایش موارد بیشتر ({toPersianNum(filteredItems.length - visibleCount)} مورد دیگر)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
