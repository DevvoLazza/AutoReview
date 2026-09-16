import type { ReviewCase } from "@reviewguard/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ReviewCard } from "@/components/ReviewCard";
import { listReviews, registerDeviceToken, request } from "@/lib/api";
import { registerForPushNotifications } from "@/lib/notifications";
import { signOut } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function InboxScreen() {
  const [reviews, setReviews] = useState<ReviewCase[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [result, workspace] = await Promise.all([
        listReviews(),
        request<{ locations: Array<{ manualApprovalCount: number }> }>("/workspace"),
      ]);
      setReviews(result.data);
      setNextCursor(result.nextCursor);
      setLive(result.live);
      setCount(workspace.locations[0]?.manualApprovalCount ?? 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Caricamento non riuscito");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.green}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>CENTRO APPROVAZIONI</Text>
            <Text style={styles.title}>Le tue recensioni</Text>
            <Text style={styles.subtitle}>Le risposte restano sotto il tuo controllo.</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>DV</Text>
          </View>
        </View>
        <View style={styles.security}>
          <View style={styles.shield}>
            <Text>✓</Text>
          </View>
          <View>
            <Text style={styles.securityTitle}>Protezione attiva</Text>
            <Text style={styles.securityCopy}>Hard stop, audit e rilettura Google abilitati</Text>
          </View>
        </View>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>
              {reviews.filter((r) => r.status === "pending_approval").length}
            </Text>
            <Text style={styles.statLabel}>DA APPROVARE</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statNumber}>
              {reviews.filter((r) => r.status === "needs_attention").length}
            </Text>
            <Text style={styles.statLabel}>ATTENZIONE</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statNumber}>
              {count}
              <Text style={styles.statSmall}>/20</Text>
            </Text>
            <Text style={styles.statLabel}>CALIBRAZIONE</Text>
          </View>
        </View>
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.kicker}>INBOX</Text>
            <Text style={styles.sectionTitle}>Recensioni recenti</Text>
          </View>
          <View style={[styles.liveBadge, !live && styles.demoBadge]}>
            <Text style={[styles.liveText, !live && styles.demoText]}>
              {live ? "LIVE" : "DEMO"}
            </Text>
          </View>
        </View>
        {loading && (
          <Text accessibilityRole="text" style={styles.subtitle}>
            Caricamento…
          </Text>
        )}
        {error && (
          <View>
            <Text accessibilityRole="alert" style={styles.subtitle}>
              {error}
            </Text>
            <Pressable accessibilityRole="button" onPress={load}>
              <Text style={styles.securityCopy}>Riprova</Text>
            </Pressable>
          </View>
        )}
        {!loading && !error && !reviews.length && (
          <Text style={styles.subtitle}>
            Nessuna recensione. Collega Google e importa una sede dalla dashboard web.
          </Text>
        )}
        {!error && reviews.map((review) => <ReviewCard review={review} key={review.id} />)}
        {!error && nextCursor && (
          <Pressable
            accessibilityRole="button"
            disabled={moreLoading}
            onPress={async () => {
              setMoreLoading(true);
              try {
                const result = await listReviews(nextCursor);
                setReviews((previous) => [
                  ...new Map(
                    [...previous, ...result.data].map((entry) => [entry.id, entry]),
                  ).values(),
                ]);
                setNextCursor(result.nextCursor);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Caricamento non riuscito");
              } finally {
                setMoreLoading(false);
              }
            }}
          >
            <Text style={styles.subtitle}>
              {moreLoading ? "Caricamento…" : "Carica altre recensioni"}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            try {
              const token = await registerForPushNotifications();
              if (!token || (Platform.OS !== "ios" && Platform.OS !== "android")) {
                Alert.alert(
                  "Notifiche non disponibili",
                  "Servono un dispositivo fisico, un progetto EAS configurato e il permesso alle notifiche. L’inbox resta utilizzabile.",
                );
                return;
              }
              await registerDeviceToken(token, Platform.OS);
              Alert.alert("Notifiche abilitate", "Riceverai avvisi senza testo delle recensioni.");
            } catch {
              Alert.alert(
                "Notifiche non abilitate",
                "Verifica la connessione e la configurazione EAS. Puoi continuare a usare l’inbox.",
              );
            }
          }}
        >
          <Text style={styles.subtitle}>Abilita notifiche di approvazione</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={signOut}>
          <Text style={styles.subtitle}>Esci dall’account</Text>
        </Pressable>
        <Text style={styles.privacy}>
          Le notifiche non contengono mai il testo della recensione.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 50 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 22,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.green,
    marginBottom: 6,
  },
  title: { fontFamily: "Georgia", fontSize: 29, color: colors.ink, fontWeight: "600" },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 5 },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: colors.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "white", fontWeight: "800", fontSize: 12 },
  security: {
    backgroundColor: colors.greenDark,
    borderRadius: 17,
    padding: 15,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 13,
  },
  shield: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#dff1e8",
    alignItems: "center",
    justifyContent: "center",
  },
  securityTitle: { color: "white", fontSize: 12, fontWeight: "700" },
  securityCopy: { color: "#b7d1c4", fontSize: 9, marginTop: 3 },
  stats: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 17,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 27,
  },
  stat: { flex: 1, alignItems: "center" },
  statNumber: { fontFamily: "Georgia", fontSize: 24, color: colors.ink },
  statSmall: { fontSize: 12, color: colors.muted },
  statLabel: {
    fontSize: 7,
    letterSpacing: 0.65,
    color: colors.muted,
    fontWeight: "800",
    marginTop: 3,
  },
  divider: { height: 30, width: 1, backgroundColor: colors.line },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
  },
  sectionTitle: { fontFamily: "Georgia", fontSize: 21, color: colors.ink },
  liveBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: colors.mint,
  },
  demoBadge: { backgroundColor: colors.amberBg },
  liveText: { fontSize: 8, fontWeight: "800", color: colors.green },
  demoText: { color: colors.amber },
  privacy: { textAlign: "center", color: colors.muted, fontSize: 9, marginTop: 13 },
});
