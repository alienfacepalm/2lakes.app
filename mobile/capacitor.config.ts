import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.twolakes.mobile",
  appName: "2lakes",
  webDir: "dist",
  backgroundColor: "#001e40",
  android: {
    allowMixedContent: true,
    backgroundColor: "#001e40",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#001e40",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#001e40",
    },
  },
};

export default config;
