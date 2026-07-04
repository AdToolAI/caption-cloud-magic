## Befund

Der Button **„Lipsync komplett zurücksetzen"** hat aktuell zwei Probleme:

1. Er löscht zu viel Szenen-Rendering-State (`clip_url`, `clip_status`, `reference_image_url`), dadurch wirkt die Szene/Preview gelöscht.
2. Er löscht nicht sauber die Lip-Sync-Absicht. `engine_override='cinematic-sync'` und/oder `lip_sync_with_voiceover=true` bleiben aktiv. Der globale Auto-Trigger (`useTwoShotAutoTrigger`) erkennt die Szene deshalb wenige Sekunden später wieder als gültigen Lip-Sync-Kandidaten und startet Sync.so erneut.

## Ziel

Der rote Button bedeutet künftig: **Lip-Sync stoppen und für diese Szene deaktivieren**, ohne das Basis-Video der Szene zu löschen.

## Umsetzung

### 1. Button-Handler in `SceneCard.tsx` korrigieren

Beim Klick auf **„Lipsync komplett zurücksetzen"**:

- `cancel-dialog-lipsync` weiter aufrufen, damit laufende Sync.so-Jobs serverseitig beendet werden.
- Danach DB-Update nur auf Lip-Sync- und Opt-out-Felder anwenden:

```ts
{
  lip_sync_status: 'canceled',
  lip_sync_applied_at: null,
  lip_sync_source_clip_url: null,
  twoshot_stage: null,
  dialog_shots: null,
  lip_sync_with_voiceover: false,
  dialog_mode: false,
  engine_override: 'auto',
  updated_at: now,
}
```

Wichtig: Diese Felder werden **nicht mehr** gelöscht/geändert:

```ts
clip_url
clip_status
clip_error
reference_image_url
replicate_prediction_id
```

Damit bleibt das gerenderte Basis-Video sichtbar.

### 2. Lokalen UI-State analog aktualisieren

Das `onUpdate(...)` nach dem DB-Update wird ebenfalls nur auf Lip-Sync/Opt-out-Felder reduziert:

```ts
{
  lipSyncStatus: 'canceled',
  lipSyncAppliedAt: null,
  lipSyncSourceClipUrl: null,
  twoshotStage: null,
  dialogShots: null,
  lipSyncWithVoiceover: false,
  dialogMode: false,
  engineOverride: 'auto',
}
```

`clipUrl`, `clipStatus`, `referenceImageUrl` bleiben unverändert.

### 3. Texte anpassen

Der Confirm-Dialog wird eindeutig:

„Lip-Sync für diese Szene wirklich stoppen und deaktivieren? Laufende Sync.so-Jobs werden abgebrochen und Dialog-Shots geleert. Das gerenderte Basis-Video bleibt erhalten."

Der Toast wird eindeutig:

- Titel: `Lip-Sync gestoppt`
- Beschreibung: `Sync.so wurde abgebrochen und Lip-Sync für diese Szene deaktiviert. Das Basis-Video bleibt erhalten.`

### 4. Kein Server-Refactor nötig

`cancel-dialog-lipsync` ist als Cancel-Endpunkt schon passend: Es setzt `lip_sync_status='canceled'`. Der Fehler liegt im nachfolgenden Client-Update, das Status/Opt-in wieder so setzt, dass der Auto-Trigger erneut losläuft.

`reset-lipsync-scene` bleibt unverändert, weil der separate Button **„Lip-Sync neu rendern"** genau für einen expliziten Neustart gedacht ist.

## Erwartetes Verhalten nach Fix

- Klick auf roten Button stoppt laufenden Lip-Sync.
- Die Szene bleibt mit ihrem Basis-Clip sichtbar.
- Der globale Auto-Trigger startet Sync.so nicht erneut, weil `lip_sync_with_voiceover=false`, `dialog_mode=false` und `engine_override='auto'` gesetzt sind.
- Nur ein expliziter Klick auf **„Lip-Sync neu rendern"** oder erneutes Aktivieren der Lip-Sync-Option startet wieder Kosten/Sync.so.