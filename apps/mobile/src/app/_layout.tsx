import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { accessToken, demoMode, restoreSession, subscribeSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  const router = useRouter();
  const segments: readonly string[] = useSegments();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(demoMode);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState(false);
  useEffect(() => {
    const refresh = async () => {
      try {
        await restoreSession();
        setAuthenticated(demoMode || Boolean(await accessToken()));
      } catch {
        setAuthenticated(false);
      } finally {
        setReady(true);
      }
    };
    const unsubscribe = subscribeSession(() => {
      void restoreSession()
        .then((value) => setAuthenticated(demoMode || Boolean(value)))
        .catch(() => setAuthenticated(false));
    });
    void refresh();
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!authenticated && segments[0] !== "login") {
      if (segments[0] === "reviews" && /^[0-9a-f-]{36}$/i.test(segments[1] ?? ""))
        setPendingRoute(`/reviews/${segments[1]}`);
      router.replace("/login");
    } else if (authenticated && pendingRoute) {
      router.replace(pendingRoute as never);
      setPendingRoute(null);
      void Notifications.clearLastNotificationResponseAsync().catch(() =>
        setNotificationError(true),
      );
    } else if (authenticated && segments[0] === "login") router.replace("/");
  }, [ready, authenticated, segments, pendingRoute, router]);
  useEffect(() => {
    const accept = (route: unknown) => {
      if (typeof route === "string" && /^\/reviews\/[0-9a-f-]{36}$/i.test(route))
        setPendingRoute(route);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      accept(route);
    });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const route = response?.notification.request.content.data?.route;
        accept(route);
      })
      .catch(() => setNotificationError(true));
    return () => subscription.remove();
  }, []);
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator accessibilityLabel="Ripristino sessione" color={colors.green} />
      </View>
    );

  return (
    <>
      <StatusBar style="dark" />
      {notificationError && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.muted, padding: 12, backgroundColor: colors.background }}
        >
          Notifiche non disponibili: consulta l’inbox per le nuove recensioni.
        </Text>
      )}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.green,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="reviews/[id]"
          options={{ title: "Approva risposta", headerBackTitle: "Inbox" }}
        />
      </Stack>
    </>
  );
}
