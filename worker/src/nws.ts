const NWS_USER_AGENT = "2lakes.app (https://github.com/alienfacepalm/2lakes.app)";
const NWS_TIMEOUT_MS = 8000;

type Fetcher = typeof fetch;

async function getJson(url: string, fetchFn: Fetcher): Promise<unknown> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
    signal: AbortSignal.timeout(NWS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`NWS ${res.status} for ${url}`);
  return res.json();
}

/**
 * Chance of precipitation (0 to 100) for the current hour at a point, from NWS.
 * This is the only snapshot field that does not come from King County.
 * Returns null on any failure, because a missing value must not become a fake 0.
 */
export async function fetchPrecipitationProbability(
  lat: number,
  lon: number,
  fetchFn: Fetcher = fetch
): Promise<number | null> {
  try {
    const point = (await getJson(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      fetchFn
    )) as { properties?: { forecastHourly?: string } };
    const hourlyUrl = point.properties?.forecastHourly;
    if (!hourlyUrl) return null;

    const hourly = (await getJson(hourlyUrl, fetchFn)) as {
      properties?: { periods?: Array<{ probabilityOfPrecipitation?: { value: number | null } }> };
    };
    const value = hourly.properties?.periods?.[0]?.probabilityOfPrecipitation?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
