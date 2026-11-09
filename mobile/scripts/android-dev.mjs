#!/usr/bin/env node
/**
 * Android emulator dev — Capacitor WebView shell (standalone, no URL bar) + Vite live reload.
 * See manifest.json display: "standalone" and capacitor.config.ts.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DEV_PORT, devServerUrl, resolveDevPort } from "./dev-port.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const CAPACITOR_APP_ID = "app.twolakes.mobile";
const CAPACITOR_MAIN_ACTIVITY = `${CAPACITOR_APP_ID}/.MainActivity`;
const DEFAULT_AVD = "Pixel_3_API_33";
const MIN_JAVA_MAJOR = 21;
const BOOT_TIMEOUT_MS = 300_000;
const DEV_SERVER_TIMEOUT_MS = 90_000;

export function resolveAndroidSdk() {
  const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const winDefault = path.join(localAppData, "Android", "Sdk");
    if (fs.existsSync(winDefault)) return winDefault;
  }

  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home) {
    const unixDefault = path.join(home, "Library", "Android", "sdk");
    if (fs.existsSync(unixDefault)) return unixDefault;
    const linuxDefault = path.join(home, "Android", "Sdk");
    if (fs.existsSync(linuxDefault)) return linuxDefault;
  }

  throw new Error(
    "Android SDK not found. Set ANDROID_HOME or install Android Studio SDK.",
  );
}

export function resolveAvdName() {
  return process.env.ANDROID_AVD?.trim() || DEFAULT_AVD;
}

export function resolveDeviceSerial() {
  const fromEnv = process.env.ANDROID_SERIAL?.trim();
  if (fromEnv) return fromEnv;
  const emulators = listDevices().filter(
    (d) => d.state === "device" && d.serial.startsWith("emulator-"),
  );
  if (emulators.length === 1) return emulators[0].serial;
  if (emulators.length > 1) {
    throw new Error(
      `Multiple emulators connected (${emulators.map((d) => d.serial).join(", ")}). Set ANDROID_SERIAL.`,
    );
  }
  return null;
}

export function emulatorAppUrl(port = resolveDevPort()) {
  return devServerUrl(port);
}

export function capacitorMainActivity() {
  return CAPACITOR_MAIN_ACTIVITY;
}

function javaBin(javaHome) {
  return path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
}

export function javaMajorVersion(javaHome) {
  try {
    const result = spawnSync(javaBin(javaHome), ["-version"], { encoding: "utf8" });
    const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const match = text.match(/version "(\d+)/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

function javaHomeCandidates() {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const home = process.env.HOME ?? process.env.USERPROFILE;

  const candidates = [
    process.env.ANDROID_JAVA_HOME,
    path.join(programFiles, "Android", "Android Studio", "jbr"),
    path.join(programFilesX86, "Android", "Android Studio", "jbr"),
    home && "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    home && path.join(home, "android-studio", "jbr"),
    process.env.JAVA_HOME,
  ];

  if (process.platform === "win32") {
    for (const root of [path.join(programFiles, "Java"), path.join(programFilesX86, "Java")]) {
      try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (entry.isDirectory()) candidates.push(path.join(root, entry.name));
        }
      } catch {
        // optional Java install dir
      }
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

/** Capacitor 7 Android builds require Java 21+. Prefer Android Studio JBR. */
export function resolveJavaHome() {
  for (const candidate of javaHomeCandidates()) {
    if (!fs.existsSync(javaBin(candidate))) continue;
    if (javaMajorVersion(candidate) >= MIN_JAVA_MAJOR) return candidate;
  }

  throw new Error(
    `Java ${MIN_JAVA_MAJOR}+ required for Android builds. Install Android Studio or set ANDROID_JAVA_HOME.`,
  );
}

function sdkTool(sdkRoot, ...segments) {
  return path.join(sdkRoot, ...segments);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localBin(name) {
  const win = process.platform === "win32";
  return path.join(MOBILE_ROOT, "node_modules", ".bin", win ? `${name}.cmd` : name);
}

export function listAvds(sdkRoot = resolveAndroidSdk()) {
  const emulatorBin =
    process.platform === "win32"
      ? sdkTool(sdkRoot, "emulator", "emulator.exe")
      : sdkTool(sdkRoot, "emulator", "emulator");
  const out = execFileSync(emulatorBin, ["-list-avds"], { encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function listDevices(sdkRoot = resolveAndroidSdk()) {
  const adbBin =
    process.platform === "win32"
      ? sdkTool(sdkRoot, "platform-tools", "adb.exe")
      : sdkTool(sdkRoot, "platform-tools", "adb");
  const out = execFileSync(adbBin, ["devices"], { encoding: "utf8" });
  const devices = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line || line.startsWith("List of devices")) continue;
    const [serial, state] = line.trim().split(/\s+/);
    if (serial && state) devices.push({ serial, state });
  }
  return devices;
}

function adbArgs(sdkRoot, serial, args) {
  const adbBin =
    process.platform === "win32"
      ? sdkTool(sdkRoot, "platform-tools", "adb.exe")
      : sdkTool(sdkRoot, "platform-tools", "adb");
  const prefix = serial ? ["-s", serial] : [];
  return { adbBin, argv: [...prefix, ...args] };
}

function runAdb(sdkRoot, serial, args) {
  const { adbBin, argv } = adbArgs(sdkRoot, serial, args);
  return execFileSync(adbBin, argv, { encoding: "utf8" });
}

export async function waitForBoot(sdkRoot, serial, timeoutMs = BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  runAdb(sdkRoot, serial, ["wait-for-device"]);

  while (Date.now() < deadline) {
    const booted = runAdb(sdkRoot, serial, ["shell", "getprop", "sys.boot_completed"]).trim();
    if (booted === "1") {
      const animExit = runAdb(sdkRoot, serial, [
        "shell",
        "getprop",
        "service.bootanim.exit",
      ]).trim();
      if (!animExit || animExit === "1") {
        await sleep(2000);
        return;
      }
    }
    await sleep(1000);
  }

  throw new Error("Emulator boot timed out");
}

export function startEmulator(sdkRoot, avdName) {
  const emulatorBin =
    process.platform === "win32"
      ? sdkTool(sdkRoot, "emulator", "emulator.exe")
      : sdkTool(sdkRoot, "emulator", "emulator");

  if (!fs.existsSync(emulatorBin)) {
    throw new Error(`Emulator binary not found at ${emulatorBin}`);
  }

  const avds = listAvds(sdkRoot);
  if (!avds.includes(avdName)) {
    throw new Error(
      `AVD "${avdName}" not found. Available: ${avds.join(", ") || "(none)"}. Set ANDROID_AVD.`,
    );
  }

  console.log(`Starting emulator: ${avdName}`);
  const child = spawn(emulatorBin, ["-avd", avdName], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

export async function ensureEmulatorRunning(sdkRoot, avdName = resolveAvdName()) {
  let serial = resolveDeviceSerial();
  if (serial) {
    console.log(`Emulator already running (${serial})`);
    await waitForBoot(sdkRoot, serial);
    return serial;
  }

  startEmulator(sdkRoot, avdName);
  serial = null;
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      serial = resolveDeviceSerial();
    } catch {
      serial = null;
    }
    if (serial) break;
    await sleep(2000);
  }

  if (!serial) {
    throw new Error("Emulator did not appear via adb within the boot timeout.");
  }

  console.log(`Waiting for emulator boot (${serial})…`);
  await waitForBoot(sdkRoot, serial);
  return serial;
}

export function setupPortReverse(sdkRoot, serial, port = resolveDevPort()) {
  runAdb(sdkRoot, serial, ["reverse", `tcp:${port}`, `tcp:${port}`]);
  console.log(`adb reverse tcp:${port} tcp:${port}`);
}

export function launchCapacitorApp(sdkRoot, serial) {
  runAdb(sdkRoot, serial, [
    "shell",
    "am",
    "start",
    "-n",
    CAPACITOR_MAIN_ACTIVITY,
  ]);
  console.log(`Launched 2lakes app shell (${serial})`);
}

export function resolveBrowserPackage() {
  return process.env.ANDROID_BROWSER?.trim() || null;
}

/** Debug only — opens a browser tab (has URL bar; not the shipped app UX). */
export function openAppInBrowser(sdkRoot, serial, url = emulatorAppUrl()) {
  const browserPackage = resolveBrowserPackage();
  const args = [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url,
  ];
  if (browserPackage) args.push(browserPackage);

  runAdb(sdkRoot, serial, args);
  const target = browserPackage ?? "default browser";
  console.log(`Opened ${url} in ${target} (${serial}) — browser tab, not standalone app`);
}

export async function waitForDevServer(port = resolveDevPort(), timeoutMs = DEV_SERVER_TIMEOUT_MS) {
  const url = devServerUrl(port);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return url;
    } catch {
      // retry until timeout
    }
    await sleep(500);
  }

  throw new Error(`Dev server not ready at ${url}`);
}

export function ensureCapacitorAndroid() {
  const androidDir = path.join(MOBILE_ROOT, "android");
  if (fs.existsSync(androidDir)) return;

  throw new Error(
    "Capacitor android/ project missing. Run: pnpm build && pnpm exec cap add android",
  );
}

function runCapLiveReload(port = resolveDevPort(), target) {
  ensureCapacitorAndroid();
  const capBin = localBin("cap");

  const args = [
    "run",
    "android",
    "-l",
    `--port=${port}`,
    `--forwardPorts=${port}:${port}`,
  ];
  if (target) args.push(`--target=${target}`);

  return new Promise((resolve, reject) => {
    const javaHome = resolveJavaHome();
    console.log(`Using JAVA_HOME=${javaHome}`);
    console.log("Building and launching Capacitor app (standalone WebView)…");
    const child = spawn(capBin, args, {
      cwd: MOBILE_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, JAVA_HOME: javaHome },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`cap run exited with code ${code}`));
    });
  });
}

async function connectFlow() {
  const port = resolveDevPort();
  const sdkRoot = resolveAndroidSdk();

  await waitForDevServer(port);
  const serial = await ensureEmulatorRunning(sdkRoot);
  await runCapLiveReload(port, serial);

  return { sdkRoot, serial, port, url: emulatorAppUrl(port) };
}

async function devFlow() {
  const port = resolveDevPort();
  const viteBin = localBin("vite");

  const vite = spawn(
    viteBin,
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: MOBILE_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  const shutdown = () => {
    if (!vite.killed) vite.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    console.log("Starting Vite dev server…");
    await waitForDevServer(port);
    const sdkRoot = resolveAndroidSdk();
    const serial = await ensureEmulatorRunning(sdkRoot);
    console.log("");
    console.log("Android dev ready:");
    console.log(`  Emulator: ${serial}`);
    console.log(`  Dev URL:  ${emulatorAppUrl(port)} (via adb reverse inside WebView)`);
    console.log("  Edit mobile/src — the app shell hot-reloads (no browser URL bar).");
    console.log("");
    await runCapLiveReload(port, serial);
  } catch (err) {
    shutdown();
    throw err;
  } finally {
    shutdown();
  }
}

async function main() {
  const command = process.argv[2] ?? "connect";
  const sdkRoot = resolveAndroidSdk();

  switch (command) {
    case "list": {
      const avds = listAvds(sdkRoot);
      console.log(avds.length ? avds.join("\n") : "(no AVDs — create one in Android Studio)");
      break;
    }
    case "status": {
      const devices = listDevices(sdkRoot);
      console.log(
        JSON.stringify(
          {
            sdkRoot,
            avd: resolveAvdName(),
            avds: listAvds(sdkRoot),
            devices,
            devUrl: emulatorAppUrl(),
            appShell: CAPACITOR_MAIN_ACTIVITY,
          },
          null,
          2,
        ),
      );
      break;
    }
    case "boot": {
      const serial = await ensureEmulatorRunning(sdkRoot);
      console.log(`Ready: ${serial}`);
      break;
    }
    case "reverse": {
      const serial = resolveDeviceSerial();
      if (!serial) throw new Error("No emulator connected. Run: pnpm android:boot");
      setupPortReverse(sdkRoot, serial);
      break;
    }
    case "open": {
      const serial = resolveDeviceSerial();
      if (!serial) throw new Error("No emulator connected. Run: pnpm android:boot");
      setupPortReverse(sdkRoot, serial);
      launchCapacitorApp(sdkRoot, serial);
      break;
    }
    case "connect": {
      await connectFlow();
      break;
    }
    case "dev": {
      await devFlow();
      break;
    }
    default:
      console.error(
        `Unknown command "${command}". Use: list | status | boot | reverse | open | connect | dev`,
      );
      process.exit(2);
  }
}

const isMain =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
