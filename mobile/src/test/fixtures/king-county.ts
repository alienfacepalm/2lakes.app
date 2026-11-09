/** Minimal King County pipe-delimited fixture for unit/e2e tests */
export const SAMPLE_KC_LINE =
  "Sammamish|2026-06-23T12:00:00Z|18|5|0|18.5|2026-06-23T11:00:00Z|47.58167|-122.09|0|0|55|12|Y";

export const SAMPLE_KC_RESPONSE = `${SAMPLE_KC_LINE}^`;

export const SAMPLE_NWS_POINT = {
  properties: {
    forecastHourly: "https://api.weather.gov/gridpoints/SEW/124,50/forecast/hourly",
    forecast: "https://api.weather.gov/gridpoints/SEW/124,50/forecast",
    forecastZone: "https://api.weather.gov/zones/forecast/WAZ559",
    radarStation: "KATX",
    astronomicalData: {
      sunrise: "2026-06-23T12:30:00+00:00",
      sunset: "2026-06-23T03:45:00+00:00",
    },
  },
};

export const SAMPLE_NWS_HOURLY = {
  properties: {
    periods: [
      {
        startTime: "2026-06-23T12:00:00-07:00",
        temperature: 72,
        shortForecast: "Sunny",
        isDaytime: true,
        windSpeed: "5 mph",
        windDirection: "NW",
        icon: "https://api.weather.gov/icons/land/day/skc?size=medium",
        relativeHumidity: { value: 50 },
        dewpoint: { value: 12 },
        probabilityOfPrecipitation: { value: 0 },
      },
    ],
  },
};

export const SAMPLE_NWS_DAILY = {
  properties: {
    periods: [
      {
        name: "Today",
        temperature: 75,
        isDaytime: true,
        icon: "https://api.weather.gov/icons/land/day/skc?size=medium",
        shortForecast: "Sunny",
        detailedForecast: "Sunny skies.",
        probabilityOfPrecipitation: { value: 0 },
      },
    ],
  },
};

export const SAMPLE_NWS_ALERTS = { features: [] };
