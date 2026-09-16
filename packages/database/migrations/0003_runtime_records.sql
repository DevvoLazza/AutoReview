-- Authoritative versioned pilot aggregates; normalized tables are reserved for reporting.
CREATE TABLE runtime_records (
  tenant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('review','knowledge','rule','audit','google_tokens','device','event','settings','location','counter','oauth','publish')),
  id text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  payload jsonb NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,kind,id)
);--> statement-breakpoint
ALTER TABLE runtime_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runtime_records FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON runtime_records USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());--> statement-breakpoint
CREATE INDEX runtime_records_expiry_idx ON runtime_records(expires_at) WHERE expires_at IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX runtime_review_google_idx ON runtime_records(tenant_id,(payload->'snapshot'->>'googleReviewName')) WHERE kind='review';--> statement-breakpoint
CREATE INDEX runtime_knowledge_search_idx ON runtime_records USING gin(to_tsvector('simple',payload->>'content')) WHERE kind='knowledge';--> statement-breakpoint
CREATE FUNCTION protect_runtime_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind='audit' THEN RAISE EXCEPTION 'runtime audit is append-only'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER runtime_audit_append_only BEFORE UPDATE OR DELETE ON runtime_records FOR EACH ROW EXECUTE FUNCTION protect_runtime_audit();
