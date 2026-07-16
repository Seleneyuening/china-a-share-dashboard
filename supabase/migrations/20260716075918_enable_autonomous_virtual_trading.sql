do $$
declare
  next_parameters jsonb := jsonb_build_object(
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
  );
begin
  if exists (select 1 from public.cn_strategy_versions where strategy_version = 1 and status = 'active')
    and not exists (select 1 from public.cn_strategy_versions where strategy_version = 2) then
    update public.cn_strategy_versions
      set status = 'retired', retired_at = now()
      where strategy_version = 1;

    insert into public.cn_strategy_versions (
      strategy_version, parent_version, status, parameters, evaluation, rationale, promoted_at
    ) values (
      2, 1, 'active', next_parameters,
      jsonb_build_object('mode', 'autonomous_virtual', 'pool', '25_core_50_dynamic_10_etf'),
      '启用全自动虚拟交易：精简股票池并适度放宽初始门槛，由后续虚拟成交样本自动调整参数',
      now()
    );

    update public.cn_portfolio_accounts
      set strategy_version = 2,
          status = 'active',
          message = 'V2 全自动虚拟交易已启用，等待下一交易时段',
          updated_at = now()
      where account_id = 'main';
  end if;

  perform cron.unschedule(jobid)
    from cron.job
    where jobname in ('cn_strategy_optimizer_weekly', 'cn_strategy_optimizer_daily');
end
$$;

select cron.schedule(
  'cn_strategy_optimizer_daily',
  '10 7 * * 1-5',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cn_project_url') || '/functions/v1/cn-strategy-optimizer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cn_edge_anon_key')
    ),
    body := '{"scheduled":true}'::jsonb
  );
  $job$
);
