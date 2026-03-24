

## Fix: Publishing schlaegt fehl -- fehlende `content_hash` Spalte

### Ursache

Die Edge Function `publish/index.ts` versucht bei jedem Publish-Vorgang einen `content_hash` in die Tabelle `publish_jobs` zu schreiben (Zeile 1362). Diese Spalte existiert aber nicht in der Datenbank. Dadurch schlaegt **jeder** Insert fehl mit "Failed to create publish job" -- unabhaengig von der Plattform.

Die Logs bestaetigen: `[Orchestrator] Fatal error: Error: Failed to create publish job`

### Loesung

**1. Datenbank-Migration**: `content_hash` Spalte hinzufuegen

```sql
ALTER TABLE public.publish_jobs 
ADD COLUMN content_hash TEXT;

CREATE INDEX idx_publish_jobs_content_hash 
ON public.publish_jobs (user_id, content_hash, created_at);
```

Das ist alles. Keine Code-Aenderungen noetig -- die Edge Function ist bereits korrekt implementiert, ihr fehlt nur die Spalte in der Datenbank.

### Ergebnis

Nach der Migration funktioniert das gleichzeitige Posten auf Facebook, YouTube, Instagram und alle anderen Kanaele wieder.

