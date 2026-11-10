export interface BuoyData {
  location: string;
  tempC: number;
  tempF: number;
  airTempC: number | null;
  airTempF: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  humidity: number | null;
  dewpoint: number | null;
  precipitationProbability: number | null;
  timestamp: string;
  status: string;
  condition: string;
  lastSync: string;
  lat: number | null;
  lon: number | null;
  sunrise?: string;
  sunset?: string;
  hourlyForecast?: Array<{
    time: string;
    temp: number;
    condition: string;
    isDaytime: boolean;
    windSpeed: string;
    windDirection?: string;
    icon: string;
    precipitationProbability: number;
    humidity: number | null;
    dewpoint: number | null;
  }>;
  dailyForecast?: Array<{
    name: string;
    temp: number;
    isDaytime: boolean;
    icon: string;
    shortForecast: string;
    detailedForecast: string;
    precipitationProbability: number;
  }>;
  alerts?: Array<{
    event: string;
    severity: string;
    headline: string;
    description: string;
    instruction: string;
  }>;
  radarStation?: string;
}

export interface MapBuoy {
  id: string;
  name: string;
  tempC: number | null;
  tempF: number | null;
  lat: number;
  lon: number;
  active: boolean;
}

export interface HistoryPoint {
  time: string;
  tempC: number;
  tempF: number;
  airTempC?: number;
  airTempF?: number;
  precipitation?: number;
  windSpeed?: number;
  humidity?: number;
  dewpoint?: number;
  dewpointF?: number | null;
  precipitationProbability?: number;
}
