import type { ReviewCase } from "@reviewguard/contracts";

export const apiBase = "/api/backend";

const demoHeaders = {
  "Content-Type": "application/json",
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    cache: "no-store",
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
