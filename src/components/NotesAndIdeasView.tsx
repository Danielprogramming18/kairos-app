import React, { useState, useRef } from 'react';
import { Lightbulb, Plus, Trash2, ArrowUpRight, Search, Edit3, X, Check } from 'lucide-react';
import { Idea, IdeaCategory, Task } from '../types';
import { toPersianNum } from '../utils/persianDate';

export const IDEA_CATEGORIES: Record<string, { label: string; color: string }> = {
  all: { label: 'همه ایده‌ها', color: '#6366f1' },
  project: { label: 'پروژه و کدنویسی 💻', color: '#8b5cf6' },
  learning: { label: 'آموزش و مهارت 📚', color: '#3b82f6' },
  business: { label: 'کسب‌وکار و محتوا 💼', color: '#10b981' },
  personal: { label: 'شخصی و تفریح 🎸', color: '#f59e0b' },
};

interface NotesAndIdeasViewProps {
  ideas: Idea[];
  tasks?: Task[];
  onAddIdea: (idea: Omit<Idea, 'id' | 'createdAt'>) => void;
  onUpdateIdea?: (id: string, data: Partial<Idea>) => void;
  onConvertIdeaToTask: (ideaId: string) => void;
  onDeleteIdea: (ideaId: string) => void;
}

export const NotesAndIdeasView: React.FC<NotesAndIdeasViewProps> = ({
  ideas,
  tasks = [],
  onAddIdea,
  onUpdateIdea,
  onConvertIdeaToTask,
  onDeleteIdea,
}) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('project');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingId && onUpdateIdea) {
      onUpdateIdea(editingId, {
        title: title.trim(),
        note: note.trim() || undefined,
        category,
      });
      setEditingId(null);
    } else {
      onAddIdea({
        title: title.trim(),
        note: note.trim() || undefined,
        category,
      });
    }
    setTitle('');
    setNote('');
  };

  const handleStartEdit = (idea: Idea) => {
    setEditingId(idea.id);
    setTitle(idea.title);
    setNote(idea.note || '');
    setCategory(idea.category);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setNote('');
    setCategory('project');
  };

  const filteredIdeas = ideas.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      (item.note && item.note.toLowerCase().includes(searchQuery.trim().toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const visibleIdeas = filteredIdeas.slice(0, visibleCount);
  const hasMoreIdeas = filteredIdeas.length > visibleCount;

  return (
    <div className="space-y-6">
      {/* 1. Fast Add / Edit Idea Form */}
      <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <span>بانک ایده‌ها (تخلیه بار شناختی ذهن)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              هر ایده، پروژه یا آموزشی که به ذهنت می‌رسد را با دسته‌بندی اینجا ثبت کن تا ذهنت هنگام تمرکز درگیرش نماند.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>انصراف از ویرایش</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
          <div className="md:col-span-5">
            <input
              ref={titleInputRef}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان ایده یا پروژه..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>
          <div className="md:col-span-4">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="توضیح کوتاه یا منبع (اختیاری)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>
          <div className="md:col-span-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IdeaCategory)}
              aria-label="دسته‌بندی ایده"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            >
              <option value="project">پروژه و کدنویسی 💻</option>
              <option value="learning">آموزش و مهارت 📚</option>
              <option value="business">کسب‌وکار و محتوا 💼</option>
              <option value="personal">شخصی و تفریح 🎸</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <button
              type="submit"
              className="w-full h-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{editingId ? 'ذخیره' : 'ثبت'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* 2. Filters & Search */}
      <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {Object.entries(IDEA_CATEGORIES).map(([key, info]) => {
              const active = selectedCategory === key;
              const count =
                key === 'all'
                  ? ideas.length
                  : ideas.filter((i) => i.category === key).length;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <span>{info.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    {toPersianNum(count)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در ایده‌ها..."
              className="w-full sm:w-48 pr-9 pl-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Ideas Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleIdeas.map((idea) => {
            const cat = IDEA_CATEGORIES[idea.category] || IDEA_CATEGORIES.project;
            const alreadyConverted = tasks.some(
              (t) => t.title.trim() === idea.title.trim()
            );

            return (
              <div
                key={idea.id}
                className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex flex-col justify-between gap-4 hover:-translate-y-0.5 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg"
                      style={{
                        backgroundColor: `${cat.color}18`,
                        color: cat.color,
                      }}
                    >
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{idea.createdAt}</span>
                  </div>
                  <h4 className="text-sm font-black text-slate-800 dark:text-white leading-snug">
                    {idea.title}
                  </h4>
                  {idea.note && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {idea.note}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60 dark:border-slate-700/50">
                  <button
                    type="button"
                    onClick={() => onConvertIdeaToTask(idea.id)}
                    className={`text-xs font-bold flex items-center gap-1 cursor-pointer ${
                      alreadyConverted
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-indigo-600 dark:text-indigo-400 hover:underline'
                    }`}
                  >
                    {alreadyConverted ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>در لیست کارها موجود است</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>تبدیل به مأموریت میز کار</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    {onUpdateIdea && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(idea)}
                        title="ویرایش ایده"
                        aria-label={`ویرایش ایده «${idea.title}»`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteIdea(idea.id)}
                      title="حذف ایده"
                      aria-label={`حذف ایده «${idea.title}»`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredIdeas.length === 0 && (
            <div
              data-testid="ideas-empty-state"
              className="col-span-full py-12 px-4 text-center space-y-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 mx-auto flex items-center justify-center text-amber-500">
                <Lightbulb className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                  {ideas.length === 0
                    ? 'بانک ایده‌های شما خالی است'
                    : 'هیچ ایده‌ای با فیلتر یا جستجوی فعلی یافت نشد'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {ideas.length === 0
                    ? 'ایده‌ها و جرقه‌های ذهنی خود را اینجا ثبت کنید تا هنگام تمرکز عمیق، ذهن شما آرام بماند.'
                    : 'می‌توانید فیلتر دسته‌بندی یا عبارت جستجو را پاک کنید یا ایده جدیدی ثبت نمایید.'}
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
                  ثبت اولین ایده
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
        </div>

        {hasMoreIdeas && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 50)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              نمایش موارد بیشتر ({toPersianNum(filteredIdeas.length - visibleCount)} مورد دیگر)
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
