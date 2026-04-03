-- PS-03: Content Approval Loop
-- Tracks the full lifecycle of every script approval conversation

CREATE TABLE IF NOT EXISTS approval_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid REFERENCES scripts(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES clients(id) NOT NULL,

  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'request_sent', 'follow_up_1_sent', 'follow_up_2_sent',
      'escalated', 'approved', 'revision_requested', 'rejected',
      'call_requested', 'paused'
    )
  ),

  preferred_channel text NOT NULL DEFAULT 'email' CHECK (
    preferred_channel IN ('email', 'whatsapp')
  ),

  script_version integer NOT NULL DEFAULT 1,

  -- Timestamps for each phase
  request_sent_at     timestamptz,
  follow_up_1_sent_at timestamptz,
  follow_up_2_sent_at timestamptz,
  escalated_at        timestamptz,
  resolved_at         timestamptz,

  -- Message content stored for history + continuity
  request_message     text,
  follow_up_1_message text,
  follow_up_2_message text,
  escalation_message  text,

  -- Client response
  client_response         text,
  response_classification text CHECK (
    response_classification IN (
      'approved', 'revision_requested', 'rejected',
      'call_requested', 'partial_approval', 'ambiguous'
    )
  ),
  approved_sections text,
  revision_notes    text,
  rejection_reason  text,

  -- Control
  is_paused       boolean NOT NULL DEFAULT false,
  follow_up_count integer NOT NULL DEFAULT 0,

  -- LangGraph thread ID for checkpoint resume
  langgraph_thread_id text UNIQUE,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (script_id, script_version)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_approval_threads_script_id    ON approval_threads(script_id);
CREATE INDEX IF NOT EXISTS idx_approval_threads_status       ON approval_threads(status);
CREATE INDEX IF NOT EXISTS idx_approval_threads_request_sent ON approval_threads(request_sent_at);
CREATE INDEX IF NOT EXISTS idx_approval_threads_client_id    ON approval_threads(client_id);

-- Auto-update updated_at on every row change
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
