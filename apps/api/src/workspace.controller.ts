import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { RequestPrincipal } from "@reviewguard/contracts";
import { DomainError } from "@reviewguard/core";
import { z } from "zod";
import { Principal, Roles } from "./auth.js";
import { MemoryStore } from "./store.js";

const settingsSchema = z.object({
  killSwitch: z.boolean(),
  defaultLanguage: z.string().min(2).max(16),
  tone: z.string().min(3).max(1000),
});

@Controller()
export class WorkspaceController {
  constructor(private readonly store: MemoryStore) {}
  @Get("session")
  session(@Principal() principal: RequestPrincipal) {
    return {
      principal,
      demo: (process.env.AUTH_MODE ?? "demo") === "demo" && process.env.NODE_ENV !== "production",
    };
  }
  @Get("workspace")
  async workspace(@Principal() principal: RequestPrincipal) {
    const [locations, settings, reviews, knowledge, tokens] = await Promise.all([
      this.store.listLocations(principal.tenantId),
      this.store.getSettings(principal.tenantId),
      this.store.listReviews(principal.tenantId),
      this.store.listKnowledge(principal.tenantId),
      this.store.getGoogleTokens(principal.tenantId),
    ]);
    return {
      principal,
      locations: await Promise.all(
        locations.map(async (location) => ({
          ...location,
          manualApprovalCount: await this.store.manualApprovalCount(
            principal.tenantId,
            location.id,
          ),
        })),
      ),
      settings,
      metrics: {
        pending: reviews.filter((review) => review.status === "pending_approval").length,
        attention: reviews.filter((review) => review.status === "needs_attention").length,
        published: reviews.filter((review) => review.status === "published").length,
        approvedSources: knowledge.filter((entry) => entry.status === "approved").length,
      },
      integration: {
        googleMode: process.env.GOOGLE_MODE ?? "mock",
        googleConnected: Boolean(tokens),
        aiMode: process.env.AI_MODE ?? "mock",
        model: process.env.OPENROUTER_MODEL ?? "mock-review-model-v1",
        storageMode: process.env.STORAGE_MODE ?? "memory",
        automationReleased: process.env.AUTOMATION_RELEASE_APPROVED === "true",
      },
    };
  }
  @Post("workspace/settings")
  @Roles("owner")
  saveSettings(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    return this.store.saveSettings(principal.tenantId, settingsSchema.parse(body));
  }
  @Post("locations/:id/settings")
  @Roles("owner", "admin")
  async locationSettings(
    @Principal() principal: RequestPrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({ defaultLanguage: z.string().min(2).max(16), tone: z.string().min(3).max(1000) })
      .parse(body);
    const location = (await this.store.listLocations(principal.tenantId)).find(
      (entry) => entry.id === id,
    );
    if (!location) throw new DomainError("Location not found", "not_found", 404);
    return this.store.upsertLocation(principal.tenantId, { ...location, ...input });
  }
}
