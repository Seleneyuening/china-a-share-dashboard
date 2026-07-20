create table if not exists public.cn_etf_strategy_versions (
  strategy_version integer primary key,
  parent_version integer references public.cn_etf_strategy_versions(strategy_version),
  status text not null check (status in ('active', 'retired')),
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  evaluation jsonb not null default '{}'::jsonb,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  retired_at timestamptz
);

create unique index if not exists cn_etf_strategy_versions_one_active
  on public.cn_etf_strategy_versions (status)
  where status = 'active';

create index if not exists cn_etf_strategy_versions_parent_version_idx
  on public.cn_etf_strategy_versions (parent_version);

create table if not exists public.cn_etf_strategy_reviews (
  review_id uuid primary key default extensions.gen_random_uuid(),
  review_key text not null unique,
  reviewed_at timestamptz not null default now(),
  status text not null check (status in ('waiting_for_sample', 'no_change', 'promoted', 'failed')),
  current_version integer not null references public.cn_etf_strategy_versions(strategy_version),
  proposed_version integer references public.cn_etf_strategy_versions(strategy_version),
  metrics jsonb not null default '{}'::jsonb,
  rationale text not null,
  created_at timestamptz not null default now()
);

create index if not exists cn_etf_strategy_reviews_current_version_idx
  on public.cn_etf_strategy_reviews (current_version);
create index if not exists cn_etf_strategy_reviews_proposed_version_idx
  on public.cn_etf_strategy_reviews (proposed_version);

create table if not exists public.cn_etf_engine_runs (
  run_id uuid primary key default extensions.gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'skipped', 'failed')),
  universe_size integer not null default 0 check (universe_size >= 0),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  action_count integer not null default 0 check (action_count >= 0),
  message text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  run_slot timestamptz unique
);

alter table public.cn_etf_strategy_versions enable row level security;
alter table public.cn_etf_strategy_reviews enable row level security;
alter table public.cn_etf_engine_runs enable row level security;

grant select on public.cn_etf_strategy_versions, public.cn_etf_strategy_reviews, public.cn_etf_engine_runs to anon, authenticated;
revoke insert, update, delete on public.cn_etf_strategy_versions, public.cn_etf_strategy_reviews, public.cn_etf_engine_runs from anon, authenticated;

create policy "cn_etf_strategy_versions_public_read"
  on public.cn_etf_strategy_versions for select to anon, authenticated using (true);
create policy "cn_etf_strategy_reviews_public_read"
  on public.cn_etf_strategy_reviews for select to anon, authenticated using (true);
create policy "cn_etf_engine_runs_public_read"
  on public.cn_etf_engine_runs for select to anon, authenticated using (true);

insert into public.cn_etf_strategy_versions (
  strategy_version, parent_version, status, parameters, evaluation, rationale, promoted_at
) values (
  1,
  null,
  'active',
  jsonb_build_object(
    'positiveRatioMin', 0.52,
    'averageChangeMin', 0.15,
    'minimumScore', 9.5,
    'maxPositions', 4,
    'maxExposure', 0.45,
    'positionEquityPct', 0.10,
    'cashBudgetPct', 0.14,
    'cooldownMinutes', 20,
    'stopLossPct', -4.5,
    'takeProfitPct', 8,
    'maxHoldDays', 8,
    'weakDayChangePct', -3.5,
    'changePctMin', 0.8,
    'changePctMax', 8,
    'turnoverRateMin', 0.8,
    'turnoverRateMax', 18,
    'volumeRatioMin', 0.95,
    'volumeRatioMax', 5,
    'fiveMinuteMin', -1.2,
    'return60dMin', -15,
    'return60dMax', 70
  ),
  jsonb_build_object('mode', 'autonomous_virtual_etf', 'pool', '10_core_etfs'),
  '延续 A 股虚拟账户的自动交易与风控规则，但交易范围严格限制为 ETF',
  now()
) on conflict (strategy_version) do nothing;

insert into public.cn_portfolio_accounts (
  account_id, initial_capital, cash, equity, status, mode, strategy_version, message, updated_at
) values (
  'etf', 1000000, 1000000, 1000000, 'awaiting_engine', 'real_quotes_paper_funds', 1,
  'ETF 全自动虚拟账户已建立，等待下一交易时段', now()
) on conflict (account_id) do nothing;

insert into public.cn_portfolio_snapshots (
  account_id, captured_at, cash, equity, cumulative_return, drawdown
)
select 'etf', now(), 1000000, 1000000, 0, 0
where not exists (select 1 from public.cn_portfolio_snapshots where account_id = 'etf');

create or replace function public.cn_execute_etf_virtual_trade(
  p_side text,
  p_symbol text,
  p_market text,
  p_company_name text,
  p_quantity integer,
  p_price numeric,
  p_fee numeric,
  p_reason text,
  p_strategy_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.cn_portfolio_accounts%rowtype;
  v_position public.cn_portfolio_positions%rowtype;
  v_gross numeric(18,2);
  v_net numeric(18,2);
  v_realized numeric(18,2);
  v_now timestamptz := now();
  v_allowed_symbols constant text[] := array['510300','510500','588000','159915','512480','512660','512010','515790','516160','512880'];
begin
  if p_side not in ('买入','卖出') or p_quantity <= 0 or p_price <= 0 or p_fee < 0 then
    raise exception 'invalid trade input';
  end if;
  if not (p_symbol = any(v_allowed_symbols)) then
    raise exception 'ETF account only accepts approved ETF symbols';
  end if;

  select * into v_account
  from public.cn_portfolio_accounts
  where account_id = 'etf'
  for update;
  if not found then raise exception 'ETF account not found'; end if;
  v_gross := round(p_quantity * p_price, 2);

  if p_side = '买入' then
    v_net := v_gross + p_fee;
    if v_account.cash < v_net then raise exception 'insufficient cash'; end if;
    insert into public.cn_portfolio_positions (
      account_id, symbol, market, company_name, quantity, average_price, last_price,
      opened_at, last_marked_at, reason, strategy_version
    ) values (
      'etf', p_symbol, p_market, p_company_name, p_quantity, p_price, p_price,
      v_now, v_now, p_reason, p_strategy_version
    )
    on conflict (account_id, symbol) do update set
      average_price = round((cn_portfolio_positions.average_price * cn_portfolio_positions.quantity + excluded.average_price * excluded.quantity) / (cn_portfolio_positions.quantity + excluded.quantity), 4),
      quantity = cn_portfolio_positions.quantity + excluded.quantity,
      last_price = excluded.last_price,
      last_marked_at = excluded.last_marked_at,
      reason = excluded.reason,
      strategy_version = excluded.strategy_version;
    update public.cn_portfolio_accounts
      set cash = cash - v_net, equity = equity - p_fee, status = 'active', message = 'ETF 操盘引擎运行中', updated_at = v_now
      where account_id = 'etf';
    insert into public.cn_portfolio_trades (
      account_id, side, symbol, market, company_name, quantity, price, fee, occurred_at, reason, strategy_version
    ) values (
      'etf', p_side, p_symbol, p_market, p_company_name, p_quantity, p_price, p_fee, v_now, p_reason, p_strategy_version
    );
    return jsonb_build_object('accountId','etf','side',p_side,'symbol',p_symbol,'quantity',p_quantity,'price',p_price);
  end if;

  select * into v_position
  from public.cn_portfolio_positions
  where account_id = 'etf' and symbol = p_symbol
  for update;
  if not found or v_position.quantity < p_quantity then raise exception 'position unavailable'; end if;
  if (v_position.opened_at at time zone 'Asia/Shanghai')::date >= (v_now at time zone 'Asia/Shanghai')::date then
    raise exception 'T+1 sell restriction';
  end if;

  v_net := v_gross - p_fee;
  v_realized := round((p_price - v_position.average_price) * p_quantity - p_fee, 2);
  if v_position.quantity = p_quantity then
    delete from public.cn_portfolio_positions where position_id = v_position.position_id;
  else
    update public.cn_portfolio_positions
      set quantity = quantity - p_quantity, last_price = p_price, last_marked_at = v_now
      where position_id = v_position.position_id;
  end if;
  update public.cn_portfolio_accounts
    set cash = cash + v_net, status = 'active', message = 'ETF 操盘引擎运行中', updated_at = v_now
    where account_id = 'etf';
  insert into public.cn_portfolio_trades (
    account_id, side, symbol, market, company_name, quantity, price, fee, occurred_at, realized_pnl, reason, strategy_version
  ) values (
    'etf', p_side, p_symbol, p_market, p_company_name, p_quantity, p_price, p_fee, v_now, v_realized, p_reason, p_strategy_version
  );
  return jsonb_build_object('accountId','etf','side',p_side,'symbol',p_symbol,'quantity',p_quantity,'price',p_price,'realizedPnl',v_realized);
end;
$$;

revoke all on function public.cn_execute_etf_virtual_trade(text,text,text,text,integer,numeric,numeric,text,integer) from public, anon, authenticated;
grant execute on function public.cn_execute_etf_virtual_trade(text,text,text,text,integer,numeric,numeric,text,integer) to service_role;

create or replace function public.cn_promote_etf_strategy(
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
  select strategy_version into current_version
  from public.cn_portfolio_accounts
  where account_id = 'etf'
  for update;
  if current_version is null or current_version <> p_expected_current_version then
    raise exception 'ETF strategy version changed during review';
  end if;
  select coalesce(max(strategy_version), 0) + 1 into next_version
  from public.cn_etf_strategy_versions;
  update public.cn_etf_strategy_versions
    set status = 'retired', retired_at = now()
    where status = 'active';
  insert into public.cn_etf_strategy_versions (
    strategy_version, parent_version, status, parameters, evaluation, rationale, promoted_at
  ) values (
    next_version, current_version, 'active', p_parameters, coalesce(p_evaluation, '{}'::jsonb), p_rationale, now()
  );
  update public.cn_portfolio_accounts
    set strategy_version = next_version,
        message = 'ETF 策略已根据虚拟成交样本自动升级至 V' || next_version,
        updated_at = now()
    where account_id = 'etf';
  return next_version;
end;
$$;

revoke all on function public.cn_promote_etf_strategy(integer,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.cn_promote_etf_strategy(integer,jsonb,jsonb,text) to service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'cn_etf_engine_morning_0935_0955_utc',
    'cn_etf_engine_morning_1000_1055_utc',
    'cn_etf_engine_morning_1100_1125_utc',
    'cn_etf_engine_afternoon_1305_1355_utc',
    'cn_etf_engine_afternoon_1400_1450_utc',
    'cn_etf_strategy_optimizer_daily'
  );
end
$$;

select cron.schedule('cn_etf_engine_morning_0935_0955_utc', '35-55/5 1 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-etf-portfolio-engine',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')),
    body := '{"scheduled":true}'::jsonb
  );
$$);
select cron.schedule('cn_etf_engine_morning_1000_1055_utc', '*/5 2 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-etf-portfolio-engine',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')),
    body := '{"scheduled":true}'::jsonb
  );
$$);
select cron.schedule('cn_etf_engine_morning_1100_1125_utc', '0-25/5 3 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-etf-portfolio-engine',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')),
    body := '{"scheduled":true}'::jsonb
  );
$$);
select cron.schedule('cn_etf_engine_afternoon_1305_1355_utc', '5-55/5 5 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-etf-portfolio-engine',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')),
    body := '{"scheduled":true}'::jsonb
  );
$$);
select cron.schedule('cn_etf_engine_afternoon_1400_1450_utc', '0-50/5 6 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-etf-portfolio-engine',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')),
    body := '{"scheduled":true}'::jsonb
  );
$$);
select cron.schedule('cn_etf_strategy_optimizer_daily', '15 7 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-etf-strategy-optimizer',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')),
    body := '{"scheduled":true}'::jsonb
  );
$$);
