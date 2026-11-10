import { Capacitor } from "@capacitor/core";

const LAKE_NAVY = "#001e40";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Installed PWA or iOS home-screen bookmark — same chromeless shell as native. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

export function isAppShell(): boolean {
  return isNativeApp() || isStandalonePwa();
}

const PERIODIC_SYNC_TAG = "2lakes-sync";
/** Prefer ~15 minutes; browsers may coerce to a longer floor. */
const PERIODIC_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000;

async function registerPeriodicSync(registration: ServiceWorkerRegistration): Promise<void> {
  const periodic = registration as ServiceWorkerRegistration & {
    periodicSync?: {
      register: (tag: string, options: { minInterval: number }) => Promise<void>;
    };
  };
  if (!periodic.periodicSync) return;
  try {
    const status = await navigator.permissions.query({
      name: "periodic-background-sync" as PermissionName,
    });
    if (status.state === "denied") return;
  } catch {
    /* permission query unsupported — still try register */
  }
  try {
    await periodic.periodicSync.register(PERIODIC_SYNC_TAG, {
      minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS,
    });
  } catch {
    /* not an installed PWA / Chromium, or quota denied */
  }
}

export function registerServiceWorkerIfWeb(): void {
  if (!("serviceWorker" in navigator) || isNativeApp()) return;

  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const swUrl = `${base}sw.js`;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(swUrl)
      .then((registration) => registerPeriodicSync(registration))
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}

function markAppShellDocument(): void {
  if (!isAppShell()) return;
  document.documentElement.classList.add("app-shell");
}

async function configureNativeChrome(): Promise<void> {
  if (!isNativeApp()) return;

  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/splash-screen"),
    import("@capacitor/status-bar"),
  ]);

  if (Capacitor.getPlatform() === "android") {
    await StatusBar.setBackgroundColor({ color: LAKE_NAVY });
  }
  await StatusBar.setStyle({ style: Style.Dark });

  App.addListener("backButton", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    void App.minimizeApp();
  });

  await SplashScreen.hide();
}

/** Native / standalone shell: status bar, splash, hardware back, no browser SW. */
export async function initNativeShell(): Promise<void> {
  markAppShellDocument();
  registerServiceWorkerIfWeb();

  try {
    await configureNativeChrome();
  } catch (err) {
    console.warn("Native shell setup skipped:", err);
  }
}
