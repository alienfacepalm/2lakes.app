import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation, Routes, Route, Navigate, Link } from "react-router-dom";
import { 
  Waves, 
  
  Clock, 
  Thermometer, 
  MapPin, 
  History as HistoryIcon, 
  LayoutDashboard,
  Moon,
  Sun,
  CloudRain,
  Droplets,
  Wind,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  Mountain,
  WifiOff,
  ThermometerSnowflake,
  ThermometerSun,
  ChevronDown,
  ChevronRight,
  Check,
  Share,
  Database,
  Radar,
  Plus,
  Minus,
  Settings as SettingsIcon,
} from "lucide-react";
import type { BuoyData, MapBuoy, HistoryPoint } from "./types";
import { getBuoyData, getAllBuoys } from "./lib/buoy-api";
import { loadHistory } from "./lib/history-store";
import {
  BACKGROUND_HISTORY_CHECK_MS,
  isBackgroundHistoryEnabled,
  runBackgroundHistoryCapture,
  setBackgroundHistoryEnabled as persistBackgroundHistoryEnabled,
} from "./lib/background-history";
import { requestPersistentStorage, syncIfStale } from "./lib/sync";
import { getConditionIcon, getBuoyBackground, getTemperatureColor } from "./lib/utils.tsx";
import { IconGallery } from "./components/icon-gallery";
import { HistoryCharts } from "./components/history-charts";
import { Tooltip } from "./components/tooltip";
import { TempLegend } from "./components/temp-legend";
import { SettingsMenu } from "./components/settings-menu";
import { StaticMap } from "./components/static-map";
import { TOSPage } from "./pages/tos-page";

function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: unknown }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-black text-on-surface uppercase tracking-tight">Something went wrong</h1>
            <p className="text-on-surface-variant opacity-70">
              Something broke on our side. A quick reload usually fixes it — your local history on this device is
              unaffected.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-primary text-on-primary rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
            >
              Reload Application
            </button>
            {import.meta.env.DEV && (
              <pre className="mt-8 p-4 bg-black/5 dark:bg-white/5 rounded-xl text-[10px] text-left overflow-auto max-h-40 font-mono opacity-50">
                {this.state.error instanceof Error ? this.state.error.message : String(this.state.error)}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [data, setData] = useState<BuoyData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [allBuoys, setAllBuoys] = useState<MapBuoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<"F" | "C">("F");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBuoy, setSelectedBuoy] = useState(() => localStorage.getItem("selectedBuoy") || "Lake Sammamish");
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  const handleToggleDark = (val: boolean) => {
    setIsDark(val);
    localStorage.setItem("theme", val ? "dark" : "light");
  };

  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date>(new Date());
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showRadarModal, setShowRadarModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [backgroundHistoryEnabled, setBackgroundHistoryEnabled] = useState(() => isBackgroundHistoryEnabled());
  const [expandedBuoyId, setExpandedBuoyId] = useState<string | null>(null);
  const [expandedForecastIdx, setExpandedForecastIdx] = useState<number | null>(null);
  const [mapZoom, setMapZoom] = useState<Record<string, number>>({});

  const location = useLocation();
  const activeTab = location.pathname === "/history" ? "history" : 
                    location.pathname === "/network" ? "map" : "current";

  const selectedBuoyInfo = allBuoys.find(b => b.name === selectedBuoy);
  const isSelectedBuoyOffline = selectedBuoyInfo && !selectedBuoyInfo.active;

  const humidityPoints = history.filter(p => p.humidity !== null && p.humidity !== undefined && !isNaN(p.humidity));
  const hasHumidityData = humidityPoints.length > 0;
  const avgHumidity = hasHumidityData ? humidityPoints.reduce((acc, p) => acc + (p.humidity ?? 0), 0) / humidityPoints.length : null;
  const currentHumidityAvailable = (data?.humidity !== null && data?.humidity !== undefined && !isNaN(data.humidity)) || hasHumidityData;

  const waterTempPoints = history.filter(p => p.tempC !== null && p.tempC !== undefined && !isNaN(p.tempC));
  const hasWaterTempData = waterTempPoints.length > 0;
  const lastWaterTempPoint = hasWaterTempData ? waterTempPoints[waterTempPoints.length - 1] : null;

  const precipPoints = history.filter(p => p.precipitation !== null && p.precipitation !== undefined);
  const hasPrecipitationRecords = precipPoints.length > 0;
  const totalPrecipitation = precipPoints.reduce((acc, p) => acc + (p.precipitation ?? 0), 0);
  const currentPrecipitationAvailable = (data?.precipitation !== null && data?.precipitation !== undefined) || hasPrecipitationRecords;

  const airTempPoints = history.filter(p => p.airTempC !== null && p.airTempC !== undefined && !isNaN(p.airTempC));
  const hasAirTempData = airTempPoints.length > 0;
  const lastAirTempPoint = hasAirTempData ? airTempPoints[airTempPoints.length - 1] : null;

  const windPoints = history.filter(p => p.windSpeed !== null && p.windSpeed !== undefined && !isNaN(p.windSpeed));
  const hasWindData = windPoints.length > 0;
  const lastWindPoint = hasWindData ? windPoints[windPoints.length - 1] : null;

  const dewpointPoints = history.filter(p => p.dewpoint !== null && p.dewpoint !== undefined && !isNaN(p.dewpoint));
  const hasDewpointData = dewpointPoints.length > 0;
  const avgDewpoint = hasDewpointData ? dewpointPoints.reduce((acc, p) => acc + (p.dewpoint ?? 0), 0) / dewpointPoints.length : null;
  
  const sortedBuoys = useMemo(() => {
    return [...allBuoys].sort((a, b) => {
      if (a.active === b.active) return a.name.localeCompare(b.name);
      return a.active ? -1 : 1;
    });
  }, [allBuoys]);

  useEffect(() => {
    localStorage.setItem("selectedBuoy", selectedBuoy);
  }, [selectedBuoy]);


  const refreshHistory = useCallback(() => {
    void loadHistory(selectedBuoy).then(setHistory).catch(console.error);
  }, [selectedBuoy]);

  const handleToggleBackgroundHistory = useCallback((enabled: boolean) => {
    setBackgroundHistoryEnabled(enabled);
    persistBackgroundHistoryEnabled(enabled);
    if (enabled) {
      void runBackgroundHistoryCapture().then((result) => {
        if (!result.skipped && result.saved > 0) refreshHistory();
      });
    }
  }, [refreshHistory]);

  // Keep the local replica in step with D1 on open and when returning to the tab.
  useEffect(() => {
    void requestPersistentStorage();

    const runSync = () => {
      void syncIfStale().then((result) => {
        if (result?.ok && result.changed > 0) refreshHistory();
      });
    };

    runSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") runSync();
    };
    const onOnline = () => runSync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refreshHistory]);

  useEffect(() => {
    if (!backgroundHistoryEnabled) return;

    const tick = () => {
      void runBackgroundHistoryCapture().then((result) => {
        if (!result.skipped && result.saved > 0) refreshHistory();
      });
    };

    tick();
    const intervalId = window.setInterval(tick, BACKGROUND_HISTORY_CHECK_MS);
    return () => clearInterval(intervalId);
  }, [backgroundHistoryEnabled, refreshHistory]);

  useEffect(() => {
    if (!selectedBuoy) return;
    let cancelled = false;
    loadHistory(selectedBuoy)
      .then((historyData) => {
        if (!cancelled) setHistory(historyData);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedBuoy, data?.timestamp]);

  const fetchData = useCallback(async (options?: { userInitiated?: boolean }) => {
    const userInitiated = options?.userInitiated ?? false;

    if (!navigator.onLine) {
      setPendingRefresh(true);
      setRefreshing(true);
      setError(null);
      try {
        const [currentResult, mapResult] = await Promise.all([getBuoyData(selectedBuoy), getAllBuoys()]);
        setData(currentResult);
        setAllBuoys(mapResult);
        setLastFetchTime(new Date());
      } catch (error) {
        if (userInitiated) {
          setShowOfflineAlert(true);
        }
        setError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    setRefreshing(true);
    setError(null);
    if (userInitiated) {
      setData(null);
    }
    try {
      const [currentResult, mapResult] = await Promise.all([getBuoyData(selectedBuoy), getAllBuoys()]);
      setData(currentResult);
      setAllBuoys(mapResult);
      setLastFetchTime(new Date());
    } catch (error) {
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBuoy]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingRefresh) {
      setPendingRefresh(false);
      void fetchData();
    }
  }, [isOnline, pendingRefresh, fetchData]);


  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) setTimeOfDay("dawn");
    else if (hour >= 8 && hour < 17) setTimeOfDay("day");
    else if (hour >= 17 && hour < 20) setTimeOfDay("dusk");
    else setTimeOfDay("night");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <ErrorBoundary>
      <div className={`h-screen flex flex-col overflow-hidden transition-colors duration-300 bg-surface relative`}>
      <ScrollToTop />
      <>
        <div className={`lake-bg lake-bg-${timeOfDay}`} />
        <div className="lake-waves" />
      </>


      <header className="shrink-0 z-50 bg-surface/70 backdrop-blur-2xl flex items-center justify-between px-4 sm:px-6 min-h-[4rem] border-b border-black/5 dark:border-white/5 pt-safe">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Mountain className="text-primary w-6 h-6" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-surface rounded-full flex items-center justify-center shadow-sm border border-black/5 dark:border-white/10">
              <Waves className="text-primary w-3 h-3" />
            </div>
          </div>
          <div className="flex flex-col -space-y-0.5 sm:-space-y-1">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-primary/70 leading-none">Seattle</span>
            <h1 className="text-xl sm:text-2xl font-black text-on-surface font-headline tracking-tighter uppercase leading-none">
              2lakes<span className="text-primary">.app</span>
            </h1>
            {!isOnline && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/80 mt-0.5">
                Offline — last saved readings
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Settings">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowSettings(true)} 
              className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface lg:hover:bg-black/5 lg:dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <SettingsIcon className="w-5 h-5" />
            </motion.button>
          </Tooltip>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto px-4 pt-6 pb-32 max-w-4xl mx-auto w-full relative`}>
        <SettingsMenu 
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          isDark={isDark}
          onToggleDark={handleToggleDark}
          onRefresh={() => void fetchData({ userInitiated: true })}
          isRefreshing={refreshing}
          hasRadar={!!data?.radarStation}
          onShowRadar={() => setShowRadarModal(true)}
          backgroundHistoryEnabled={backgroundHistoryEnabled}
          onToggleBackgroundHistory={handleToggleBackgroundHistory}
          onHistoryChanged={refreshHistory}
        />
        <AnimatePresence mode="wait">
          <Routes location={location}>
            <Route path="/" element={
              loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : error ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-[2rem] text-red-500 flex items-center gap-3">
                  <AlertCircle className="w-6 h-6" />
                  <p className="font-medium">{error}</p>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                  {/* Top Buoy Selector Bar */}
                  <div className="mb-6 relative">
                    <Tooltip content="Select Buoy Location" side="bottom">
                      <motion.button 
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="w-full bg-surface-container-low border border-black/5 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between group lg:hover:bg-surface-container transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full animate-pulse border border-black/10 dark:border-white/10 ${
                            data?.status === "ACTIVE" 
                              ? (data?.tempC !== null && data?.tempC !== undefined && !isNaN(data.tempC) ? "bg-[#ccff00] shadow-[0_0_8px_#ccff00]" : "bg-[#ffbf00] shadow-[0_0_8px_#ffbf00]") 
                              : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                          }`} />
                          <span className="text-sm font-bold text-on-surface">{selectedBuoy.endsWith("Buoy") ? selectedBuoy : `${selectedBuoy} Buoy`}</span>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-on-surface-variant transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </motion.button>
                    </Tooltip>
                    
                    <AnimatePresence>
                      {isDropdownOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                          animate={{ opacity: 1, y: 0, scale: 1 }} 
                          exit={{ opacity: 0, y: 10, scale: 0.95 }} 
                          className="absolute top-full left-0 right-0 mt-2 bg-surface-container-highest backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                        >
                          {sortedBuoys.map((buoy) => (
                            <button 
                              key={buoy.id} 
                              onClick={() => { setSelectedBuoy(buoy.name); setIsDropdownOpen(false); }} 
                              className={`w-full text-left px-4 py-3 text-sm font-bold flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${selectedBuoy === buoy.name ? 'text-primary' : 'text-on-surface'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${
                                  buoy.active 
                                    ? (buoy.tempC !== null && buoy.tempC !== undefined && !isNaN(buoy.tempC) ? "bg-[#ccff00] shadow-[0_0_5px_#ccff00]" : "bg-[#ffbf00] shadow-[0_0_5px_#ffbf00]")
                                    : "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"
                                }`} />
                                {buoy.name}
                              </div>
                              {selectedBuoy === buoy.name && <Check className="w-4 h-4" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Alerts Banner */}
                  <AnimatePresence>
                    {data?.alerts && data.alerts.length > 0 && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mb-6 overflow-hidden"
                      >
                        {data.alerts.map((alert, idx) => (
                          <div key={idx} className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 mb-2">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                              <h3 className="text-sm font-black text-red-500 uppercase tracking-wider">{alert.event}</h3>
                              <p className="text-xs font-medium text-on-surface opacity-80 mt-1">{alert.headline}</p>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Current Conditions Card */}
                  <section className="relative overflow-hidden bg-surface-container-low rounded-[2.5rem] p-8 shadow-sm border border-black/5 dark:border-white/5">
                    <img
                      src={getBuoyBackground()}
                      alt="Lake Washington seasonal background"
                      className="absolute inset-0 w-full h-full object-cover opacity-[0.4] dark:opacity-[0.5] pointer-events-none select-none"
                    />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-2xl font-semibold text-on-surface">{data?.location?.endsWith("Buoy") ? data.location : `${data?.location} Buoy`}</h2>
                          <p className="text-on-surface text-sm font-medium">
                            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </p>
                        </div>
                        <div className="flex gap-1 bg-surface-container-highest/50 backdrop-blur-md p-1 rounded-xl">
                          <Tooltip content="Show Fahrenheit">
                            <button onClick={() => setUnit("F")} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${unit === "F" ? "bg-surface shadow-sm" : "opacity-50"}`}>°F</button>
                          </Tooltip>
                          <Tooltip content="Show Celsius">
                            <button onClick={() => setUnit("C")} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${unit === "C" ? "bg-surface shadow-sm" : "opacity-50"}`}>°C</button>
                          </Tooltip>
                        </div>
                      </div>
                      <div className={`mt-8 flex flex-col items-center`}>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center border border-black/5 dark:border-white/10 shadow-sm">
                            {(data?.tempC === null || data?.tempC === undefined) && data?.status === "ACTIVE" ? (
                              <WifiOff className="w-8 h-8 text-on-surface opacity-60" />
                            ) : (
                              getConditionIcon(data?.condition || "", getTemperatureColor(data?.tempF ?? lastWaterTempPoint?.tempF ?? 0))
                            )}
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-1">Water Temperature</span>
                            <span className={`text-8xl font-black tracking-tighter drop-shadow-sm ${getTemperatureColor(data?.tempF ?? lastWaterTempPoint?.tempF ?? 0)}`}>
                              {data?.tempC !== null && data?.tempC !== undefined && !isNaN(data.tempC)
                                ? `${Math.round(unit === "F" ? (data.tempF || 0) : (data.tempC || 0))}°`
                                : (data?.status === "ACTIVE" ? "--" : (lastWaterTempPoint ? `${Math.round(unit === "F" ? (lastWaterTempPoint.tempF || 0) : (lastWaterTempPoint.tempC || 0))}°` : "--"))}
                            </span>
                          </div>
                        </div>
                        <p className="text-2xl font-black text-on-surface mt-2 text-center drop-shadow-sm">
                          {data?.status === "ACTIVE" 
                            ? (data?.tempC === null || data?.tempC === undefined ? "Water Temperature Unavailable" : `${data?.condition} Conditions`) 
                            : (lastWaterTempPoint ? "Last Recorded" : "Sensor Offline")}
                        </p>
                        <div className="flex gap-4 mt-2 text-on-surface-variant font-black text-base drop-shadow-sm">
                          {(() => {
                            const baseVal = unit === "F" 
                              ? (data?.tempF ?? lastWaterTempPoint?.tempF) 
                              : (data?.tempC ?? lastWaterTempPoint?.tempC);
                            return !isNaN(baseVal ?? NaN) ? (
                              <>
                                <span>High: <span className={getTemperatureColor((data?.tempF ?? lastWaterTempPoint?.tempF ?? 0) + 2)}>
                                  {Math.round((baseVal || 0) + 2)}°
                                </span></span>
                                <span>Low: <span className={getTemperatureColor((data?.tempF ?? lastWaterTempPoint?.tempF ?? 0) - 3)}>
                                  {Math.round((baseVal || 0) - 3)}°
                                </span></span>
                              </>
                            ) : null;
                          })()}
                        </div>
                        <div className="mt-6">
                          <TempLegend unit={unit} />
                        </div>
                      </div>
                      <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full animate-pulse border border-black/10 dark:border-white/10 ${
                            data?.status === "ACTIVE" 
                              ? (data?.tempC !== null && data?.tempC !== undefined && !isNaN(data.tempC) ? "bg-[#ccff00] shadow-[0_0_8px_#ccff00]" : "bg-[#ffbf00] shadow-[0_0_8px_#ffbf00]") 
                              : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                          }`}></span>
                          <div className="flex flex-col leading-tight">
                            <span className="text-[11px] font-black uppercase tracking-widest text-on-surface">
                              {data?.status === "ACTIVE" 
                                ? (data?.tempC !== null && data?.tempC !== undefined && !isNaN(data.tempC) ? "Live Sensor" : "Live Sensor (Water Temp Missing)") 
                                : "Offline"}
                            </span>
                            {data?.status === "ACTIVE" && (data?.tempC === null || data?.tempC === undefined || isNaN(data.tempC)) ? (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[#ffbf00]">
                                Water temp temporarily missing, but other data active
                              </span>
                            ) : history.length > 0 && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                                Since {new Date(history[history.length - 1].time).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right group cursor-default">
                            <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                              <span className="text-primary font-black">Updated</span> <span className="text-on-surface">{new Date(data?.timestamp || "").toLocaleDateString()}</span> at <span className="text-on-surface">{new Date(data?.timestamp || "").toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                            </p>
                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                              <p className="text-xs sm:text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                                <span className="text-primary font-black">Checked</span> <span className="text-on-surface">{lastFetchTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Hourly Forecast */}
                  <section className="bg-surface-container-low rounded-[2rem] p-6 mt-6 shadow-sm border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-on-surface-variant mb-6 px-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Hourly Forecast</span>
                      </div>
                      <div className="flex overflow-x-auto pb-2 gap-6">
                        {data?.hourlyForecast && data.hourlyForecast.length > 0 ? (
                          data.hourlyForecast.map((p, i) => {
                            const time = new Date(p.time);
                            const hour = time.getHours();
                            const displayHour = `${hour.toString().padStart(2, '0')}:00`;
                            const temp = unit === "F" ? p.temp : Math.round((p.temp - 32) * 5/9);
                            return (
                              <div key={i} className="flex flex-col items-center gap-3 min-w-[80px] sm:min-w-[100px]">
                                <span className="text-xs font-black text-on-surface-variant uppercase tracking-wider">{i === 0 ? "Now" : displayHour}</span>
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-surface-container flex items-center justify-center border border-black/5 dark:border-white/5 relative group/h overflow-hidden shadow-sm">
                                  <img 
                                    src={p.icon} 
                                    alt={p.condition} 
                                    className="w-full h-[220%] object-cover object-top" 
                                    referrerPolicy="no-referrer" 
                                  />
                                  {p.precipitationProbability > 0 && (
                                    <div className="absolute bottom-1 right-1 bg-primary/90 backdrop-blur-sm text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm border border-white/10">
                                      {p.precipitationProbability}%
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-center">
                                  <span className={`text-lg font-black ${getTemperatureColor(p.temp)}`}>{isNaN(temp) ? "--" : Math.round(temp)}°</span>
                                  {p.windDirection && (
                                    <span className="text-[11px] font-black text-on-surface-variant uppercase mt-0.5 tracking-tight">{p.windDirection} {p.windSpeed.split(' ')[0]}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          Array.from({ length: 12 }).map((_, i) => {
                            const time = new Date();
                            time.setHours(time.getHours() + i);
                            const hour = time.getHours();
                            const displayHour = `${hour.toString().padStart(2, '0')}:00`;
                            const baseTemp = (unit === "F" ? data?.tempF : data?.tempC) ?? 0;
                            const temp = Math.round(baseTemp) + (Math.sin(i / 2) * 2);
                            return (
                              <div key={i} className="flex flex-col items-center gap-3 min-w-[40px]">
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase">{i === 0 ? "Now" : displayHour}</span>
                                <Thermometer className="w-4 h-4 text-primary opacity-60" />
                                <span className="text-sm font-bold text-on-surface">{isNaN(temp) ? "--" : Math.round(temp)}°</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>
                  

                  {/* 7-Day Forecast */}
                  {data?.dailyForecast && data.dailyForecast.length > 0 && (
                    <section className="bg-surface-container-low rounded-[2rem] pt-6 pb-2 mt-6 shadow-sm border border-black/5 dark:border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 text-on-surface-variant mb-4 px-6">
                        <HistoryIcon className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">7-Day Outlook</span>
                      </div>
                      <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
                        {data.dailyForecast.slice(0, 10).map((day, idx) => {
                          const isExpanded = expandedForecastIdx === idx;
                          return (
                            <div key={idx} className="flex flex-col relative transition-all group/day">
                              <motion.div 
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setExpandedForecastIdx(isExpanded ? null : idx)}
                                className={`flex items-center gap-4 py-4 px-6 lg:hover:bg-black/5 lg:dark:hover:bg-white/5 transition-all cursor-pointer relative lg:hover:z-10 lg:hover:border-t-transparent lg:hover:[&+*]:border-t-transparent ${isExpanded ? "bg-sky-900/20 dark:bg-sky-500/10 border-t-transparent" : ""}`}
                              >
                                <div className="flex items-center gap-4 w-[160px] sm:w-[200px] shrink-0">
                                  <span className="text-base font-black text-on-surface w-28 sm:w-36 shrink-0 inline-block truncate">{day.name}</span>
                                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container flex items-center justify-center border border-black/5 dark:border-white/5 overflow-hidden shadow-sm relative shrink-0 transition-transform group-hover/day:scale-110">
                                    <img 
                                      src={day.icon} 
                                      alt={day.shortForecast} 
                                      className="w-full h-[220%] object-cover object-top" 
                                      referrerPolicy="no-referrer" 
                                    />
                                    {day.precipitationProbability > 0 && (
                                      <div className="absolute bottom-0.5 right-0.5 bg-primary/90 backdrop-blur-sm text-white text-[7px] font-black px-1 py-0.5 rounded-sm shadow-sm border border-white/10">
                                        {day.precipitationProbability}%
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-on-surface-variant line-clamp-1 group-hover/day:text-on-surface transition-colors">
                                    {day.shortForecast}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 w-12 sm:w-16 justify-end shrink-0">
                                  <span className={`text-lg sm:text-xl font-black ${getTemperatureColor(day.temp)}`}>
                                    {!isNaN(day.temp) ? (unit === "F" ? day.temp : Math.round((day.temp - 32) * 5/9)) : "--"}°
                                  </span>
                                  <ChevronRight className={`w-5 h-5 text-primary/60 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                              </motion.div>
                              
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden bg-sky-900/20 dark:bg-sky-500/10 px-6 pb-6"
                                  >
                                    <div className="pt-2 text-sm leading-relaxed text-on-surface font-semibold border-t border-sky-500/20 dark:border-sky-400/20">
                                      {day.detailedForecast || day.shortForecast}
                                      {day.precipitationProbability > 0 && (
                                        <div className="mt-2 text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                                          <Droplets className="w-3.5 h-3.5" />
                                          Chance of precipitation: {day.precipitationProbability}%
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-6">
                    {/* Swim Suitability */}
                    <div className="col-span-2 sm:col-span-1 bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-on-surface-variant mb-4 px-1">
                        <Waves className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Swim Suitability</span>
                      </div>
                      <div className="space-y-4">
                        <div className={`flex items-center gap-3 text-3xl font-black tracking-tight ${
                          data?.tempF === null && data?.status === "ACTIVE" 
                            ? "text-on-surface-variant opacity-50" 
                            : (Math.round((data?.tempF || lastWaterTempPoint?.tempF) || 0) < 60 ? "text-red-500" : Math.round((data?.tempF || lastWaterTempPoint?.tempF) || 0) < 70 ? "text-orange-500" : "text-green-500")
                        }`}>
                          {data?.tempF === null && data?.status === "ACTIVE" ? (
                            <>
                              <WifiOff className="w-6 h-6" />
                              <span>Unknown</span>
                            </>
                          ) : Math.round((data?.tempF || lastWaterTempPoint?.tempF) || 0) < 60 ? (
                            <>
                              <AlertTriangle className="w-6 h-6" />
                              <span>Dangerous</span>
                            </>
                          ) : Math.round((data?.tempF || lastWaterTempPoint?.tempF) || 0) < 70 ? (
                            <>
                              <AlertCircle className="w-6 h-6" />
                              <span>Caution</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-6 h-6" />
                              <span>Safe</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant opacity-70 leading-relaxed font-medium">
                          {data?.tempF === null && data?.status === "ACTIVE"
                            ? "Water temperature sensor is currently offline. Suitability cannot be determined."
                            : Math.round((data?.tempF || lastWaterTempPoint?.tempF) || 0) < 60 
                              ? "Extreme cold shock risk. Wetsuit mandatory." 
                              : Math.round((data?.tempF || lastWaterTempPoint?.tempF) || 0) < 70 
                                ? "Cold water shock risk. Limit exposure." 
                                : "Comfortable swimming conditions."}
                        </p>
                      </div>
                    </div>

                    {/* Wind */}
                    <div className="bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-on-surface-variant mb-6 px-1">
                        <Wind className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Wind Speed</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-5xl font-black text-on-surface drop-shadow-sm">
                          {data?.windSpeed !== null && data?.windSpeed !== undefined && !isNaN(Number(data.windSpeed))
                            ? data.windSpeed
                            : (lastWindPoint ? lastWindPoint.windSpeed : "0")}
                        </p>
                        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mt-2">
                          {data?.windSpeed !== null && data?.windSpeed !== undefined ? "MPH" : "Last Hour"}
                        </p>
                      </div>
                    </div>

                    {/* Air Temp */}
                    <div className="bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-on-surface-variant mb-6 px-1">
                        <ThermometerSun className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Air Temp</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className={`text-5xl font-black drop-shadow-sm ${getTemperatureColor(data?.airTempF ?? lastAirTempPoint?.airTempF ?? 0)}`}>
                          {data?.airTempC !== null && data?.airTempC !== undefined && !isNaN(data.airTempF || 0) && !isNaN(data.airTempC || 0)
                            ? Math.round(unit === "F" ? (data.airTempF ?? 0) : (data.airTempC ?? 0))
                            : (lastAirTempPoint && !isNaN(lastAirTempPoint.airTempF || 0) ? Math.round(unit === "F" ? (lastAirTempPoint.airTempF || 0) : (lastAirTempPoint.airTempC || 0)) : "--")}°
                        </p>
                        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mt-2">
                          {data?.airTempC !== null && data?.airTempC !== undefined ? "Surface Level" : "Last Hour"}
                        </p>
                      </div>
                    </div>
                    {/* Dew Point */}
                    <div className="bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-on-surface-variant mb-6 px-1">
                        <ThermometerSnowflake className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Dew Point</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className={`text-5xl font-black drop-shadow-sm ${getTemperatureColor((data?.dewpoint !== null && data?.dewpoint !== undefined ? data.dewpoint : (avgDewpoint ?? 0)) * 9/5 + 32)}`}>
                          {data?.dewpoint !== null && data?.dewpoint !== undefined && !isNaN(data.dewpoint)
                            ? Math.round(unit === "F" ? (data.dewpoint * 9/5 + 32) : data.dewpoint)
                            : (avgDewpoint !== null && !isNaN(avgDewpoint) ? Math.round(unit === "F" ? (avgDewpoint * 9/5 + 32) : avgDewpoint) : "--")}°
                        </p>
                        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mt-2">
                          {data?.dewpoint !== null ? "Atmospheric" : "24h Average"}
                        </p>
                      </div>
                    </div>

                    {/* Precipitation */}
                    {currentPrecipitationAvailable && (
                      <div className="bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 text-on-surface-variant mb-6">
                          <CloudRain className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Precipitation</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <p className="text-3xl font-black text-on-surface">
                            {data?.precipitation !== null && data?.precipitation !== undefined
                              ? `${data.precipitation}"` 
                              : (hasPrecipitationRecords ? `${totalPrecipitation.toFixed(2)}"` : "--")}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mt-1">
                            {data?.precipitation !== null && data?.precipitation !== undefined ? "Past Hour" : "24h Total"}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Sunrise & Sunset */}
                    {(data?.sunrise || data?.sunset) && (
                      <div className="bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 text-on-surface-variant mb-6 px-1">
                          <Sun className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Sun Cycle</span>
                        </div>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                                <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                              </div>
                              <span className="text-[10px] sm:text-sm font-black uppercase tracking-wider sm:tracking-widest text-on-surface-variant">Sunrise</span>
                            </div>
                            <span className="text-sm sm:text-lg font-black text-on-surface whitespace-nowrap bg-surface-container px-2 sm:px-3 py-1 rounded-lg border border-black/5 dark:border-white/5">
                              {data.sunrise ? new Date(data.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
                              </div>
                              <span className="text-[10px] sm:text-sm font-black uppercase tracking-wider sm:tracking-widest text-on-surface-variant">Sunset</span>
                            </div>
                            <span className="text-sm sm:text-lg font-black text-on-surface whitespace-nowrap bg-surface-container px-2 sm:px-3 py-1 rounded-lg border border-black/5 dark:border-white/5">
                              {data.sunset ? new Date(data.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Humidity */}
                    {currentHumidityAvailable && (
                      <div className="bg-surface-container-low rounded-[2rem] p-4 sm:p-6 border border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 text-on-surface-variant mb-6 px-1">
                          <Droplets className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-widest text-primary leading-none">Humidity</span>
                        </div>
                        <div className="flex flex-col items-center text-center">
                          <p className="text-5xl font-black text-on-surface drop-shadow-sm">
                            {data?.humidity !== null && data?.humidity !== undefined && !isNaN(data.humidity)
                              ? `${Math.round(data.humidity)}%` 
                              : (avgHumidity !== null && !isNaN(avgHumidity) ? `${Math.round(avgHumidity)}%` : "--")}
                          </p>
                          <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-on-surface-variant mt-2 max-w-[80px] sm:max-w-none">
                            {data?.humidity !== null && data?.humidity !== undefined ? "Relative Humidity" : "24h Average"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            } />
            <Route path="/history" element={
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="space-y-6">
                {/* Top Buoy Selector Bar */}
                <div className="relative">
                  <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full bg-surface-container-low border border-black/5 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-surface-container transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full animate-pulse border border-black/10 dark:border-white/10 ${
                        data?.status === "ACTIVE" 
                          ? (data?.tempC !== null && data?.tempC !== undefined && !isNaN(data.tempC) ? "bg-[#ccff00] shadow-[0_0_8px_#ccff00]" : "bg-[#ffbf00] shadow-[0_0_8px_#ffbf00]") 
                          : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                      }`} />
                      <span className="text-sm font-bold text-on-surface">{selectedBuoy.endsWith("Buoy") ? selectedBuoy : `${selectedBuoy} Buoy`}</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-on-surface-variant transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                        animate={{ opacity: 1, y: 0, scale: 1 }} 
                        exit={{ opacity: 0, y: 10, scale: 0.95 }} 
                        className="absolute top-full left-0 right-0 mt-2 bg-surface-container-highest backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                      >
                        {sortedBuoys.map((buoy) => (
                          <button 
                            key={buoy.id} 
                            onClick={() => { setSelectedBuoy(buoy.name); setIsDropdownOpen(false); }} 
                            className={`w-full text-left px-4 py-3 text-sm font-bold flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${selectedBuoy === buoy.name ? 'text-primary' : 'text-on-surface'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                buoy.active 
                                  ? (buoy.tempC !== null && buoy.tempC !== undefined && !isNaN(buoy.tempC) ? "bg-[#ccff00] shadow-[0_0_5px_#ccff00]" : "bg-[#ffbf00] shadow-[0_0_5px_#ffbf00]")
                                  : "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"
                              }`} />
                              {buoy.name}
                            </div>
                            {selectedBuoy === buoy.name && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="bg-surface-container-low rounded-[2rem] p-8 shadow-sm border border-black/5 dark:border-white/5">
                  <h2 className="text-3xl font-black text-on-surface mb-2 font-headline uppercase tracking-tight drop-shadow-sm">24h History</h2>
                  <div className="space-y-4 mb-8">
                    <p className="text-base font-bold text-on-surface-variant">
                      Detailed trends and historical data for the <span className="text-primary">{selectedBuoy}</span>.
                    </p>
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex items-start gap-4">
                      <div className="mt-0.5"><Database className="w-5 h-5 text-primary" /></div>
                      <p className="text-xs leading-relaxed text-on-surface font-semibold">
                        <span className="text-primary font-black uppercase tracking-wider block mb-1">On-Device Replica</span>
                        Charts read a photocopy of the official diary kept on this device. Opening the app syncs new
                        readings; turn on Background sync in Settings for hourly catch-up while you are online.
                      </p>
                    </div>
                  </div>
                  
                  {history.length >= 2 ? (
                    <HistoryCharts 
                      history={history} 
                      unit={unit} 
                      isDark={isDark} 
                      hasPrecipitationData={hasPrecipitationRecords} 
                      hasHumidityData={hasHumidityData} 
                      hasDewpointData={hasDewpointData}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 bg-surface-container-highest/10 rounded-[2rem] border border-dashed border-on-surface-variant/20 text-center px-6">
                      <div className="relative">
                        {isSelectedBuoyOffline && history.length === 0 ? (
                          <WifiOff className="w-12 h-12 text-orange-500 opacity-40 mb-4" />
                        ) : (
                          <Database className="w-12 h-12 text-primary opacity-20 mb-4" />
                        )}
                        {history.length > 0 && (
                          <div className="absolute -top-1 -right-1 bg-primary text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                            {history.length}
                          </div>
                        )}
                      </div>
                      <p className="text-on-surface-variant font-medium opacity-60">
                        {isSelectedBuoyOffline && history.length === 0 
                          ? "Buoy is resting" 
                          : history.length === 0 
                            ? "Waiting for the first sync"
                            : "One more reading and charts appear"}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant opacity-40 mt-2 max-w-[240px]">
                        {isSelectedBuoyOffline && history.length === 0
                          ? "This sensor isn't sending data right now. You can still check other buoys on the Network tab."
                          : history.length === 0 
                            ? "Open the app online once to photocopy readings onto this device. Charts appear after two points."
                            : `Collected ${history.length} of 2 points for trend lines.`}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            } />
            <Route path="/network" element={
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="space-y-6">
                <div className="bg-surface-container-low rounded-[2rem] pt-8 pb-4 shadow-sm border border-black/5 dark:border-white/5 overflow-hidden">
                  <h2 className="text-2xl font-black text-on-surface mb-2 font-headline uppercase tracking-tight px-8">Lake Network</h2>
                  <p className="text-sm text-on-surface-variant opacity-70 mb-6 px-8">Real-time data from all monitored sensors in the Seattle area.</p>
                  
                  <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
                    {sortedBuoys.map((buoy) => {
                      const isExpanded = expandedBuoyId === buoy.id;
                      return (
                        <div key={buoy.id} className="flex flex-col relative transition-all lg:hover:z-10 lg:hover:border-t-transparent lg:hover:[&+*]:border-t-transparent group/buoy">
                            <Tooltip content={`Click to ${isExpanded ? 'close' : 'toggle'} location details`} side="top">
                              <motion.div 
                                whileTap={{ scale: 0.98 }} 
                                onClick={() => setExpandedBuoyId(isExpanded ? null : buoy.id)} 
                                className={`relative py-5 px-8 flex items-center justify-between cursor-pointer transition-all overflow-hidden ${selectedBuoy === buoy.name ? "bg-primary/10" : "lg:hover:bg-primary/5 dark:lg:hover:bg-white/5"} group/buoy`}
                              >
                                <div className="relative z-10 flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${
                                    buoy.active 
                                      ? (buoy.tempC !== null && buoy.tempC !== undefined && !isNaN(buoy.tempC) 
                                        ? "bg-[#ccff00]/10 text-[#718800] dark:text-[#ccff00] border-[#718800]/30 dark:border-[#ccff00]/20 shadow-[0_0_10px_rgba(204,255,0,0.1)]" 
                                        : "bg-[#ffbf00]/10 text-[#ffbf00] border-[#ffbf00]/30 shadow-[0_0_10px_rgba(255,191,0,0.1)]") 
                                      : "bg-on-surface-variant/10 text-on-surface-variant border-transparent"
                                  }`}><MapPin className="w-5 h-5" /></div>
                                  <div>
                                    <h3 className="text-base font-black text-on-surface uppercase tracking-tight">{buoy.name}</h3>
                                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{buoy.lat?.toFixed(3) || "0.000"}, {buoy.lon?.toFixed(3) || "0.000"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-5">
                                  <div className="text-right">
                                    <p className={`text-2xl font-black drop-shadow-sm ${getTemperatureColor(buoy.tempF || 0)}`}>
                                      {buoy.tempC !== null && buoy.tempC !== undefined && !isNaN(buoy.tempC) 
                                        ? `${unit === "F" ? Math.round(buoy.tempF || 0) : Math.round(buoy.tempC)}°` 
                                        : "--°"}
                                    </p>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                                      buoy.active 
                                        ? (buoy.tempC !== null && buoy.tempC !== undefined && !isNaN(buoy.tempC) ? "text-[#718800] dark:text-[#ccff00]" : "text-[#ffbf00]") 
                                        : "text-on-surface-variant"
                                    }`}>
                                      {buoy.active ? (buoy.tempC !== null && buoy.tempC !== undefined && !isNaN(buoy.tempC) ? "Active" : "Partial") : "Offline"}
                                    </span>
                                  </div>
                                  <ChevronRight className={`w-5 h-5 text-primary/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                              </motion.div>
                            </Tooltip>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden bg-surface-container-highest/10 px-8 py-6 transition-all"
                                >
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                      <div className="space-y-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-tight text-primary leading-none italic">Buoy <span className="text-on-surface not-italic">Location</span></h4>
                                        <p className="text-[11px] font-bold text-on-surface-variant font-mono">{buoy.lat?.toFixed(4)}, {buoy.lon?.toFixed(4)}</p>
                                      </div>
                                      <Tooltip content="Go to Dashboard with this Buoy selected">
                                        <Link 
                                          to="/" 
                                          onClick={() => setSelectedBuoy(buoy.name)}
                                          className="p-3 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl transition-all cursor-pointer flex items-center gap-2"
                                        >
                                          <LayoutDashboard className="w-4 h-4" />
                                          <span className="text-[10px] font-black uppercase tracking-widest">Dashboard</span>
                                        </Link>
                                      </Tooltip>
                                    </div>
                                    <div className="w-full aspect-[2/1] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-inner group relative">
                                      <StaticMap 
                                        lat={buoy.lat || 0} 
                                        lon={buoy.lon || 0} 
                                        zoom={mapZoom[buoy.id] || 11}
                                        name={buoy.name}
                                        className="transition-transform duration-700 group-hover:scale-110"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                                      
                                      {/* Zoom Controls */}
                                      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
                                        <Tooltip content="Zoom In">
                                          <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const currentZ = mapZoom[buoy.id] || 11;
                                              if (currentZ < 17) {
                                                setMapZoom(prev => ({ ...prev, [buoy.id]: currentZ + 1 }));
                                              }
                                            }}
                                            className="w-8 h-8 bg-surface/90 backdrop-blur-md rounded-lg flex items-center justify-center text-on-surface shadow-lg border border-black/5 dark:border-white/10 cursor-pointer lg:hover:bg-primary lg:hover:text-white transition-colors"
                                          >
                                            <Plus className="w-4 h-4" />
                                          </motion.button>
                                        </Tooltip>
                                        <Tooltip content="Zoom Out">
                                          <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const currentZ = mapZoom[buoy.id] || 11;
                                              if (currentZ > 1) {
                                                setMapZoom(prev => ({ ...prev, [buoy.id]: currentZ - 1 }));
                                              }
                                            }}
                                            className="w-8 h-8 bg-surface/90 backdrop-blur-md rounded-lg flex items-center justify-center text-on-surface shadow-lg border border-black/5 dark:border-white/10 cursor-pointer lg:hover:bg-primary lg:hover:text-white transition-colors"
                                          >
                                            <Minus className="w-4 h-4" />
                                          </motion.button>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            } />
            <Route path="/icons" element={<IconGallery />} />
            <Route path="/tos" element={<TOSPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      <nav className="shrink-0 z-50 bg-surface/80 backdrop-blur-xl border-t border-black/5 dark:border-white/5 pb-safe">
        <div className="flex justify-around items-center px-4 pt-4 pb-6">
          <Tooltip content="Home Dashboard">
            <Link to="/" className={`flex flex-col items-center justify-center transition-all cursor-pointer ${activeTab === "current" ? "text-primary" : "text-on-surface/40"}`}>
              <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center">
                <LayoutDashboard className="w-6 h-6" />
                <span className="text-[10px] font-bold mt-1">Dashboard</span>
              </motion.div>
            </Link>
          </Tooltip>
          <Tooltip content="History Trends">
            <Link to="/history" className={`flex flex-col items-center justify-center transition-all cursor-pointer ${activeTab === "history" ? "text-primary" : "text-on-surface/40"}`}>
              <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center">
                <HistoryIcon className="w-6 h-6" />
                <span className="text-[10px] font-bold mt-1">History</span>
              </motion.div>
            </Link>
          </Tooltip>
          <Tooltip content="Lake Network">
            <Link to="/network" className={`flex flex-col items-center justify-center transition-all cursor-pointer ${activeTab === "map" ? "text-primary" : "text-on-surface/40"}`}>
              <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center">
                <MapPin className="w-6 h-6" />
                <span className="text-[10px] font-bold mt-1">Network</span>
              </motion.div>
            </Link>
          </Tooltip>
        </div>
      </nav>


      <AnimatePresence>
        {showOfflineAlert && !isOnline && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="w-full max-w-sm bg-surface-container-low border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl text-center">
              <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><WifiOff className="w-10 h-10 text-orange-500" /></div>
              <h2 className="text-xl font-bold text-on-surface mb-3 font-headline">No connection right now</h2>
              <p className="text-sm text-on-surface-variant opacity-70 mb-8 leading-relaxed">
                We couldn&apos;t reach the buoys. If you&apos;ve opened the app before, your last readings may
                still be on screen. Try again when you have signal — or just check back later.
              </p>
              <button onClick={() => setShowOfflineAlert(false)} className="w-full bg-on-surface text-surface font-bold py-4 rounded-2xl shadow-lg active:scale-[0.98] transition-all">OK</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRadarModal && data?.radarStation && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="w-full max-w-5xl h-full max-h-[85vh] bg-surface-container-low border border-black/10 dark:border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5 bg-surface/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Radar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-on-surface uppercase tracking-tight leading-none italic">
                      National Weather Service <span className="text-primary not-italic">Radar</span>
                    </h3>
                    <p className="text-[10px] text-on-surface-variant opacity-60 font-bold uppercase tracking-widest mt-1">
                      Station: {data.radarStation}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip content="Open in new tab">
                    <a 
                       href={`https://radar.weather.gov/station/${data.radarStation}/standard`}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-on-surface-variant cursor-pointer"
                     >
                       <Share className="w-4 h-4" />
                     </a>
                  </Tooltip>
                   <button 
                     onClick={() => setShowRadarModal(false)}
                     className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors group cursor-pointer"
                   >
                     <X className="w-6 h-6 text-on-surface-variant group-hover:text-on-surface transition-colors" />
                   </button>
                </div>
              </div>
              <div className="flex-1 bg-black/5 relative min-h-0">
                <iframe 
                  src={`https://radar.weather.gov/station/${data.radarStation}/standard`}
                  className="w-full h-full border-none"
                  title="NWS Live Radar"
                  allow="geolocation"
                />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 animate-pulse bg-surface/5">
                   <Radar className="w-12 h-12 text-primary opacity-20" />
                </div>
              </div>
              <div className="px-6 py-3 bg-surface/30 backdrop-blur-sm border-t border-black/5 dark:border-white/5 text-center">
                 <p className="text-[9px] text-on-surface-variant opacity-40 uppercase font-bold tracking-[0.2em]">
                   Observational data provided by NOAA and the National Weather Service. Mapping context provided via public geospatial services.
                 </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
    </ErrorBoundary>
  );
}
