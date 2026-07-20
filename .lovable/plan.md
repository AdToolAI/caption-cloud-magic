# Artlist Deep-Dive — Wie machen die das mit Lip-Sync + Charakter-Bewegung?

## Deliverable

Eine neue Analyse-Datei `.lovable/analysis/artlist-lipsync-motion-deepdive.md` (kein Code, keine Pipeline-Änderungen). Reine Recherche + Vergleich mit unserem Stack seit v169. Ziel: verstehen, warum bei Artlist 4 Sprecher in einer Action-Szene synchron sprechen UND telefonieren/tippen können, ohne dass Lip-Sync verloren geht — und was davon wir übernehmen könnten.

## Inhalt der Datei

**1. Artlist-Stack Reverse-Engineering (Web-Research)**
- Welche Modelle Artlist / Artlist Max / Artlist Motion aktuell öffentlich einsetzt (Kling 2.1/2.5 Omni, Runway Act-One / Act-Two, Hedra Character-3, Sync.so v2 vs sync-3, HeyGen Avatar IV, D-ID).
- Konkret: bekannte API-/Doku-Belege für Multi-Character-Dialog-Pfade (Kling Omni „multi_speaker", Hedra „scene mode", Runway Act-Two „performance capture").
- Preise pro Sekunde und Marge im Vergleich zu unserem 3.00× Modell.

**2. Wie sie das technisch lösen — 3 Hypothesen mit Belegen**
- **A) End-to-End Dialog-Modell** (Kling Omni / Hedra Character-3): Audio + Anchor-Bilder + Aktionen → ein einziges i2v-Render pro Szene, Lip-Sync ist Teil des Modells, keine Sync.so-Post-Pass. Skaliert nativ auf N Sprecher + Aktionen.
- **B) Performance-Capture-Overlay** (Runway Act-Two): Actor-Video → Face-Retargeting auf Anchor. Aktionen kommen aus dem Original-Take, Lip-Sync ist implizit.
- **C) Per-Speaker-Plate + separater Sync-Pass** (unser aktueller v169–v260-Weg): fragil bei Action-Szenen, weil Face-Share droppt wenn Charakter telefoniert.

**3. Direkter Vergleich zu unserer Pipeline seit v169**
- Kurze Tabelle: v169 Preclip / v195 Anchor-Invariant / v204 Rollback / v217 UUID / v242 Row-Major / v247 Rekognition Face-Share ≥42% / v249 AWS-only / v260 Speaker Priority Framing → welches Problem war das, das die Art-One-/Kling-Omni-Konkurrenz gar nicht erst hat.
- Warum unser Face-Gate (42%) systembedingt an Action-Posen (Profil, Kopf gesenkt, Hand vor Mund) scheitert, während Kling Omni das intern löst.

**4. Was uns fehlt / offene Baustellen**
- Sync.so sync-3 kann kein „active speaker in profile with prop occlusion" zuverlässig.
- Wir haben keinen Zugang zu Kling Omni multi_speaker über Replicate (nur Basic/Standard-Endpoints).
- Hedra Character-3 API ist verfügbar, aber Marge und deutscher Sprach-Support unklar.

**5. Konkrete Optionen für uns (nur Bewertung, kein Plan)**
- **Option 1**: Kling 2.5 Omni multi_speaker direkt über Kling API (nicht Replicate) — löst A + B in einem Call.
- **Option 2**: Hedra Character-3 als N-Sprecher-Ersatz für Sync.so.
- **Option 3**: Bei Sync.so bleiben, aber Speaker Priority Framing (v260 Phase 2/3) fertig bauen.
- **Option 4**: Runway Act-Two als optionaler „Premium-Dialog"-Engine.

Für jede Option: geschätzte Kosten/Sekunde, Marge bei 3×, deutsche Sprachqualität, Multi-Sprecher-Fähigkeit, Charakter-Aktions-Support, Integrations-Aufwand in Stunden.

## Vorgehen

1. Web-Research über `websearch--web_search` + `websearch--web_code_search` (Kling Omni API docs, Hedra Character-3, Runway Act-Two, Artlist Motion Marketing-Seite, Reddit/HackerNews Erfahrungsberichte).
2. Gegenlese mit unserer bestehenden Config (`hailuoVideoCredits.ts`, `happyhorseVideoCredits.ts`, `syncso-face-gate.ts`) — nur lesen, nichts anfassen.
3. Datei schreiben, danach im Chat kurz zusammenfassen (3–5 Bullets + Empfehlung).

## Nicht Teil dieses Plans

- Keine Änderung an `compose-video-clips`, `compose-scene-anchor`, `compose-dialog-segments`.
- Keine Speaker-Priority-Framing Phase 2/3.
- Keine neue Engine-Integration — die kommt erst nach Deiner Entscheidung basierend auf dem Report.
