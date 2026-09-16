import { IdentityClient, type IdentitySession } from "@reviewguard/core";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const key = "autoreview_session";
export const demoMode = process.env.EXPO_PUBLIC_AUTH_MODE === "demo" && __DEV__;
export const identity = () => new IdentityClient(process.env.EXPO_PUBLIC_IDENTITY_API_KEY ?? "");
let session: IdentitySession | null = null;
let loaded = false;
let refreshing: Promise<IdentitySession> | null = null;
const listeners = new Set<() => void>();
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  for (const listener of listeners) listener();
}
async function read() {
  return Platform.OS === "web"
    ? (globalThis.sessionStorage?.getItem(key) ?? null)
    : SecureStore.getItemAsync(key);
}
async function write(value: string | null) {
  if (Platform.OS === "web") {
    if (value) globalThis.sessionStorage?.setItem(key, value);
    else globalThis.sessionStorage?.removeItem(key);
    return;
  }
  if (value)
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(key);
}
export async function restoreSession() {
  if (!loaded) {
    try {
      const value = await read();
      session = value ? JSON.parse(value) : null;
    } catch {
      session = null;
    }
    loaded = true;
    notify();
  }
  return session;
}
export async function saveSession(value: IdentitySession) {
  await write(JSON.stringify(value));
  session = value;
  loaded = true;
  notify();
}
export async function signOut() {
  await write(null);
  session = null;
  loaded = true;
  notify();
}
export async function accessToken() {
  await restoreSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.idToken;
  try {
    if (!refreshing) refreshing = identity().refresh(session.refreshToken);
    const value = await refreshing;
    await saveSession(value);
    return value.idToken;
  } catch (error) {
    await signOut();
    throw error;
  } finally {
    refreshing = null;
  }
}
