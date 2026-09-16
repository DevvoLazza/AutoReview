import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("member_role", ["owner", "admin", "editor", "approver"]);
export const runtimeRecords = pgTable(
  "runtime_records",
  {
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").notNull(),
    id: text("id").notNull(),
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.kind, table.id] }),
    check("runtime_records_version_check", sql`${table.version}>0`),
    check(
      "runtime_records_kind_check",
      sql`${table.kind} IN ('review','knowledge','rule','audit','google_tokens','device','event','settings','location','counter','oauth','publish')`,
    ),
    index("runtime_records_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} IS NOT NULL`),
    uniqueIndex("runtime_review_google_idx")
      .on(table.tenantId, sql`(${table.payload}->'snapshot'->>'googleReviewName')`)
      .where(sql`${table.kind}='review'`),
    index("runtime_knowledge_search_idx")
      .using("gin", sql`to_tsvector('simple',${table.payload}->>'content')`)
      .where(sql`${table.kind}='knowledge'`),
  ],
);
export const runtimeKnowledgeChunks = pgTable(
  "runtime_knowledge_chunks",
  {
    tenantId: uuid("tenant_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.sourceId, table.sourceVersion, table.ordinal] }),
    index("runtime_knowledge_chunks_lookup_idx").on(
      table.tenantId,
      table.sourceId,
      table.sourceVersion,
    ),
    index("runtime_knowledge_chunks_search_idx").using(
      "gin",
      sql`to_tsvector('simple',${table.content})`,
    ),
    index("runtime_knowledge_chunks_vector_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
export const reviewStatusEnum = pgEnum("review_workflow_status", [
  "received",
  "generating",
  "pending_approval",
  "scheduled_auto",
  "publishing",
  "published",
  "rejected",
  "needs_attention",
]);
export const knowledgeStatusEnum = pgEnum("knowledge_status", ["draft", "approved", "retired"]);
export const knowledgeKindEnum = pgEnum("knowledge_kind", [
  "business_profile",
  "service",
  "opening_hours",
  "contact",
  "tone",
  "faq",
  "policy",
  "forbidden_claim",
  "document",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  defaultLanguage: text("default_language").notNull().default("it"),
  automationKillSwitch: boolean("automation_kill_switch").notNull().default(false),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  identityUid: text("identity_uid").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  mfaEnrolled: boolean("mfa_enrolled").notNull().default(false),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId] })],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    googleAccountName: text("google_account_name").notNull(),
    googleLocationName: text("google_location_name").notNull(),
    displayName: text("display_name").notNull(),
    defaultLanguage: text("default_language").notNull().default("it"),
    tone: text("tone").notNull().default("professionale, umano e conciso"),
    manualApprovalCount: integer("manual_approval_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("locations_tenant_google_uidx").on(table.tenantId, table.googleLocationName),
    index("locations_tenant_idx").on(table.tenantId),
  ],
);

export const googleConnections = pgTable(
  "google_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    googleAccountName: text("google_account_name"),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    tokenKeyVersion: text("token_key_version").notNull(),
    scopes: text("scopes").array().notNull(),
    status: text("status").notNull().default("active"),
    lastErrorCode: text("last_error_code"),
    connectedBy: uuid("connected_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [index("google_connections_tenant_idx").on(table.tenantId)],
);

export const reviewCases = pgTable(
  "review_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    googleReviewName: text("google_review_name").notNull(),
    googleCreateTime: timestamp("google_create_time", { withTimezone: true }).notNull(),
    googleUpdateTime: timestamp("google_update_time", { withTimezone: true }).notNull(),
    reviewerDisplayName: text("reviewer_display_name").notNull(),
    starRating: integer("star_rating").notNull(),
    comment: text("comment").notNull().default(""),
    contentExpiresAt: timestamp("content_expires_at", { withTimezone: true }).notNull(),
    existingReply: text("existing_reply"),
    status: reviewStatusEnum("status").notNull().default("received"),
    version: integer("version").notNull().default(1),
    language: text("language"),
    category: text("category"),
    riskFlags: text("risk_flags").array().notNull().default(sql`ARRAY[]::text[]`),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    matchedRuleId: uuid("matched_rule_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedReply: text("published_reply"),
    activeDraftId: uuid("active_draft_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("review_cases_tenant_google_uidx").on(table.tenantId, table.googleReviewName),
    index("review_cases_inbox_idx").on(table.tenantId, table.status, table.createdAt),
    index("review_cases_expiry_idx").on(table.contentExpiresAt),
  ],
);

export const replyDrafts = pgTable(
  "reply_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reviewCaseId: uuid("review_case_id")
      .notNull()
      .references(() => reviewCases.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    text: text("text").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    riskFlags: text("risk_flags").array().notNull().default(sql`ARRAY[]::text[]`),
    knowledgeSourceIds: uuid("knowledge_source_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    unsupportedClaims: text("unsupported_claims").array().notNull().default(sql`ARRAY[]::text[]`),
    requiresHumanReview: boolean("requires_human_review").notNull(),
    validation: jsonb("validation").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    promptVersion: text("prompt_version").notNull(),
    requestId: text("request_id"),
    humanInstruction: text("human_instruction"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reply_drafts_revision_uidx").on(table.reviewCaseId, table.revision),
    index("reply_drafts_tenant_idx").on(table.tenantId),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
    kind: knowledgeKindEnum("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    language: text("language").notNull(),
    status: knowledgeStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    sha256: text("sha256").notNull(),
    ...timestamps,
  },
  (table) => [
    index("knowledge_sources_lookup_idx").on(table.tenantId, table.locationId, table.status),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    searchText: text("search_text").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_chunks_source_ordinal_uidx").on(table.sourceId, table.ordinal),
    index("knowledge_chunks_tenant_idx").on(table.tenantId),
  ],
);

export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    locationIds: uuid("location_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    starRatings: integer("star_ratings").array().notNull(),
    languages: text("languages").array().notNull().default(sql`ARRAY[]::text[]`),
    commentMode: text("comment_mode").notNull().default("any"),
    categories: text("categories").array().notNull().default(sql`ARRAY[]::text[]`),
    action: text("action").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(10),
    dailyLimit: integer("daily_limit").notNull().default(20),
    enabled: boolean("enabled").notNull().default(false),
    consentVersion: text("consent_version"),
    consentedBy: uuid("consented_by").references(() => users.id),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("automation_rules_tenant_idx").on(table.tenantId, table.enabled)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_tenant_time_idx").on(table.tenantId, table.createdAt)],
);

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    provider: text("provider").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("device_tokens_token_uidx").on(table.token)],
);

export const processedEvents = pgTable("processed_events", {
  messageId: text("message_id").primaryKey(),
  eventType: text("event_type").notNull(),
  entityId: text("entity_id").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publishAttempts = pgTable(
  "publish_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reviewCaseId: uuid("review_case_id")
      .notNull()
      .references(() => reviewCases.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    providerStatus: integer("provider_status"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("publish_attempts_idempotency_uidx").on(table.idempotencyKey, table.attempt),
    index("publish_attempts_review_idx").on(table.reviewCaseId),
  ],
);
