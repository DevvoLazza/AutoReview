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
  reviewListQuerySchema,
  reviewSnapshotSchema,
  revisionRequestSchema,
} from "@reviewguard/contracts";
import {
  decideAutomation,
  FakeGoogleBusinessClient,
  type GoogleBusinessGateway,
} from "@reviewguard/core";
import { z } from "zod";
import { Principal, Public, Roles } from "./auth.js";
import { DEMO_SNAPSHOTS, DEMO_TENANT_ID, DEMO_USER_ID } from "./demo.js";
import { IntegrationService } from "./integration.service.js";
import { KnowledgeService } from "./knowledge.service.js";
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
  async list(@Principal() principal: RequestPrincipal, @Query() query: unknown) {
    const parsed = reviewListQuerySchema.parse(query);
    const data = (await this.reviews.list(principal, parsed.status))
      .filter((review) => !parsed.locationId || review.snapshot.locationId === parsed.locationId)
      .slice(0, parsed.limit);
    return { data, meta: { limit: parsed.limit } };
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
  constructor(
    private readonly store: MemoryStore,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get()
  async list(@Principal() principal: RequestPrincipal) {
    return { data: await this.store.listKnowledge(principal.tenantId) };
  }

  @Post()
  @Roles("owner", "admin", "editor")
  create(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    return this.store.createKnowledge(principal, createKnowledgeSourceSchema.parse(body));
  }

  @Get(":id")
  async getSource(@Principal() principal: RequestPrincipal, @Param("id") id: string) {
    const entry = (await this.store.listKnowledge(principal.tenantId)).find(
      (source) => source.id === id,
    );
    if (!entry) throw new BadRequestException("Fonte non disponibile");
    return entry;
  }

  @Post(":id/edit")
  @Roles("owner", "admin", "editor")
  async editSource(
    @Principal() principal: RequestPrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = createKnowledgeSourceSchema
      .extend({ expectedVersion: z.number().int().positive() })
      .parse(body);
    const current = (await this.store.listKnowledge(principal.tenantId)).find(
      (source) => source.id === id,
    );
    if (!current || current.version !== input.expectedVersion)
      throw new BadRequestException("La fonte è cambiata: ricaricala prima di salvare");
    return this.store.changeKnowledge(
      principal.tenantId,
      id,
      "draft",
      createKnowledgeSourceSchema.parse(input),
      input.expectedVersion,
    );
  }

  @Post(":id/retire")
  @Roles("owner", "admin")
  retire(@Principal() principal: RequestPrincipal, @Param("id") id: string, @Body() body: unknown) {
    return this.store.changeKnowledge(
      principal.tenantId,
      id,
      "retired",
      {},
      decisionRequestSchema.parse(body).expectedVersion,
    );
  }

  @Post(":id/approve")
  @Roles("owner", "admin")
  async approve(
    @Principal() principal: RequestPrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const result = await this.knowledge.approve(
      principal.tenantId,
      id,
      decisionRequestSchema.parse(body).expectedVersion,
    );
    await this.store.appendAudit(principal, "knowledge.approved", "knowledge", id, {
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
  async list(@Principal() principal: RequestPrincipal) {
    return { data: await this.store.listRules(principal.tenantId) };
  }

  @Post()
  @Roles("owner", "admin")
  create(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    return this.store.createRule(principal.tenantId, createAutomationRuleSchema.parse(body));
  }

  @Post("simulate")
  async simulate(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    const { reviewId } = z.object({ reviewId: z.string().uuid() }).parse(body);
    const review = await this.store.getReview(principal.tenantId, reviewId);
    if (!review.activeDraft || !review.validation)
      throw new BadRequestException("Genera e valida una bozza prima della simulazione");
    const rules = await this.store.listRules(principal.tenantId);
    return decideAutomation({
      review,
      draft: review.activeDraft,
      validation: review.validation,
      rules,
      approvedManualCount: await this.store.manualApprovalCount(
        principal.tenantId,
        review.snapshot.locationId,
      ),
      sentTodayByRule: await this.store.sentTodayByRule(
        principal.tenantId,
        rules.map((rule) => rule.id),
      ),
      globalKillSwitch:
        (await this.store.getSettings(principal.tenantId)).killSwitch ||
        process.env.AUTOMATION_RELEASE_APPROVED !== "true",
    });
  }

  @Post(":id/enable")
  @Roles("owner")
  async enable(
    @Principal() principal: RequestPrincipal,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    enableAutomationRuleSchema.parse(body);
    if (!principal.mfaVerified)
      throw new BadRequestException("MFA is required to enable automation");
    if (process.env.AUTOMATION_RELEASE_APPROVED !== "true")
      throw new BadRequestException("Automatic publication is not released; use manual approval");
    const rule = await this.store.enableRule(principal, id);
    await this.store.appendAudit(principal, "rule.enabled", "automation_rule", id, {
      consentVersion: rule.consentVersion,
    });
    return rule;
  }

  @Post(":id/disable")
  @Roles("owner")
  async disable(@Principal() principal: RequestPrincipal, @Param("id") id: string) {
    const rule = await this.store.setRuleEnabled(principal, id, false);
    await this.store.appendAudit(principal, "rule.disabled", "automation_rule", id);
    return rule;
  }
}

@ApiTags("audit")
@Controller("audit")
export class AuditController {
  constructor(private readonly store: MemoryStore) {}

  @Get()
  @Roles("owner", "admin")
  async list(@Principal() principal: RequestPrincipal) {
    return { data: await this.store.listAudit(principal.tenantId) };
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
    private readonly integrations: IntegrationService,
  ) {}

  @Get("start")
  @Roles("owner")
  @ApiOperation({ summary: "Start Google Business Profile OAuth" })
  async start(@Principal() principal: RequestPrincipal) {
    const nonce = crypto.randomUUID();
    await this.store.repository.put(
      principal.tenantId,
      "oauth",
      nonce,
      { userId: principal.userId },
      null,
      new Date(Date.now() + 10 * 60_000).toISOString(),
    );
    const state = signState({
      tenantId: principal.tenantId,
      userId: principal.userId,
      issuedAt: Date.now(),
      nonce,
    });
    return { authorizationUrl: this.google.buildAuthorizationUrl(state) };
  }

  @Get("callback")
  @Public()
  @Redirect(process.env.WEB_ORIGIN ?? "http://localhost:3000/settings", 302)
  async callback(@Query("code") code: string, @Query("state") state: string) {
    const payload = verifyState(state);
    const record = await this.store.repository.get<{ userId: string; consumed?: boolean }>(
      payload.tenantId,
      "oauth",
      payload.nonce,
    );
    if (
      !record ||
      record.value.userId !== payload.userId ||
      record.value.consumed ||
      !(await this.store.repository.put(
        payload.tenantId,
        "oauth",
        payload.nonce,
        { userId: payload.userId, consumed: true },
        record.version,
      ))
    )
      throw new BadRequestException("OAuth session is expired or already used");
    if (!code) throw new BadRequestException("Google authorization was cancelled");
    const tokens = await this.google.exchangeCode(code);
    await this.store.setGoogleTokens(payload.tenantId, tokens);
    await this.store.appendAudit(
      { tenantId: payload.tenantId, userId: payload.userId },
      "integration.connected",
      "google_connection",
      payload.tenantId,
    );
    return {
      url: `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/settings?google=connected`,
    };
  }

  @Get("discover")
  @Roles("owner")
  discover(@Principal() principal: RequestPrincipal) {
    return this.integrations.discover(principal);
  }

  @Post("import-location")
  @Roles("owner")
  importLocation(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    const input = z
      .object({ accountName: z.string(), locationName: z.string(), consent: z.literal(true) })
      .parse(body);
    return this.integrations.importLocation(principal, input.accountName, input.locationName);
  }

  @Post("sync")
  @Roles("owner", "admin")
  sync(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    const input = z
      .object({ locationId: z.string(), pageToken: z.string().max(4000).optional() })
      .parse(body);
    return this.integrations.sync(principal, input.locationId, input.pageToken);
  }

  @Post("disconnect")
  @Roles("owner")
  disconnect(@Principal() principal: RequestPrincipal) {
    return this.integrations.disconnect(principal);
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
    const notification = googleReviewNotificationSchema.parse(
      JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")),
    );
    const location = (await this.store.listLocations(principal.tenantId)).find(
      (entry) =>
        entry.active &&
        `${entry.googleAccountName}/${entry.googleLocationName}/reviews/` ===
          `${notification.reviewName.split("/reviews/")[0]}/reviews/`,
    );
    if (process.env.GOOGLE_MODE === "live" && !location)
      return { ignored: true, reason: "location_not_connected" };
    if (!(await this.store.claimEvent(principal.tenantId, envelope.message.messageId)))
      return { duplicate: true };
    try {
      const token = await currentAccessToken(this.store, this.google, principal.tenantId);
      const snapshot = await this.google.getReview(token, notification.reviewName);
      const review = await this.reviews.ingestAndGenerate(principal, {
        ...snapshot,
        locationId: location?.id ?? snapshot.locationId,
      });
      await this.store.completeEvent(principal.tenantId, envelope.message.messageId);
      return { accepted: true, reviewId: review.id };
    } catch (error) {
      await this.store.releaseEvent(principal.tenantId, envelope.message.messageId);
      throw error;
    }
  }

  @Post("demo")
  async demo(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    if (process.env.NODE_ENV === "production" || process.env.GOOGLE_MODE === "live")
      throw new BadRequestException("Demo ingestion is disabled");
    const snapshot =
      body && Object.keys(body).length
        ? reviewSnapshotSchema.parse(body)
        : {
            ...DEMO_SNAPSHOTS[1],
            googleReviewName: `accounts/demo/locations/demo/reviews/${crypto.randomUUID()}`,
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
          };
    if (!(this.google instanceof FakeGoogleBusinessClient))
      throw new BadRequestException("Mock adapter is required");
    this.google.putReview(snapshot);
    return this.reviews.ingestAndGenerate(principal, snapshot);
  }
}

async function currentAccessToken(
  store: MemoryStore,
  google: GoogleBusinessGateway,
  tenantId: string,
): Promise<string> {
  const current = await store.getGoogleTokens(tenantId);
  if (!current) {
    if (process.env.GOOGLE_MODE !== "live" && process.env.NODE_ENV !== "production")
      return "demo-access-token";
    throw new UnauthorizedException("Connect Google before continuing");
  }
  if (current.expiresAt > Date.now()) return current.accessToken;
  if (!current.refreshToken) throw new UnauthorizedException("Google connection must be renewed");
  const refreshed = await google.refreshAccessToken(current.refreshToken);
  await store.setGoogleTokens(tenantId, refreshed);
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
  constructor(
    private readonly reviews: ReviewService,
    private readonly store: MemoryStore,
  ) {}

  @Post("purge-expired-google-content")
  @Public()
  async purge(@Headers("x-reviewguard-worker-secret") suppliedSecret: string | undefined) {
    verifyWorkerSecret(suppliedSecret);
    const tenantId = process.env.GOOGLE_WEBHOOK_TENANT_ID ?? DEMO_TENANT_ID;
    return { purged: await this.store.repository.purgeExpired(tenantId) };
  }

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

function signState(payload: {
  tenantId: string;
  userId: string;
  issuedAt: number;
  nonce: string;
}): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", oauthStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyState(state: string): {
  tenantId: string;
  userId: string;
  issuedAt: number;
  nonce: string;
} {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new BadRequestException("Invalid OAuth state");
  const expected = createHmac("sha256", oauthStateSecret()).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new BadRequestException("Invalid OAuth state signature");
  }
  const payload = z
    .object({
      tenantId: z.string().uuid(),
      userId: z.string().uuid(),
      nonce: z.string().uuid(),
      issuedAt: z.number(),
    })
    .parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  if (Date.now() - payload.issuedAt > 10 * 60_000 || payload.issuedAt > Date.now() + 5000)
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
