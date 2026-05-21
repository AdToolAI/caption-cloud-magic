## Status

Two-Pass Lip-Sync mit `temperature: 0.85` läuft. User-Feedback:
1. **Timing leicht versetzt** — Lip-Sync hängt minimal hinter dem Voiceover.
2. **Samuels zweite Zeile = Bauchredner** — erste Zeile gut, zweite Zeile kaum Mundöffnung.
3. **Vergleich Artlist** — warum so viel sauberer?

## Warum Artlist sauberer wirkt

Artlist/HeyGen/Hedra arbeiten NICHT mit einem statischen Hailuo-Plate + Sync.so-Overlay. Sie nutzen entweder:
- **Face-Crop-Lipsync**: Speaker-Gesicht wird gecroppt, isoliert animiert (höhere Pixel-Dichte = mehr Mundauflösung), zurückgepastet.
- **Viseme-driven Rigs**: 3D-Rig pro Sprecher mit echten Mund-Visemes statt Diffusion-Inpaint.
- **Single-Face Pro-Modelle**: jeder Sprecher kommt aus einem Solo-Plate, dann werden beide nebeneinander komponiert — kein Two-Pass-Overlay nötig.

Wir machen Full-Frame Two-Pass auf einem 1080p-Plate, in dem Samuels Gesicht ~25% der Höhe einnimmt → wenig Pixel pro Mund → Sync.so muss interpolieren → bei kurzen 2. Turns reicht das VAD-Signal nicht für volle Artikulation.

## Wahrscheinliche Ursachen für die zwei Probleme

**A) Bauchreden in Samuels 2. Zeile**
Drei plausible Faktoren:
1. **Pass 2 (Matthew) re-encodiert das gesamte Video** — auch Frames außerhalb seiner `segments_secs`. Pass-1-Artikulation auf Samuels 2. Turn wird durch eine zweite Generation leicht weichgezeichnet/verwaschen.
2. **Sync.so VAD braucht Pre-Roll**: Ein kurzer 2. Turn (z.B. 0.6s) startet mitten in einer Phrase. Ohne ~80–150ms Vorlauf-Frames im `segments_secs`-Fenster fehlt der Engine der Onset-Kontext, sie öffnet den Mund kaum.
3. **Temperature 0.85 ist global** — für lange 1. Turns ok, für kurze 2. Turns zu defensiv.

**B) Timing-Versatz**
- `voicedRange.turns[].startSec` ist sample-exakt am TTS-Onset.
- `segments_secs` an Sync.so läuft auf Video-Frame-Grid (24/25/30 fps) → wird auf nächste Frame-Boundary gerundet. Bei 30 fps kann das ±33ms Drift erzeugen — genau das was als „leicht versetzt" auffällt.
- Zusätzlich: Hailuo-Master-Clip-Realdauer (siehe `probeMp4Duration`) weicht oft von der Soll-Dauer ab → Audio läuft korrekt, Video wird minimal gestreckt/komprimiert.

## Vorschlag (gestufter Fix, kein "alles auf einmal")

### Schritt 1 — Per-Turn Pre-Roll Window (löst sowohl Bauchreden 2. Turn als auch Timing)

In `compose-twoshot-lipsync` und `poll-twoshot-lipsync` die `segments_secs`-Fenster pro Turn um **−0.12s Lead-in / +0.08s Tail** erweitern, geclamped auf [0, sceneDur] und ohne Overlap zwischen Sprechern (bei Konflikt mittig splitten).

- Sync.so bekommt Pre-Roll-Frames vor dem TTS-Onset → VAD lockt sauber an die erste Silbe → keine "halb-geschlossenen" 2. Turns.
- Tail-Padding fängt das Frame-Rounding ab → kein wahrnehmbarer Versatz mehr.
- Audio selbst wird NICHT gepaddet — nur das Video-Window (löst nicht das alte `pad=0.25`-Problem, das hat den Audio-Onset verschoben).

### Schritt 2 — Adaptive Temperature pro Turn

Statt globaler 0.85: turn-individuell.
- Lange Turns (≥2.0s): `0.85` (status quo, kein Jitter).
- Kurze Turns (<2.0s): `1.0` (maximale Artikulation, kompensiert kurzes VAD-Fenster).

Implementierung: `startSyncJob` akzeptiert ein Array von Temperaturen analog zu `segmentSecs` ist Overkill — stattdessen pro **Pass** eine Temperatur basierend auf der kürzesten Turn-Dauer des Sprechers.

### Schritt 3 — Validierung

- Szene `70a34582-178c-4ed9-a357-5f4725e7902a` reset auf `master_clip`, neu rendern.
- Diag-Log prüfen: `windows=[[a,b],[c,d]] tempPass1=… tempPass2=…`.
- Erwartet: beide Samuel-Turns gleichmäßig artikuliert, Lippen synchron zum Voiceover ohne wahrnehmbaren Versatz.

### Bewusst NICHT in diesem Schritt

- **Face-Crop-Lipsync** (echter Artlist-Ansatz) wäre die Königslösung, aber das ist ein eigenständiges Architektur-Projekt (Solo-Plate pro Sprecher + serverseitiges Compositing). Nur ansprechen wenn Schritt 1+2 nicht reicht.
- **`pads`/`inference_steps`** anfassen — erst wenn Pre-Roll alleine nicht reicht.

## Geänderte Dateien

- `supabase/functions/compose-twoshot-lipsync/index.ts` — Pre-Roll-Helper + adaptive temperature für Pass 1.
- `supabase/functions/poll-twoshot-lipsync/index.ts` — gleiche Logik für Pass 2 und Retries.
- `mem/architecture/lipsync/sync-so-pro-model-policy` — Pre-Roll-Regel und adaptive Temperature dokumentieren.
- Migration: Test-Szene reset.

## Frage an dich

Soll ich Schritt 1 (Pre-Roll) UND Schritt 2 (adaptive Temperature) gemeinsam umsetzen, oder zuerst nur Schritt 1 isolieren, damit wir wissen welcher Hebel was bewirkt?