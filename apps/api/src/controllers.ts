import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Redirect,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createAutomationRuleSchema,
  createKnowledgeSourceSchema,
  decisionRequestSchema,
  deviceRegistrationSchema,
  editDraftRequestSchema,
  enableAutomationRuleSchema,
  googleReviewNotificationSchema,
  pubSubEnvelopeSchema,
  type RequestPrincipal,
  type ReviewSnapshot,
  reviewListQuerySchema,
  revisionRequestSchema,
} from "@reviewguard/contracts";
import type { GoogleBusinessGateway } from "@reviewguard/core";
import { z } from "zod";
import { Principal, Public, Roles } from "./auth.js";
import { DEMO_SNAPSHOTS, DEMO_TENANT_ID, DEMO_USER_ID } from "./demo.js";
import { GOOGLE_GATEWAY } from "./providers.js";
import { ReviewService } from "./review.service.js";
import { MemoryStore } from "./store.js";

@ApiTags("system")
@Controller()
export class HealthController {
  @Get("health")
  @Public()
  health() {
    return { status: "ok", service: "reviewguard-api", time: new Date().toISOString() };
  }
}

@ApiTags("reviews")
@ApiBearerAuth()
@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  list(@Principal() principal: RequestPrincipal, @Query() query: unknown) {
    const parsed = reviewListQuerySchema.parse(query);
    return { data: this.reviews.list(principal, parsed.status), meta: { limit: parsed.limit } };
  }

  @Get(":id")
  get(@Principal() principal: RequestPrincipal, @Param("id") id: string) {
    return this.reviews.get(principal, id);
  }

  @Post(":id/generate")
  @Roles("owner", "admin", "editor", "approver")
  generate(
    @Principal() principal: RequestPrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = decisionRequestSchema.parse(body);
    return this.reviews.generate(principal, id, parsed.expectedVersion);
  }

  @Post(":id/revise")
  @Roles("owner", "admin", "editor", "approver")
  revise(@Principal() principal: RequestPrincipal, @Param("id") id: string, @Body() body: unknown) {
    const parsed = revisionRequestSchema.parse(body);
    return this.reviews.generate(principal, id, parsed.expectedVersion, parsed.instruction);
  }

  @Post(":id/edit")
  @Roles("owner", "admin", "editor", "approver")
  edit(@Principal() principal: RequestPrincipal, @Param("id") id: string, @Body() body: unknown) {
    const parsed = editDraftRequestSchema.parse(body);
    return this.reviews.editDraft(principal, id, parsed.expectedVersion, parsed.text);
  }

  @Post(":id/approve")
  @Roles("owner", "approver")
  approve(
    @Principal() principal: RequestPrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = decisionRequestSchema.parse(body);
    return this.reviews.approve(principal, id, parsed.expectedVersion);
  }

  @Post(":id/reject")
  @Roles("owner", "approver")
  reject(@Principal() principal: RequestPrincipal, @Param("id") id: string, @Body() body: unknown) {
    const parsed = decisionRequestSchema.parse(body);
    return this.reviews.reject(principal, id, parsed.expectedVersion, parsed.reason);
  }

  @Post(":id/cancel-schedule")
  @Roles("owner", "approver")
  cancel(@Principal() principal: RequestPrincipal, @Param("id") id: string, @Body() body: unknown) {
    const parsed = decisionRequestSchema.parse(body);
    return this.reviews.cancelSchedule(principal, id, parsed.expectedVersion);
  }
}

@ApiTags("knowledge")
@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly store: MemoryStore) {}

  @Get()
  list(@Principal() principal: RequestPrincipal) {
    return { data: this.store.listKnowledge(principal.tenantId) };
  }

  @Post()
  @Roles("owner", "admin", "editor")
  create(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    return this.store.createKnowledge(principal, createKnowledgeSourceSchema.parse(body));
  }

  @Post(":id/approve")
  @Roles("owner", "admin")
  approve(@Principal() principal: RequestPrincipal, @Param("id") id: string) {
    const result = this.store.approveKnowledge(principal.tenantId, id);
    this.store.appendAudit(principal, "knowledge.approved", "knowledge", id, {
      version: result.version,
    });
    return result;
  }
}

@ApiTags("automation")
@Controller("automation-rules")
export class AutomationController {
  constructor(private readonly store: MemoryStore) {}

  @Get()
  list(@Principal() principal: RequestPrincipal) {
    return { data: this.store.listRules(principal.tenantId) };
  }

  @Post()
  @Roles("owner", "admin")
  create(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    return this.store.createRule(principal.tenantId, createAutomationRuleSchema.parse(body));
  }

  @Post(":id/enable")
  @Roles("owner")
  enable(@Principal() principal: RequestPrincipal, @Param("id") id: string, @Body() body: unknown) {
    enableAutomationRuleSchema.parse(body);
    if (!principal.mfaVerified)
      throw new BadRequestException("MFA is required to enable automation");
    const rule = this.store.enableRule(principal, id);
    this.store.appendAudit(principal, "rule.enabled", "automation_rule", id, {
      consentVersion: rule.consentVersion,
    });
    return rule;
  }
}

@ApiTags("audit")
@Controller("audit")
export class AuditController {
  constructor(private readonly store: MemoryStore) {}

  @Get()
  @Roles("owner", "admin")
  list(@Principal() principal: RequestPrincipal) {
    return { data: this.store.listAudit(principal.tenantId) };
  }
}

@ApiTags("devices")
@Controller("devices")
export class DevicesController {
  constructor(private readonly store: MemoryStore) {}

  @Post()
  register(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    return this.store.registerDevice(principal, deviceRegistrationSchema.parse(body));
  }
}

@ApiTags("integrations")
@Controller("integrations/google")
export class IntegrationsController {
  constructor(
    @Inject(GOOGLE_GATEWAY) private readonly google: GoogleBusinessGateway,
    private readonly store: MemoryStore,
  ) {}

  @Get("start")
  @Roles("owner")
  @ApiOperation({ summary: "Start Google Business Profile OAuth" })
  start(@Principal() principal: RequestPrincipal) {
    const state = signState({
      tenantId: principal.tenantId,
      userId: principal.userId,
      issuedAt: Date.now(),
    });
    return { authorizationUrl: this.google.buildAuthorizationUrl(state) };
  }

  @Get("callback")
  @Public()
  @Redirect(process.env.WEB_ORIGIN ?? "http://localhost:3000/settings", 302)
  async callback(@Query("code") code: string, @Query("state") state: string) {
    const payload = verifyState(state);
    const tokens = await this.google.exchangeCode(code);
    this.store.setGoogleTokens(payload.tenantId, tokens);
    this.store.appendAudit(
      { tenantId: payload.tenantId, userId: payload.userId },
      "integration.connected",
      "google_connection",
      payload.tenantId,
    );
    return {
      url: `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/settings?google=connected`,
    };
  }
}

@ApiTags("webhooks")
@Controller("webhooks/google-business")
export class GoogleWebhookController {
  constructor(
    @Inject(GOOGLE_GATEWAY) private readonly google: GoogleBusinessGateway,
    private readonly store: MemoryStore,
    private readonly reviews: ReviewService,
  ) {}

  @Post()
  @Public()
  async receive(
    @Headers("x-reviewguard-worker-secret") suppliedSecret: string | undefined,
    @Body() body: unknown,
  ) {
    verifyWorkerSecret(suppliedSecret);
    const principal: RequestPrincipal = {
      tenantId: process.env.GOOGLE_WEBHOOK_TENANT_ID ?? DEMO_TENANT_ID,
      userId: process.env.GOOGLE_WEBHOOK_ACTOR_ID ?? DEMO_USER_ID,
      role: "owner",
      mfaVerified: true,
    };
    const envelope = pubSubEnvelopeSchema.parse(body);
    if (!this.store.claimEvent(envelope.message.messageId)) return { duplicate: true };
    const notification = googleReviewNotificationSchema.parse(
      JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")),
    );
    const token = await currentAccessToken(this.store, this.google, principal.tenantId);
    const snapshot = await this.google.getReview(token, notification.reviewName);
    const review = await this.reviews.ingestAndGenerate(principal, snapshot);
    return { accepted: true, reviewId: review.id };
  }

  @Post("demo")
  async demo(@Principal() principal: RequestPrincipal) {
    return this.reviews.ingestAndGenerate(principal, DEMO_SNAPSHOTS[1] as ReviewSnapshot);
  }
}

async function currentAccessToken(
  store: MemoryStore,
  google: GoogleBusinessGateway,
  tenantId: string,
): Promise<string> {
  const current = store.getGoogleTokens(tenantId);
  if (!current) return "demo-access-token";
  if (current.expiresAt > Date.now()) return current.accessToken;
  if (!current.refreshToken) throw new UnauthorizedException("Google connection must be renewed");
  const refreshed = await google.refreshAccessToken(current.refreshToken);
  store.setGoogleTokens(tenantId, refreshed);
  return refreshed.accessToken;
}

const internalPublishSchema = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});

@ApiTags("internal")
@Controller("internal/reviews")
export class InternalReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  @Post(":id/publish")
  @Public()
  publish(
    @Headers("x-reviewguard-worker-secret") suppliedSecret: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    verifyWorkerSecret(suppliedSecret);
    const input = internalPublishSchema.parse(body);
    return this.reviews.approve(
      {
        tenantId: input.tenantId,
        userId: input.actorId,
        role: "owner",
        mfaVerified: true,
      },
      id,
      input.expectedVersion,
      false,
    );
  }
}

function signState(payload: { tenantId: string; userId: string; issuedAt: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", oauthStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyState(state: string): { tenantId: string; userId: string; issuedAt: number } {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new BadRequestException("Invalid OAuth state");
  const expected = createHmac("sha256", oauthStateSecret()).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new BadRequestException("Invalid OAuth state signature");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    tenantId: string;
    userId: string;
    issuedAt: number;
  };
  if (Date.now() - payload.issuedAt > 10 * 60_000)
    throw new BadRequestException("Expired OAuth state");
  return payload;
}

function oauthStateSecret(): string {
  if (process.env.NODE_ENV === "production" && !process.env.OAUTH_STATE_SECRET) {
    throw new Error("OAUTH_STATE_SECRET is required in production");
  }
  return process.env.OAUTH_STATE_SECRET ?? "reviewguard-local-state-secret";
}

function verifyWorkerSecret(supplied: string | undefined): void {
  const expected = process.env.INTERNAL_WORKER_SECRET ?? "reviewguard-local-worker-secret";
  if (process.env.NODE_ENV === "production" && !process.env.INTERNAL_WORKER_SECRET) {
    throw new Error("INTERNAL_WORKER_SECRET is required in production");
  }
  if (!supplied) throw new UnauthorizedException("Worker authentication is required");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    throw new UnauthorizedException("Invalid worker authentication");
  }
}
