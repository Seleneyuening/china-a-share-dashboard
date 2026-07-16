create table if not exists public.cn_strategy_versions (
  strategy_version integer primary key,
  parent_version integer references public.cn_strategy_versions(strategy_version),
  status text not null check (status in ('active', 'retired')),
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  evaluation jsonb not null default '{}'::jsonb,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  retired_at timestamptz
);

create unique index if not exists cn_strategy_versions_one_active
  on public.cn_strategy_versions (status)
  where status = 'active';

create table if not exists public.cn_strategy_reviews (
  review_id uuid primary key default extensions.gen_random_uuid(),
  review_key text not null unique,
  reviewed_at timestamptz not null default now(),
  status text not null check (status in ('waiting_for_sample', 'no_change', 'promoted', 'failed')),
  current_version integer not null references public.cn_strategy_versions(strategy_version),
  proposed_version integer references public.cn_strategy_versions(strategy_version),
  metrics jsonb not null default '{}'::jsonb,
  rationale text not null,
  created_at timestamptz not null default now()
);

alter table public.cn_strategy_versions enable row level security;
alter table public.cn_strategy_reviews enable row level security;

grant select on public.cn_strategy_versions to anon, authenticated;
grant select on public.cn_strategy_reviews to anon, authenticated;
revoke insert, update, delete on public.cn_strategy_versions from anon, authenticated;
revoke insert, update, delete on public.cn_strategy_reviews from anon, authenticated;

drop policy if exists "cn_strategy_versions_public_read" on public.cn_strategy_versions;
create policy "cn_strategy_versions_public_read"
  on public.cn_strategy_versions for select
  to anon, authenticated
  using (true);

drop policy if exists "cn_strategy_reviews_public_read" on public.cn_strategy_reviews;
create policy "cn_strategy_reviews_public_read"
  on public.cn_strategy_reviews for select
  to anon, authenticated
  using (true);

insert into public.cn_strategy_versions (
  strategy_version,
  parent_version,
  status,
  parameters,
  evaluation,
  rationale,
  promoted_at
)
values (
  1,
  null,
  'active',
  jsonb_build_object(
    'positiveRatioMin', 0.58,
    'averageChangeMin', 0.55,
    'minimumScore', 12,
    'maxPositions', 3,
    'maxExposure', 0.40,
    'positionEquityPct', 0.12,
    'cashBudgetPct', 0.18,
    'cooldownMinutes', 30,
    'stopLossPct', -5,
    'takeProfitPct', 10,
    'maxHoldDays', 12,
    'weakDayChangePct', -4,
    'changePctMin', 1.2,
    'changePctMax', 7,
    'turnoverRateMin', 1,
    'turnoverRateMax', 15,
    'volumeRatioMin', 1.05,
    'volumeRatioMax', 4,
    'fiveMinuteMin', -0.8,
    'return60dMin', -8,
    'return60dMax', 60
  ),
  jsonb_build_object('seed', true),
  '初始保守策略；先空仓等待高质量机会，再由真实虚拟成交样本驱动后续版本',
  now()
)
on conflict (strategy_version) do nothing;

create or replace function public.cn_promote_strategy(
  p_expected_current_version integer,
  p_parameters jsonb,
  p_evaluation jsonb,
  p_rationale text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version integer;
  next_version integer;
begin
  if jsonb_typeof(p_parameters) <> 'object' then
    raise exception 'strategy parameters must be a JSON object';
  end if;

  select strategy_version
    into current_version
    from public.cn_portfolio_accounts
    where account_id = 'main'
    for update;

  if current_version is null or current_version <> p_expected_current_version then
    raise exception 'strategy version changed during review';
  end if;

  select coalesce(max(strategy_version), 0) + 1
    into next_version
    from public.cn_strategy_versions;

  update public.cn_strategy_versions
    set status = 'retired', retired_at = now()
    where status = 'active';

  insert into public.cn_strategy_versions (
    strategy_version,
    parent_version,
    status,
    parameters,
    evaluation,
    rationale,
    promoted_at
  ) values (
    next_version,
    current_version,
    'active',
    p_parameters,
    coalesce(p_evaluation, '{}'::jsonb),
    p_rationale,
    now()
  );

  update public.cn_portfolio_accounts
    set strategy_version = next_version,
        message = '策略已根据真实虚拟成交样本自动升级至 V' || next_version,
        updated_at = now()
    where account_id = 'main';

  return next_version;
end;
$$;

revoke all on function public.cn_promote_strategy(integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.cn_promote_strategy(integer, jsonb, jsonb, text) to service_role;
