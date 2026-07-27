## Diagnose

Die Szene aus dem Screenshot (`S01 · 3e0cc017…`) ist in Wahrheit fertig – nur die UI hängt auf „Szene wird gebaut…". DB-Stand:

```
clip_status       = generating   ← bleibt hängen
twoshot_stage     = done
lip_sync_status   = done
clip_url          = dialog-stitch-muxed-3e0cc017-…mp4   ← existiert
clip_error        = null
```

Ursache: In `supabase/functions/remotion-webhook/index.ts` (dialog-stitch Success-Branch, Zeilen ~277–291) schreibt der Webhook nach dem finalen Audio-Mux zwar `clip_url`, `twoshot_stage='done'` und `lip_sync_status='done'`, **setzt aber `clip_status` nicht auf `'ready'`**. Alle anderen Finalisierungs-Pfade (`sync-so-webhook` Single-Speaker Direct, `compose-clip-webhook`, `motion-studio-superuser`) setzen `clip_status: 'ready'` mit. Der dialog-stitch-Pfad – der für alle Multi-Speaker Cinematic-Sync Szenen der finale Schritt ist – vergisst es. Ergebnis: `clip_status` bleibt auf `generating`, die UI zeigt ewig „Szene wird gebaut…" obwohl das MP4 längst existiert.

`S02` (`88a79fe9…`) ist ein separates Thema: `clip_error='watchdog_never_dispatched'`, d.h. Dispatch hat wegen Provider-Concurrency nicht gefeuert und der Watchdog hat nach 60 Min gecancelt (kein Refund nötig, kein Provider-Call). Diese Szene muss der User nur neu starten – das ist erwartetes Verhalten und kein Bug in dieser Runde.

## Fix

### 1. Webhook-Fix – `supabase/functions/remotion-webhook/index.ts`

Im dialog-stitch Success-Branch (ca. Zeile 277) das Scene-Update um `clip_status: 'ready'` ergänzen:

```ts
await supabaseAdmin.from('composer_scenes').update({
  clip_url: finalOutputUrl,
  clip_status: 'ready',           // ← NEU (v268)
  lip_sync_source_clip_url: prevState?.source_clip_url ?? null,
  lip_sync_applied_at: nowIso,
  lip_sync_status: 'done',
  twoshot_stage: 'done',
  clip_error: null,
  dialog_shots: { ...prevState, status: 'done', final_url: finalOutputUrl, finished_at: nowIso },
  updated_at: nowIso,
}).eq('id', composerSceneId);
```

Cancel-Guard (Zeilen 268–275) bleibt unverändert und läuft weiter davor.

### 2. Backfill – Migration für die gestrandete Szene

```sql
UPDATE composer_scenes
SET clip_status = 'ready', updated_at = now()
WHERE clip_status = 'generating'
  AND twoshot_stage = 'done'
  AND lip_sync_status = 'done'
  AND clip_url IS NOT NULL;
```

Fängt Szene `3e0cc017…` und potenzielle andere aus derselben Regression ab. Kein Refund, kein Provider-Call – reine Status-Korrektur.

### 3. Memory

Kurzer Eintrag `mem/architecture/lipsync/v268-dialog-stitch-clip-status-ready.md` mit dem Fund (dialog-stitch Webhook muss `clip_status='ready'` mitschreiben, sonst UI-Deadlock „Szene wird gebaut…").

## Nicht Teil dieses Plans

- `S02` (`88a79fe9`) neu generieren – User-Action, nicht Code.
- Watchdog-Verhalten für `never_dispatched` ändern – funktioniert korrekt.
- v266/v267 Anker-Logik – unverändert.
