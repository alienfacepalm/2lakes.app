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

export function registerServiceWorkerIfWeb(): void {
  if (!("serviceWorker" in navigator) || isNativeApp()) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
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
