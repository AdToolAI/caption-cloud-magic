## Befund

Nein — der aktive Composer-Pfad ist **noch nicht vollständig 1:1 wie am 27.07.2026**.

Der letzte Lauf `d7402a67-d10d-493d-8fe5-aefb91b6ccc9` lief technisch bis zum fertigen Ergebnis:

```text
Master-Clip gespeichert
→ Dialog-Audio für 4 Sprecher erstellt
→ 4/4 Sync.so-Pässe erfolgreich
→ finaler Dialog-Stitch erfolgreich gerendert
→ fertige MP4 vorhanden
→ Abschluss-Webhook verwirft das Ergebnis als „stale callback“
→ Szene bleibt auf audio_muxing / plate_ready
→ UI schaltet den Lip-Sync-Prozess wieder ab
```

Der konkrete Widerspruch ist im Code bestätigt:

- `render-sync-segments-audio-mux` sendet beim finalen Render **keine** `plate_generation` und **keine** `active_run_id` im Callback (`index.ts:838–852`). Das entspricht dem zurückgesetzten Juli-Pfad.
- `remotion-webhook` enthält aber weiterhin den späteren **v379-Run-Guard**, der genau diese beiden Werte zwingend verlangt (`index.ts:53–60`, `282–285`).
- Deshalb wurde um `23:29:11 UTC` der erfolgreich fertiggestellte Clip mit `v379 stale callback ignored` verworfen.
- Der ursprüngliche Plate-Clip wurde nicht gelöscht: Die Szene hat weiterhin `clip_status=ready` und eine gültige `clip_url`. Nur der fertige Lip-Sync-Clip wurde nicht übernommen.

## Umsetzung

1. **Dialog-Stitch-Abschluss auf Juli-Baseline zurücksetzen**
   - Den post-Juli-v379-Run-Guard ausschließlich aus dem Composer-Dialog-Stitch-Erfolgs- und Fehlerpfad entfernen.
   - Erfolgreiche Juli-Callbacks wieder `clip_url`, `lip_sync_applied_at`, `dialog_shots.status=done`, `lip_sync_status` und `twoshot_stage` finalisieren lassen.
   - Andere Remotion-Pfade wie Director’s Cut und Long Form unverändert lassen.

2. **Verwandte Composer-Callbacks abgleichen**
   - `dialog-turn-preclip` und Dialog-Stitch-Fehlerbehandlung gegen Commit `58060cffe` prüfen.
   - Weitere post-Juli-Abhängigkeiten auf `active_run_id`, `plate_generation` oder Enum-Transitions im Composer-spezifischen Callback entfernen, sofern sie die Juli-Nutzdaten blockieren.
   - Die additive Datenbank-Bridge darf nur spiegeln/telemetrieren und keinen Juli-Abschluss verhindern.

3. **Erfolgreichen Abschluss atomar machen**
   - Erst finalen Clip und Dialogstatus speichern, dann den kompatiblen Abschlussstatus setzen.
   - Ein nachgelagerter Statusfehler darf den bereits fertig gerenderten Clip weder ausblenden noch zurücksetzen.
   - Wiederholte Webhooks bleiben idempotent und dürfen denselben fertigen Clip erneut bestätigen.

4. **Gezielte Verifikation**
   - Tests für einen Dialog-Stitch-Callback ohne `active_run_id`/`plate_generation` ergänzen — genau die Juli-Payload.
   - Nach Deployment einen 4-Sprecher-Lauf prüfen: 4/4 Sync.so → Stitch → Callback → `done` → finale `clip_url` sichtbar.
   - Zusätzlich belegen, dass kein `stale callback ignored` mehr im Composer-Dialog-Stitch-Pfad erscheint und fertige Plates währenddessen sichtbar bleiben.

## Wichtig

Der aktuelle Fehler liegt **nicht bei Sync.so** und nicht beim generierten Video. Der fertige Lip-Sync-Render existiert; ausschließlich ein übrig gebliebener post-Juli-v379-Guard verhindert seine Übernahme.