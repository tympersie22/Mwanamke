import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { preventScreenCaptureAsync } from "expo-screen-capture";

export default function RootLayout() {
  useEffect(() => { void preventScreenCaptureAsync("mwanamke-private").catch(() => undefined); }, []);
  return <><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false, animation: "fade" }}/></>;
}
