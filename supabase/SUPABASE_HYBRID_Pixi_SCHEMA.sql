-- Hybrid Pixi schema for desktop/mobile/web shared backend
-- Safe to run with existing project tables; create-if-not-exists only.

create table if not exists public.devices (
  device_id text primary key,
  name text,
  device_type text not null,
  platform text,
  online_status text not null default 'offline',
  capabilities text[] not null default '{}',
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id bigserial primary key,
  user_id uuid,
  key text not null,
  value text not null,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  source_device_id text,
  target_device_id text,
  command text not null,
  status text not null default 'queued',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_logs (
  id bigserial primary key,
  agent_name text not null,
  level text not null default 'info',
  message text not null,
  device_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_tag text,
  app_name text not null,
  sender text,
  content text not null,
  importance text not null default 'info',
  source_device text,
  metadata jsonb not null default '{}'::jsonb,
  announced boolean not null default false,
  processed_summary text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gpu_job_queue (
  id uuid primary key default gen_random_uuid(),
  media_job_id text,
  stage_type text not null,
  prompt text not null,
  input_urls text[] not null default '{}',
  model_name text,
  status text not null default 'queued',
  result_url text,
  error text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  worker_id text,
  last_heartbeat_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

