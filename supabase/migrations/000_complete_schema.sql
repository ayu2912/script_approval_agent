-- ============================================================
-- COMPLETE SCHEMA — script_approval_agent
-- Run this ONCE on a fresh Supabase project
-- ============================================================

-- Enable pgvector for AI embeddings (RAG / client memory)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Utility function for auto-updating updated_at ────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. CLIENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                      text NOT NULL,
  email                     text NOT NULL,
  company                   text,
  whatsapp_number           text,
  preferred_channel         text DEFAULT 'email',
  instagram_handle          text,
  youtube_channel_id        text,
  twitter_handle            text,
  linkedin_url              text,
  avg_response_hours        numeric DEFAULT 48,
  total_scripts             integer DEFAULT 0,
  approved_count            integer DEFAULT 0,
  rejected_count            integer DEFAULT 0,
  changes_requested_count   integer DEFAULT 0,
  brand_voice               text,
  account_manager           text,
  contract_start            date,
  monthly_volume            integer,
  platform_focus            text[],
  onboarding_checklist      jsonb,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. BRIEFS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS briefs (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id            uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  raw_input            text NOT NULL,
  content_type         text NOT NULL DEFAULT 'video_script',
  platform             text,
  topic                text,
  target_audience      text,
  key_messages         text,
  tone                 text,
  reference_links      text,
  deadline             date,
  special_instructions text,
  parsed_brief         jsonb,
  status               text NOT NULL DEFAULT 'intake'
    CHECK (status IN ('intake','parsing','parsed','assigned','in_progress','script_uploaded','archived')),
  assigned_writer      text,
  script_id            uuid,  -- FK added after scripts table
  parsed_at            timestamptz,
  assigned_at          timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_briefs_client_id ON briefs(client_id);
CREATE INDEX idx_briefs_status ON briefs(status);

CREATE TRIGGER briefs_updated_at
  BEFORE UPDATE ON briefs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 3. SCRIPTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scripts (
  id                         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title                      text NOT NULL,
  content                    text NOT NULL,
  client_id                  uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  brief_id                   uuid REFERENCES briefs(id) ON DELETE SET NULL,
  status                     text DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','changes_requested','approved','rejected','overdue','escalated','closed')),
  review_token               text DEFAULT gen_random_uuid()::text,
  client_feedback            text,
  sent_at                    timestamptz,
  reviewed_at                timestamptz,
  due_date                   timestamptz,
  expires_at                 timestamptz,
  version                    integer DEFAULT 1,
  platform                   text DEFAULT 'instagram',
  assigned_writer            text,
  review_channel             text DEFAULT 'email',
  response_deadline_minutes  integer DEFAULT 2880,
  archived                   boolean DEFAULT false,
  quality_score              jsonb,
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

CREATE INDEX idx_scripts_client_id ON scripts(client_id);
CREATE INDEX idx_scripts_status ON scripts(status);

CREATE TRIGGER scripts_updated_at
  BEFORE UPDATE ON scripts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Now add the FK from briefs → scripts
ALTER TABLE briefs ADD CONSTRAINT briefs_script_id_fkey
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL;

-- ── 4. CHASERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chasers (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id            uuid REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
  client_id            uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  draft_content        text NOT NULL,
  status               text DEFAULT 'pending_hitl'
    CHECK (status IN ('pending_hitl','draft_saved','approved','edited','rejected','sent')),
  team_lead_edits      text,
  hitl_state           jsonb,
  recommended_channel  text,
  delivery_channel     text,
  critique_scores      jsonb,
  revision_count       integer DEFAULT 0,
  node_execution_log   jsonb DEFAULT '[]',
  sent_at              timestamptz,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_chasers_script_id ON chasers(script_id);
CREATE INDEX idx_chasers_status ON chasers(status);

-- ── 5. CLIENT MEMORIES (RAG / pgvector) ─────────────────────
CREATE TABLE IF NOT EXISTS client_memories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  memory_type text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_client_memories_client_id ON client_memories(client_id);

-- Vector similarity search function (used by RAG nodes)
CREATE OR REPLACE FUNCTION match_client_memories(
  query_embedding vector(1536),
  match_client_id uuid,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id          uuid,
  client_id   uuid,
  content     text,
  memory_type text,
  created_at  timestamptz,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cm.id,
    cm.client_id,
    cm.content,
    cm.memory_type,
    cm.created_at,
    1 - (cm.embedding <=> query_embedding) AS similarity
  FROM client_memories cm
  WHERE cm.client_id = match_client_id
    AND cm.embedding IS NOT NULL
  ORDER BY cm.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 6. AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  action      text NOT NULL,
  actor       text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- ── 7. AGENT QUEUE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id    uuid REFERENCES scripts(id) ON DELETE CASCADE,
  status       text DEFAULT 'queued',
  error        text,
  skip_reason  text,
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_queue_script_queued_unique
  ON agent_queue (script_id)
  WHERE status = 'queued';

-- ── 8. REPORTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id          uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  report_title       text NOT NULL,
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  entries            jsonb NOT NULL DEFAULT '[]',
  aggregate_metrics  jsonb,
  previous_aggregate jsonb,
  generated_summary  text,
  recommendations    text,
  sent_at            timestamptz,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX idx_reports_client_id ON reports(client_id);
CREATE INDEX idx_reports_period ON reports(client_id, period_end DESC);

-- ── 9. LANGGRAPH CHECKPOINTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  thread_id            text NOT NULL,
  checkpoint_id        text NOT NULL,
  parent_checkpoint_id text,
  state                jsonb NOT NULL DEFAULT '{}',
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz DEFAULT now(),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX idx_agent_checkpoints_thread
  ON agent_checkpoints (thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_checkpoint_writes (
  thread_id     text NOT NULL,
  checkpoint_id text NOT NULL,
  task_id       text NOT NULL,
  idx           integer NOT NULL,
  channel       text NOT NULL,
  value         jsonb,
  PRIMARY KEY (thread_id, checkpoint_id, task_id, idx)
);

-- ── 10. FEW-SHOT EXAMPLES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS chaser_few_shot_examples (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id      uuid REFERENCES clients(id) ON DELETE CASCADE,
  original_draft text NOT NULL,
  edited_draft   text NOT NULL,
  script_title   text,
  tone           text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_few_shot_client
  ON chaser_few_shot_examples (client_id, created_at DESC);

-- ── 11. WHATSAPP MESSAGES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id       uuid REFERENCES scripts(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  direction       text,
  message_body    text,
  parsed_intent   text,
  parsed_feedback text,
  created_at      timestamptz DEFAULT now()
);

-- ── 12. APPROVAL THREADS (PS-03 — new) ──────────────────────
CREATE TABLE IF NOT EXISTS approval_threads (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id               uuid REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
  client_id               uuid REFERENCES clients(id) NOT NULL,
  status                  text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending','request_sent','follow_up_1_sent','follow_up_2_sent',
      'escalated','approved','revision_requested','rejected',
      'call_requested','paused'
    )
  ),
  preferred_channel       text NOT NULL DEFAULT 'email'
    CHECK (preferred_channel IN ('email','whatsapp')),
  script_version          integer NOT NULL DEFAULT 1,
  request_sent_at         timestamptz,
  follow_up_1_sent_at     timestamptz,
  follow_up_2_sent_at     timestamptz,
  escalated_at            timestamptz,
  resolved_at             timestamptz,
  request_message         text,
  follow_up_1_message     text,
  follow_up_2_message     text,
  escalation_message      text,
  client_response         text,
  response_classification text CHECK (
    response_classification IN (
      'approved','revision_requested','rejected',
      'call_requested','partial_approval','ambiguous'
    )
  ),
  approved_sections       text,
  revision_notes          text,
  rejection_reason        text,
  is_paused               boolean NOT NULL DEFAULT false,
  follow_up_count         integer NOT NULL DEFAULT 0,
  langgraph_thread_id     text UNIQUE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, script_version)
);

CREATE INDEX IF NOT EXISTS idx_approval_threads_script_id
  ON approval_threads(script_id);
CREATE INDEX IF NOT EXISTS idx_approval_threads_status
  ON approval_threads(status);
CREATE INDEX IF NOT EXISTS idx_approval_threads_request_sent
  ON approval_threads(request_sent_at);
CREATE INDEX IF NOT EXISTS idx_approval_threads_client_id
  ON approval_threads(client_id);

CREATE OR REPLACE FUNCTION update_approval_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approval_threads_updated_at ON approval_threads;
CREATE TRIGGER approval_threads_updated_at
  BEFORE UPDATE ON approval_threads
  FOR EACH ROW EXECUTE FUNCTION update_approval_threads_updated_at();

-- ── Realtime ─────────────────────────────────────────────────
ALTER TABLE scripts REPLICA IDENTITY FULL;
ALTER TABLE chasers REPLICA IDENTITY FULL;

-- ── RLS (Row Level Security) ──────────────────────────────────
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chasers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access on clients"
  ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access on scripts"
  ON scripts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access on chasers"
  ON chasers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access on client_memories"
  ON client_memories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access on audit_log"
  ON audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access on approval_threads"
  ON approval_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access on briefs"
  ON briefs FOR ALL TO authenticated USING (true) WITH CHECK (true);
