import type { ReviewCase } from "@reviewguard/contracts";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

const statusLabels = {
  received: "DA GENERARE",
  generating: "GENERAZIONE",
  pending_approval: "DA APPROVARE",
  scheduled_auto: "PROGRAMMATA",
  publishing: "INVIO",
  published: "PUBBLICATA",
  rejected: "RIFIUTATA",
  needs_attention: "ATTENZIONE",
};

export function ReviewCard({ review }: { review: ReviewCase }) {
  const risk = review.status === "needs_attention";
  return (
    <Link href={{ pathname: "/reviews/[id]", params: { id: review.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={[styles.rating, risk && styles.ratingRisk]}>
          <Text style={[styles.ratingText, risk && styles.ratingRiskText]}>
            {review.snapshot.starRating}
          </Text>
          <Text style={[styles.star, risk && styles.ratingRiskText]}>★</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.meta}>
            <Text style={styles.name}>{review.snapshot.reviewerDisplayName}</Text>
            <Text style={styles.time}>
              {new Date(review.snapshot.createTime).toLocaleDateString("it-IT")}
            </Text>
          </View>
          <Text style={styles.comment} numberOfLines={2}>
            {review.snapshot.comment || "Recensione senza testo"}
          </Text>
          <View style={[styles.badge, risk && styles.badgeRisk]}>
            <Text style={[styles.badgeText, risk && styles.badgeRiskText]}>
              {statusLabels[review.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    marginBottom: 11,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  rating: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ratingRisk: { backgroundColor: colors.redBg },
  ratingText: { fontFamily: "Georgia", fontSize: 19, fontWeight: "700", color: colors.green },
  ratingRiskText: { color: colors.red },
  star: { fontSize: 9, color: colors.green, marginTop: 5, marginLeft: 1 },
  body: { flex: 1 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  name: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  time: { color: colors.muted, fontSize: 10 },
  comment: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 9 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.amberBg,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeRisk: { backgroundColor: colors.redBg },
  badgeText: { fontSize: 8, color: colors.amber, fontWeight: "800", letterSpacing: 0.4 },
  badgeRiskText: { color: colors.red },
  chevron: { fontSize: 25, color: "#a2aaa5" },
});
