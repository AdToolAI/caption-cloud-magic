# v145 — Forensische Diagnose: Plate-Komposition & Face-Gate

## Was v143/v144 erreicht haben (verifiziert)
- ✅ Plate-Rehost in `lipsync-plates`-Bucket funktioniert (344 KB Upload in ~1s)
- ✅ Sync.so akzeptiert mit HTTP 201, keine `inaccessible`-Fehler mehr
- ✅ NOOP-Auto-Escalation respektiert `bbox-url-pro` Variante

## Tatsächlicher Fehler jetzt
```
error_class: v107_preclip_required
error_message: face_gate_failed:count=0 (after 2 v116 repair attempts)
sync_status: PREFLIGHT_BLOCKED
```
Sync.so detektiert **0 Gesichter** in der gerenderten Hailuo-Plate für 4 Sprecher. Das Plate selbst ist also **nicht das Sync.so-Delivery-Problem** (gefixt) — sondern die **Hailuo-Komposition** zeigt 4 Personen in einem Wide-Shot, in dem die Gesichter zu klein/verdeckt sind, damit Sync.so sie als Speaker erkennt.

Zusätzlich: `FACE_GATE_PROBE_UNAVAILABLE` mit Grund `server_extract_disabled_use_client_canvas` — wir können vor dem Dispatch nicht selbst prüfen, ob Gesichter erkennbar sind, und fliegen blind in den NOOP rein.

## Plan

### 1. Forensik-Modus (Diagnose-only, keine Verhaltensänderung)
- `lipsync-diagnostic` Edge-Function erweitern um neuen Modus `plate-face-forensic`:
  - Lädt die letzte rehostete Plate für eine `scene_id` herunter
  - Extrahiert mit ffmpeg (Edge-Runtime kompatibel: WASM-Variante oder Frame via Remotion-API) 3 Sample-Frames (early/mid/late)
  - Schickt jeden Frame an Gemini Vision mit Prompt "Count distinct, clearly visible human faces with mouth area visible enough for lipsync. Return JSON {count, faces:[{bbox, mouth_visible, share_of_frame}]}"
  - Speichert Resultat in `lipsync_diagnostics`-Tabelle (neues Feld `plate_face_audit`)
- UI: Im `/admin/lipsync-diagnostic` Tool neuer Button **"Plate-Forensik für Szene X"** der das oben Genannte triggert und die 3 Frames + Counts anzeigt

### 2. Server-Side Face-Probe re-aktivieren
- Den `server_extract_disabled_use_client_canvas`-Flag prüfen: warum ist die serverseitige Frame-Extraktion aus?
- Falls aus Stabilitätsgründen: stattdessen die rehostete Plate (jetzt verfügbar in eigenem Bucket!) mit ffmpeg-via-Edge oder Replicate-Frame-Extractor probieren, **bevor** wir dispatchen
- Wenn Face-Count < Sprecher-Count: **Fail-Fast** mit klarer UI-Meldung ("Hailuo-Plate zeigt nur N von M Sprechern erkennbar — bitte Szene neu generieren mit Close-up-Komposition"), kein Sync.so-Burn, **automatischer Refund**

### 3. Hailuo-Komposition für Multi-Speaker korrigieren (nur falls Forensik bestätigt: Hailuo zeigt zu wenig Gesichter)
- In `compose-scene-anchor` / Hailuo-Prompt-Builder für `speakers >= 3` automatisch einen "**medium close-up group composition, all faces clearly visible, framed shoulders-up**"-Modifier injizieren
- Bzw. Aspect-Ratio-Hinweis: Bei 4 Sprechern lieber 9:16 vermeiden und 16:9 erzwingen

### 4. UI-Fehlermeldung präzisieren
Aktuell sagt die UI "Szene-Clip nicht erkennbar". Besser:
> "Hailuo hat in der Szene nur 0/4 Gesichter erkennbar generiert. Dies ist kein Lipsync-Fehler — die Quell-Plate muss neu gerendert werden mit Close-up-Komposition. Credits wurden zurückerstattet."

## Technische Details
- **Files to touch**: 
  - `supabase/functions/lipsync-diagnostic/index.ts` (neuer `plate-face-forensic`-Modus)
  - `supabase/functions/compose-dialog-segments/index.ts` (re-enable server face-probe, fail-fast vor Sync.so)
  - `src/pages/admin/LipsyncDiagnostic.tsx` (Forensik-Button + Result-Render)
  - `src/components/video-composer/director-console/DirectorConsolePreview.tsx` (präzisere Fehlermeldung)
  - Migration: Spalte `plate_face_audit jsonb` in `lipsync_diagnostics`
- **Keine Funktionsänderung am Rehost-Pipeline** (v143/v144 bleiben wie sie sind — sie funktionieren)
- **Memory-Update**: `mem/architecture/lipsync/v145-plate-face-forensic.md`

## Was NICHT in v145
- Keine Änderungen am NOOP-Ladder oder Webhook-Logik (separates Thema)
- Kein automatischer Re-Render der Hailuo-Plate (User soll entscheiden — wir geben nur klares Signal)

## Verifikation
1. Forensik für Szene `8bd0d568-...` laufen lassen → wir sehen schwarz auf weiß, wie viele Gesichter in der Plate erkennbar sind
2. Falls < 4: bestätigt, dass das **Plate-Bild-Inhalt** (nicht Plate-Delivery) das Problem ist
3. Neuen Dispatch triggern → server-side Probe sollte den Job vor Sync.so abbrechen mit klarer Meldung + Refund
