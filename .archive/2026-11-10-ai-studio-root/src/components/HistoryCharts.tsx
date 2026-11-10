import React, { useState, useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from "recharts";
import { Thermometer, Wind, CloudRain, Droplets, CalendarRange } from "lucide-react";
import { HistoryPoint } from "../types";
import { Tooltip as UITooltip } from "./Tooltip";

interface HistoryChartsProps {
  history: HistoryPoint[];
  unit: "C" | "F";
  isDark: boolean;
  hasPrecipitationData: boolean;
  hasHumidityData: boolean;
  hasDewpointData: boolean;
}

type TimeRange = "6h" | "12h" | "24h" | "48h" | "72h" | "1w" | "1m" | "1y";

export const HistoryCharts: React.FC<HistoryChartsProps> = ({ history, unit, isDark, hasPrecipitationData, hasHumidityData, hasDewpointData }) => {
  const [range, setRange] = useState<TimeRange>("24h");

  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    
    const now = new Date().getTime();
    const rangeMs = {
      "6h": 6 * 60 * 60 * 1000,
      "12h": 12 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "48h": 48 * 60 * 60 * 1000,
      "72h": 72 * 60 * 60 * 1000,
      "1w": 7 * 24 * 60 * 60 * 1000,
      "1m": 30 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    }[range];

    const cutoff = now - rangeMs;
    return history.filter(p => new Date(p.time).getTime() >= cutoff);
  }, [history, range]);

  const tooltipStyle = { 
    backgroundColor: isDark ? 'rgba(28, 28, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)', 
    border: 'none', 
    borderRadius: '16px', 
    fontSize: '12px', 
    color: isDark ? '#fff' : '#000', 
    backdropFilter: 'blur(10px)', 
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
  };

  const ranges: { label: string; fullLabel: string; value: TimeRange }[] = [
    { label: "6H", fullLabel: "6 Hours", value: "6h" },
    { label: "12H", fullLabel: "12 Hours", value: "12h" },
    { label: "24H", fullLabel: "24 Hours", value: "24h" },
    { label: "1W", fullLabel: "1 Week", value: "1w" },
    { label: "1M", fullLabel: "1 Month", value: "1m" },
    { label: "1Y", fullLabel: "1 Year", value: "1y" },
  ];

  const formatTick = (time: string) => {
    const d = new Date(time);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    
    if (range === "1y") {
      return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
    }
    if (range === "1m") {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    if (range === "48h" || range === "72h" || range === "1w") {
      return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
    }
    return `${hh}:${mm}`;
  };

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <section className="bg-surface-container-highest/30 rounded-[2rem] p-6 border border-black/5 dark:border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <CalendarRange className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Time Range</span>
          </div>
          <div className="flex p-0.5 sm:p-1 bg-surface-container-highest/50 rounded-xl w-full sm:w-fit flex-nowrap justify-between sm:justify-start items-center">
            {ranges.map((r) => (
              <UITooltip key={r.value} content={`Show Data for the Last ${r.fullLabel}`}>
                <button
                  onClick={() => setRange(r.value)}
                  className={`px-2 sm:px-3 py-1 rounded-lg text-[10px] font-black transition-all shrink-0 cursor-pointer ${
                    range === r.value 
                      ? "bg-surface shadow-sm text-primary" 
                      : "text-on-surface-variant opacity-50 hover:opacity-100"
                  }`}
                >
                  {r.label}
                </button>
              </UITooltip>
            ))}
          </div>
        </div>
      </section>

      {/* Temperature Trend */}
      <section className="bg-surface-container-highest/30 rounded-[2rem] p-6 border border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2 mb-6 text-on-surface-variant">
          <Thermometer className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Temperature Trend</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredHistory}>
              <defs>
                <linearGradient id="colorWaterHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#007aff" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#007aff" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAirHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fb923c" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-on-surface-variant)" opacity={0.05} />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatTick} 
                stroke="var(--color-on-surface-variant)" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                opacity={0.5} 
              />
              <YAxis domain={['auto', 'auto']} stroke="var(--color-on-surface-variant)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}°`} opacity={0.5} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontWeight: 'bold' }} labelFormatter={(label) => new Date(label).toLocaleString()} />
              <Area type="monotone" name="Water Temperature" dataKey={unit === "F" ? "tempF" : "tempC"} stroke="#007aff" strokeWidth={3} fillOpacity={1} fill="url(#colorWaterHist)" connectNulls />
              <Area type="monotone" name="Air Temperature" dataKey={unit === "F" ? "airTempF" : "airTempC"} stroke="#fb923c" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorAirHist)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Wind Speed Trend */}
      <section className="bg-surface-container-highest/30 rounded-[2rem] p-6 border border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2 mb-6 text-on-surface-variant">
          <Wind className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Wind Speed (MPH)</span>
        </div>
        <div className="h-48 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredHistory}>
              <defs>
                <linearGradient id="colorWindHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-on-surface-variant)" opacity={0.05} />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatTick} 
                stroke="var(--color-on-surface-variant)" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                opacity={0.5} 
              />
              <YAxis stroke="var(--color-on-surface-variant)" fontSize={10} tickLine={false} axisLine={false} opacity={0.5} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#10b981', fontWeight: 'bold' }} labelFormatter={(label) => new Date(label).toLocaleString()} />
              <Area type="monotone" name="Wind Speed" dataKey="windSpeed" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorWindHist)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Precipitation */}
      {hasPrecipitationData && (
        <section className="bg-surface-container-highest/30 rounded-[2rem] p-6 border border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2 mb-6 text-on-surface-variant">
            <CloudRain className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Precipitation (Inches)</span>
          </div>
          <div className="h-40 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredHistory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-on-surface-variant)" opacity={0.05} />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTick} 
                  stroke="var(--color-on-surface-variant)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  opacity={0.5} 
                />
                <YAxis stroke="var(--color-on-surface-variant)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}"`} opacity={0.5} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }} labelFormatter={(label) => new Date(label).toLocaleString()} />
                <Bar name="Precipitation" dataKey="precipitation" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Humidity */}
      {hasHumidityData && (
        <section className="bg-surface-container-highest/30 rounded-[2rem] p-6 border border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2 mb-6 text-on-surface-variant">
            <Droplets className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Humidity Trend (%)</span>
          </div>
          <div className="h-40 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredHistory}>
                <defs>
                  <linearGradient id="colorHumHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-on-surface-variant)" opacity={0.05} />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTick} 
                  stroke="var(--color-on-surface-variant)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  opacity={0.5} 
                />
                <YAxis domain={[0, 100]} stroke="var(--color-on-surface-variant)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} opacity={0.5} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#8b5cf6', fontWeight: 'bold' }} labelFormatter={(label) => new Date(label).toLocaleString()} />
                <Area type="monotone" name="Relative Humidity" dataKey="humidity" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorHumHist)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Dew Point */}
      {hasDewpointData && (
        <section className="bg-surface-container-highest/30 rounded-[2rem] p-6 border border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2 mb-6 text-on-surface-variant">
            <Droplets className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Dew Point Trend</span>
          </div>
          <div className="h-40 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredHistory}>
                <defs>
                  <linearGradient id="colorDewHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-on-surface-variant)" opacity={0.05} />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTick} 
                  stroke="var(--color-on-surface-variant)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  opacity={0.5} 
                />
                <YAxis domain={['auto', 'auto']} stroke="var(--color-on-surface-variant)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}°`} opacity={0.5} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#ec4899', fontWeight: 'bold' }} labelFormatter={(label) => new Date(label).toLocaleString()} />
                <Area type="monotone" name="Dew Point Temperature" dataKey={unit === "F" ? "dewpointF" : "dewpoint"} stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorDewHist)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
};
