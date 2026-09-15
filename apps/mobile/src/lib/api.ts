import type { ReviewCase } from "@reviewguard/contracts";
import { mobileDemoReviews } from "./demo";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4100/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-role": "owner",
      "x-mfa-verified": "true",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Errore ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listReviews(): Promise<{ data: ReviewCase[]; live: boolean }> {
  try {
    const result = await request<{ data: ReviewCase[] }>("/reviews");
    return { data: result.data, live: true };
  } catch {
    return { data: mobileDemoReviews, live: false };
  }
}

export async function getReview(id: string): Promise<ReviewCase> {
  try {
    return await request<ReviewCase>(`/reviews/${id}`);
  } catch {
    const review = mobileDemoReviews.find((item) => item.id === id);
    if (!review) throw new Error("Recensione non trovata");
    return review;
  }
}

export function decide(review: ReviewCase, action: "approve" | "reject") {
  return request<ReviewCase>(`/reviews/${review.id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: review.version }),
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
