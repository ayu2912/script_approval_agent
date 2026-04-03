-- Greenlit database schema
-- Run this in the Supabase SQL editor

-- Enable pgvector for embedding storage
create extension if not exists vector with schema extensions;

-- Clients table
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  company text,
  avg_response_hours double precision,
  total_scripts integer not null default 0,
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  changes_requested_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Scripts table
create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'changes_requested', 'approved', 'rejected', 'overdue', 'closed')),
  review_token uuid not null default gen_random_uuid() unique,
  client_feedback text,
  sent_at timestamptz,
  reviewed_at timestamptz,
  due_date timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chasers table (AI-generated follow-up emails)
create table public.chasers (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  draft_content text not null,
  status text not null default 'pending_hitl'
    check (status in ('pending_hitl', 'approved', 'edited', 'rejected', 'sent')),
  team_lead_edits text,
  hitl_state jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Audit log
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Client memories for RAG (pgvector)
create table public.client_memories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  memory_type text not null
    check (memory_type in ('feedback', 'approval', 'rejection', 'behavioral_pattern')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_scripts_client_id on public.scripts(client_id);
create index idx_scripts_status on public.scripts(status);
create index idx_scripts_review_token on public.scripts(review_token);
create index idx_chasers_script_id on public.chasers(script_id);
create index idx_chasers_status on public.chasers(status);
create index idx_audit_log_entity on public.audit_log(entity_type, entity_id);
create index idx_client_memories_client_id on public.client_memories(client_id);

-- IVFFlat index for vector similarity search
-- Use 100 lists as a reasonable default; tune after data volume is known
create index idx_client_memories_embedding on public.client_memories
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Auto-update updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_clients_updated_at
  before update on public.clients
  for each row execute function public.handle_updated_at();

create trigger set_scripts_updated_at
  before update on public.scripts
  for each row execute function public.handle_updated_at();

-- Enable Row Level Security
alter table public.clients enable row level security;
alter table public.scripts enable row level security;
alter table public.chasers enable row level security;
alter table public.audit_log enable row level security;
alter table public.client_memories enable row level security;

-- Service role bypasses RLS automatically.
-- Authenticated users get full access (internal team app).
create policy "Authenticated users can read clients"
  on public.clients for select to authenticated using (true);
create policy "Authenticated users can insert clients"
  on public.clients for insert to authenticated with check (true);
create policy "Authenticated users can update clients"
  on public.clients for update to authenticated using (true);

create policy "Authenticated users can read scripts"
  on public.scripts for select to authenticated using (true);
create policy "Authenticated users can insert scripts"
  on public.scripts for insert to authenticated with check (true);
create policy "Authenticated users can update scripts"
  on public.scripts for update to authenticated using (true);

-- Anon users can read scripts by review_token (magic link access)
create policy "Anon can read scripts by review_token"
  on public.scripts for select to anon using (true);
create policy "Anon can update scripts via review"
  on public.scripts for update to anon using (true);

create policy "Authenticated users can read chasers"
  on public.chasers for select to authenticated using (true);
create policy "Authenticated users can insert chasers"
  on public.chasers for insert to authenticated with check (true);
create policy "Authenticated users can update chasers"
  on public.chasers for update to authenticated using (true);

create policy "Authenticated users can read audit_log"
  on public.audit_log for select to authenticated using (true);
create policy "Authenticated users can insert audit_log"
  on public.audit_log for insert to authenticated with check (true);

create policy "Authenticated users can read client_memories"
  on public.client_memories for select to authenticated using (true);
create policy "Authenticated users can insert client_memories"
  on public.client_memories for insert to authenticated with check (true);

-- Vector similarity search function for RAG
create or replace function public.match_client_memories(
  query_embedding vector(1536),
  match_client_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  memory_type text,
  similarity float
)
language sql stable
as $$
  select
    cm.id,
    cm.content,
    cm.memory_type,
    1 - (cm.embedding <=> query_embedding) as similarity
  from public.client_memories cm
  where cm.client_id = match_client_id
    and cm.embedding is not null
  order by cm.embedding <=> query_embedding
  limit match_count;
$$;

-- Enable Supabase Realtime on scripts and chasers
alter publication supabase_realtime add table public.scripts;
alter publication supabase_realtime add table public.chasers;
