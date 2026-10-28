import React, { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Habit, HabitCategory } from '../types';

export const EMOJIS = [
  '🚿', '📚', '💻', '🎯', '🧹', '💧', '🎨', '💰',
  '🎸', '✍️', '🦷', '📵', '🏋️‍♂️', '🧠', '🍵', '✨',
];

export const COLORS = [
  { name: 'indigo', hex: '#6366f1' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'rose', hex: '#f43f5e' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'sky', hex: '#0ea5e9' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'teal', hex: '#14b8a6' },
];

interface HabitModalProps {
  isOpen: boolean;
  habitToEdit: Habit | null;
  onClose: () => void;
  onSave: (habitData: {
    id?: string;
    title: string;
    category: HabitCategory;
    weeklyGoal: number;
    emoji: string;
    color: string;
  }) => void;
}

export const HabitModal: React.FC<HabitModalProps> = ({
  isOpen,
  habitToEdit,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HabitCategory>('health');
  const [weeklyGoal, setWeeklyGoal] = useState<number>(7);
  const [selectedEmoji, setSelectedEmoji] = useState<string>(EMOJIS[0]);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0].hex);

  useEffect(() => {
    if (habitToEdit) {
      setTitle(habitToEdit.title);
      setCategory(habitToEdit.category);
      setWeeklyGoal(habitToEdit.weeklyGoal || 7);
      setSelectedEmoji(habitToEdit.emoji || EMOJIS[0]);
      setSelectedColor(habitToEdit.color || COLORS[0].hex);
    } else {
      setTitle('');
      setCategory('health');
      setWeeklyGoal(7);
      setSelectedEmoji(EMOJIS[0]);
      setSelectedColor(COLORS[0].hex);
    }
  }, [habitToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: habitToEdit?.id,
      title: title.trim(),
      category,
      weeklyGoal,
      emoji: selectedEmoji,
      color: selectedColor,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <span>{habitToEdit ? 'ویرایش عادت' : 'ایجاد عادت جدید'}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              عنوان عادت *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: مطالعه ۲۰ صفحه کتاب"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                دسته‌بندی
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as HabitCategory)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              >
                <option value="health">سلامتی و بهداشت</option>
                <option value="learning">مطالعه و یادگیری</option>
                <option value="work">کار و بهره‌وری</option>
                <option value="mindfulness">آرامش و نظم شخصی</option>
                <option value="finance">مدیریت مالی</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                هدف در هفته
              </label>
              <select
                value={weeklyGoal}
                onChange={(e) => setWeeklyGoal(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              >
                <option value={7}>هر روز (۷ روز)</option>
                <option value={6}>۶ روز در هفته</option>
                <option value={5}>۵ روز در هفته</option>
                <option value={4}>۴ روز در هفته</option>
                <option value={3}>۳ روز در هفته</option>
                <option value={2}>۲ روز در هفته</option>
                <option value={1}>۱ روز در هفته</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              انتخاب نماد
            </label>
            <div className="grid grid-cols-8 gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`h-9 rounded-lg flex items-center justify-center text-lg transition ${
                    selectedEmoji === emoji
                      ? 'bg-indigo-600/15 ring-2 ring-indigo-500 scale-105'
                      : 'hover:bg-slate-200/70 dark:hover:bg-slate-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              رنگ شاخص
            </label>
            <div className="flex items-center gap-2.5 pt-1">
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSelectedColor(c.hex)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    selectedColor === c.hex
                      ? 'scale-125 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25 transition"
            >
              ذخیره عادت
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
