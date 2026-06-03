do $$
begin
  begin
    perform cron.unschedule('lipsync-watchdog-every-2min');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'lipsync-watchdog-every-2min',
    '*/2 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/lipsync-watchdog',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cmd$
  );
end$$;
