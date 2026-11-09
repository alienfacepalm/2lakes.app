import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Moon, Sun, RefreshCw, Radar, FileText, ExternalLink, 
  Key, Copy, Check, Eye, EyeOff, Terminal, Zap 
} from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  onToggleDark: (val: boolean) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  hasRadar: boolean;
  onShowRadar: () => void;
}

interface DeveloperApiProps {
  isOpen: boolean;
}

const DeveloperApiSection = ({ isOpen }: DeveloperApiProps) => {
  const [keyDoc, setKeyDoc] = React.useState<{ id: string; active: boolean } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [showHowToUse, setShowHowToUse] = React.useState(false);

  const fetchKey = React.useCallback(async () => {
    const storedKeyId = localStorage.getItem("buoy_api_key");
    if (!storedKeyId) {
      setKeyDoc(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, "api_keys", storedKeyId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setKeyDoc({ id: docSnap.id, active: data ? data.active !== false : true });
      } else {
        localStorage.removeItem("buoy_api_key");
        setKeyDoc(null);
      }
    } catch (err: any) {
      console.error("Error fetching API Key from db:", err);
      // Fallback: show local key even if offline or permission denied
      setKeyDoc({ id: storedKeyId, active: true });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      fetchKey();
    }
  }, [isOpen, fetchKey]);

  const generateKey = async () => {
    setLoading(true);
    setError(null);
    try {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let randomId = "2l_key_";
      for (let i = 0; i < 24; i++) {
        randomId += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      await setDoc(doc(db, "api_keys", randomId), {
        uid: "localStorage_guest",
        active: true,
        createdAt: new Date().toISOString(),
        name: "Default API Key"
      });

      localStorage.setItem("buoy_api_key", randomId);
      setKeyDoc({ id: randomId, active: true });
    } catch (err: any) {
      console.error("Error generating API key:", err);
      setError("Failed to create key. Verify your Firestore connection in settings.");
    } finally {
      setLoading(false);
    }
  };

  const deleteKey = async () => {
    const storedKeyId = localStorage.getItem("buoy_api_key");
    if (!storedKeyId) return;
    setLoading(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "api_keys", storedKeyId));
      localStorage.removeItem("buoy_api_key");
      setKeyDoc(null);
    } catch (err: any) {
      console.error("Error deleting API key:", err);
      // Also clear local memory/cache anyway to let them cycle keys
      localStorage.removeItem("buoy_api_key");
      setKeyDoc(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!keyDoc) return;
    navigator.clipboard.writeText(keyDoc.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const curlExample = `curl -H "X-API-Key: ${keyDoc?.id || 'YOUR_KEY'}" "https://2lakes.app/api/buoy-data?buoy=Lake%20Sammamish"`;
  const fetchExample = `fetch("https://2lakes.app/api/buoy-data?buoy=Lake Sammamish", {
  headers: {
    "X-API-Key": "${keyDoc?.id || 'YOUR_KEY'}"
  }
})
.then(r => r.json())
.then(console.log);`;

  return (
    <section className="pt-2">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">Developer Access</h3>
      
      {error && (
        <div className="p-3 mb-3 bg-red-500/15 border border-red-500/20 rounded-xl text-red-500 text-[11px] font-medium leading-normal animate-pulse">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-4 justify-center bg-surface-container-low border border-black/5 dark:border-white/10 rounded-2xl">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-on-surface-variant font-bold uppercase tracking-tight">Syncing API Key...</span>
        </div>
      ) : keyDoc ? (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-primary uppercase tracking-wider">Active API Key</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-green-500/10 text-green-500">
                Live
              </span>
            </div>

            <div className="flex items-center gap-2 bg-surface-container-highest border border-black/5 dark:border-white/5 rounded-xl px-3 py-2.5">
              <Key className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                type={visible ? "text" : "password"}
                readOnly
                value={keyDoc.id}
                className="bg-transparent border-none outline-none font-mono text-xs w-full text-on-surface select-all leading-none focus:ring-0"
              />
              <button
                onClick={() => setVisible(!visible)}
                className="text-on-surface-variant hover:text-on-surface p-1 transition-colors"
                title={visible ? "Hide" : "Show"}
              >
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleCopy}
                className="text-on-surface-variant hover:text-on-surface p-1 transition-colors shrink-0"
                title="Copy Key"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setShowHowToUse(!showHowToUse)}
                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                {showHowToUse ? "Hide Instructions" : "How to Use"}
              </button>

              <button
                onClick={deleteKey}
                className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                Revoke Key
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showHowToUse && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3"
              >
                <div className="p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 text-[11px] text-on-surface-variant space-y-3 font-medium">
                  <p className="leading-relaxed">
                    Access real-time buoy statistics externally on custom dashboards. Two endpoints are supported:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      <code className="font-mono text-[10px] bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">
                        /api/buoy-data?buoy=NAME
                      </code>
                    </li>
                    <li>
                      <code className="font-mono text-[10px] bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">
                        /api/all-buoy-data
                      </code>
                    </li>
                  </ul>
                  
                  <div className="space-y-1.5">
                    <p className="font-bold text-[10px] uppercase text-on-surface">curl example</p>
                    <pre className="font-mono text-[9px] bg-black/10 dark:bg-black/30 p-2.5 rounded-xl overflow-x-auto text-on-surface-variant select-all whitespace-pre-wrap leading-normal">
                      {curlExample}
                    </pre>
                  </div>
                  
                  <div className="space-y-1.5">
                    <p className="font-bold text-[10px] uppercase text-on-surface">JavaScript fetch example</p>
                    <pre className="font-mono text-[9px] bg-black/10 dark:bg-black/30 p-2.5 rounded-xl overflow-x-auto text-on-surface-variant select-all whitespace-pre leading-normal">
                      {fetchExample}
                    </pre>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <button
          onClick={generateKey}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 text-primary transition-all duration-300 group active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5 text-primary group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black uppercase tracking-tight leading-none mb-1">Generate API Key</p>
              <p className="text-[10px] font-bold text-on-surface-variant leading-none">Access buoy data from other apps</p>
            </div>
          </div>
          <Zap className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all" />
        </button>
      )}
    </section>
  );
};

export const SettingsMenu = ({ 
  isOpen, 
  onClose, 
  isDark,
  onToggleDark,
  onRefresh,
  isRefreshing,
  hasRadar,
  onShowRadar,
}: SettingsMenuProps) => {
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
                id="close-settings"
              >
                <X className="w-6 h-6 text-on-surface" />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-180px)] no-scrollbar">
              {/* Appearance Section */}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">Appearance</h3>
                
                <div className="space-y-3">
                  {/* Dark Mode */}
                  <button 
                    onClick={() => onToggleDark(!isDark)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border bg-surface-container-low border-black/5 dark:border-white/10 hover:bg-surface-container transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface animate-pulse-slow">
                        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">{isDark ? 'Light' : 'Dark'} Mode</p>
                        <p className="text-[10px] font-bold text-on-surface-variant leading-none">Toggle theme</p>
                      </div>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${isDark ? 'bg-primary' : 'bg-black/10 dark:bg-white/10'}`}>
                      <motion.div 
                        animate={{ x: isDark ? 22 : 2 }}
                        className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full"
                      />
                    </div>
                  </button>
                </div>
              </section>

              {/* Tools Section */}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 ml-1">Tools</h3>
                <div className="space-y-3">
                  {/* Refresh */}
                  <button 
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all group active:scale-[0.98] cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                      <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">Refresh Data</p>
                      <p className="text-[10px] font-bold text-on-surface-variant leading-none">Sync with buoy sensors</p>
                    </div>
                  </button>

                  {/* Radar (if available) */}
                  {hasRadar && (
                    <button 
                      onClick={() => { onShowRadar(); onClose(); }}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 hover:bg-surface-container transition-all group active:scale-[0.98] cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                        <Radar className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">Live Radar</p>
                        <p className="text-[10px] font-bold text-on-surface-variant leading-none">View precipitation maps</p>
                      </div>
                    </button>
                  )}
                </div>
              </section>

              {/* Developer Access Section */}
              <DeveloperApiSection isOpen={isOpen} />

              {/* Legal Section */}
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
                      <p className="text-sm font-black text-on-surface uppercase tracking-tight leading-none mb-1">Terms of Service</p>
                      <p className="text-[10px] font-bold text-on-surface-variant leading-none">Usage & Data attribution</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-on-surface-variant/40" />
                </Link>
              </section>

              <div className="pt-8 mt-8 border-t border-black/5 dark:border-white/10">
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 italic">
                  2lakes.app v1.4 • Seattle, WA
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
