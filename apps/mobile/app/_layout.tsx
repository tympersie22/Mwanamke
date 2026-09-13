import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";

export default function RootLayout() {
  useEffect(() => {
    const allowQaScreenshots = __DEV__ && process.env.EXPO_PUBLIC_ALLOW_SCREENSHOTS === "true";
    if (allowQaScreenshots) {
      void allowScreenCaptureAsync("mwanamke-private").catch(() => undefined);
      return undefined;
    }
    void preventScreenCaptureAsync("mwanamke-private").catch(() => undefined);
    return () => { void allowScreenCaptureAsync("mwanamke-private").catch(() => undefined); };
  }, []);
  return <><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false, animation: "fade" }}/></>;
}
