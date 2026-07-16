do $$
begin
  perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cn_strategy_optimizer_weekly';
end
$$;

select cron.schedule(
  'cn_strategy_optimizer_weekly',
  '35 7 * * 5',
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
