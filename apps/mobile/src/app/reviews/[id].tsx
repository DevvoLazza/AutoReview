import type { ReviewCase } from "@reviewguard/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { decide, getReview, revise } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<ReviewCase | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id)
      getReview(id)
        .then(setReview)
        .catch((e) => Alert.alert("Errore", e.message));
  }, [id]);
  if (!review)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  const run = async (operation: () => Promise<ReviewCase>, success: string) => {
    setBusy(true);
    try {
      const next = await operation();
      setReview(next);
      Alert.alert(
        success,
        next.status === "published" ? "La risposta è stata confermata da Google." : undefined,
      );
      if (next.status === "published" || next.status === "rejected") router.back();
    } catch (e) {
      Alert.alert("Operazione non riuscita", e instanceof Error ? e.message : "Riprova");
    } finally {
      setBusy(false);
    }
  };
  const risk = Boolean(review.activeDraft?.riskFlags.length) || review.status === "needs_attention";
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.reviewCard}>
          <View style={styles.reviewTop}>
            <View style={[styles.rating, risk && styles.ratingRisk]}>
              <Text style={[styles.ratingText, risk && styles.riskText]}>
                {review.snapshot.starRating} ★
              </Text>
            </View>
            <View>
              <Text style={styles.name}>{review.snapshot.reviewerDisplayName}</Text>
              <Text style={styles.meta}>
                {review.snapshot.languageHint?.toUpperCase()} · Demo Location
              </Text>
            </View>
          </View>
          <Text style={styles.comment}>{review.snapshot.comment || "Recensione senza testo"}</Text>
        </View>
        {risk ? (
          <View style={styles.riskBox}>
            <Text style={styles.riskIcon}>!</Text>
            <View>
              <Text style={styles.riskTitle}>Controllo umano obbligatorio</Text>
              <Text style={styles.riskCopy}>
                {review.activeDraft?.riskFlags.join(", ") || "La recensione richiede attenzione."}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.draftCard}>
          <View style={styles.draftHead}>
            <View>
              <Text style={styles.kicker}>PROPOSTA AI</Text>
              <Text style={styles.heading}>Risposta pubblica</Text>
            </View>
            <Text style={styles.model}>V4 PRO</Text>
          </View>
          {review.activeDraft ? (
            <TextInput
              style={styles.draft}
              value={review.activeDraft.text}
              multiline
              editable={false}
            />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>AI</Text>
              <Text style={styles.emptyText}>
                Genera una proposta dal pannello web oppure chiedi una nuova versione.
              </Text>
            </View>
          )}
          <Text style={styles.label}>COME DEVE ESSERE MODIFICATA?</Text>
          <View style={styles.reviseRow}>
            <TextInput
              style={styles.input}
              placeholder="Più breve e meno formale"
              placeholderTextColor="#929b95"
              value={instruction}
              onChangeText={setInstruction}
            />
            <Pressable
              disabled={busy || instruction.length < 2}
              style={({ pressed }) => [
                styles.reviseButton,
                (busy || instruction.length < 2) && styles.disabled,
                pressed && styles.pressed,
              ]}
              onPress={() => run(() => revise(review, instruction), "Nuova versione pronta")}
            >
              <Text style={styles.reviseText}>Rigenera</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.safety}>✓ Il modello non possiede credenziali di pubblicazione</Text>
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          style={({ pressed }) => [styles.reject, pressed && styles.pressed]}
          onPress={() => run(() => decide(review, "reject"), "Risposta rifiutata")}
        >
          <Text style={styles.rejectText}>Rifiuta</Text>
        </Pressable>
        <Pressable
          disabled={busy || !review.activeDraft || review.status !== "pending_approval"}
          style={({ pressed }) => [
            styles.approve,
            (busy || !review.activeDraft || review.status !== "pending_approval") &&
              styles.disabled,
            pressed && styles.pressed,
          ]}
          onPress={() => run(() => decide(review, "approve"), "Risposta pubblicata")}
        >
          <Text style={styles.approveText}>{busy ? "Attendi…" : "Approva e pubblica"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  container: { padding: 18, paddingBottom: 120 },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 17,
    marginBottom: 12,
  },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 16 },
  rating: {
    backgroundColor: colors.mint,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ratingRisk: { backgroundColor: colors.redBg },
  ratingText: { color: colors.green, fontWeight: "800" },
  riskText: { color: colors.red },
  name: { fontSize: 14, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 9, color: colors.muted, marginTop: 3 },
  comment: { fontFamily: "Georgia", fontSize: 18, lineHeight: 27, color: colors.ink },
  riskBox: {
    backgroundColor: colors.redBg,
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  riskIcon: {
    width: 27,
    height: 27,
    borderRadius: 14,
    textAlign: "center",
    lineHeight: 27,
    backgroundColor: colors.red,
    color: "white",
    fontWeight: "800",
  },
  riskTitle: { fontSize: 11, fontWeight: "800", color: colors.red },
  riskCopy: { fontSize: 9, color: colors.red, marginTop: 3 },
  draftCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 17,
  },
  draftHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  kicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.green,
    marginBottom: 4,
  },
  heading: { fontFamily: "Georgia", fontSize: 20, color: colors.ink },
  model: {
    fontSize: 7,
    color: "white",
    backgroundColor: "#1e2830",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    fontWeight: "800",
  },
  draft: {
    minHeight: 145,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 13,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    textAlignVertical: "top",
    backgroundColor: "#fffefa",
  },
  empty: {
    minHeight: 145,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd2cd",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyIcon: { color: colors.green, fontWeight: "900", marginBottom: 8 },
  emptyText: { textAlign: "center", fontSize: 11, lineHeight: 17, color: colors.muted },
  label: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: colors.muted,
    marginTop: 17,
    marginBottom: 7,
  },
  reviseRow: { flexDirection: "row", gap: 7 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 11,
    color: colors.ink,
  },
  reviseButton: {
    backgroundColor: colors.greenDark,
    borderRadius: 10,
    paddingHorizontal: 13,
    justifyContent: "center",
  },
  reviseText: { color: "white", fontSize: 10, fontWeight: "800" },
  safety: { fontSize: 9, color: colors.green, textAlign: "center", marginTop: 15 },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
    flexDirection: "row",
    gap: 9,
  },
  reject: {
    borderWidth: 1,
    borderColor: "#e7b9b4",
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectText: { color: colors.red, fontWeight: "800", fontSize: 12 },
  approve: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  approveText: { color: "white", fontWeight: "800", fontSize: 12 },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.8 },
});
