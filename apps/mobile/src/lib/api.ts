import type { ReviewCase } from "@reviewguard/contracts";
import { accessToken, demoMode, signOut } from "./session";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4100/v1";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = demoMode ? null : await accessToken();
  if (!__DEV__ && !baseUrl.startsWith("https://"))
    throw new Error("Configura un endpoint HTTPS prima del rilascio");
  if (!demoMode && !token) throw new Error("Accedi prima di continuare");
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(95_000),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { "x-role": "owner", "x-mfa-verified": "true" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    if (response.status === 401 && !demoMode && !body.error?.startsWith("google_")) await signOut();
    throw new Error(body.message ?? `Errore ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listReviews(
  cursor?: string,
): Promise<{ data: ReviewCase[]; live: boolean; nextCursor: string | null }> {
  const result = await request<{ data: ReviewCase[]; meta: { nextCursor: string | null } }>(
    `/reviews?limit=50${cursor ? `&cursor=${cursor}` : ""}`,
  );
  return { data: result.data, live: !demoMode, nextCursor: result.meta.nextCursor };
}

export async function getReview(id: string): Promise<ReviewCase> {
  return request<ReviewCase>(`/reviews/${encodeURIComponent(id)}`);
}

export function decide(
  review: ReviewCase,
  action: "approve" | "reject" | "cancel-schedule" | "generate",
) {
  return request<ReviewCase>(`/reviews/${review.id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: review.version }),
  });
}
export function edit(review: ReviewCase, text: string) {
  return request<ReviewCase>(`/reviews/${review.id}/edit`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: review.version, text }),
  });
}

export function revise(review: ReviewCase, instruction: string) {
  return request<ReviewCase>(`/reviews/${review.id}/revise`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: review.version, instruction }),
  });
}

export function registerDeviceToken(token: string, platform: "ios" | "android") {
  return request<{ registered: true }>("/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform, provider: "expo" }),
  });
}
