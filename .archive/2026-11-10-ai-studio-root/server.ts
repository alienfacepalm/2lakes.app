import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, getDocs, limit, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { BUOY_CONFIGS, NWS_USER_AGENT, CACHE_TTL, NWS_TIMEOUT } from "./src/constants.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase for background sync
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let db: any = null;

if (fs.existsSync(firebaseConfigPath)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("[Firebase] Background sync initialized");
  } catch (err) {
    console.error("[Firebase] Failed to initialize background sync:", err);
  }
}

let syncStats = {
  lastSync: "Never",
  lastSyncTimestamp: 0,
  pointsSaved: 0,
  errors: 0
};

/**
 * Triggers background sync if it hasn't run in the last hour.
 * This "lazy sync" approach allows the Cloud Run container to scale to 0 when idle,
 * significantly reducing hosting costs.
 */
function triggerLazySync() {
  const ONE_HOUR = 60 * 60 * 1000;
  if (Date.now() - syncStats.lastSyncTimestamp > ONE_HOUR) {
    // Run in background, don't await to keep request responsive
    performBackgroundSync().catch(err => console.error("[Sync] Lazy sync failed:", err));
  }
}

async function performBackgroundSync() {
  if (!db) {
    console.log("[Background Sync] Skipped: Firebase not initialized");
    return;
  }
  syncStats.lastSyncTimestamp = Date.now();
  console.log("[Background Sync] Starting fetch at", new Date().toISOString());
  
  try {
    const response = await fetch("https://green2.kingcounty.gov/lake-buoy/GenerateMapData.aspx", {
      signal: AbortSignal.timeout(NWS_TIMEOUT),
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    const lines = text.split("^").filter(line => line.trim() !== "");
    
    for (const line of lines) {
      try {
        const parts = line.split("|").map(p => p.trim());
        const nameIndex = parts.findIndex(p => p.length > 0 && !p.startsWith("\t"));
        if (nameIndex === -1) continue;
        
        const rawName = parts[nameIndex];
        
        // Strict mapping to BUOY_CONFIGS
        const configEntry = Object.entries(BUOY_CONFIGS).find(([name, cfg]) => {
          const ln = rawName.toLowerCase();
          const sn = cfg.searchName.toLowerCase();
          const fn = name.toLowerCase();
          
          return ln === sn || ln === fn || ln.includes(sn);
        });

        if (!configEntry) {
          // Skip buoys not in our configuration
          continue;
        }

        const buoyName = configEntry[0];

        const getVal = (idx: number) => {
          const val = parts[nameIndex + idx];
          if (val === undefined || val === "" || val === null) return NaN;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? NaN : parsed;
        };

        // Specific parsing: index 5 is Water Temp, 2 is Air Temp, 3 is Wind Speed
        const tempC = getVal(5);
        const airTempC_kc = getVal(2);
        const windSpeed_kc = getVal(3);

        // If we have no data at all, skip
        if (isNaN(tempC) && isNaN(airTempC_kc) && isNaN(windSpeed_kc)) continue;

        // Try to get humidity and dewpoint from King County API first
        let kc_humidity = getVal(11);
        let kc_dewpoint = getVal(12);

        const ts1 = parts[nameIndex + 1];
        const ts2 = parts[nameIndex + 6];
        let bestTimestamp = ts1 || ts2 || new Date().toISOString();
        const normalizedTimestamp = new Date(bestTimestamp).toISOString();
        
        // Check existence
        const q = query(
          collection(db, "buoy_snapshots"),
          where("buoyId", "==", buoyName),
          where("timestamp", "==", normalizedTimestamp),
          limit(1)
        );
        
        const existing = await getDocs(q);
        if (!existing.empty) continue;

        // Augment with NWS
        let airTempC = isNaN(airTempC_kc) ? NaN : airTempC_kc;
        let windSpeed = isNaN(windSpeed_kc) ? NaN : windSpeed_kc;
        let precipitation = null, humidity = isNaN(kc_humidity) ? null : kc_humidity, dewpoint = isNaN(kc_dewpoint) ? null : kc_dewpoint, precipitationProbability = 0;
        const lat = parseFloat(parts[nameIndex + 7]) || (configEntry ? configEntry[1].defaultLat : 47.6);
        const lon = parseFloat(parts[nameIndex + 8]) || (configEntry ? configEntry[1].defaultLon : -122.3);

        try {
          const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
            signal: AbortSignal.timeout(NWS_TIMEOUT),
            headers: { "User-Agent": NWS_USER_AGENT }
          });
          if (pointRes.ok) {
            const pointData = await pointRes.json();
            const hourlyRes = await fetch(pointData.properties.forecastHourly, {
              signal: AbortSignal.timeout(NWS_TIMEOUT),
              headers: { "User-Agent": NWS_USER_AGENT }
            });
            if (hourlyRes.ok) {
              const forecastData = await hourlyRes.json();
              const currentPeriod = forecastData.properties.periods[0];
              if (currentPeriod) {
                if (isNaN(airTempC)) airTempC = (currentPeriod.temperature - 32) * 5/9;
                if (isNaN(windSpeed)) windSpeed = parseInt(currentPeriod.windSpeed, 10);
                // Only override if King County didn't have it
                if (humidity === null) humidity = currentPeriod.relativeHumidity?.value ?? null;
                if (dewpoint === null) dewpoint = currentPeriod.dewpoint?.value ?? null;
                const iconProb = currentPeriod.icon?.match(/,(\d+)/)?.[1];
                precipitationProbability = iconProb ? parseInt(iconProb, 10) : (currentPeriod.probabilityOfPrecipitation?.value || 0);
              }
            }
          }
        } catch (e) {
          // Silent catch for NWS augmentation
        }

        await addDoc(collection(db, "buoy_snapshots"), {
          buoyId: buoyName,
          timestamp: normalizedTimestamp,
          recordedAt: new Date().toISOString(),
          tempC: tempC,
          tempF: Math.round((tempC * 9/5) + 32),
          airTempC: isNaN(airTempC) ? null : airTempC,
          airTempF: isNaN(airTempC) ? null : Math.round((airTempC * 9/5) + 32),
          windSpeed: isNaN(windSpeed) ? null : windSpeed,
          precipitation: precipitation,
          humidity: humidity,
          dewpoint: dewpoint,
          precipitationProbability: precipitationProbability,
          lat: lat,
          lon: lon,
          serverTime: serverTimestamp()
        });
        syncStats.pointsSaved++;
      } catch (lineErr) {
        console.error(`[Background Sync] Error processing line:`, lineErr);
      }
    }
    syncStats.lastSync = new Date().toLocaleString();
  } catch (err) {
    console.error("[Background Sync] Fatal error:", err);
    syncStats.errors++;
  }
}

// Simple in-memory cache for NWS data
const nwsCache: Record<string, { data: any, expires: number }> = {};
const apiRateLimits: Record<string, number[]> = {};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Enable CORS for all API calls to support cross-origin external clients cleanly
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization");
    
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // 2. Middleware to secure external access and prevent abuse
  async function validateExternalAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
    const secFetchSite = req.headers["sec-fetch-site"];
    const referer = (req.headers["referer"] as string) || "";
    const origin = (req.headers["origin"] as string) || "";
    const host = req.headers["host"] || "";
    
    // Internal referers, same-origin, or localhost development bypass
    const isInternal = 
      secFetchSite === "same-origin" || 
      (referer && referer.includes(host)) ||
      (origin && origin.includes(host)) ||
      process.env.NODE_ENV !== "production";
      
    if (isInternal && !req.query.apiKey && !req.headers["x-api-key"] && !req.headers["authorization"]) {
      return next();
    }

    // Extract API key
    let apiKey = (req.query.apiKey || req.headers["x-api-key"]) as string;
    const authHeader = req.headers["authorization"];
    if (!apiKey && authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7);
    }

    if (!apiKey) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "External access requires an API Key. Please pass it via an 'apiKey' query parameter, an 'X-API-Key' header, or an 'Authorization: Bearer <Key>' header. Retrieve or generate your developer key in the app Settings menu."
      });
    }

    let isValid = false;
    let keyData: any = null;

    if (db) {
      try {
        const docRef = doc(db, "api_keys", apiKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          keyData = docSnap.data();
          if (keyData && keyData.active !== false) {
            isValid = true;
          }
        }
      } catch (err) {
        console.error(`[API Key Validation] Error fetching key from Firestore:`, err);
      }
    }

    // Static ENV fallback for absolute safety
    if (!isValid && process.env.EXTERNAL_API_KEY && apiKey === process.env.EXTERNAL_API_KEY) {
      isValid = true;
      keyData = { name: "Master ENV Key", rateLimit: 120 };
    }

    if (!isValid) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Invalid, expired, or deactivated API Key. Please verify or regenerate your developer key in the app Settings menu."
      });
    }

    // Sliding window rate limiter
    const now = Date.now();
    const limitWindowMs = 60 * 1000;
    const maxRequestsPerMin = keyData.rateLimit || 60; // 60 RPM default

    if (!apiRateLimits[apiKey]) {
      apiRateLimits[apiKey] = [];
    }

    // Evict expired entries
    apiRateLimits[apiKey] = apiRateLimits[apiKey].filter(t => now - t < limitWindowMs);

    if (apiRateLimits[apiKey].length >= maxRequestsPerMin) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: `Rate limit of ${maxRequestsPerMin} requests per minute exceeded.`
      });
    }

    apiRateLimits[apiKey].push(now);

    res.setHeader("X-RateLimit-Limit", maxRequestsPerMin);
    res.setHeader("X-RateLimit-Remaining", maxRequestsPerMin - apiRateLimits[apiKey].length);

    next();
  }

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      sync: syncStats
    });
  });

  // API Route to fetch buoy data
  app.get("/api/buoy-data", validateExternalAccess, async (req, res) => {
    // Trigger a sync if needed (won't block this request)
    if (db) triggerLazySync();
    
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const requestedBuoy = (req.query.buoy as string) || "Lake Sammamish";
    console.log(`[API] Fetching buoy data for: ${requestedBuoy}`);
    
    try {
      const configEntry = Object.entries(BUOY_CONFIGS).find(([name, _]) => name === requestedBuoy);
      const config = configEntry ? configEntry[1] : {
        searchName: requestedBuoy.toLowerCase().replace(" buoy", "").replace(" lake", "").trim(),
        fullName: requestedBuoy,
        defaultLat: 47.6,
        defaultLon: -122.3
      };
      
      const response = await fetch("https://green2.kingcounty.gov/lake-buoy/GenerateMapData.aspx", {
        signal: AbortSignal.timeout(NWS_TIMEOUT),
        headers: { "Cache-Control": "no-cache" }
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      const buoys = text.split("^").filter(line => line.trim() !== "");
      
      // Strict matching: prioritize exact name matches
      let buoyLine = buoys.find(line => {
        const parts = line.split("|").map(p => p.trim());
        const namePart = parts.find(p => p.length > 0 && !p.startsWith("\t"));
        if (!namePart) return false;
        const ln = namePart.toLowerCase();
        const sn = config.searchName.toLowerCase();
        const fn = config.fullName.toLowerCase();
        
        // Stricter matching to avoid cross-buoy pollution
        if (ln === sn || ln === fn) return true;
        
        // If it's a lake buoy, it must contain the search name AND "lake"
        if (ln.includes(sn) && ln.includes("lake") && !ln.includes("river")) return true;
        
        // If it's a river buoy, it must contain the search name AND "river"
        if (ln.includes(sn) && ln.includes("river") && !ln.includes("lake")) return true;
        
        return false;
      });

      if (!buoyLine) {
        console.warn(`[API] ${requestedBuoy} not found in API response. Search: ${config.searchName}`);
        return res.json({
          location: `${requestedBuoy} Buoy`,
          tempC: null,
          tempF: null,
          airTempC: null,
          airTempF: null,
          windSpeed: null,
          precipitation: null,
          humidity: null,
          dewpoint: null,
          precipitationProbability: 0,
          lat: config.defaultLat,
          lon: config.defaultLon,
          timestamp: new Date().toISOString(),
          status: "INACTIVE",
          condition: "Offline",
          lastSync: new Date().toISOString(),
          hourlyForecast: [],
          dailyForecast: [],
          alerts: []
        });
      }
      
      const parts = buoyLine.split("|").map(p => p.trim());
      // Find the name index by looking for the part that matches the search name
      const nameIndex = parts.findIndex(p => {
        const lp = p.toLowerCase();
        const sn = config.searchName.toLowerCase();
        const fn = config.fullName.toLowerCase();
        return lp === sn || lp === fn || lp.includes(sn);
      });
      
      if (nameIndex === -1) {
        console.error(`[API] Could not locate ${requestedBuoy} in data line. Parts:`, parts);
        throw new Error(`Could not locate ${requestedBuoy} in data line`);
      }

      const getVal = (idx: number) => {
        const val = parts[nameIndex + idx];
        if (val === undefined || val === "" || val === null) return NaN;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? NaN : parsed;
      };

      // Specific parsing to avoid using air temp as water temp
      let tempC = getVal(5);
      
      let airTempC = getVal(2);
      let windSpeed = getVal(3);
      const precipitation = getVal(10);
      const humidity = getVal(11);
      const dewpoint = getVal(12); // Try to get dewpoint from API if available
      const lat = getVal(7) || config.defaultLat;
      const lon = getVal(8) || config.defaultLon;

      // Use the last parameter (Y/N) from King County API as the primary active flag, with sensor data as fallback
      const activeIndicator = parts[parts.length - 1]?.trim().replace(/\^$/, "").toUpperCase();
      const isActive = activeIndicator === "Y" || (!isNaN(tempC) || !isNaN(airTempC) || !isNaN(windSpeed));
      
      console.log(`[API] ${requestedBuoy} - nameIndex: ${nameIndex}, tempC: ${tempC}, airTempC: ${airTempC}, isActive: ${isActive}`);
      
      const tempF = isNaN(tempC) ? null : (tempC * 9/5) + 32;

      // Parse both timestamps and pick the most recent one
      const ts1 = parts[nameIndex + 1];
      const ts2 = parts[nameIndex + 6];
      let bestTimestamp = ts1 || ts2 || new Date().toISOString();
      try {
        const d1 = ts1 ? new Date(ts1).getTime() : NaN;
        const d2 = ts2 ? new Date(ts2).getTime() : NaN;
        if (!isNaN(d2) && (isNaN(d1) || d2 > d1)) {
          bestTimestamp = ts2;
        }
      } catch (e) {}

      // Determine condition
      let condition = "Unknown";
      if (isActive) {
        condition = "Moderate";
        if (!isNaN(precipitation) && precipitation > 0) {
          condition = precipitation > 0.1 ? "Rainy" : "Showers";
        } else if (!isNaN(tempC)) {
          if (tempC > 22) condition = "Warm";
          else if (tempC < 12) condition = "Cold";
          else if (windSpeed > 15) condition = "Windy";
          else if (tempC < 18 && windSpeed < 5) condition = "Overcast";
          else if (tempC < 18) condition = "Cloudy";
        }
      }

      const locationName = config.fullName;

      // NWS Data Augmentation
      let sunrise = null;
      let sunset = null;
      let hourlyForecast = [];
      let dailyForecast = [];
      let alerts = [];
      let radarStation = "KATX";

      if (!isNaN(lat) && !isNaN(lon)) {
        const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        const cached = nwsCache[cacheKey];
        
        if (cached && cached.expires > Date.now()) {
          console.log(`[NWS] Using cached data for ${locationName}`);
          ({ sunrise, sunset, hourlyForecast, dailyForecast, alerts, radarStation } = cached.data);
        } else {
          try {
            const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
              signal: AbortSignal.timeout(NWS_TIMEOUT),
              headers: { "User-Agent": NWS_USER_AGENT }
            });
            
            if (pointRes.ok) {
              const pointData = await pointRes.json();
              sunrise = pointData.properties.astronomicalData?.sunrise;
              sunset = pointData.properties.astronomicalData?.sunset;
              radarStation = pointData.properties.radarStation || "KATX";
              
              const hourlyUrl = pointData.properties.forecastHourly;
              const dailyUrl = pointData.properties.forecast;
              const forecastZone = pointData.properties.forecastZone;

              const [hourlyRes, dailyRes, alertsRes] = await Promise.allSettled([
                hourlyUrl ? fetch(hourlyUrl, { signal: AbortSignal.timeout(NWS_TIMEOUT), headers: { "User-Agent": NWS_USER_AGENT } }) : Promise.reject("No hourly URL"),
                dailyUrl ? fetch(dailyUrl, { signal: AbortSignal.timeout(NWS_TIMEOUT), headers: { "User-Agent": NWS_USER_AGENT } }) : Promise.reject("No daily URL"),
                forecastZone ? fetch(`https://api.weather.gov/alerts/active/zone/${forecastZone.split('/').pop()}`, { signal: AbortSignal.timeout(NWS_TIMEOUT), headers: { "User-Agent": NWS_USER_AGENT } }) : Promise.reject("No zone ID")
              ]);

              if (hourlyRes.status === 'fulfilled' && hourlyRes.value.ok) {
                const forecastData = await hourlyRes.value.clone().json();
                hourlyForecast = forecastData.properties.periods.slice(0, 24).map((p: any) => {
                  const iconProb = p.icon?.match(/,(\d+)/)?.[1];
                  const prob = iconProb ? parseInt(iconProb, 10) : (p.probabilityOfPrecipitation?.value || 0);
                  
                  return {
                    time: p.startTime,
                    temp: p.temperature,
                    condition: p.shortForecast,
                    isDaytime: p.isDaytime,
                    windSpeed: p.windSpeed,
                    windDirection: p.windDirection,
                    icon: p.icon,
                    precipitationProbability: prob,
                    humidity: p.relativeHumidity?.value || null,
                    dewpoint: p.dewpoint?.value || null
                  };
                });
              }

              if (dailyRes.status === 'fulfilled' && dailyRes.value.ok) {
                const dailyData = await dailyRes.value.clone().json();
                dailyForecast = dailyData.properties.periods.map((p: any) => {
                  const iconProb = p.icon?.match(/,(\d+)/)?.[1];
                  const prob = iconProb ? parseInt(iconProb, 10) : (p.probabilityOfPrecipitation?.value || 0);
                  
                  return {
                    name: p.name,
                    temp: p.temperature,
                    isDaytime: p.isDaytime,
                    icon: p.icon,
                    shortForecast: p.shortForecast,
                    detailedForecast: p.detailedForecast,
                    precipitationProbability: prob
                  };
                });
              }

              if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
                const alertsData = await alertsRes.value.clone().json();
                alerts = alertsData.features.map((f: any) => ({
                  event: f.properties.event,
                  severity: f.properties.severity,
                  headline: f.properties.headline,
                  description: f.properties.description,
                  instruction: f.properties.instruction
                }));
              }

              nwsCache[cacheKey] = {
                data: { sunrise, sunset, hourlyForecast, dailyForecast, alerts, radarStation },
                expires: Date.now() + CACHE_TTL
              };
            }
          } catch (nwsErr: any) {
            if (nwsErr.name === 'AbortError') {
              console.warn(`[NWS] Timeout fetching augmented data for ${locationName} (${NWS_TIMEOUT}ms exceeded)`);
            } else {
              console.warn(`[NWS] Failed to fetch augmented data for ${locationName}:`, nwsErr.message || nwsErr);
            }
          }
        }
      }

      // Augment airTempC and windSpeed from hourlyForecast if missing from King County
      if (isNaN(airTempC) && hourlyForecast[0]) {
        airTempC = (hourlyForecast[0].temp - 32) * 5/9;
      }
      if (isNaN(windSpeed) && hourlyForecast[0]) {
        windSpeed = parseInt(hourlyForecast[0].windSpeed, 10);
      }

      const data = {
        location: `${locationName} Buoy`,
        tempC: isNaN(tempC) ? null : parseFloat(tempC.toFixed(2)),
        tempF: tempF === null ? null : Math.round(tempF),
        airTempC: isNaN(airTempC) ? null : parseFloat(airTempC.toFixed(2)),
        airTempF: isNaN(airTempC) ? null : Math.round((airTempC * 9/5) + 32),
        windSpeed: isNaN(windSpeed) ? null : parseFloat(windSpeed.toFixed(1)),
        precipitation: (isNaN(precipitation) || precipitation === null) ? (hourlyForecast[0]?.precipitationProbability > 0 ? hourlyForecast[0].precipitationProbability / 100 : null) : parseFloat(precipitation.toFixed(2)),
        humidity: (isNaN(humidity) || humidity === null || humidity === 0) ? (hourlyForecast[0]?.humidity || null) : parseFloat(humidity.toFixed(1)),
        dewpoint: (isNaN(dewpoint) || dewpoint === null) ? (hourlyForecast[0]?.dewpoint || null) : parseFloat(dewpoint.toFixed(1)),
        precipitationProbability: hourlyForecast[0]?.precipitationProbability || 0,
        lat: isNaN(lat) ? null : lat,
        lon: isNaN(lon) ? null : lon,
        timestamp: bestTimestamp, 
        status: isActive ? "ACTIVE" : "INACTIVE",
        condition,
        lastSync: new Date().toISOString(),
        sunrise,
        sunset,
        hourlyForecast,
        dailyForecast,
        alerts,
        radarStation
      };
      res.json(data);
    } catch (error) {
      console.error(`[API] Error fetching buoy data for ${requestedBuoy}:`, error);
      const config = BUOY_CONFIGS[requestedBuoy as keyof typeof BUOY_CONFIGS] || BUOY_CONFIGS["Lake Sammamish"];

      const fallback = {
        location: `${config.fullName} Buoy (Offline)`,
        tempC: null,
        tempF: null,
        airTempC: null,
        airTempF: null,
        windSpeed: null,
        precipitation: null,
        humidity: null,
        dewpoint: null,
        precipitationProbability: 0,
        lat: config.defaultLat,
        lon: config.defaultLon,
        timestamp: new Date().toISOString(),
        status: "OFFLINE",
        condition: "Unknown",
        lastSync: new Date().toISOString(),
        isFallback: true
      };
      res.json(fallback);
    }
  });

  // Handler for fetching all buoy data
  const getAllBuoys = async (req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    console.log("[API] Fetching all buoys");
    try {
      const response = await fetch("https://green2.kingcounty.gov/lake-buoy/GenerateMapData.aspx", {
        signal: AbortSignal.timeout(10000),
        headers: { "Cache-Control": "no-cache" }
      });
      const text = await response.text();
      const lines = text.split("^").filter(line => line.trim() !== "");
      
      const apiBuoys = lines.map(line => {
        const parts = line.split("|").map(p => p.trim());
        const nameIndex = parts.findIndex(p => p.length > 0 && !p.startsWith("\t"));
        if (nameIndex === -1) return null;
        
        let rawName = parts[nameIndex];
        let displayName = rawName;
        
        // Strict mapping to BUOY_CONFIGS
        const configEntry = Object.entries(BUOY_CONFIGS).find(([name, cfg]) => {
          const ln = rawName.toLowerCase();
          const sn = cfg.searchName.toLowerCase();
          const fn = name.toLowerCase();
          
          return ln === sn || ln === fn;
        });
        
        if (configEntry) {
          displayName = configEntry[0]; 
        } else {
          // Fallback for partial matches if exact fails
          const partialMatch = Object.entries(BUOY_CONFIGS).find(([name, cfg]) => {
            return rawName.toLowerCase().includes(cfg.searchName.toLowerCase());
          });
          if (partialMatch) displayName = partialMatch[0];
        }
        
        const getVal = (idx: number) => {
          const val = parts[nameIndex + idx];
          if (val === undefined || val === "" || val === null) return NaN;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? NaN : parsed;
        };
        
        // Specific parsing: index 5 is Water Temp, 2 is Air Temp, 3 is Wind Speed
        const tempC = getVal(5);
        const airTempC = getVal(2);
        const windSpeed = getVal(3);

        const lat = getVal(7);
        const lon = getVal(8);
        
        // Use the last parameter (Y/N) from King County API as the primary active flag, with sensor data as fallback
        const activeIndicator = parts[parts.length - 1]?.trim().replace(/\^$/, "").toUpperCase();
        const active = activeIndicator === "Y" || (!isNaN(tempC) || !isNaN(airTempC) || !isNaN(windSpeed));
        
        return {
          id: displayName.toLowerCase().replace(/\s+/g, '-'),
          name: displayName,
          tempC: isNaN(tempC) ? null : parseFloat(tempC.toFixed(2)),
          tempF: isNaN(tempC) ? null : Math.round((tempC * 9/5) + 32),
          lat: isNaN(lat) ? null : lat,
          lon: isNaN(lon) ? null : lon,
          active
        };
      }).filter((b): b is NonNullable<typeof b> => b !== null);

      // Merge with BUOY_CONFIGS to ensure we don't miss anything, but don't overwrite if name is different
      const finalResultsMap = new Map();
      
      // First add everything from API
      apiBuoys.forEach(b => {
        // Use a unique key to prevent merging different sensors
        const key = b.name;
        if (!finalResultsMap.has(key) || (b.tempC !== null && finalResultsMap.get(key).tempC === null)) {
          finalResultsMap.set(key, b);
        }
      });
      
      // Then ensure everything in BUOY_CONFIGS is present
      Object.entries(BUOY_CONFIGS).forEach(([buoyName, config]) => {
        if (!finalResultsMap.has(buoyName)) {
          finalResultsMap.set(buoyName, {
            id: buoyName.toLowerCase().replace(/\s+/g, '-'),
            name: buoyName,
            tempC: null,
            tempF: null,
            lat: config.defaultLat,
            lon: config.defaultLon,
            active: false
          });
        }
      });
      
      res.json(Array.from(finalResultsMap.values()));
    } catch (error) {
      console.error("Error fetching all buoys:", error);
      const fallback = Object.entries(BUOY_CONFIGS).map(([buoyName, config]) => ({
        id: buoyName.toLowerCase().replace(/\s+/g, '-'),
        name: buoyName,
        tempC: null,
        tempF: null,
        lat: config.defaultLat,
        lon: config.defaultLon,
        active: false
      }));
      res.json(fallback);
    }
  };

  app.get("/api/all-buoys", validateExternalAccess, getAllBuoys);
  app.get("/api/all-buoy-data", validateExternalAccess, getAllBuoys);

  // API Route to fetch history (simulated for now based on real current data)
  app.get("/api/buoy-history", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    console.log(`[API] Fetching history for: ${req.query.buoy || "Lake Sammamish"}`);
    try {
      const targetBuoy = (req.query.buoy as string) || "Lake Sammamish";
      const config = BUOY_CONFIGS[targetBuoy as keyof typeof BUOY_CONFIGS] || BUOY_CONFIGS["Lake Sammamish"];
      const searchName = config.searchName.toLowerCase();

      const response = await fetch("https://green2.kingcounty.gov/lake-buoy/GenerateMapData.aspx", {
        signal: AbortSignal.timeout(NWS_TIMEOUT),
        headers: { "Cache-Control": "no-cache" }
      });
      const text = await response.text();
      const buoys = text.split("^").filter(line => line.trim() !== "");
      const buoyLine = buoys.find(line => {
        const parts = line.split("|").map(p => p.trim());
        const namePart = parts.find(p => p.length > 0 && !p.startsWith("\t"));
        if (!namePart) return false;
        
        const ln = namePart.toLowerCase();
        const sn = config.searchName.toLowerCase();
        const fn = config.fullName.toLowerCase();
        
        return ln === sn || ln === fn || ln.includes(sn);
      });
      
      if (!buoyLine) throw new Error(`${targetBuoy} buoy not found`);
      
      const parts = buoyLine.split("|").map(p => p.trim());
      const nameIndex = parts.findIndex(p => p.toLowerCase().includes(searchName));
      
      const rawTempC = parts[nameIndex + 5];
      const tempC = parseFloat(rawTempC);
      // Extremely lenient: if we have a temperature, it's active.
      const isActive = !isNaN(tempC);
      
      if (!isActive) {
        return res.json([]);
      }

      // Real historical data is not available from the current King County API endpoint.
      // We rely on the background sync points saved in Firestore (accessed by the client).
      res.json([]);
    } catch (error) {
      console.error("Error generating history:", error);
      res.json([]);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Perform an initial sync at startup
    if (db) {
      performBackgroundSync();
    }
  });
}

startServer();
