CREATE TABLE "runtime_knowledge_chunks" (
	"tenant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"embedding_model" text NOT NULL,
	CONSTRAINT "runtime_knowledge_chunks_tenant_id_source_id_source_version_ordinal_pk" PRIMARY KEY("tenant_id","source_id","source_version","ordinal")
);
--> statement-breakpoint
-- runtime_records is already created by 0003; the generated snapshot now includes it.
ALTER TABLE runtime_knowledge_chunks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runtime_knowledge_chunks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON runtime_knowledge_chunks USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());--> statement-breakpoint
CREATE INDEX "runtime_knowledge_chunks_lookup_idx" ON "runtime_knowledge_chunks" USING btree ("tenant_id","source_id","source_version");--> statement-breakpoint
CREATE INDEX "runtime_knowledge_chunks_search_idx" ON "runtime_knowledge_chunks" USING gin (to_tsvector('simple',"content"));--> statement-breakpoint
CREATE INDEX "runtime_knowledge_chunks_vector_idx" ON "runtime_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
