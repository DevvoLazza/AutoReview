import type { ReviewSnapshot } from "@reviewguard/contracts";
import { DomainError, NotFoundError } from "../errors.js";

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export interface GoogleBusinessGateway {
  buildAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleTokens>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokens>;
  getReview(accessToken: string, reviewName: string): Promise<ReviewSnapshot>;
  updateReply(
    accessToken: string,
    reviewName: string,
    comment: string,
  ): Promise<{ comment: string; updateTime: string }>;
}

export interface GoogleBusinessClientOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

const reviewNamePattern = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/;

export class GoogleBusinessClient implements GoogleBusinessGateway {
  private readonly request: typeof fetch;

  constructor(private readonly options: GoogleBusinessClientOptions) {
    this.request = options.fetchImpl ?? fetch;
  }

  buildAuthorizationUrl(state: string): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/business.manage",
      state,
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    const response = await this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: this.options.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new DomainError("Google OAuth exchange failed", "google_oauth_failed", 502);
    }
    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresIn: payload.expires_in,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    const response = await this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new DomainError("Google OAuth refresh failed", "google_oauth_failed", 401);
    const payload = (await response.json()) as { access_token: string; expires_in: number };
    return { accessToken: payload.access_token, refreshToken, expiresIn: payload.expires_in };
  }

  async getReview(accessToken: string, reviewName: string): Promise<ReviewSnapshot> {
    this.assertReviewName(reviewName);
    const response = await this.request(`https://mybusiness.googleapis.com/v4/${reviewName}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) throw new NotFoundError("Google review", reviewName);
    if (!response.ok) throw new DomainError("Google review fetch failed", "google_api_failed", 502);
    const payload = (await response.json()) as Record<string, unknown>;
    return mapGoogleReview(payload, reviewName);
  }

  async updateReply(
    accessToken: string,
    reviewName: string,
    comment: string,
  ): Promise<{ comment: string; updateTime: string }> {
    this.assertReviewName(reviewName);
    const response = await this.request(
      `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new DomainError("Google reply publication failed", "google_api_failed", 502);
    const payload = (await response.json()) as { comment: string; updateTime?: string };
    return { comment: payload.comment, updateTime: payload.updateTime ?? new Date().toISOString() };
  }

  private assertReviewName(reviewName: string): void {
    if (!reviewNamePattern.test(reviewName)) {
      throw new DomainError("Invalid Google review resource name", "invalid_google_resource", 400);
    }
  }
}

function mapGoogleReview(payload: Record<string, unknown>, reviewName: string): ReviewSnapshot {
  const starMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const reviewer = (payload.reviewer ?? {}) as { displayName?: string };
  const reply = (payload.reviewReply ?? null) as { comment?: string } | null;
  const locationId = reviewName.split("/")[3] ?? "unknown";
  return {
    googleReviewName: reviewName,
    locationId,
    reviewerDisplayName: reviewer.displayName ?? "Google user",
    starRating: starMap[String(payload.starRating)] ?? 1,
    comment: String(payload.comment ?? ""),
    createTime: String(payload.createTime ?? new Date().toISOString()),
    updateTime: String(payload.updateTime ?? payload.createTime ?? new Date().toISOString()),
    existingReply: reply?.comment ?? null,
  };
}

export class FakeGoogleBusinessClient implements GoogleBusinessGateway {
  private readonly reviews = new Map<string, ReviewSnapshot>();

  constructor(seed: readonly ReviewSnapshot[] = []) {
    for (const review of seed) this.reviews.set(review.googleReviewName, review);
  }

  buildAuthorizationUrl(state: string): string {
    return `http://localhost:4100/v1/integrations/google/callback?code=demo&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(): Promise<GoogleTokens> {
    return {
      accessToken: "demo-access-token",
      refreshToken: "demo-refresh-token",
      expiresIn: 3_600,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    return { accessToken: "demo-access-token", refreshToken, expiresIn: 3_600 };
  }

  async getReview(_accessToken: string, reviewName: string): Promise<ReviewSnapshot> {
    const review = this.reviews.get(reviewName);
    if (!review) throw new NotFoundError("Google review", reviewName);
    return structuredClone(review);
  }

  async updateReply(
    _accessToken: string,
    reviewName: string,
    comment: string,
  ): Promise<{ comment: string; updateTime: string }> {
    const review = await this.getReview(_accessToken, reviewName);
    const updateTime = new Date().toISOString();
    this.reviews.set(reviewName, { ...review, existingReply: comment, updateTime });
    return { comment, updateTime };
  }

  putReview(review: ReviewSnapshot): void {
    this.reviews.set(review.googleReviewName, review);
  }
}
