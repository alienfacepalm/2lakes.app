import React from "react";
import { motion } from "motion/react";
import { ShieldAlert, FileText, ArrowLeft, Globe, Scale, Fingerprint, Lock } from "lucide-react";
import { Link } from "react-router-dom";

export const TOSPage: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: 20 }}
      className="max-w-3xl mx-auto space-y-8 pb-32"
    >
      <div className="flex items-center gap-4 mb-10">
        <Link 
          to="/"
          className="w-12 h-12 rounded-2xl bg-surface-container-low border border-black/5 dark:border-white/10 flex items-center justify-center text-primary hover:bg-surface-container transition-all active:scale-90"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-4xl font-black text-on-surface uppercase tracking-tight leading-none mb-1">
            Terms of <span className="text-primary italic">Service</span>
          </h1>
          <p className="text-xs text-on-surface-variant opacity-60 font-bold uppercase tracking-widest">
            Last Revision: April 2026 • v1.4
          </p>
        </div>
      </div>

      {/* Preamble / Introduction */}
      <section className="bg-surface-container-low rounded-[2.5rem] p-8 border border-black/5 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Scale className="w-6 h-6 text-primary" />
          <h2 className="text-lg font-black text-on-surface uppercase tracking-tight">Purpose & Acceptance</h2>
        </div>
        <p className="text-sm font-medium leading-relaxed text-on-surface-variant">
          This Service is provided to help monitor local lake conditions. By accessing 2lakes.app, you agree to these terms. We reserve the right to modify the Service or these terms at any time to ensure the continued quality and sustainability of the project.
        </p>
      </section>

      {/* Beta Phase Analysis */}
      <section className="bg-primary/5 border border-primary/20 rounded-[2.5rem] p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <ShieldAlert className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <ShieldAlert className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-black text-on-surface uppercase tracking-tight">Beta Service Notice</h2>
          </div>
          <p className="text-sm font-semibold leading-relaxed text-on-surface-variant italic">
            2lakes.app is an experimental platform in its Alpha/Beta phase. Service interruptions, data inaccuracies, or sensor outages may occur. This Service is intended for recreational and informational purposes only. It should not be relied upon for maritime navigation, safety-critical operations, or emergency decision-making.
          </p>
        </div>
      </section>

      {/* Data Integrity & Mapping Ethics */}
      <section className="bg-surface-container-low rounded-[2.5rem] p-8 border border-black/5 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-6 h-6 text-primary" />
          <h2 className="text-lg font-black text-on-surface uppercase tracking-tight">Geospatial Context</h2>
        </div>
        <div className="space-y-4">
          <p className="text-sm font-medium leading-relaxed text-on-surface-variant">
            To provide accurate context for buoy locations, we integrate data from various public and open-source mapping platforms, including NOAA, Yandex, and OpenStreetMap.
          </p>
          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-6 border border-black/5 dark:border-white/5">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-2">Service Attribution & Customization</h3>
            <p className="text-xs font-bold leading-relaxed text-on-surface-variant">
              These mapping services are selected based on their technical reliability and availability. For enhanced precision or custom styling, the platform also supports professional integration with Google Maps and Mapbox via private configuration.
            </p>
          </div>
        </div>
      </section>

      {/* Intellectual Property & Privacy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-surface-container-low rounded-[2rem] p-6 border border-black/5 dark:border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <Fingerprint className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-black text-on-surface uppercase tracking-tight">User Conduct</h2>
          </div>
          <p className="text-xs font-medium leading-relaxed text-on-surface-variant">
            Users are expected to use the Service as intended. Attempting to disrupt sensor transmissions, scrape data, or compromise the integrity of our systems is strictly prohibited.
          </p>
        </section>

        <section className="bg-surface-container-low rounded-[2rem] p-6 border border-black/5 dark:border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-black text-on-surface uppercase tracking-tight">Privacy Commitment</h2>
          </div>
          <p className="text-xs font-medium leading-relaxed text-on-surface-variant">
            We value your privacy. We collect minimal, non-identifiable telemetry to monitor buoy connectivity and Service health. We do not track individual identity or sell user data.
          </p>
        </section>
      </div>

      {/* Limitation of Liability */}
      <section className="bg-surface-container-low rounded-[2.5rem] p-8 border border-black/5 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="w-6 h-6 text-primary" />
          <h2 className="text-lg font-black text-on-surface uppercase tracking-tight">Disclaimer of Liability</h2>
        </div>
        <p className="text-sm font-medium leading-relaxed text-on-surface-variant">
          In no event shall 2lakes.app or its developers be held liable for any damages, losses, or injuries resulting from the use of this Service. Users assume all responsibility for verifying conditions locally. The Service is used at the user's sole risk and discretion.
        </p>
      </section>

      <div className="pt-10 flex flex-col items-center gap-4 border-t border-black/5 dark:border-white/5 opacity-50">
        <div className="w-12 h-1 bg-primary/20 rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-on-surface-variant">
          2lakes.app Engineering • Seattle
        </p>
      </div>
    </motion.div>
  );
};
