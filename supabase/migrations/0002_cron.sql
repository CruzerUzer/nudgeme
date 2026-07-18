-- Schemalägg nudge-motorn att köra varje minut. Kräver tilläggen pg_cron och
-- pg_net (aktivera under Database > Extensions i Supabase).
--
-- Byt ut <PROJECT_REF> och <SERVICE_ROLE_KEY> mot dina värden innan körning,
-- eller sätt dem via Vault. Edge Function-URL:en följer mönstret nedan.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ta bort ev. tidigare jobb med samma namn.
select cron.unschedule('nudgeme-send')
where exists (select 1 from cron.job where jobname = 'nudgeme-send');

select cron.schedule(
  'nudgeme-send',
  '* * * * *', -- varje minut
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/send-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
