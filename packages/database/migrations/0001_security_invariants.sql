CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;--> statement-breakpoint

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'memberships','locations','google_connections','review_cases','reply_drafts',
    'knowledge_sources','knowledge_chunks','automation_rules','audit_events',
    'device_tokens','publish_attempts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      table_name
    );
  END LOOP;
END $$;--> statement-breakpoint

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_tenant_id())
  WITH CHECK (id = app_tenant_id());--> statement-breakpoint

ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_members_only ON users
  USING (EXISTS (
    SELECT 1 FROM memberships
    WHERE memberships.user_id = users.id
      AND memberships.tenant_id = app_tenant_id()
  ));--> statement-breakpoint

CREATE INDEX knowledge_chunks_fulltext_idx
  ON knowledge_chunks USING gin (to_tsvector('simple', search_text));--> statement-breakpoint
CREATE INDEX knowledge_chunks_embedding_hnsw_idx
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);--> statement-breakpoint

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
