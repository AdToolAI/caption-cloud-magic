## Ziel — "Artlist Two-Shot Hook"

Aus der ursprünglichen 10s-Hook-Szene (Matthew + Sarah im Dialog) wird **EINE einzige 10s-Karte** im Storyboard, in der **beide Charaktere gleichzeitig im Bild** zu sehen sind und **nacheinander lippensynchron sprechen** — ohne sichtbare Cuts, ohne dass die Szene aufgesplittet wird. Maximale Charakter-Konsistenz via Continuity Guardian + Anchor-Lock.

---

## Pipeline (vollständig server-seitig)

### Phase 0 — Sofort-Bereinigung
- DB: 5 Duplikat-Zeilen aus letztem Bug löschen (Slots 6–10 des aktuellen Projekts).
- Splitten-Knopf für Multi-Speaker-Hooks **deaktivieren** (UI-Badge bleibt, aber ohne Split-Aktion). Stattdessen primärer CTA: **"Two-Shot in echte Szene einbauen"**.

### Phase 1 — Audio-Plan & Voiceover (gemeinsamer Master-Track)
1. Aus `dialog_script` + `dialog_voices` einen Master-Plan bauen:
   - Matthew 0.00 – 1.42 s ("Welcome to DroneOcular")
   - 0.20 s Pause
   - Sarah 1.62 – 4.10 s ("…")
   - Total padded auf max. 10 s (Hailuo-Limit).
2. Pro Sprecher TTS via ElevenLabs/Hume → einzelne WAVs, exakt auf die Zeitachse gemixt zu **einem** `master_voice_track.wav`.
3. Pro Speaker zusätzlich isolierte Stems speichern (`speaker1.wav`, `speaker2.wav`) — werden für Sync.so gebraucht.
4. Persist in `composer_scenes.audio_plan` (segments + master URL + per-speaker URLs).

### Phase 2 — Two-Shot-Anchor (Nano Banana 2)
1. `compose-scene-anchor` mit `portraitUrls=[matthew, sarah]` und Prompt-Hint *"Two-Shot, both characters visible, equal framing, shared lighting and location"*.
2. Ergebnis = **Anchor-Frame** (1 Bild). Im Storyboard als Vorschau-Thumbnail.
3. Anchor-URL in `lock_reference_url` schreiben → Continuity Guardian aktiviert.

### Phase 3 — Master-Clip (Hailuo i2v 10 s)
1. Hailuo i2v mit dem Two-Shot-Anchor als first frame, 10 s, gemeinsamer Prompt mit Bewegungs-Hint *"both speakers stay in frame, subtle natural body language, no cuts"*.
2. Output = **`master_clip.mp4` (10 s, beide Köpfe sichtbar, kein Lip-Sync)**.

### Phase 4 — Sequentieller Multi-Face Lip-Sync (neuer Edge-Function-Pfad)
Neue Funktion **`compose-twoshot-lipsync`** (ersetzt für Two-Shots den bisherigen `compose-lipsync-scene`-Aufruf):

```text
input: master_clip.mp4 + audio_plan.segments[]

for each segment in order:
  1. Sync.so/lipsync-2 läuft auf dem AKTUELLEN Clip
     mit nur DIESEM Speaker-Audio + Sync.so-Parameter
     "active_speaker_face_index" (Sync.so unterstützt face_index 0/1).
     Erste Iteration: face_index=0 (Matthew) mit silence-padded
       Audio (Matthew spricht 0–1.42s, Rest Stille).
     Zweite Iteration: face_index=1 (Sarah) auf das ERGEBNIS
       der ersten Iteration mit Sarah-Audio (Stille 0–1.62s,
       dann Sarah, Rest Stille).
  result = lippensynchroner Two-Shot mit beiden Sprechern
```

Der bereits durchgesynchronisierte Speaker bleibt natürlich erhalten — Sync.so überschreibt nur den jeweils adressierten Mund. Endergebnis = ein einziges 10-s-Video.

Falls Sync.so `face_index` für einen Frame nicht eindeutig auflösen kann → Fallback: **face-detection Crop → per-Face-Sync → Re-Composite** via ffmpeg in der Edge Function (Plan B, automatisch).

### Phase 5 — Audio-Mix & Persist
1. Master-Voice-Track (aus Phase 1.2) mit `clip_url` mux'en (ffmpeg in Edge), Musik-Bed bleibt unangetastet (kommt im Director's Cut dazu).
2. `composer_scenes` der Hook-Karte aktualisieren:
   - `clip_url` = finales 10s-Two-Shot-Video
   - `duration_seconds` = 10
   - `lip_sync_status` = `done`
   - `lip_sync_source_clip_url` = master_clip.mp4 (für Re-Run)
   - `cinematic_preset_slug` = `twoshot-cinematic-sync`
3. **Keine** Sub-Szenen werden angelegt. Storyboard zeigt weiterhin **eine** Hook-Karte.

### Phase 6 — Continuity Guardian
1. Nach Render: 3 Frames (0s, 5s, 9.5s) extrahieren.
2. Vergleich gegen Anchor → Drift-Score.
3. Bei Drift > Schwelle: UI-Badge "Continuity drift erkannt — Re-render?".

---

## UI-Änderungen

- **SceneCard (Hook mit ≥2 Sprechern)**:
  - Großer Primär-Button: **"Two-Shot in echte Szene einbauen (€~1.50)"**.
  - Sekundär klein: "Als Shot-Reverse-Shot splitten (Legacy)".
  - Status während Render: "Anchor → Master-Clip → Lip-Sync 1/2 → Lip-Sync 2/2 → Continuity Check".
- **Tipp-Banner** umtexten: "Multi-Charakter-Szenen werden jetzt als Two-Shot in einer einzigen 10s-Szene gerendert. Beide sprechen lippensynchron. Kein Splitten mehr nötig."

---

## Tech-Footprint

| Bereich | Datei | Änderung |
|---|---|---|
| DB | Migration | Cleanup-Funktion + Default `removeParent` Defensive |
| Edge | `compose-scene-anchor` | Two-Shot-Hint im Prompt |
| Edge | **NEU** `compose-twoshot-lipsync` | sequenzielles Sync.so + ffmpeg-Mix |
| Edge | `compose-video-clips` | Two-Shot-Routing erkennt `dialog_voices`-Count ≥ 2, ruft neue Funktion |
| Edge | `compose-lipsync-scene` | bleibt für Single-Speaker-Cinematic-Sync |
| Frontend | `SceneCard.tsx` | Neuer Primär-CTA, Splitten-Button degradiert |
| Frontend | `ClipsTab.tsx` | Multi-Stage-Status für Two-Shot |
| Frontend | `SceneDialogStudio.tsx` | Auto-Split entfernen / nur noch optional |

## Kosten pro Hook

| Step | Kosten |
|---|---|
| Nano Banana 2 Anchor | €0.03 |
| Hailuo i2v 10 s | €0.95 |
| Sync.so × 2 | €0.30 × 2 = €0.60 |
| ElevenLabs TTS × 2 | ~€0.05 |
| **Summe** | **≈ €1.65** |

---

## Risiken & Mitigation

1. **Sync.so face_index nicht zuverlässig** → Fallback Plan B (Crop/Re-Composite). Beide Pfade in `compose-twoshot-lipsync`.
2. **Hailuo zeigt nur 1 Person** trotz Two-Shot-Anchor → Anchor-Validierung mit Gemini Vision (zähle erkannte Gesichter ≥ 2, sonst Anchor-Re-Roll).
3. **Drift im Master-Clip** → Continuity Guardian rendert Re-Run Vorschlag.

## Reihenfolge der Umsetzung

1. **Bereinigung + Splitten-Disable** (sofort sichtbar, kein DB-Mess mehr).
2. **`compose-twoshot-lipsync` Edge Function** + `compose-video-clips` Routing.
3. **UI-CTA + Multi-Stage-Status**.
4. **Continuity Guardian Hook** für Two-Shot.
5. **Anchor-Validierung (Face-Count ≥ 2)** als Polish.