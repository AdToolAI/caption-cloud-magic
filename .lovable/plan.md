## Ziel

Der Single-Charakter-Cinematic-Sync muss wie der 2-Charakter-Flow laufen:

```text
Scene-aware Anchor → echter Master-Clip → Lip-Sync
```

Aktuell startet Lip-Sync nicht, weil vorher schon kein gültiger Master-Clip entsteht. Nach ca. 30 Sekunden bricht der Startpfad ab, bevor Provider-Generierung sichtbar beginnt.

## Befund

- Der Lip-Sync-Trigger ist absichtlich blockiert, solange `clip_url` fehlt. Das ist korrekt.
- Die betroffene Single-Charakter-Szene steht nach dem Reset auf `clip_status='pending'`, `clip_url=null`, `reference_image_url=null`, `lip_sync_status='pending'`.
- Damit kann `compose-dialog-segments` noch nicht starten, weil es zwingend eine echte Scene-Plate braucht.
- Der kritische Single-Charakter-Unterschied: Die UI überspringt bei `engineOverride='cinematic-sync'` die Client-Anchor-Vorbereitung und verlässt sich komplett auf `compose-video-clips`, dort synchron den Anchor und dann den Master-Clip zu starten. Wenn Anchor/Audio-Prep länger dauert oder Character-Mapping fehlt, sieht der Nutzer nach ca. 30s einen Abbruch ohne sichtbaren Providerstart.
- Die 2-Charakter-Pipeline darf dabei nicht gelockert werden: ihre Face-/Human-/Identity-Audits bleiben streng aktiv.

## Umsetzung

### 1. Single-Charakter als First-Class Cinematic-Sync behandeln

In `compose-video-clips` trenne ich die Logik sauber nach Sprecheranzahl:

- 1 Sprecher:
  - Szene-aware Anchor ist weiterhin Pflicht.
  - Kein Fallback auf rohen Avatar.
  - Kein Text-only Master-Clip, wenn ein Sprecherportrait erwartet wird.
  - Aber: Single-Speaker bekommt einen leichteren Anchor-Audit als 2-Speaker, damit er nicht unnötig durch die Multi-Face-Checks blockiert.
- 2+ Sprecher:
  - Bestehende Two-Shot-Audits bleiben unverändert streng.
  - Kein Verhalten wird gelockert.

### 2. Anchor-Start robuster machen

Wenn die Szene im Payload keine vollständige `characterShots`/Portrait-Info hat, löst `compose-video-clips` den Sprecher serverseitig aus dem Dialog-Slug und der Brand-Character-Library auf.

Beispiel:

```text
Samuel Dusatko: Text
→ slug samuel-dusatko
→ Brand Character Samuel Dusatko
→ reference_image_url / outfit look
→ scene-aware anchor
```

Wenn das nicht möglich ist, wird die Szene mit einem klaren Fehler gestoppt:

```text
cinematic_sync_anchor_missing_single_speaker
```

Nicht mehr: stiller Abbruch oder verschwindender Ladebalken.

### 3. Lange Startphase nicht mehr als Abbruch wirken lassen

Der Startpfad wird so gehärtet, dass die UI den Zustand sichtbar hält:

- `twoshot_stage='anchor'` während Anchor-Komposition.
- Danach `twoshot_stage='master_clip'` beim Provider-Start.
- Wenn Anchor nach Timeout nicht fertig wird, bleibt ein verständlicher Fehler in `clip_error`, statt dass die Pipeline einfach verschwindet.

### 4. Progress-Bar nur Clips + Lip-Sync für Dialog/Cinematic-Sync

Ich entferne die übrigen `voiceover:start/end` Events aus `SceneDialogStudio` für diese Dialog-Cinematic-Sync-Flows und mappe interne Audio-Vorbereitung auf Lip-Sync.

Ergebnis:

```text
Clips → Lip-Sync
```

Kein dritter sichtbarer Voiceover-Schritt für diesen Workflow.

### 5. Audio-Mux / laufende Stages sichtbar halten

Zusätzlich nehme ich die bekannten Zwischenstände in die Progress-Logik auf:

- `audio_muxing` gilt als laufender Lip-Sync-Schritt.
- `audio_mux_failed` gilt als fehlgeschlagener, retrybarer Zustand.

Das schützt besonders den 2-Charakter-Flow, weil dieser häufiger in Audio-Muxing landet.

### 6. Auto-Trigger schützt beide Flows

In `useTwoShotAutoTrigger`:

- Single- und Multi-Speaker werden beide nur gestartet, wenn `clip_url` und `audio_plan.twoshot.url` existieren.
- `audio_muxing` wird nicht fälschlich als „nichts läuft“ behandelt.
- `audio_mux_failed` kann sauber erneut angestoßen werden.
- Raw Talking-Head-URLs bleiben weiterhin hart blockiert.

### 7. Datenbereinigung der betroffenen Szene

Nach den Codeänderungen setze ich die betroffene Szene sauber auf:

```text
clip_url = null
clip_status = pending
reference_image_url = null
lip_sync_status = pending
twoshot_stage = null
stale dialog/sync fields = null
```

und lösche den Scene-Anchor-Cache für diese Szene, damit beim nächsten Start wirklich ein frischer Scene-aware Anchor gebaut wird.

## Validierung

Ich prüfe nach Umsetzung:

- Single-Charakter-Szene startet sichtbar mit Anchor/Clip und landet nicht nach 30s im Nichts.
- Lip-Sync startet erst nach echter Scene-Plate.
- Kein roher Avatar-Clip wird als Master verwendet.
- 2-Charakter-Cinematic-Sync bleibt unverändert streng: Anchor-Audit, Face-/Human-Count und Multi-Speaker-Sync bleiben aktiv.
- Progress-Bar zeigt nur Clips und Lip-Sync für diesen Workflow.