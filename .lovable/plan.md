# 3-Speaker Lipsync: nur 1 Person spricht — Diagnose & Fix

## Status der Daten (Szene `e451083e…`)

Die Pipeline-Daten sind komplett korrekt:

- **FaceMap**: 3 Gesichter, alle 3 mit Confidence 0.999 zu `sarah-dusatko`, `matthew-dusatko`, `samuel-dusatko` gematcht.
- **Sync.so Dispatch Log**: 3× HTTP 201 — also 3 separate Lipsync-Passes erfolgreich erzeugt.
- **`dialog_shots.passes`**: alle 3 mit `status=done`, eigenem `output_url`, eigenem `preclip_crop` (x=0/266/504 in 768-px Master-Space).
- **Audio-Mux Edge Function Log**: `mode=fanout-3-speakers-windowed shots=3` → Lambda hat alle 3 Crops erhalten.

→ Das Problem liegt **nicht** im Face-Mapping, nicht im Sync.so-Call und nicht im Edge-Function-Payload. Es liegt entweder:
1. im **Lambda-Bundle** (`DialogStitchVideo.tsx` v21 CroppedOverlay-Pfad — alter Bundle deployed ohne `crop`-Support, fällt auf einen Default zurück), **oder**
2. in der **CroppedOverlay-Mathematik**, sodass Pass 1+2 außerhalb des sichtbaren Frames landen oder den gleichen Pixelbereich wie Pass 0 belegen.

## Schritt 1 — Render herunterladen & inspizieren (Diagnose)

`ffprobe` auf `dialog-stitch-muxed-…-1781108231296.mp4` + 3 Standbilder extrahieren (bei t=1s, t=4s, t=7s — eine Frame pro sprechender Speaker) und visuell prüfen, **welche** Münder sich bewegen.

Daraus ergibt sich eindeutig:
- **Fall A:** Pass 1 + 2 Overlays sind unsichtbar → Lambda-Bundle ist veraltet (kein `crop`-Pfad). Fix: Bundle redeployen (`scripts/deploy-remotion-bundle.sh`) und `dialog_shots.bundle_version` invalidieren.
- **Fall B:** Pass 1 + 2 Overlays werden an der falschen Stelle gerendert (z.B. alle bei x=0) → Bug in `CroppedOverlay` / `scaleX` (Master ist 768×768 quadratisch, Comp ist 1280×720, `Math.max(scaleX, scaleY)` skaliert die Crop-Größe übermäßig). Fix: getrennte X/Y-Skalierung, Position mit `scaleX` und `scaleY`, Größe mit `Math.min(scaleX, scaleY)` damit die 512px-Patches in ihrer Original-Region bleiben.
- **Fall C:** Pass 1 + 2 Overlays sind voll-frame statt gecroppt → `crop`-Feld geht in der Schema-Validierung der Lambda verloren. Fix: Schema-Sync zwischen `render-sync-segments-audio-mux` Payload und `DialogStitchVideo` Zod-Schema.

## Schritt 2 — Fix ausliefern + verifizieren

- Patch in der entsprechenden Datei (`DialogStitchVideo.tsx` oder `scripts/deploy-remotion-bundle.sh`).
- Redeploy des Remotion-Bundles falls Template geändert wurde.
- Auf der existierenden Szene `e451083e…` `force_remux=true` an `render-sync-segments-audio-mux` schicken → ohne neuen Sync.so-Cost neu muxen.
- Verifizieren mit denselben 3 Standbildern.

## Schritt 3 — Memory aktualisieren

Falls Fall A: `mem://infrastructure/remotion/lambda-bundle-deployment-and-verification` erweitern um "bei `crop`-Schema-Änderung Bundle-Version-Bump erzwingen".

## Out-of-Scope

- Welle B (parallele Sync.so-Passes) — bleibt erst nach Fix.
- Keine Änderung am `compose-dialog-segments`-Flow, FaceMap oder Sync.so-Dispatch.
- Keine erneute Sync.so-Berechnung (alle 3 Outputs sind bereits gerendert).

Soll ich loslegen?
