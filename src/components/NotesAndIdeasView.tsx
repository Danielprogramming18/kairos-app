import React, { useState } from 'react';
import { Lightbulb, Plus, Trash2, ArrowUpRight, Search, Tag } from 'lucide-react';
import { Idea, IdeaCategory } from '../types';
import { toPersianNum } from '../utils/persianDate';

export const IDEA_CATEGORIES: Record<string, { label: string; color: string }> = {
  all: { label: 'همه ایده‌ها', color: '#6366f1' },
  project: { label: 'پروژه و کدنویسی 💻', color: '#8b5cf6' },
  learning: { label: 'آموزش و مهارت 📚', color: '#3b82f6' },
  business: { label: 'مغازه و ایتا 💼', color: '#10b981' },
  personal: { label: 'شخصی و تفریح 🎸', color: '#f59e0b' },
};

interface NotesAndIdeasViewProps {
  ideas: Idea[];
  onAddIdea: (idea: Omit<Idea, 'id' | 'createdAt'>) => void;
  onConvertIdeaToTask: (ideaId: string) => void;
  onDeleteIdea: (ideaId: string) => void;
}

export const NotesAndIdeasView: React.FC<NotesAndIdeasViewProps> = ({
  ideas,
  onAddIdea,
  onConvertIdeaToTask,
  onDeleteIdea,
}) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('project');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddIdea({
      title: title.trim(),
      note: note.trim() || undefined,
      category,
    });
    setTitle('');
    setNote('');
  };

  const filteredIdeas = ideas.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      (item.note && item.note.toLowerCase().includes(searchQuery.trim().toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* 1. Fast Add Idea Form */}
      <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            پارکینگ ایده‌های دانیال (تخلیه بار شناختی مغز)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            هر ایده، پروژه یا آموزشی که به ذهنت می‌رسد را با دسته‌بندی اینجا پارک کن تا ذهنت موقع کار و استراحت درگیرش نماند.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
          <div className="md:col-span-5">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان ایده یا پروژه (مثلاً: ساخت داشبورد معاملات با Power BI)"
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
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            >
              <option value="project">پروژه و کدنویسی 💻</option>
              <option value="learning">آموزش و مهارت 📚</option>
              <option value="business">مغازه و ایتا 💼</option>
              <option value="personal">شخصی و تفریح 🎸</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <button
              type="submit"
              className="w-full h-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-lg shadow-indigo-600/25 transition"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت</span>
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
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
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
          {filteredIdeas.map((idea) => {
            const cat = IDEA_CATEGORIES[idea.category] || IDEA_CATEGORIES.project;
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
                    onClick={() => onConvertIdeaToTask(idea.id)}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>تبدیل به مأموریت میز کار</span>
                  </button>
                  <button
                    onClick={() => onDeleteIdea(idea.id)}
                    title="حذف ایده"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredIdeas.length === 0 && (
            <div className="col-span-full py-12 text-center text-xs text-slate-400">
              هیچ ایده‌ای در این بخش پیدا نشد.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
