-- Agent execution logging tables
-- Provides observability for all agent runs and inter-agent communication.

-- ─── Agent Runs ───────────────────────────────────────────────────
-- One row per agent execution. Tracks tokens, duration, tool calls.

CREATE TABLE IF NOT EXISTS agent_runs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id        text NOT NULL UNIQUE,
  agent         text NOT NULL,
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed', 'timeout')),
  turns         integer NOT NULL DEFAULT 0,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tool_calls    integer NOT NULL DEFAULT 0,
  tool_call_details jsonb,
  final_response text,
  error         text,
  duration_ms   integer NOT NULL DEFAULT 0,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by agent and time
CREATE INDEX idx_agent_runs_agent_started ON agent_runs (agent, started_at DESC);
CREATE INDEX idx_agent_runs_status ON agent_runs (status);

-- ─── Agent Messages ───────────────────────────────────────────────
-- Inter-agent communication log (hub-and-spoke model).

CREATE TABLE IF NOT EXISTS agent_messages (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_agent    text NOT NULL,
  to_agent      text NOT NULL,
  message_type  text NOT NULL DEFAULT 'notification'
                  CHECK (message_type IN ('request', 'response', 'escalation', 'notification')),
  priority      text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  deal_id       text,
  summary       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_messages_to ON agent_messages (to_agent, created_at DESC);
CREATE INDEX idx_agent_messages_deal ON agent_messages (deal_id) WHERE deal_id IS NOT NULL;

-- ─── RLS Policies ─────────────────────────────────────────────────
-- Agent tables are service-role only (agents use service role key).

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Admin users can read agent logs
CREATE POLICY "admin_read_agent_runs" ON agent_runs
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
  );

CREATE POLICY "admin_read_agent_messages" ON agent_messages
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
  );
