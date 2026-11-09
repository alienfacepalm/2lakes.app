import { useState } from "react";
import { TEMP_SCALE } from "../lib/utils";
import { Tooltip } from "./tooltip";
import { motion, AnimatePresence } from "motion/react";
import { Info, X } from "lucide-react";

export const TempLegend = ({ unit = "F" }: { unit?: "F" | "C" }) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatVal = (v: number) => {
    if (v === -Infinity || v === Infinity) return "";
    return unit === "F" ? Math.round(v) : Math.round((v - 32) * 5 / 9);
  };

  const getLabel = (step: typeof TEMP_SCALE[0]) => {
    return step.min === -Infinity 
      ? `< ${formatVal(step.max)}°` 
      : step.max > 120 
        ? `> ${formatVal(step.min)}°`
        : `${formatVal(step.min)}-${formatVal(step.max)}°`;
  };

  return (
    <>
      {/* Desktop Version */}
     <div className="hidden sm:flex items-center gap-1.5 p-2 bg-surface-container/50 backdrop-blur-md rounded-xl border border-black/5 dark:border-white/5">
        <div className="flex items-center gap-1">
          {TEMP_SCALE.map((step, idx) => (
            <Tooltip key={idx} content={
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-tighter opacity-60">Temperature Range</span>
                <span className="text-sm font-black">{getLabel(step)}</span>
              </div>
            }>
              <motion.div 
                whileHover={{ scale: 1.2, y: -2 }}
                className={`w-3 h-3 rounded-full ${step.bg} cursor-help shadow-sm border border-white/10`}
              />
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Mobile Version Link */}
      <button 
        onClick={() => setIsOpen(true)}
        className="sm:hidden flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 transition-colors rounded-full border border-primary/20 backdrop-blur-sm"
        id="mobile-legend-trigger"
      >
        <Info className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-black uppercase tracking-widest text-primary">View Temperature</span>
      </button>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-surface-container-highest rounded-t-[2.5rem] z-[100] shadow-2xl px-6 py-6 border-t border-white/10"
              id="mobile-temp-scale-drawer"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black text-on-surface uppercase tracking-tighter">Temperature</h3>
                  <p className="text-[10px] font-bold text-on-surface-variant">Thermal intensity color key ({unit})</p>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {TEMP_SCALE.map((step, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full ${step.bg} shadow-md border border-white/10`} />
                      <span className="text-base font-black text-on-surface capitalize leading-none">{step.color.replace('-', ' ')}</span>
                    </div>
                    <span className="text-lg font-black text-on-surface leading-none">{getLabel(step)}</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 text-center">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="px-6 py-3 bg-on-surface text-surface-container font-black uppercase tracking-widest rounded-xl w-full text-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
