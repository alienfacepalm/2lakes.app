import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Moon,
  Sun,
  RefreshCw,
  Radar,
  FileText,
  ExternalLink,
  Database,
  Heart,
  Download,
  Upload,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getDonateUrl, openDonatePage } from "../lib/donate";
import {
  DEFAULT_RETENTION_DAYS,
  RETENTION_CHOICES,
  exportHistory,
  getRetentionDays,
  importHistory,
  pruneOldRecords,
  setRetentionDays,
} from "../lib/history-store";

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  onToggleDark: (val: boolean) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  hasRadar: boolean;
  onShowRadar: () => void;
  backgroundHistoryEnabled: boolean;
  onToggleBackgroundHistory: (val: boolean) => void;
  onHistoryChanged?: () => void;
}

function retentionLabel(days: number | null): string {
  if (days === null) return "Forever";
  if (days === 365) return "1 year";
  return `${days} days`;
}

export const SettingsMenu = ({
  isOpen,
  onClose,
  isDark,
  onToggleDark,
  onRefresh,
  isRefreshing,
  hasRadar,
  onShowRadar,
  backgroundHistoryEnabled,
  onToggleBackgroundHistory,
  onHistoryChanged,
}: SettingsMenuProps) => {
  const donateUrl = getDonateUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [retention, setRetention] = useState<number | null>(() => getRetentionDays());
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);

  const handleRetentionChange = async (raw: string) => {
    const days = raw === "forever" ? null : parseInt(raw, 10);
    const next = days === null || Number.isFinite(days) ? days : DEFAULT_RETENTION_DAYS;
    setRetentionDays(next);
    setRetention(next);
    await pruneOldRecords();
    onHistoryChanged?.();
  };

  const handleExport = async () => {
    setTransferBusy(true);
    setTransferMessage(null);
    try {
      const data = await exportHistory();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `2lakes-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setTransferMessage(`Exported ${data.rows.length} readings`);
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "Export failed");
    } finally {
      setTransferBusy(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setTransferBusy(true);
    setTransferMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = await importHistory(parsed);
      onHistoryChanged?.();
      setTransferMessage(`Imported ${result.added} readings (${result.skipped} skipped)`);
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setTransferBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-surface rounded-l-[2.5rem] z-[110] shadow-2xl p-8 border-l border-black/5 dark:border-white/10"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-on-surface uppercase tracking-tight">Settings</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6 text-on-surface" />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-180px)] no-scrollbar">
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">
                  Appearance
                </h3>
                <button
                  onClick={() => onToggleDark(!isDark)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl border bg-surface-container-low border-black/5 dark:border-white/10 hover:bg-surface-container transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface">
                      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">
                        {isDark ? "Light" : "Dark"} Mode
                      </p>
                      <p className="text-[10px] font-bold text-on-surface-variant leading-none">Toggle theme</p>
                    </div>
                  </div>
                  <div
                    className={`w-10 h-5 rounded-full relative transition-colors ${isDark ? "bg-primary" : "bg-black/10 dark:bg-white/10"}`}
                  >
                    <motion.div animate={{ x: isDark ? 22 : 2 }} className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full" />
                  </div>
                </button>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">Tools</h3>
                <div className="space-y-3">
                  <button
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all group active:scale-[0.98] cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                      <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">
                        Refresh Data
                      </p>
                      <p className="text-[10px] font-bold text-on-surface-variant leading-none">Sync with buoy sensors</p>
                    </div>
                  </button>

                  {hasRadar && (
                    <button
                      onClick={() => {
                        onShowRadar();
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all group active:scale-[0.98] cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                        <Radar className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">
                          Live Radar
                        </p>
                        <p className="text-[10px] font-bold text-on-surface-variant leading-none">View precipitation maps</p>
                      </div>
                    </button>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">
                  Local replica
                </h3>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => onToggleBackgroundHistory(!backgroundHistoryEnabled)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border bg-surface-container-low border-black/5 dark:border-white/10 hover:bg-surface-container transition-all cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface shrink-0">
                        <Database className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">
                          Background sync
                        </p>
                        <p className="text-[10px] font-bold text-on-surface-variant leading-snug">
                          Keep this photocopy current hourly
                        </p>
                      </div>
                    </div>
                    <div
                      className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ml-3 ${backgroundHistoryEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10"}`}
                      aria-hidden
                    >
                      <motion.div
                        animate={{ x: backgroundHistoryEnabled ? 22 : 2 }}
                        className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full"
                      />
                    </div>
                  </button>

                  <label className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl border bg-surface-container-low border-black/5 dark:border-white/10 cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface shrink-0">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">
                          Keep history
                        </p>
                        <p className="text-[10px] font-bold text-on-surface-variant leading-snug">
                          Older readings are pruned on this device
                        </p>
                      </div>
                    </div>
                    <select
                      value={retention === null ? "forever" : String(retention)}
                      onChange={(e) => void handleRetentionChange(e.target.value)}
                      className="shrink-0 max-w-[7.5rem] rounded-xl border border-black/10 dark:border-white/10 bg-surface-container-highest px-2 py-2 text-xs font-bold text-on-surface"
                    >
                      {RETENTION_CHOICES.map((days) => (
                        <option key={String(days)} value={days === null ? "forever" : String(days)}>
                          {retentionLabel(days)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={transferBusy}
                      onClick={() => void handleExport()}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all active:scale-[0.98] cursor-pointer text-left disabled:opacity-60"
                    >
                      <Download className="w-5 h-5 text-on-surface shrink-0" />
                      <span className="text-xs font-black uppercase tracking-tight text-on-surface">Export</span>
                    </button>
                    <button
                      type="button"
                      disabled={transferBusy}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all active:scale-[0.98] cursor-pointer text-left disabled:opacity-60"
                    >
                      <Upload className="w-5 h-5 text-on-surface shrink-0" />
                      <span className="text-xs font-black uppercase tracking-tight text-on-surface">Import</span>
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => void handleImportFile(e.target.files?.[0])}
                  />

                  {transferMessage && (
                    <p className="text-[10px] font-bold text-on-surface-variant px-1">{transferMessage}</p>
                  )}

                  <p className="text-[10px] font-medium text-on-surface-variant leading-relaxed px-1">
                    The official diary lives in the cloud. This device keeps a{" "}
                    <span className="font-bold text-on-surface">photocopy</span> for offline use and never writes
                    readings back. Opening the app already syncs; background sync adds hourly catch-up while you
                    are online.
                  </p>
                </div>
              </section>

              {donateUrl && (
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">
                    Support
                  </h3>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => openDonatePage()}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 text-primary transition-all group active:scale-[0.98] cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Heart className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black uppercase tracking-tight leading-none mb-1">
                            Donate
                          </p>
                          <p className="text-[10px] font-bold text-on-surface-variant leading-snug">
                            Totally optional — never required
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100 shrink-0" />
                    </button>
                    <p className="text-[10px] font-medium text-on-surface-variant leading-relaxed px-1">
                      The app is free forever with <span className="font-bold text-on-surface">no ads</span> — we
                      will not show ads or make you watch anything to use buoy data, history, or forecasts. Donate
                      only if you want to; it opens an external page and changes nothing in the app.
                    </p>
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">Legal</h3>
                <Link
                  to="/tos"
                  onClick={onClose}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">
                        Terms of Service
                      </p>
                      <p className="text-[10px] font-bold text-on-surface-variant leading-none">Usage & Data attribution</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-on-surface-variant/40" />
                </Link>
              </section>

              <div className="pt-8 mt-8 border-t border-black/5 dark:border-white/10">
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 italic">
                  2lakes.app mobile • Seattle, WA
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
