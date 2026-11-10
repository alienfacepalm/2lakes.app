import React from "react";
import { motion } from "motion/react";
import { ThermometerSun, Sun, ThermometerSnowflake, Cloud, Cloudy as CloudyIcon, Wind, CloudRain, CloudDrizzle, Waves } from "lucide-react";
import { getConditionIcon } from "../lib/utils";

export const IconGallery = () => {
  const conditions = ["Warm", "Moderate", "Cold", "Cloudy", "Overcast", "Windy", "Rainy", "Showers", "Unknown"];
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: 20 }} 
      className="bg-surface-container-low rounded-[2rem] p-8 shadow-sm border border-black/5 dark:border-white/5"
    >
      <h2 className="text-2xl font-black text-on-surface mb-6 font-headline uppercase tracking-tight">Icon Library</h2>
      <div className="grid grid-cols-3 gap-4">
        {conditions.map(c => (
          <div key={c} className="flex flex-col items-center gap-2 p-4 bg-surface-container rounded-2xl border border-black/5 dark:border-white/5">
            {getConditionIcon(c)}
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{c}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
