## Diagnose

Der aktuelle Lauf ist nicht mehr beim eigentlichen Lip-Sync hängen geblieben:

- Alle 3 Sync.so-Turns sind fertig und haben `output_url`.
- Die Szene steht seitdem auf `stitching`.
- Der Fehler ist: `dialog_stitch_dispatch: Edge Function returned a non-2xx status code`.
- Es wurde kein `video_renders`-Eintrag für `dialog-stitch` angelegt. Das heißt: der finale Artlist-Schritt, der die fertigen Einzel-Turns in einen Master-Clip zusammensetzt, startet gar nicht sauber.

## Ziel

Die Pipeline soll wie Artlist robust enden:

```text
Master-Video + Master-Audio
        ↓
Turn 1 Sync.so output
Turn 2 Sync.so output
Turn 3 Sync.so output
        ↓
finaler deterministic Stitch
        ↓
clip_url gesetzt, Lip-Sync fertig
```

Kein Rückfall auf den letzten Sync.so-Output, kein falscher Sprecher, kein 13-Minuten-Hängen.

## Fix-Plan

1. **Stitch-Dispatch-Fehler sichtbar machen**
   - `render-dialog-stitch` soll bei jedem Fehler konkrete Details in `clip_error` und Logs schreiben.
   - Der aktuell generische Fehler `Edge Function returned a non-2xx status code` reicht nicht für stabile Wiederherstellung.

2. **Idempotenten Retry reparieren**
   - Wenn alle Shots `ready` sind und noch kein `stitch.render_id` existiert, muss jeder Poll den Stitch erneut versuchen.
   - Wenn ein `video_renders`-Insert oder Lambda-Invoke fehlschlägt, darf der Zustand nicht in einer unklaren Zwischenlage bleiben.

3. **Stitch-Payload an echte Szene anpassen**
   - Aktuelle Szene hat `video_width=1376`, `video_height=768`, aber `render-dialog-stitch` erzwingt 1280x720.
   - Ich passe den Stitch so an, dass er die gespeicherten Master-Dimensionen verwendet und nur auf gerade Werte normalisiert.
   - Dadurch vermeiden wir Remotion-/Lambda-Validierungsfehler oder Medienalignment-Probleme.

4. **Remotion-Stitch robuster machen**
   - `DialogStitchVideo` bekommt Zielbreite/-höhe aus Props.
   - Overlay-Clips bleiben zeitlich synchron über `startFrom`, aber das Canvas passt zur Master-Plate.
   - Optionaler Fallback: Wenn ein Shot-Fenster minimal außerhalb der Dauer liegt, wird es hart geklemmt statt den Render zu crashen.

5. **Poller darf `stitching` nicht liegen lassen**
   - Der Cron-Selector verarbeitet aktuell nur `lip_sync_status = 'running'`.
   - Szenen mit `lip_sync_status = 'stitching'` müssen ebenfalls gepollt/retrybar sein, solange `lip_sync_applied_at` fehlt.
   - Das ist wahrscheinlich der Grund, warum der Lauf nach dem ersten Stitch-Fehler nicht automatisch weitergeht.

6. **Watchdog-Regel korrigieren**
   - Ready-Shots + Stitch-Dispatch-Problem darf nicht nach 12 Minuten als Sync.so-Timeout behandelt werden.
   - Der Watchdog soll `stitching` als eigenen Zustand sehen: Retry/gelb warten, erst bei definitivem Lambda-Fehler terminal scheitern.

7. **Bestehende hängende Szene retten**
   - Nach dem Code-Fix wird die aktuelle Szene `63b47104-05ca-43c7-846d-77d60777e924` erneut durch `poll-dialog-shots`/`render-dialog-stitch` angestoßen.
   - Da alle Sync.so-Ergebnisse bereits fertig sind, müssen keine Lip-Sync-Credits erneut verbraucht werden.

## Dateien

- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/render-dialog-stitch/index.ts`
- `src/remotion/templates/DialogStitchVideo.tsx`
- `src/remotion/Root.tsx`
- ggf. Watchdog-Funktion, falls sie die 12-Minuten-Fehlklassifizierung enthält
- `mem://features/video-composer/dialog-shot-pipeline`
- `.lovable/plan.md`

## Erwartetes Ergebnis

- Bei fertigen Turns startet der finale Stitch zuverlässig.
- Ein temporärer Lambda-/Dispatch-Fehler bleibt retrybar statt ewig bei 95% zu hängen.
- Der fertige Clip nutzt weiterhin Master-Audio + per-speaker Overlay-Fenster, also die Artlist-Logik ohne Sprecher-Verwechslung.
- Die aktuelle Szene kann ohne erneute Sync.so-Kosten abgeschlossen werden.