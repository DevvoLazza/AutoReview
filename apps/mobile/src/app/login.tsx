import type { MfaChallenge } from "@reviewguard/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { identity, saveSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    try {
      const result = challenge
        ? { session: await identity().verifyMfa(challenge, code) }
        : await identity().signIn(email, password);
      setPassword("");
      if ("challenge" in result) setChallenge(result.challenge);
      else {
        await saveSession(result.session);
        router.replace("/");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Accesso non riuscito");
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      await identity().resetPassword(email);
      Alert.alert("Recupero password", "Se l’account esiste riceverai un’email di recupero.");
    } catch {
      Alert.alert("Recupero password", "Verifica l’email o riprova più tardi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>AUTOREVIEW</Text>
        <Text style={styles.title}>
          {challenge ? "Verifica l’accesso" : "Recensioni sotto controllo"}
        </Text>
        <Text style={styles.copy}>
          {challenge
            ? "Inserisci il codice della tua app authenticator."
            : "Accedi con l’account autorizzato per la tua attività."}
        </Text>
        {challenge ? (
          <TextInput
            style={styles.input}
            accessibilityLabel="Codice MFA"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            placeholder="Codice a 6 cifre"
          />
        ) : (
          <>
            <TextInput
              style={styles.input}
              accessibilityLabel="Email"
              keyboardType="email-address"
              textContentType="username"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
            />
            <TextInput
              style={styles.input}
              accessibilityLabel="Password"
              secureTextEntry
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
            />
          </>
        )}
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          style={[styles.button, busy && styles.disabled]}
          disabled={busy || (challenge ? !/^\d{6}$/.test(code) : !email || !password)}
          onPress={login}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.buttonText}>Accedi</Text>
          )}
        </Pressable>
        {challenge ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setChallenge(null);
              setCode("");
            }}
          >
            <Text style={styles.link}>Cambia account</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" disabled={busy || !email} onPress={reset}>
            <Text style={styles.link}>Password dimenticata?</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            const url = process.env.EXPO_PUBLIC_WEB_URL;
            if (url) void Linking.openURL(`${url.replace(/\/$/, "")}/mfa`);
            else
              Alert.alert(
                "Configurazione MFA",
                "Apri la dashboard web della tua attività per configurare il secondo fattore.",
              );
          }}
        >
          <Text style={styles.link}>Configura MFA dalla dashboard web</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 60, gap: 18 },
  brand: { color: colors.green, fontWeight: "800", letterSpacing: 2 },
  title: { fontSize: 32, color: colors.ink, fontWeight: "700" },
  copy: { fontSize: 16, color: colors.muted, lineHeight: 23 },
  input: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  button: { padding: 18, borderRadius: 12, backgroundColor: colors.green, alignItems: "center" },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  link: { color: colors.green, fontSize: 15, paddingVertical: 10 },
  error: { color: colors.red, fontSize: 15 },
  disabled: { opacity: 0.5 },
});
