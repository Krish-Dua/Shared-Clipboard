import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function UsernameModal({ isOpen, username, onSave, onClose }) {
  const [nameInput, setNameInput] = useState(username || '');

  useEffect(() => {
    setNameInput(username || '');
  }, [username, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    const clean = nameInput.trim();
    if (clean.length >= 5 && clean.length <= 10) {
      onSave(clean);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {username ? 'Change Username' : 'Register Username'}
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Username
              </label>
              <span className={`text-[11px] font-medium ${nameInput.length >= 10 ? 'text-amber-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                {nameInput.length}/10
              </span>
            </div>
            <input
              type="text"
              maxLength={10}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
              placeholder="Enter your name"
              autoFocus
              className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 transition ${
                nameInput.length >= 10
                  ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-500/40 focus:border-amber-500'
                  : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500/40 focus:border-indigo-500'
              }`}
            />
            {nameInput.length >= 10 && (
              <p className="text-[11px] text-amber-500 font-medium mt-1">
                Maximum 10 characters reached
              </p>
            )}
            {nameInput.length > 0 && nameInput.length < 5 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Minimum 5 characters required
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={nameInput.trim().length < 5 || nameInput.trim().length > 10}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition cursor-pointer"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
