-- Phase 3 Supabase schema patch (retry governance + worker heartbeat)
-- Run in Supabase SQL editor.

alter table if exists public.gpu_job_queue
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists worker_id text,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_gpu_job_queue_status_updated
  on public.gpu_job_queue (status, updated_at);

create index if not exists idx_gpu_job_queue_dead_lettered_at
  on public.gpu_job_queue (dead_lettered_at);

create table if not exists public.gpu_worker_heartbeats (
  id uuid primary key default uuid_generate_v4(),
  worker_id text not null,
  status text not null default 'online',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_gpu_worker_heartbeats_worker_time
  on public.gpu_worker_heartbeats (worker_id, updated_at desc);

create table if not exists public.model_deployments (
  id uuid primary key default uuid_generate_v4(),
  stage_type text not null,
  model_name text not null,
  endpoint text not null,
  auth_mode text not null default 'bearer',
  auth_secret_name text,
  concurrency_limit integer not null default 1,
  timeout_ms integer not null default 300000,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_model_deployments_active_unique
  on public.model_deployments (stage_type, model_name)
  where active = true;

create or replace function public.claim_next_gpu_job(
  p_worker_id text,
  p_stage_types text[] default null
)
returns table (
  id text,
  media_job_id text,
  stage_type text,
  prompt text,
  input_urls text[],
  model_name text,
  retry_count integer,
  max_retries integer
)
language plpgsql
security definer
as $$
begin
  return query
  with candidate as (
    select q.id
    from public.gpu_job_queue q
    where
      (
        q.status = 'queued'
        or (
          q.status = 'processing'
          and q.last_heartbeat_at is not null
          and q.last_heartbeat_at < now() - interval '2 minutes'
        )
      )
      and coalesce(q.retry_count, 0) <= coalesce(q.max_retries, 3)
      and (
        p_stage_types is null
        or array_length(p_stage_types, 1) is null
        or q.stage_type = any(p_stage_types)
      )
    order by coalesce(q.queued_at, now()) asc
    for update skip locked
    limit 1
  )
  update public.gpu_job_queue q
  set
    status = 'processing',
    started_at = now(),
    worker_id = p_worker_id,
    last_heartbeat_at = now(),
    updated_at = now(),
    error = null
  from candidate c
  where q.id = c.id
  returning
    q.id::text,
    q.media_job_id::text,
    q.stage_type,
    q.prompt,
    coalesce(q.input_urls, array[]::text[]),
    q.model_name,
    coalesce(q.retry_count, 0),
    coalesce(q.max_retries, 3);
end;
$$;

create or replace function public.heartbeat_gpu_job(
  p_job_id text,
  p_worker_id text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.gpu_job_queue
  set
    last_heartbeat_at = now(),
    updated_at = now(),
    worker_id = p_worker_id
  where id::text = p_job_id;

  insert into public.gpu_worker_heartbeats (worker_id, status, metadata, updated_at)
  values (p_worker_id, 'online', jsonb_build_object('job_id', p_job_id), now());
end;
$$;

create or replace function public.complete_gpu_job(
  p_job_id text,
  p_worker_id text,
  p_status text,
  p_result_url text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_next_retry integer;
  v_max_retries integer;
begin
  if p_status = 'done' then
    update public.gpu_job_queue
    set
      status = 'done',
      result_url = p_result_url,
      error = null,
      completed_at = now(),
      updated_at = now(),
      last_heartbeat_at = now(),
      worker_id = p_worker_id
    where id::text = p_job_id;
    return;
  end if;

  select coalesce(retry_count, 0) + 1, coalesce(max_retries, 3)
  into v_next_retry, v_max_retries
  from public.gpu_job_queue
  where id::text = p_job_id;

  if v_next_retry <= v_max_retries then
    update public.gpu_job_queue
    set
      status = 'queued',
      retry_count = v_next_retry,
      error = coalesce(p_error, 'Worker failed stage and re-queued.'),
      started_at = null,
      completed_at = null,
      dead_lettered_at = null,
      updated_at = now(),
      last_heartbeat_at = null,
      worker_id = null
    where id::text = p_job_id;
  else
    update public.gpu_job_queue
    set
      status = 'failed',
      retry_count = v_next_retry,
      error = coalesce(p_error, 'Worker exhausted retries and dead-lettered.'),
      dead_lettered_at = now(),
      completed_at = now(),
      updated_at = now(),
      last_heartbeat_at = now(),
      worker_id = p_worker_id
    where id::text = p_job_id;
  end if;
end;
$$;
