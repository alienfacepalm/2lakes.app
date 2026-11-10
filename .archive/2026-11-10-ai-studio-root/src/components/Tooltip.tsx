import React, { useState, useEffect } from "react";
import * as RadarTooltip from "@radix-ui/react-tooltip";
import { motion, AnimatePresence } from "motion/react";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  children, 
  content, 
  side = "top", 
  align = "center",
  className = ""
}) => {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Detect if we're on a touch device to avoid sticky hover tooltips
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();
  }, []);

  // On touch devices, we often skip tooltips for decorative icons 
  // as they can cause confusing "sticky" states.
  if (isTouch) return <>{children}</>;

  return (
    <RadarTooltip.Provider delayDuration={200}>
      <RadarTooltip.Root>
        <RadarTooltip.Trigger asChild>
          {children}
        </RadarTooltip.Trigger>
        <RadarTooltip.Portal>
          <RadarTooltip.Content
            side={side}
            align={align}
            sideOffset={8}
            collisionPadding={12}
            asChild
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className={`z-[200] ${className || "max-w-[320px]"} rounded-xl bg-surface-container-highest/90 backdrop-blur-xl px-4 py-2.5 text-xs font-bold text-on-surface shadow-2xl border border-black/5 dark:border-white/10 select-none animate-in fade-in zoom-in-95 leading-relaxed break-words`}
            >
              {content}
              <RadarTooltip.Arrow className="fill-surface-container-highest/90" />
            </motion.div>
          </RadarTooltip.Content>
        </RadarTooltip.Portal>
      </RadarTooltip.Root>
    </RadarTooltip.Provider>
  );
};
