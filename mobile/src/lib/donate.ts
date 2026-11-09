/** External donate page (Ko-fi, Buy Me a Coffee, GitHub Sponsors, PayPal, etc.) — set at build time. */
export function getDonateUrl(): string | null {
  const raw = import.meta.env.VITE_DONATE_URL?.trim() ?? "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function openDonatePage(): boolean {
  const url = getDonateUrl();
  if (!url || typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
