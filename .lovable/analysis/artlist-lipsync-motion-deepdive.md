# Artlist Deep-Dive — Lip-Sync + Charakter-Bewegung

Stand: 2026-07-20. Reine Recherche, kein Code-Change. Ziel: verstehen, warum bei
Artlist eine 4-Sprecher-Action-Szene funktioniert (jeder telefoniert / tippt /
druckt und redet trotzdem synchron), während unsere v169–v260-Pipeline an
genau diesem Fall reißt — und was davon wir kopieren können.

---

## 1. Was Artlist unter der Haube fährt

Artlist Studio / AI Toolkit ist kein eigenes Modell. Es ist ein Orchestrator vor
Fremdmodellen — genauso wie wir. Öffentlich dokumentiert / beworben:

| Modell | Rolle bei Artlist | Multi-Sprecher? | Native Audio / Lip-Sync? |
|---|---|---|---|
| **Kling 2.6 Pro** | Standard-Cinematic i2v mit Native Audio | teilweise (Element Consistency) | ja, native |
| **Kling 3.0 / 3.0 Omni** | Dialog- und Multi-Shot Szenen | **ja** — bis zu mehreren Speakern in einem Take | **ja, End-to-End** |
| **Kling 3.0 Motion Control** | Reference-Video → Motion-Transfer auf neuen Charakter | 1 Charakter | Lip-Sync über getrenntes Advanced-Lip-Sync-Modul |
| **Seedance 1.5 Pro / 2.0** | Cinematic i2v mit Native Audio, Start/End-Frame | 1–2 Charaktere gut, N≥3 schwach | ja, mehrsprachig |
| **Runway Act-Two** | Performance-Capture (Driving-Video → Character-Ref) | 1 Charakter pro Pass | implizit (kommt aus dem Actor-Take) |
| **Advanced Lip Sync (Kling)** | Post-Pass für vorhandene Videos | 1 pro Call | ja, aber Overlay-artig |

Quellen:
- Kling 3.0 Omni Guide, native audio + multi-speaker: https://kling.ai/blog/kling-video-3-omni-multi-shot-native-audio-guide
- Kling 3.0 Omni Native Lip Sync: https://kling.ai/blog/kling-video-3-omni-native-lip-sync-audio-guide
- Artlist Kling 2.6 Pro Doku: https://help.artlist.io/hc/en-us/articles/33139264549533-Kling-2-6-Pro
- Artlist Kling 3.0 Motion Control Blog: https://new-blog.artlist.io/blog/new-kling-3-motion-control/
- Artlist Seedance 2.0 Blog: https://new-blog.artlist.io/blog/new-seedance-2/
- Runway Act-Two Help: https://help.runwayml.com/hc/en-us/articles/42311337895827
- Hedra Character-3 Modell-Seite: https://www.hedra.com/video-models/hedra-character-3

**Wichtigste Erkenntnis**: Artlist macht **keinen** externen Sync.so-Post-Pass
für Dialog-Szenen. Sie nutzen Modelle mit **nativem Audio-Input** (Kling 3.0
Omni, Seedance 1.5+, Kling 2.6 Pro). Der Lip-Sync ist Teil der Video-Generation,
nicht ein separater Prozess auf einem gerenderten Master-Plate.

---

## 2. Wie sie eine 4-Sprecher-Action-Szene lösen — 3 Hypothesen

### A) End-to-End Multi-Speaker Dialog-Modell (Kling 3.0 Omni)  ← wahrscheinlichste Route

Kling Omni akzeptiert pro Szene:
- 1–N **Character Elements** (Reference-Bild + zugewiesene Voice-ID + Script-Zeilen)
- 1 Location-Element
- Optional: Prop-Elements, Camera-Direction, Action-Beschreibungen pro Charakter

Das Modell rendert **einen einzigen Take** in dem alle Charaktere im gleichen
Raum ihre zugewiesenen Zeilen sprechen **und** ihre Aktionen ausführen. Lip-Sync
ist intern gelöst — kein Face-Gate, kein Rekognition-Landmark, kein Sync.so.

Warum das bei Action-Posen (Profil, Kopf gesenkt, Hand am Ohr) trotzdem passt:
das Modell kennt Audio + Character-ID zur Render-Zeit und kann den Mund auch bei
21°-Profil oder Occlusion korrekt animieren. Es muss den Sprecher **nicht
finden** — es weiß, wer gerade dran ist.

### B) Performance-Capture Overlay (Runway Act-Two)

Ein Actor-Take (Driving-Video) plus Charakter-Reference erzeugt den animierten
Charakter. Aktionen kommen aus dem Original-Take, Lip-Sync ist implizit. Für
Multi-Speaker macht Artlist pro Charakter einen Act-Two-Pass und comp't die
Ergebnisse zusammen — sinnvoll für stilisierte / animierte Charaktere, nicht für
"4 Leute im Büro". Preis: Gen-4.5 = 12 credits/sec ≈ $0.12/sec ≈ €0.11/sec.

### C) Per-Speaker-Plate + separater Sync-Pass (unser aktueller Weg)

Das ist genau v169–v260. Systembedingte Probleme siehe Abschnitt 3.

**Was Artlist definitiv NICHT tut** (belegbar aus der Marketing-Kommunikation):
sie schicken kein Multi-Face-Plate an einen externen Sync.so-artigen Provider.
Sie wählen das Modell so, dass Lip-Sync von Anfang an in einem einzigen Render
enthalten ist.

---

## 3. Vergleich zu unserer Pipeline seit v169

| Version | Problem | Fix | Was Artlist stattdessen macht |
|---|---|---|---|
| v169 | Multi-Face-Plate → `provider_unknown_error` bei Sync.so | Single-Face-Preclip pro Pass | kein separater Sync-Pass → Problem existiert nicht |
| v182 | Kling N=1 Klon-Fehler | Anti-Clone Anchor-Lock | Kling Character-ID löst das intern |
| v194 | Zuhörer flackern im Preclip | Silent Stabilizer + BBox-Tracking | einziger Take, keine Preclip-Konstruktion |
| v195 | Anchor "Generic Character" | reference_image_url Pflicht | Character Element ist API-Primitive |
| v198 | Skin-Seams / Morph an Preclip-Rand | Hard Mask VFX 55–63% radius | keine Composites |
| v199 | Full-Plate-Reprojection-Morph | Preclip Primary Isolation | — |
| v201 | ID-Fuzzy-Match schlägt fehl | Canonical UUID Resolution | UUIDs sind Voice/Character-IDs im Modell selbst |
| v204 | v203 Full-Plate-BBox `face_selection_invalid` | Rollback auf Preclip + BBox in Clip-Space | — |
| v217 | Falscher Sprecher aktiv | briefing-deep-parse priorisiert UUIDs | — |
| v242 | Sprecher 2/3 vertauscht bei 2×2 Grid | Row-Major Sort + Character-Assignment-Lock | Kling ordnet Voices per Character-Element direkt zu |
| v247/248 | Landmark-Detection unreliable | AWS Rekognition + Face-Share ≥42% + Mouth-YAVG Watchdog | **kein Face-Gate nötig** |
| v249/251 | Legacy Rekognition-Fallback stale | AWS als einziger Detektor | — |
| v260 | 3/4 Sprecher haben kein Lip-Sync bei Action-Szene (Profil, Prop-Occlusion) | Speaker Priority Framing: N Plates pro Szene, aktive Sprecher-Face rausgezoomt | **existiert bei Kling Omni gar nicht** — Modell weiß wer spricht |

**Kernbefund**: Fast alle unsere v169+-Fixes bekämpfen Symptome einer
architekturellen Entscheidung: „ein statisches Multi-Face-Plate + externer
Face-Detection-basierter Sync-Pass". Diese Klasse Probleme verschwindet
komplett, wenn das Video-Modell selbst Audio + Speaker-ID kennt.

### Warum unser 42%-Face-Gate systembedingt an Action-Posen scheitert

`syncso-face-gate.ts` verlangt eine detektierte Mundregion mit ausreichendem
Anteil am Frame. Bei einer realistischen Büroszene:
- Sprecher am Telefon: Kopf 20–40° geneigt, eine Hand vor der Wange → Face-Share fällt
- Sprecher am Laptop: Kopf nach unten → keine Mund-Landmarks
- Sprecher im Hintergrund: face_share zu klein
- Sprecher im Fenster / Profil: nur ein Ohr sichtbar

Rekognition + sync-3 sind auf **Talking-Head-Footage** trainiert. Alles darüber
hinaus (Aktion, Occlusion, Profil) ist out-of-distribution. v260 Speaker
Priority Framing versucht das zu umgehen, indem der aktive Sprecher pro Pass
frontal ins Bild gezoomt wird — löst das Detection-Problem aber die Szene
"driftet" pro Pass (siehe v243 Layout-Drift-Guard) und kostet N-fach an
Nano-Banana-Anchors.

---

## 4. Was uns fehlt

1. **Zugang zu Kling 3.0 Omni multi_speaker über die richtige API**. Replicate
   hostet aktuell nur Kling-Basic/Standard/Pro-Endpoints, kein Omni
   multi_speaker. Ein Kling-Direktzugang (Kling Direct API oder PiAPI/useAPI als
   Reseller) wäre notwendig.
   - PiAPI Kling Lip-Sync: $0.10 / 5 s = **$0.02/sec** (nur Lip-Sync, nicht Video).
   - PiAPI Kling 3.0 Omni Video mit Native Audio: laut Doku ~1.4× Standard Kling
     Pricing → ca. **$0.10–0.14/sec**.

2. **Hedra Character-3 API**. Öffentlich verfügbar, aber:
   - Nur 1 Charakter pro Call (Multi-Speaker über eigene Comp-Logik).
   - Preis: ca. **$0.14/sec** auf Creator-Tier (5400 credits / $30, ~180 sec).
   - Deutscher Sprach-Support: laut Doku vorhanden, in Praxis mittel.
   - Kein Face-Gate nötig — Modell bekommt Audio + 1 Portrait und rendert.

3. **Runway Act-Two**. Braucht ein Actor-Driving-Video. Für unser Content-Modell
   (User schreibt Skript, klickt Generieren) nicht ohne massive UI-Änderung
   sinnvoll. Preis: Gen-4.5 = 12 credits/sec = **$0.12/sec**.

4. **Kein natives Multi-Speaker-Modell in unserem aktuellen Stack**. Hailuo,
   Seedance 2.0, Veo 3, Sora, Kling Pro (Basic) — alle sind entweder Single-
   Speaker native oder gar kein natives Audio.

---

## 5. Optionen — was wir daraus machen können

Alle Preise brutto, unsere Marge 3.00× auf Provider-Cost.

### Option 1: Kling 3.0 Omni Direct-API als Dialog-Engine (empfohlen)

- **Provider-Cost**: ca. **$0.12/sec** für Omni multi_speaker.
- **Endkunden-Preis** bei 3.00×: **€0.34–0.36/sec** — vergleichbar zu unserem
  aktuellen Happy-Horse-Pfad (€0.42/sec) und günstiger als Hailuo + Sync.so
  (0.42 + Lip-Sync-Zuschlag).
- **Deutscher Support**: Kling 3.0 Omni unterstützt 5 Sprachen inkl. Deutsch
  laut Blog.
- **Multi-Speaker**: Bis 4 Charaktere in einem Take, native Lip-Sync.
- **Charakter-Aktions-Support**: ja, über Prompt + Character-Element-Beschreibung.
- **Integrationsaufwand**: **12–20 h** (neuer Provider-Adapter in
  `compose-video-clips`, kein Sync.so-Pfad für diese Engine, kein Anchor-Audit,
  kein Face-Gate — Kling erledigt das intern).
- **Risiko**: Kling Direct API braucht Business-Account bei Kling; Rate-Limits
  strikt; Deutsche Aussprache noch nicht auf Elite-Niveau.

### Option 2: Hedra Character-3 als N-Sprecher-Ersatz für Sync.so

- **Provider-Cost**: ~**$0.14/sec** pro Character-Pass. Für 4 Speaker = $0.56/sec
  Szenen-Cost → 3.00× = **€1.55/sec** — deutlich zu teuer als Standard-Pfad.
- **Multi-Speaker**: nur über eigenes Compositing (wieder Multi-Plate-Problem).
- **Deutscher Support**: ok.
- **Integrationsaufwand**: **20–30 h** + Comp-Pipeline.
- **Empfehlung**: nur als Premium-„Talking-Head"-Engine für Solo-Sprecher, nicht
  als Ersatz für Sync.so.

### Option 3: Bei Sync.so bleiben, Speaker Priority Framing Phase 2/3 fertig bauen

- **Provider-Cost**: keine Änderung (~€0.14–0.16/sec Sync.so + Hailuo/Kling i2v).
- **Endkunden-Preis**: keine Änderung.
- **Integrationsaufwand**: **15–25 h** (N Plate-Renders pro Szene, N i2v-Calls,
  Stitching-Layer, Credit-Adjustment).
- **Deckt Action-Szenen ab?** teilweise — v260 Phase 1 ist geladen aber
  standardmäßig aus. Phase 2/3 löst das Face-Detection-Problem, aber
  **N-fache Kosten** und Layout-Drift-Risiko zwischen Plates.
- **Empfehlung**: nur als Fallback wenn Kling Omni Direct-API nicht kommt.

### Option 4: Runway Act-Two als Premium-Dialog-Engine

- **Provider-Cost**: ~**$0.12/sec** pro Charakter.
- **Voraussetzung**: User müsste Driving-Video liefern (Selfie-Aufnahme). Bricht
  unser Text-only-Workflow → **großer UI-Umbau** (30–40 h).
- **Empfehlung**: nicht jetzt. Später als Power-User-Feature.

---

## 6. Empfehlung

**Kurzfristig (vor Live-Gang 26.07.2026)**: v260 Speaker Priority Framing
Phase 1 unter Feature-Flag lassen (Status quo). Nichts an der aktuellen
Pipeline aktiv umbauen. Aktuelle Solo- und 2-Sprecher-Talking-Head-Szenen
funktionieren zuverlässig — das ist der 80%-Use-Case.

**Mittelfristig (Q3/Q4 2026)**: Kling 3.0 Omni Direct-API als **dedizierte
Dialog-Engine** integrieren (Option 1). Neue Engine-Karte im Studio, klare
Trennung:

- „Cinematic Solo" → Hailuo / Seedance / Kling Pro (aktueller Pfad, unverändert)
- „Dialog / Action-Szene" → Kling 3.0 Omni Direct (neu, kein Sync.so, kein
  Face-Gate, native Lip-Sync bis 4 Sprecher)

Das eliminiert 80% der v169–v260-Fixes im Dialog-Pfad und macht Action-Szenen
mit Handlung („einer telefoniert, einer druckt, einer tippt") überhaupt erst
zuverlässig möglich — genau der Fall, an dem wir gerade hängen.

**Nicht empfohlen**: Hedra für Multi-Speaker und Act-Two ohne UI-Umbau.

---

## 7. Offene Fragen an Dich

1. Business-Account bei Kling / PiAPI ok, oder soll die Integration über
   Replicate warten bis Omni multi_speaker dort verfügbar ist?
2. Willst Du v260 Speaker Priority Framing Phase 2/3 trotzdem als Sync.so-
   Fallback fertig bauen, oder direkt auf Kling Omni umschwenken?
3. Zeitfenster für Kling-Omni-Integration: vor Live-Gang oder erst danach?
