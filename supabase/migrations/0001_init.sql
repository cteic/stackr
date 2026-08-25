-- Stackr alerts: accounts, watched wallets, alert subscriptions, delivery log,
-- and web-push subscriptions. Everything is owned by a Supabase auth user and
-- fenced with RLS; the only writer that bypasses RLS is the alerts Worker's
-- service-role key (sweep state, alert_events, dead-subscription cleanup).
--
-- Chains and protocols mirror the app's domain unions (@stackr/models
-- ChainSchema / ProtocolSchema); extend both together.

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, auto-created on signup.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert happens from the auth trigger below (security definer), never from
-- the client, so there is deliberately no insert policy.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- watched_wallets — the cloud twin of the local watch-only wallet list.
-- ---------------------------------------------------------------------------

create table public.watched_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chain text not null check (chain in ('btc', 'eth', 'stx', 'sol', 'sui')),
  address text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, chain, address)
);

create index watched_wallets_user_id_idx on public.watched_wallets (user_id);

alter table public.watched_wallets enable row level security;

create policy "watched_wallets owned"
  on public.watched_wallets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- alert_subscriptions — "wake me when this wallet's position on this protocol
-- crosses my thresholds". Thresholds are normalized liquidation risk (0..1,
-- 1.0 = at the liquidation threshold — HealthPosition.liquidationRisk).
-- last_band / last_alerted_at are the sweep's dedupe state, written by the
-- service role each run.
-- ---------------------------------------------------------------------------

create table public.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_id uuid not null references public.watched_wallets (id) on delete cascade,
  protocol text not null check (protocol in ('aave-v3', 'kamino', 'zest', 'granite')),
  warn_threshold numeric not null default 0.8
    check (warn_threshold > 0 and warn_threshold <= 1),
  critical_threshold numeric not null default 0.95
    check (critical_threshold > 0 and critical_threshold <= 1),
  cooldown_seconds integer not null default 21600 check (cooldown_seconds >= 300),
  last_band text not null default 'ok' check (last_band in ('ok', 'warn', 'critical')),
  last_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  check (critical_threshold >= warn_threshold),
  unique (user_id, wallet_id, protocol)
);

create index alert_subscriptions_user_id_idx on public.alert_subscriptions (user_id);

alter table public.alert_subscriptions enable row level security;

create policy "alert_subscriptions owned"
  on public.alert_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- alert_events — audit log of every notification the sweep sent (or tried
-- to). Owners read their own history; only the service role inserts, so there
-- is no insert policy.
-- ---------------------------------------------------------------------------

create table public.alert_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  subscription_id uuid references public.alert_subscriptions (id) on delete set null,
  chain text not null,
  protocol text not null,
  address text not null,
  band text not null check (band in ('ok', 'warn', 'critical')),
  reason text not null check (reason in ('escalated', 'eased', 'recovered', 'still-at-risk')),
  liquidation_risk numeric,
  delivered boolean not null default false,
  sent_at timestamptz not null default now()
);

create index alert_events_user_sent_idx on public.alert_events (user_id, sent_at desc);

alter table public.alert_events enable row level security;

create policy "alert_events readable by owner"
  on public.alert_events for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions — one row per browser the user granted notification
-- permission in. platform is restricted to 'web' until native mobile push
-- lands. The browser inserts/deletes its own subscription under RLS; the
-- sweep (service role) updates last_used_at / last_error and deletes rows the
-- push service reports gone (HTTP 410).
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('web')),
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text,
  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions owned"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
