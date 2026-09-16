import type { ExpoConfig } from "expo/config";
import base from "./app.json";

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
if (process.env.EAS_BUILD_PROFILE === "production") {
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId) || projectId.startsWith("00000000"))
    throw new Error("Set the real EXPO_PUBLIC_EAS_PROJECT_ID before a production build");
  if (
    !process.env.EXPO_PUBLIC_API_URL?.startsWith("https://") ||
    !process.env.EXPO_PUBLIC_IDENTITY_API_KEY ||
    process.env.EXPO_PUBLIC_AUTH_MODE === "demo"
  )
    throw new Error(
      "Production mobile builds require HTTPS API and Identity Platform; demo auth is forbidden",
    );
}
export default {
  ...base.expo,
  name: "AutoReview",
  extra: { ...base.expo.extra, ...(projectId ? { eas: { projectId } } : {}) },
} as ExpoConfig;
