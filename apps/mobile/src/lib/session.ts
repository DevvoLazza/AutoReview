import { IdentityClient, type IdentitySession } from "@reviewguard/core";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const key = "autoreview_session";
export const demoMode = process.env.EXPO_PUBLIC_AUTH_MODE === "demo" && __DEV__;
export const identity = () => new IdentityClient(process.env.EXPO_PUBLIC_IDENTITY_API_KEY ?? "");
let session: IdentitySession | null = null;
let loaded = false;
let refreshing: Promise<string | null> | null = null;
let generation = 0;
let writes: Promise<void> = Promise.resolve();
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
function persist(value: string | null) {
  const operation = writes.then(() => write(value));
  // Keep the queue usable after a failure; the original operation still rejects to its caller.
  writes = operation.catch(() => undefined);
  return operation;
}
export async function restoreSession() {
  if (!loaded) {
    const current = generation;
    try {
      await writes;
      const value = await read();
      if (current !== generation) return session;
      session = value ? JSON.parse(value) : null;
    } catch {
      if (current === generation) session = null;
    }
    loaded = true;
    notify();
  }
  return session;
}
export async function saveSession(value: IdentitySession) {
  const current = ++generation;
  refreshing = null;
  await persist(JSON.stringify(value));
  if (current !== generation) return;
  session = value;
  loaded = true;
  notify();
}
export async function signOut() {
  generation++;
  refreshing = null;
  session = null;
  loaded = true;
  notify();
  await persist(null);
}
export async function accessToken() {
  await restoreSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.idToken;
  if (!refreshing) {
    const current = generation;
    const refreshToken = session.refreshToken;
    refreshing = (async () => {
      try {
        const value = await identity().refresh(refreshToken);
        if (current !== generation) return null;
        await persist(JSON.stringify(value));
        if (current !== generation) return null;
        session = value;
        notify();
        return value.idToken;
      } catch (error) {
        if (current === generation) await signOut();
        throw error;
      }
    })();
  }
  const pending = refreshing;
  try {
    return await pending;
  } finally {
    if (refreshing === pending) refreshing = null;
  }
}
