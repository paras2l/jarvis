-- ================================================================
-- PHASE 9: Humanoid Existence (Proactive JARVIS)
-- Supabase schema patch
-- Safe to run multiple times (idempotent where possible)
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- Notifications sink (ingested from device/webhook/realtime bridges)
-- ----------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_tag text not null,
  app_name text not null,
  sender text,
  content text not null,
  importance text not null default 'info' check (importance in ('info', 'high', 'critical')),
  source_device text,
  metadata jsonb not null default '{}'::jsonb,
  announced boolean not null default false,
  processed_summary text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_tag, created_at desc);

create index if not exists idx_notifications_user_announced
  on public.notifications (user_tag, announced, created_at desc);

create index if not exists idx_notifications_app
  on public.notifications (app_name);

-- ----------------------------------------------------------------
-- Quiet app rules (mute noisy apps globally or temporarily)
-- ----------------------------------------------------------------
create table if not exists public.quiet_apps (
  user_tag text not null,
  app_name text not null,
  muted_until timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_tag, app_name)
);

create index if not exists idx_quiet_apps_user
  on public.quiet_apps (user_tag, app_name);

-- ----------------------------------------------------------------
-- JARVIS settings (behavioral profile + delivery preferences)
-- ----------------------------------------------------------------
create table if not exists public.jarvis_settings (
  user_tag text primary key,
  sensitivity text not null default 'partner' check (sensitivity in ('shy', 'partner', 'chatty')),
  focus_filtering boolean not null default true,
  voice_announcements boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- Curiosity logs (autonomous research traces)
-- ----------------------------------------------------------------
create table if not exists public.curiosity_runs (
  id uuid primary key default gen_random_uuid(),
  user_tag text not null,
  topic text not null,
  insight text not null,
  source_url text,
  delivered boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_curiosity_user_created
  on public.curiosity_runs (user_tag, created_at desc);

create index if not exists idx_curiosity_topic
  on public.curiosity_runs (topic);

-- ----------------------------------------------------------------
-- Shared trigger for updated_at
-- ----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quiet_apps_updated_at on public.quiet_apps;
create trigger trg_quiet_apps_updated_at
before update on public.quiet_apps
for each row
execute function public.set_updated_at();

drop trigger if exists trg_jarvis_settings_updated_at on public.jarvis_settings;
create trigger trg_jarvis_settings_updated_at
before update on public.jarvis_settings
for each row
execute function public.set_updated_at();

-- ----------------------------------------------------------------
-- Delivery decision helper
-- ----------------------------------------------------------------
create or replace function public.should_deliver_notification(
  p_user_tag text,
  p_app_name text,
  p_importance text default 'info'
)
returns boolean
language plpgsql
stable
as $$
declare
  is_muted boolean;
begin
  if coalesce(p_importance, 'info') = 'critical' then
    return true;
  end if;

  select exists (
    select 1
    from public.quiet_apps qa
    where qa.user_tag = p_user_tag
      and lower(qa.app_name) = lower(p_app_name)
      and (qa.muted_until is null or qa.muted_until > now())
  ) into is_muted;

  return not coalesce(is_muted, false);
end;
$$;

-- ----------------------------------------------------------------
-- Seed sensible defaults for existing users
-- ----------------------------------------------------------------
insert into public.jarvis_settings (user_tag)
select up.user_tag
from public.user_profiles up
on conflict (user_tag) do nothing;

-- ----------------------------------------------------------------
-- Realtime note:
-- In Supabase dashboard, enable Realtime for `public.notifications`
-- ----------------------------------------------------------------

commit;
