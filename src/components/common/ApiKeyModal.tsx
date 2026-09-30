import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, X, AlertCircle, Sparkles, Lock, ExternalLink } from 'lucide-react';
import {
  subscribeApiKeyModal,
  submitApiKeyFromModal,
  closeApiKeyModal,
  getGeminiApiKey,
  removeGeminiApiKey,
} from '../../services/aiService';

export const ApiKeyModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeApiKeyModal((open, initialError) => {
      setIsOpen(open);
      if (open) {
        setErrorMessage(initialError || null);
        const current = getGeminiApiKey();
        setApiKeyInput(current || '');
      } else {
        setErrorMessage(null);
      }
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMessage('Kunci API Gemini tidak boleh kosong.');
      return;
    }
    if (trimmed.length < 10) {
      setErrorMessage('Format Kunci API Gemini terlalu pendek. Pastikan menyalin seluruh kunci API.');
      return;
    }
    setErrorMessage(null);
    submitApiKeyFromModal(trimmed);
  };

  const handleCancel = () => {
    closeApiKeyModal();
  };

  const handleClear = () => {
    removeGeminiApiKey();
    setApiKeyInput('');
    setErrorMessage('Kunci API sebelumnya telah dihapus. Silakan masukkan kunci API baru jika ingin melanjutkan.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="api-key-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Kunci API Gemini (BYOK)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Penyusunan Kurikulum Otomatis Berbasis AI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
            <p>
              Fitur AI (Generate TP, ATP, Modul Ajar, Asesmen) memerlukan <strong>Gemini API Key</strong> Anda untuk memproses permintaan langsung.
            </p>
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-300">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Keamanan Privasi:</strong> Kunci disimpan secara lokal di browser Anda (<code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">localStorage</code>), tidak pernah disimpan di database atau dicatat di server.
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Gemini API Key
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                autoFocus
                autoComplete="off"
                spellCheck="false"
                className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400 transition-all shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-1.5 flex justify-between items-center text-xs text-slate-400">
              <span>Dapatkan kunci gratis di Google AI Studio</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <span>Buat API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <div>
              {getGeminiApiKey() && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline py-1.5 px-2 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Hapus Kunci
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5"
              >
                <span>Simpan &amp; Lanjutkan</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
