## Plan v266 — Anchor + Identity-Audit komplett aus dem kritischen Pfad entfernen

### Ziel
Die wiederkehrenden „anchor_identity_missing/clone/swap"-Fehler kommen aus zwei Zwischenstufen, die die Provider gar nicht brauchen:
1. Ein KI-erzeugtes Composite-Bild (Nano Banana 2) aus den Portraits
2. Ein KI-Identity-Audit (Gemini Vision), das dieses Bild bewertet

Beide werden für Cinematic-Sync entfernt. Der Video-Provider bekommt die echten Portraits + den Szenen-Prompt direkt, der bestehende Sync.so-Multi-Face-Lipsync bleibt unverändert.

### Neuer Ablauf für Multi-Speaker Cinematic-Sync

```text
Portraits + Outfits + Prompt
        │
        ▼
Video-Provider (Multi-Reference i2v)      ← keine Zwischenbilder, kein Audit
        │
        ▼
Erster Frame → optionaler Preview-Check   ← User kann abbrechen bevor Lip-Sync bezahlt wird
        │
        ▼
Sync.so Multi-Face Lipsync (unverändert)
```

### Was rausfliegt

1. **Composed-Anchor-Erzeugung** in `compose-video-clips` für Cinematic-Sync (der ganze Block Attempt-1/2/3, Face-Lock, Strict-Swap-Retry).
2. **Gemini Identity-Audit** und daran hängende Fehler: `anchor_identity_duplicate_detected`, `anchor_identity_missing_detected`, `anchor_identity_ambiguous`, `anchor_identity_swap_detected`.
3. **v250 Soft-Pass**, **v262 Min-Face-Retry**, **v263 Missing-Guard**, **v264 Safe-Fail** — nicht mehr nötig, weil ihr gemeinsamer Auslöser wegfällt.
4. **`anchor_soft_pass`** als Twoshot-Stage.
5. **`AnchorPreviewGate`** in seiner heutigen Form (Anchor-Bild anzeigen) — ersetzt durch einen einfachen Provider-Frame-Preview.

### Was bleibt / wird angepasst

- **`compose-scene-anchor`** bleibt als Funktion erhalten, wird aber nur noch von den Pfaden aufgerufen, die es wirklich brauchen (Still-Frame-Studio, Single-Character-Referenzbilder, Talking-Head). Cinematic-Sync ruft es nicht mehr auf.
- **Sync.so Multi-Face-Pipeline** (Face-Map, Preclips, v129 Doc-Strict, v264 Safe-Fail-Race-Guard für Mux) bleibt 1:1.
- **Portrait- und Outfit-Auflösung** (`effectiveShots`, `portraitUrls`, `identityPortraitUrls`, `outfitUrlById`) bleibt — diese werden jetzt direkt dem Provider mitgegeben.
- **Server-side CastActions Injection** (`withServerCastActions`) bleibt, aber wandert in den Provider-Prompt, nicht mehr in den Anchor-Prompt.
- **Wardrobe-Lock** wandert ebenfalls direkt in den Provider-Prompt.

### Preview-Gate light (optional, aber empfohlen)

Statt eines KI-Zwischenbilds:
- Nach dem Video-Render lädt das UI den ersten Frame des Provider-Videos (billig, existiert schon in Mux/Provider-Response).
- Der User sieht in einem kleinen Dialog: „So sehen deine Charaktere im finalen Video aus. Lip-Sync starten?"
- Bestätigen → Sync.so Lip-Sync läuft.
- Ablehnen → Szene bleibt als reines Video, kein Lip-Sync-Credit verbraucht.

Vorteil: Der Check basiert auf dem, was Sync.so tatsächlich bekommt (Video-Frame), nicht auf einem separaten Bild.

### Datenmigration für laufende Szenen

- Szene `3e0cc017-08d2-4095-8cb8-9c704ef41984` und andere aktuell auf `anchor_identity_*`-Fehlern hängende Szenen werden auf `pending` zurückgesetzt (nur `clip_status`, `clip_error`, `twoshot_stage`). `clip_url` bleibt unangetastet, falls schon vorhanden.
- Kein Refund-Backfill nötig, weil vor dem Anchor-Gate keine Video-/Lip-Sync-Credits fließen.

### Rollout

- **Feature-Flag** `CINEMATIC_SYNC_NO_ANCHOR=1` am Edge, initial nur für Multi-Speaker (2–4). 1-Sprecher-Cinematic-Sync läuft weiter über den heutigen Anchor-Weg — dort gibt es kein Familien-Drift-Problem und der Anchor stabilisiert bei Talking-Head-Look.
- Nach 24–48 h Beobachtung auf Multi-Speaker → Default umlegen und toten Anchor-Code entfernen.

### Nicht Teil dieses Plans

- Änderungen an Sync.so-Pipeline, Face-Map, Preclips, v129/v264-Race-Guards.
- Änderungen an Single-Speaker Cinematic-Sync.
- Änderungen an Still-Frame-Studio / Referenzbild-Upload.
- Änderungen an Voice/Script/Dialog-Turn-Logik.

## Technische Details

Betroffene Dateien:
- `supabase/functions/compose-video-clips/index.ts`
  - Kompletter Anchor-Block (ca. Z. 2280–3020) hinter Feature-Flag deaktivieren für Multi-Speaker Cinematic-Sync.
  - Portraits + Prompt + CastActions + Wardrobe direkt an den Provider-Aufruf weiterreichen.
  - `safeMarkSceneFailed`/`failedClipUpdate` bleiben für echte Provider-Fehler.
- `supabase/functions/compose-scene-anchor/index.ts`
  - Bleibt unverändert.
- `src/components/video-composer/SceneCard.tsx` und `AnchorPreviewGate.tsx`
  - Anchor-Preview-Modus für Multi-Speaker durch „Frame-Preview nach Video-Render" ersetzt.
  - Bestehende „Vorschau statt Full-Render"-Buttons für 1-Speaker bleiben.
- `src/components/video-composer/SceneClipProgress.tsx`
  - v264-Guards bleiben, sind auch mit dem neuen Pfad korrekt.
- Datenbank-Migration
  - Reset für hängende `anchor_identity_*`-Szenen des betroffenen Users.

## Ergebnis

- Kein Nano-Banana-Anchor mehr im Cinematic-Sync-Multi-Speaker-Pfad.
- Kein Gemini-Identity-Audit mehr im Cinematic-Sync-Multi-Speaker-Pfad.
- Keine 3-Attempt-Retry-Schleife.
- Kein Soft-Pass / Missing-Guard / Safe-Fail rund um den Anchor.
- Fehlerklassen `anchor_identity_missing_detected` etc. existieren im Cinematic-Sync-Multi-Speaker-Pfad nicht mehr.
- Der bewährte Sync.so-Multi-Face-Lipsync bleibt vollständig erhalten.
- Preview/Confirm wandert auf den echten Provider-Frame, statt auf ein zusätzliches KI-Bild.