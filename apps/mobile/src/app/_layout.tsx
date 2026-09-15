import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { registerDeviceToken } from "@/lib/api";
import { registerForPushNotifications } from "@/lib/notifications";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => {
    registerForPushNotifications()
      .then((token) => {
        if (token && (Platform.OS === "ios" || Platform.OS === "android")) {
          return registerDeviceToken(token, Platform.OS);
        }
      })
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === "string" && route.startsWith("/reviews/")) router.push(route as never);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const route = response?.notification.request.content.data?.route;
      if (typeof route === "string" && route.startsWith("/reviews/")) router.push(route as never);
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.green,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="reviews/[id]"
          options={{ title: "Approva risposta", headerBackTitle: "Inbox" }}
        />
      </Stack>
    </>
  );
}
