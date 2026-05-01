## Ausgangslage

- Deep Sweep läuft grün (5/5 + 1 Infrastruktur-Timeout).
- `qa_bug_reports` hat **0 offene** Einträge (84 resolved historisch).
- `provider_quota_log` zeigt aber 3 wiederkehrende, echte Code-Bugs in Lambda-Renders, die der Sweep noch nicht trifft, weil sie nur unter bestimmten Eingabe-Kombinationen auftreten.

Wir sollten jetzt **nicht** mehr Tests dazubauen, bevor diese realen Bugs gefixt sind — sonst wachsen wir die Coverage über bekannten Schmutz.

## Phase 1 — Die 3 realen Render-Bugs fixen (höchste Priorität)

### 1.1 `durationInFrames=120 vs frame 0-149` (Off-by-one)
- Tritt in `/render/video` auf (Composer-Pipeline, nicht DC).
- Hypothese: `durationInFrames` wird aus Sekunden×fps berechnet, aber `Sequence` bekommt eine längere Range (vermutlich Audio-Tail oder Outro-Animation).
- **Aktion**: `compose-video-clips` und `render-video` durchgehen, `durationInFrames` als `Math.max(scenesEnd, audioEnd, 1)` absichern. Unit-test im `tests/` Ordner mit dem konkreten Fall (4s @ 30fps + 5s Audio).

### 1.2 `from prop of Sequence must be finite, but got NaN`
- Tritt in `/render/directors-cut` auf.
- Hypothese: Eine Scene hat `start_at_frame = NaN`, weil `start_at_seconds` undefined oder ein String aus dem Export-Payload ist.
- **Aktion**: In `render-directors-cut/index.ts` einen `sanitizeScenes()` Guard einbauen, der jeden Scene-Eintrag mit `Number.isFinite()` validiert und bei Verstoß den Render mit einem klaren 400-Fehler ablehnt (statt Lambda zu verheizen). Plus: gleichen Guard im Director's-Cut-Studio beim "Render"-Klick clientseitig.

### 1.3 `MEDIA_ELEMENT_ERROR Code 4` auf bestimmten MP4s
- Betrifft sowohl Google-Sample-MP4s als auch eines unserer eigenen `test-video-2s.mp4` Bootstrap-Assets.
- Ursache: Codec-Profil (vermutlich H.265/HEVC oder unkompatibles Pixel-Format), das Chrome-Headless im Lambda nicht decodieren kann.
- **Aktion**: 
  - Bootstrap (`qa-live-sweep-bootstrap`) erzeugt `test-video-2s.mp4` neu mit garantiert kompatiblem Profil (H.264 baseline, yuv420p, faststart). Falls per ffmpeg im Edge nicht möglich: ein vorgefertigtes, validiertes MP4 ins Repo legen und beim Bootstrap kopieren.
  - In `render-directors-cut` bei `MEDIA_ELEMENT_ERROR Code 4` einen sauberen `failed`-Status mit Hinweis "Quell-Video Codec inkompatibel" loggen statt eines unverständlichen Stacktraces.

## Phase 2 — Bug-Sichtbarkeit erhöhen

Die Bugs aus 1.1–1.3 sind nur deshalb "unsichtbar", weil sie als `provider_quota_log`-Einträge versinken statt in `qa_bug_reports` zu landen.

- Neue Edge-Funktion `qa-bug-harvester` (täglicher Cron, 1x/Tag):
  - Liest `provider_quota_log` der letzten 24h mit `success=false`.
  - Gruppiert nach `error_message`-Fingerprint (erste 200 Zeichen, normalisiert).
  - Erstellt pro Fingerprint **maximal einen** offenen `qa_bug_reports`-Eintrag mit Severity-Heuristik (NaN/undefined → high, Codec → medium, Rate-Limit → low/ignoriert).
  - Idempotent: wenn Bug schon `open` oder `resolved` mit gleichem Fingerprint < 7 Tage alt → skip.
- Im **Bug Reports Admin-Tab** gruppierte Anzeige: "1× Sequence NaN (last seen 2h ago, 2 occurrences)" statt 84 Einzeleinträge.

## Phase 3 — Sweep-Coverage gezielt erweitern (nicht vorher!)

Erst nach Phase 1+2 lohnt es, neue Flows hinzuzufügen. Vorschlag in dieser Reihenfolge:

1. **Music Studio** (Stable Audio 2.5) — aktuell nicht im Sweep.
2. **Picture Studio Magic Edit Outpaint** — Inpaint ist drin, Outpaint nicht.
3. **Avatar Library + Talking Head mit Custom Avatar** (statt Default-Portrait).
4. **Email Director Send-Test** (Resend, Self-Send only — günstig).
5. **Auto-Director mit echtem Brand-Character-Lock** (testet Identity-Card-Injection).

Jeder neue Flow bekommt vorher ein Mock-Pendant in `_shared/qaMock.ts` und respektiert das 50€-Cap.

## Phase 4 — Stabilitäts-Härtung Flow 2 (Lambda Concurrency)

Aktuell ist Flow 2 chronisch gelb wegen AWS Rate Limits. Optionen:

- **A** Account-weites AWS Concurrency-Quota erhöhen (Support-Ticket bei AWS, kostet nichts).
- **B** Deep Sweep wartet vor Flow 2 explizit, bis `aws-lambda` Provider-Health < 50% Auslastung zeigt.
- **C** Flow 2 als "best effort" markieren und aus Pass-Rate-Berechnung entfernen.

Empfehlung: **A** beantragen, parallel **B** implementieren als Sicherheitsnetz.

## Reihenfolge & nächster konkreter Schritt

Ich empfehle **streng sequenziell**:

1. **Zuerst Phase 1.2** (NaN-Guard) — kleinster Fix, größter Hebel, bricht aktuell echte User-Renders.
2. Dann 1.1 (Off-by-one Frame).
3. Dann 1.3 (MP4-Codec-Bootstrap).
4. Dann Phase 2 (Bug Harvester), damit zukünftige Drift sofort sichtbar wird.
5. Erst dann Phase 3 (neue Flows).

## Was ich **nicht** vorschlage

- Keine spekulativen Refactorings.
- Kein neues Test-Framework — Playwright + Deep Sweep + Smoke reichen.
- Kein "alle Edge-Functions auf einmal anfassen".

---

**Soll ich mit Phase 1.2 (NaN-Sanitizer in render-directors-cut + clientseitiger Guard) loslegen?**
