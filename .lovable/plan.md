## Befund vorab (geprüft)

Der Upload im Universal Content Creator verändert das Video **nicht**:

- `BackgroundAssetSelector.tsx:148-193` lädt die Datei 1:1 per Storage-Upload hoch, holt `getPublicUrl()` **ohne** Transform-Parameter und speichert genau diese Original-URL.
- Kein Canvas/ffmpeg/WebCodecs, keine Kompression, kein Proxy im Upload-Pfad.
- `compress-video` und `media-upload-complete` existieren als Edge Functions, werden aber von **keiner** Frontend-Datei aufgerufen.
- Die Original-URL wandert unverändert bis in die Remotion-Lambda-Payload (`background.videoUrl`), `rawMediaMode: true` ist gesetzt.

Der Unterschied entsteht also **nicht beim Upload**. Was noch nicht bewiesen ist: wo genau er dann entsteht. Zwei realistische Kandidaten, beide noch unbestätigt: (a) Skalierung, weil die Remotion-Komposition eine feste Zielauflösung/FPS hat, die nicht der Quelle entspricht (4K/60fps-Quelle → 1080p/30fps-Export), und (b) die H.264-Neucodierung im Lambda selbst (CRF/Bitrate/Farbraum).

## Schritt 1 — Ursache beweisen (zuerst, ohne Codeänderung)

1. Storage-Datei mit der Originaldatei byte-/hash-vergleichen → schließt den Upload endgültig aus.
2. `ffprobe` auf Original vs. exportiertes MP4: Auflösung, FPS, Bitrate, Pixel-Format (`yuv420p`), Farbprimaries/Transfer (`bt709` vs. unmarkiert) und Farbbereich (`tv` vs. `full`) gegenüberstellen.
3. Einen identischen Frame aus beiden Dateien extrahieren und numerisch vergleichen (mittlere Differenz + Histogramm), statt nach Augenmaß.

Ergebnis dieses Schritts entscheidet, welcher der folgenden Fixes greift.

## Schritt 2 — Fix je nach Befund

**Fall A: Downscale/FPS-Konvertierung**
Zielauflösung und FPS der UCC-Komposition an die Quelle koppeln, wenn nur ein einzelnes Video-Asset ohne Format-Änderung verwendet wird — statt fest auf das Preset-Format zu rendern. Bei bewusst gewähltem Format (z.B. 9:16 aus 16:9) bleibt Skalierung natürlich nötig; dann hochwertiges Resampling erzwingen.

**Fall B: Farbraum-/Range-Shift**
Das ist die typische Ursache für „gleicher Inhalt, anderer Kontrast": Quelle ist `full range`/unmarkiert, Export schreibt `tv range`/`bt709`. Fix: Farb-Metadaten beim Encode explizit an die Quelle angleichen.

**Fall C: Encoder-Verlust**
Falls Auflösung und Farbraum identisch sind und nur Detailschärfe fehlt: Qualitätsboden im Export weiter anheben (CRF/jpegQuality) bzw. für Einzel-Video-Assets ohne Overlays einen Stream-Copy-Pfad prüfen, der gar nicht neu codiert.

## Technische Details

- Betroffene Dateien voraussichtlich: `src/lib/universalCreatorRenderPayload.ts` (Format-/FPS-Ableitung), `src/remotion/templates/UniversalCreatorVideo.tsx`, `supabase/functions/render-with-remotion/index.ts` (Encoder-Parameter, `colorSpace`).
- Die Raw-Media-Invariante (kein Grade, keine Filter außer explizit im Director's Cut) bleibt unangetastet.
- Keine Änderung am Upload-Pfad — der ist nachweislich verlustfrei.

## Was du dafür brauchst

Für Schritt 1 brauche ich die **Originaldatei und das exportierte MP4** desselben Projekts (beide als Upload), sonst kann ich nur raten statt messen.
