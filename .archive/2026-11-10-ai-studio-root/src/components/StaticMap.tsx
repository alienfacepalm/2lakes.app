import React from 'react';

interface StaticMapProps {
  lat: number;
  lon: number;
  zoom?: number;
  className?: string;
  name?: string;
}

/**
 * A robust static map component that exclusively uses free mapping services (Yandex).
 * Uses a CSS crop to hide localized branding text for a cleaner UI.
 */
export const StaticMap: React.FC<StaticMapProps> = ({ 
  lat, 
  lon, 
  zoom = 11, 
  className = "", 
  name = "Location" 
}) => {
  /**
   * We exclusively use free mapping services as requested.
   * Fallback to Yandex with a "Hide Branding" technique to avoid localized Cyrillic text.
   */
  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <div 
        className="absolute inset-x-0 top-0"
        style={{ 
          height: '115%', // Request ~15% more height to hide footer via crop
        }}
      >
        <img
          src={`https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=${zoom}&l=map&size=450,260&pt=${lon},${lat},pm2rdm&lang=en_US`}
          alt={`Map showing ${name}`}
          className="w-full h-full object-cover object-top opacity-0 transition-opacity duration-500 bg-surface-container-highest/20"
          onLoad={(e) => {
            (e.target as HTMLImageElement).classList.remove('opacity-0');
          }}
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
};
