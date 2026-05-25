## Problem

Der `auth-email-hook` empfängt das Signup-Event, scheitert aber beim Versuch, die Mail in die Queue zu schreiben:

```
Could not find the function public.enqueue_email(payload, queue_name)
```

Die Email-Infrastruktur (pgmq-Queues, `enqueue_email` RPC, `process-email-queue` Cron-Job, Send-Log-Tabellen) wurde nie initialisiert. Die Domain `notify.useadtool.ai` ist zwar verifiziert, aber ohne die Queue-Funktionen kann der Hook keine Mails versenden — deshalb kommt nichts an.

## Lösung

1. **Email-Infrastruktur initialisieren** — legt pgmq-Queues (`auth_emails`, `transactional_emails`), die `enqueue_email`/`read_email_batch`/`delete_email`-RPCs, `email_send_log`/`suppressed_emails`/`email_unsubscribe_tokens`-Tabellen und den `process-email-queue`-Cron-Job (alle 5 s) an.
2. **Vorhandenen `auth-email-hook` erneut deployen**, damit er gegen die jetzt existierenden RPCs läuft.
3. **Bestehenden unverifizierten User** `info@useadtool.ai` (ID `c0900ae0…`) löschen, damit du den Signup-Flow nochmal sauber testen kannst und eine neue Verifizierungs-Mail bekommst.
4. **Verifizieren**: nach erneutem Signup `email_send_log` prüfen und Edge-Function-Logs nochmal anschauen, dass kein `PGRST202` mehr kommt.

Keine Änderungen an Templates oder am Hook-Code nötig — die sind bereits korrekt und nutzen schon `enqueue_email`. Es fehlt nur das DB-Fundament.
