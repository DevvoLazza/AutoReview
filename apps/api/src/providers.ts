import {
  FakeGoogleBusinessClient,
  GoogleBusinessClient,
  MockReplyProvider,
  OpenRouterReplyProvider,
} from "@reviewguard/core";
import { DEMO_SNAPSHOTS } from "./demo.js";

export const AI_PROVIDER = Symbol("AI_PROVIDER");
export const GOOGLE_GATEWAY = Symbol("GOOGLE_GATEWAY");

export const aiProvider = {
  provide: AI_PROVIDER,
  useFactory: () => {
    if ((process.env.AI_MODE ?? "mock") !== "live") return new MockReplyProvider();
    return new OpenRouterReplyProvider({
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
      baseUrl: process.env.OPENROUTER_BASE_URL,
      model: process.env.OPENROUTER_MODEL,
      providerAllowlist: process.env.OPENROUTER_PROVIDER_ALLOWLIST?.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  },
};

export const googleGateway = {
  provide: GOOGLE_GATEWAY,
  useFactory: () => {
    if (process.env.GOOGLE_MODE !== "live") return new FakeGoogleBusinessClient(DEMO_SNAPSHOTS);
    return new GoogleBusinessClient({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
    });
  },
};
