## Problem

Die zwei erfolgreich gerenderten Luma-Ray-Szenen (`1318c027…` und `c16a9b72…`) sind im Storage vorhanden und in `composer_scenes` als `ready` markiert, erscheinen aber **nicht** im Tab „KI" der Mediathek.

## Ursachenanalyse

Edge-Function-Logs zeigen für beide Szenen nur:
```
[compose-clip-webhook] Scene: <id>, Status: succeeded
[compose-clip-webhook] Stored at: …
```

Der Archive-Block (der `📚 Archived scene … to Media Library (KI)` loggen sollte) **läuft nie** – weder erfolgreich noch mit Fehler. Das bedeutet: die **deployte Version** von `compose-clip-webhook` enthält den Archive-Code noch gar nicht. Das passt zum vorherigen `SUPABASE_CODEGEN_ERROR` (esm.sh-Timeout) – der Re-Deploy nach Hinzufügen des Archive-Blocks ist offenbar nicht endgültig durchgegangen.

DB-Check bestätigt: `video_creations` enthält **keinen** Eintrag mit `metadata.scene_id` für diese beiden IDs.

Das Frontend (`src/pages/MediaLibrary.tsx`, Zeile 295) filtert korrekt nach `metadata.source === 'motion-studio-clip'` – kein Frontend-Bug.

## Lösung

### 1. `compose-clip-webhook` neu deployen
Der Quellcode ist bereits korrekt. Wir triggern einen sauberen Re-Deploy (mit kleinem Kommentar-Touch, falls nötig, damit der Bundler die Funktion sicher neu baut).

### 2. Backfill der zwei vorhandenen Luma-Szenen
Migration: für die beiden bereits fertigen Szenen (und allgemein für **alle** `composer_scenes` mit `clip_status = 'ready'`, `clip_source LIKE 'ai-%'`, ohne entsprechenden `video_creations`-Eintrag) einmalig Einträge in `video_creations` anlegen mit:
- `output_url` = `clip_url`
- `metadata` = `{ source: 'motion-studio-clip', project_id, project_name, scene_id, scene_order: order_index, prompt: ai_prompt, model: clip_source, duration_seconds, reference_image_url, superseded: false }`
- `credits_used` = 0
- `status` = `'completed'`

So tauchen die beiden Luma-Szenen sofort im KI-Tab auf, ohne dass neu gerendert werden muss.

### 3. Verifikations-Schritt
Nach Deploy + Backfill: `SELECT count(*) FROM video_creations WHERE metadata->>'source' = 'motion-studio-clip'` und Mediathek-KI-Tab im Browser prüfen.

## Geänderte / Betroffene Artefakte

1. **Edge Function**: `supabase/functions/compose-clip-webhook/index.ts` – nur Re-Deploy, evtl. minimaler Kommentar-Bump
2. **DB-Migration**: einmaliges Backfill-INSERT in `video_creations` für alle nicht-archivierten ready Szenen mit `clip_source LIKE 'ai-%'`
3. Keine Frontend-Änderungen nötig

## Erwartetes Ergebnis

- Beide Luma-Szenen erscheinen sofort im Tab „KI" der Mediathek (via Backfill)
- Alle **zukünftigen** AI-Composer-Clips (Luma, Hailuo, Wan, Seedance, Kling, Veo, AI-Image) werden automatisch archiviert (durch den jetzt aktiven Webhook-Code)
- Bei Re-Generation einer Szene wird die alte Version mit `superseded: true` markiert, bleibt aber sichtbar
