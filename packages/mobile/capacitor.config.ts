import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.ridge.mobile",
  appName: "ridge",
  webDir: "dist",
  android: {
    path: "../../android",
  },
};

export default config;
