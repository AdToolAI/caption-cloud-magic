## Problem kurz gesagt

Du hast recht: Ein einzelner Charakter sollte einfacher sein. Im aktuellen Code ist er aber schwieriger gemacht worden, weil der Single-Charakter-Cinematic-Sync in denselben schweren Vorbereitungsblock wie Multi-Character gedrückt wurde:

```text
Klick → compose-video-clips wartet auf Anchor/Audit/Audio-Prep → Provider-Dispatch → Webhook → Lip-Sync
```

Wenn Anchor/Audio-Prep dabei vorher blockiert oder in den Edge-Function-Timeout läuft, kommt es genau zu deinem Verhalten: kein sichtbarer Providerstart, Ladebalken verschwindet, Lip-Sync startet nie.

Aus den aktuellen Signalen:
- Lovable Cloud ist gesund.
- In den letzten Logs ist kein sichtbarer `compose-video-clips`/`compose-scene-anchor`/`compose-dialog-segments` Aufruf angekommen.
- Die betroffene Single-Szene steht weiter auf `clip_status='pending'`, `clip_url=null`, `lip_sync_status='pending'`.
- Die Szene im Screenshot ist tatsächlich ein Single-Speaker-Dialog, aber mit `clipSource='ai-happyhorse'` und `engine_override='cinematic-sync'`.
- Der derzeitige Code bricht HappyHorse+Cinematic-Sync hart ab, wenn vorher kein `reference_image_url` erzeugt wurde. Genau dieser Anchor wird aber im gleichen synchronen Startpfad erzeugt. Das ist die Sackgasse.

## Plan

### 1. Single-Speaker-Cinematic-Sync als eigenen, schlanken Startpfad behandeln

In `compose-video-clips` trenne ich endgültig:

```text
1 Sprecher:
  Anchor komponieren, aber kein Multi-Face/Identity-Audit-Overkill
  Master-Clip sofort dispatchen
  Lip-Sync danach über bestehenden v5 Trigger

2+ Sprecher:
  bestehende strenge Two-Shot-Pipeline bleibt unverändert
  Face/Human/Identity-Audits bleiben aktiv
```

Das schützt die 2-Charakter-Pipeline und macht den 1-Charakter-Pfad deutlich robuster.

### 2. Kein synchroner 30s-Abbruch mehr beim Start

Der Single-Speaker-Pfad wird so umgebaut, dass die Szene sofort sichtbar in Arbeit geht:

```text
twoshot_stage = 'anchor'
clip_status = 'generating'
```

Wenn Anchor-Komposition klappt:

```text
reference_image_url = composed anchor
Provider startet
replicate_prediction_id wird gesetzt
```

Wenn Anchor nicht klappt:

```text
clip_status = failed
clip_error = klarer Grund
```

Nicht mehr: stiller Rückfall auf `pending` oder verschwundener Balken.

### 3. HappyHorse bei Single-Cinematic-Sync nicht mehr in die Anchor-Sackgasse laufen lassen

Für Single-Speaker gilt künftig:
- Wenn HappyHorse + Cinematic-Sync ohne Anchor startet, wird es nicht hart vor dem Provider blockiert.
- Entweder wird zuerst ein schlanker Single-Anchor erzeugt und dann HappyHorse genutzt,
- oder bei Anchor-Timeout wird kontrolliert auf Hailuo als Master-Clip-Fallback gewechselt, weil Hailuo für Cinematic-Sync bereits stabiler verdrahtet ist.

Für 2+ Sprecher bleibt die bestehende Regel bestehen: HappyHorse wird weiterhin auf Hailuo migriert, weil Multi-Cast-Identity-Drift zu riskant ist.

### 4. Storyboard-Button robust machen

`useSceneGenerate` und `useGenerateAllClips` sollen Single-Cinematic-Sync-Szenen vollständig und eindeutig an das Backend senden:

- `audioPlan`, `dialogScript`, `dialogVoices`, `characterShot(s)` bleiben erhalten.
- Bei Single-Speaker wird der gleiche Generate-Start ausgelöst wie bei allen anderen Clips.
- Der lokale Optimistic State wird nicht nach kurzer Zeit zurück auf wartend gekippt, solange Backend-Stages laufen.

### 5. Voiceover-Schritt für diesen Workflow verstecken

In der Progress-Logik wird Dialog/Cinematic-Sync weiter als:

```text
Clips → Lip-Sync
```

geführt. Interne Audio-Vorbereitung bleibt technisch nötig, erscheint aber nicht als dritter sichtbarer „Voiceover“-Button/Schritt.

### 6. Daten der betroffenen Szene sauber zurücksetzen

Nach Codeänderung setze ich die betroffenen Szenen erneut auf einen wirklich frischen Zustand:

```text
clip_url = null
clip_status = pending
reference_image_url = null
lip_sync_status = pending
twoshot_stage = null
replicate_prediction_id = null
dialog_shots = null
clip_error = null
```

und lösche den Anchor-Cache für diese Szenen.

### 7. Deployment und Prüfung

Ich deploye die betroffenen Backend-Funktionen und prüfe danach:

- Single-Charakter-Szene geht direkt sichtbar auf `anchor/generating`.
- Provider-Job-ID wird gesetzt.
- Nach Master-Clip wird `compose-twoshot-audio`/`compose-dialog-segments` gestartet.
- 2-Charakter-Szenen behalten den bestehenden strengen Two-Shot-Schutz.

## Dateien

- `supabase/functions/compose-video-clips/index.ts`
- `src/hooks/useSceneGenerate.ts`
- `src/hooks/useGenerateAllClips.ts`
- `src/hooks/usePipelineProgress.ts` falls nötig nur zur Anzeige-Korrektur
- Datenreset für die betroffenen `composer_scenes` Rows

## Wichtig

Ich werde nicht wieder versuchen, Single-Speaker durch die komplette Multi-Speaker-Audit-Logik zu pressen. Genau das ist der Grund, warum sich dieser eigentlich einfache Fall so fragil verhält.