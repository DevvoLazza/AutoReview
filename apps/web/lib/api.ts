import type { ReviewCase } from "@reviewguard/contracts";

export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/v1";

const demoHeaders = {
  "Content-Type": "application/json",
  "x-role": "owner",
  "x-mfa-verified": "true",
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...demoHeaders, ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Richiesta non riuscita (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function reviewAction(
  review: ReviewCase,
  action: "approve" | "reject" | "cancel-schedule",
  reason?: string,
) {
  return apiRequest<ReviewCase>(`/reviews/${review.id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: review.version, reason }),
  });
}
