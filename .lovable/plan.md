
# Action-First Cinematic Pipeline

Ziel: Weg vom statischen "Avatar redet in die Kamera" — hin zu echten Filmszenen, in denen Charaktere fahren, laufen, gestikulieren, mit Objekten interagieren und dabei natürlich sprechen. Lipsync wird zur Politur, nicht zum Fundament.

Wir bauen das in **4 zusammenhängenden Stages** auf bestehender Infrastruktur (Scene-Director, Cinematic-Sync, Dialog-Shot-Pipeline) auf — kein Bruch, sondern Aufwertung.

---

## Stage 1 — Action-Beat Layer im Scene-Director

Aktuell liefert der Scene-Director Cast/Location/Props + Dialog. Wir ergänzen ein neues **`action_beat`-Feld** pro Szene mit zwei Sub-Feldern:

- `character_action` — was der Charakter physisch tut (`"steers a red convertible through Los Angeles at golden hour, one hand on the wheel, glances briefly toward the camera"`)
- `environment_motion` — was um ihn herum passiert (`"palm trees blur past, sun flares hit the windshield, traffic lights reflect on the hood"`)

**Brief-Modus** (nur übergeordneter Brief): Scene-Director generiert beide Felder vollautomatisch aus dem Brief mit Lovable AI Tool-Calling. Pro Szene wählt er einen passenden Action-Beat-Archetyp (driving / walking / working / gesturing-still / arriving / leaving).

**Detail-Modus** (User schreibt pro Szene 1 Satz): Der User-Satz wird zu `character_action` promoted, der Scene-Director ergänzt `environment_motion` + Kamera-Move passend.

UI: SceneDirectorBox bekommt eine neue Zeile **"Action-Beat"** mit Edit-Pencil, sodass der User die generierte Action sehen und überschreiben kann, bevor gerendert wird.

---

## Stage 2 — Action-First Prompt Composer

Die größte Ursache für statische "Talking-Head-Busts" ist die aktuelle Prompt-Komposition: Cast und Dialog dominieren, Action ist optional. Wir drehen die Reihenfolge um.

Neue Prompt-Layer-Reihenfolge in `composePromptLayers`:

```text
1. SHOT-DIRECTOR (Framing/Lens/Movement) — bleibt wie gehabt
2. CHARACTER-ACTION (neu, höchste Priorität nach Shot)
3. ENVIRONMENT-MOTION (neu)
4. CAST-IDENTITY (was sie tragen, wer sie sind)
5. DIALOG-INTENT ("speaking calmly", "speaking with urgency" — kein Wortlaut!)
6. STYLE-PRESET / Color Grade
```

Wichtig: **Der Dialog-Wortlaut wird NICHT mehr in den i2v-Prompt geschrieben** — Hailuo/Kling verstehen Text-Inhalt sowieso nicht und verursachen damit oft starre "Sprech-Posen". Stattdessen nur die Sprech-Tonalität (`speaking warmly while driving`). Den echten Text legt Sync.so später als Lipsync drauf.

Das ist die Kern-Änderung gegen "Münder bleiben zu / Bewegung fehlt".

---

## Stage 3 — Drei Realismus-Style-Presets

Neuer Selector im Composer-Header (neben dem bestehenden Cinematic-Style-Preset-Picker):

- **Cinematic Spot** — 35mm Filmlook, natural lens flares, shallow DOF, "Kodak Vision3", Sync.so Pro (2 passes), Color-Grade `commercial-warm`. Default für Werbung.
- **Documentary / Authentic** — handheld camera, natural light, slight grain, Sync.so Standard (1 pass), Color-Grade `natural`. Default für UGC/Testimonials.
- **Lifestyle / Hero** — Steadycam glides, dramatic lighting, polished post, Sync.so Pro + Color-Grade `cinematic-teal-orange`. Default für Brand-Hero.

Jedes Preset setzt automatisch:
- passende Shot-Director-Defaults (Framing/Movement/Lighting)
- die richtige Sync.so-Qualitätsstufe (`single` vs `two-shot`)
- Color-Grade und Negative-Prompt
- bevorzugte Engine pro Szene (siehe Stage 4)

---

## Stage 4 — Smarteres Engine-Routing

`sceneEngineRouter` wird so umgebaut, dass **Action-Beats** das Routing dominieren — nicht das Vorhandensein von Dialog:

| Bedingung | Engine | Begründung |
|---|---|---|
| Action-Beat mit Bewegung + Dialog | **`cinematic-sync`** (Hailuo/Kling i2v + Sync.so Polish) | Echte Action-Plate, Mund wird draufgelegt |
| Action-Beat ohne Dialog | **`broll`** (pure Hailuo/Kling) | Off-Screen-VO oder stumm |
| Statische "Person spricht direkt zur Kamera"-Szene | **`heygen-talking-head`** | Bleibt für klassische Sprecher-Inserts |
| Multi-Speaker Dialog mit Action | **`sync-segments`** mit Action-Plate | Existierende Pipeline bleibt, aber Plate ist Action-First |

Damit wird HeyGen vom Default zur **Ausnahme** — nur noch für echte Direct-Address-Momente. Action wird zur Regel.

Zusätzlich: Engine-Empfehlung erscheint sichtbar als Badge auf jeder SceneCard mit Tooltip-Begründung und manuellem Override.

---

## Akut-Bug Szene 3 (parallel zur Story-Engine)

Im selben Plan-Batch:

- **Diagnose-Script** über die letzten 24h `dialog_shots` und `cinematic_sync_jobs`: Welche Szenen sind als "completed" markiert, haben aber keinen Lipsync-Pass durchlaufen? (Symptom: starr + geschlossene Münder.)
- **Fallback-Guard in `poll-dialog-shots`**: wenn Sync.so 8-min-Timeout greift, aber die Rohe Hailuo-Plate trotzdem durchgereicht wird → Szene auf `failed` setzen + Auto-Refund + UI-Hinweis "Lipsync fehlgeschlagen, bitte regenerieren" statt stilles Durchreichen einer stummen Plate.
- **Plate-Probe**: wenn Hailuo-Output einen Static-Anchor-Frame erkennt (Frame 1 ≈ letzter Frame über SSIM), wird die Plate verworfen und mit anderem Seed neu generiert, bevor Sync.so überhaupt startet.

---

## Technische Details

**Geänderte Dateien (Schätzung):**

- `supabase/functions/scene-director/index.ts` — Action-Beat-Generation im Lovable-AI Tool-Call-Schema
- `src/lib/video-composer/composePromptLayers.ts` — neue Layer-Reihenfolge, Dialog-Wortlaut wird gestrippt
- `src/lib/video-composer/sceneEngineRouter.ts` — Action-Beat-priorisiertes Routing, neue Tabelle oben
- `src/types/video-composer.ts` — `ComposerScene.actionBeat: { characterAction; environmentMotion }`
- `src/config/cinematicRealismPresets.ts` — neu: 3 Presets mit allen Layer-Defaults
- `src/components/video-composer/SceneCard.tsx` — Action-Beat-Editor in SceneDirectorBox, Engine-Badge mit Tooltip
- `src/components/video-composer/RealismPresetPicker.tsx` — neu, im Composer-Header
- `supabase/functions/compose-dialog-scene/index.ts` — Dialog-Wortlaut nur für Sync.so, NICHT für Hailuo-Plate
- `supabase/functions/poll-dialog-shots/index.ts` — Static-Anchor-Probe + Fallback-Guard
- Migration: neue Spalten `action_beat jsonb`, `realism_preset text` auf `composer_scenes`

**Was bleibt unverändert:**

- Bestehende Sync.so Pro / Dialog-Shot Pipeline, Webhook, 8-min Watchdog
- HeyGen Talking Head (nur Routing-Priorität sinkt)
- Render-All-and-Stitch, Director's Cut Handoff
- Credit-Refund-Automatik

---

## Erwartetes Ergebnis

- Charaktere fahren, laufen, gestikulieren in echten Umgebungen statt stoisch in die Kamera zu starren.
- Lippen bewegen sich präzise zum Voiceover — auch in Action-Szenen — weil Sync.so auf einer lebendigen Plate arbeitet.
- 3 Realismus-Presets sorgen für konsistenten Look pro Brief, ohne dass der User 20 Slots manuell setzen muss.
- Szene-3-Klasse-Bugs (starre Plate + geschlossene Münder) werden hart abgefangen statt still durchgereicht.

Soll ich loslegen?
