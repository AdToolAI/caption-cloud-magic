## Befund

Die v169-Pipeline selbst wurde bei deiner aktuellen Szene **nicht einmal gestartet**.

Live-Daten zur aktuellen S01:

- `clip_source = ai-happyhorse`
- `duration_seconds = 5`
- `engine_override = auto`
- `clip_status = ready`
- `clip_url = .../talking-head-renders/...mp4`
- `dialog_shots = null`
- `lip_sync_status = null`
- `twoshot_stage = null`
- `syncso_dispatch_log` für diese Szenen: leer

Das heißt: Der normale „Generieren“-Button hat die Szene wegen `engine_override = auto` und Dialogtext in den alten **HeyGen/Talking-Head-Pfad** geroutet. Dadurch entsteht kein HappyHorse/Hailuo-Master-Plate, keine `dialog_shots`, kein `compose-dialog-segments`, kein Sync.so-Fanout. Für dich sieht das dann aus wie: Szene bleibt schwarz, später läuft/erwartet die Lip-Sync-UI etwas, aber es gibt keine echte v169-Plate-Pipeline darunter.

Zusätzlich habe ich im Source eine v169-Invariante gefunden, die aktuell nicht mehr sauber eingehalten wird:

- `supabase/functions/_shared/asd-strategy.ts` nutzt für Preclips aktuell wieder `auto_detect: true` als Primary Rule, auch bei Multi-Speaker-Preclips. Das widerspricht deiner v169-Regel „N>=2 niemals auto_detect:true“. Das ist nicht die Ursache für die aktuelle Single-Speaker-S01, aber es ist ein Risiko für genau die „falscher Sprecher / schwarzer Lip-Sync / infinite loading“-Fälle bei Multi-Speaker.

## Ziel

Wenn im Composer „Action + Lip-Sync“, „Dialog & Lip-Sync“ oder Voiceover-LipSync aktiv ist, muss **immer** diese Route gelten:

```text
HappyHorse/Hailuo Master Plate
→ dialog_shots Skeleton
→ compose-dialog-segments v169
→ Sync.so Pass(es)
→ finalize-dialog-scene
→ finaler clip_url
```

Der alte Talking-Head/HeyGen-Pfad darf für diese Szenen nicht mehr greifen.

## Umsetzung

### 1. Normalen Generieren-Button hart auf Cinematic-Sync routen

**Datei:** `src/hooks/useSceneGenerate.ts`

Vor dem Invoke von `compose-video-clips` wird der Engine-Wert normalisiert:

- Wenn `workingScene.lipSyncWithVoiceover === true`
- oder `workingScene.dialogMode === true`
- oder Dialogtext + Cast + „Action + Lip-Sync“ aktiv ist

Dann wird an `compose-video-clips` gesendet:

```ts
engineOverride: 'cinematic-sync'
withAudio: true
```

und nicht mehr `engineOverride: workingScene.engineOverride ?? 'auto'`.

Außerdem wird vor dem Invoke in der DB direkt gesetzt:

```ts
clip_status: 'generating'
clip_error: null
engine_override: 'cinematic-sync'
lip_sync_with_voiceover: true
lip_sync_status: 'pending'
twoshot_stage: 'audio'
dialog_shots: null
lip_sync_source_clip_url: null
```

Damit kann Realtime den lokalen State nicht wieder auf `auto` / „Wartet“ zurückdrehen.

### 2. HeyGen/Talking-Head darf Lip-Sync-Szenen nicht mehr abfangen

**Datei:** `supabase/functions/compose-video-clips/index.ts`

Im HeyGen-Routing-Block wird die Bedingung verschärft.

Aktuell reicht bei `engineOverride === 'auto'` schon:

```ts
hasDialog && primaryShot && dialogSpeakers <= 1
```

Das ist die Ursache.

Neu:

- HeyGen nur noch, wenn explizit `engineOverride === 'heygen'`
- oder wenn es wirklich kein Composer-LipSync/Dialog-Mode ist
- sobald `lip_sync_with_voiceover`, `dialogMode`, `cinematic-sync` oder ein `dialogScript` aus dem Composer-Scene-Flow vorliegt, wird HeyGen übersprungen und der AI-Provider-Pfad baut die Master-Plate.

Zusätzlich: Für `engineOverride === 'cinematic-sync'` wird vor Provider-Dispatch immer gesetzt:

```ts
lip_sync_status: 'pending'
twoshot_stage: 'master_clip'
dialog_shots: null
lip_sync_source_clip_url: null
```

### 3. Payload für `compose-video-clips` vollständig machen

**Datei:** `src/hooks/useSceneGenerate.ts`

Die Payload enthält aktuell nicht alle Routing-Signale. Ergänzen:

```ts
lipSyncWithVoiceover: workingScene.lipSyncWithVoiceover
// falls ClipScene-Type erweitert werden muss: type ergänzen
```

Falls `ClipScene` serverseitig dieses Feld noch nicht kennt, wird es im Interface ergänzt und in der Routing-Logik genutzt.

### 4. v169 ASD-Invariante wiederherstellen

**Datei:** `supabase/functions/_shared/asd-strategy.ts`

Die Rule 0 „Preclip → auto_detect PRIMARY“ wird so geändert:

- `auto_detect:true` bleibt nur für echte Single-Speaker-Fälle erlaubt.
- Für `isMultiSpeaker === true` wird niemals `auto_detect:true` zurückgegeben.
- Multi-Speaker nutzt stattdessen:
  - `bounding_boxes_url`, wenn vorhanden
  - sonst `frame_number + coordinates`
  - wenn beides fehlt: kontrollierter Preflight-Fail statt Provider-Blackbox-Fehler

Damit gilt wieder:

```text
N>=2 speakers → deterministic ASD only
N=1 speaker → auto_detect allowed as fallback
```

### 5. Progress-State stabil halten

**Datei:** `src/hooks/usePipelineProgress.ts`

Eine Cinematic-Sync-Szene mit `clipStatus='generating'` zählt immer als aktiver Backend-Nachweis, auch wenn `twoshotStage` kurzzeitig noch fehlt.

Das verhindert, dass der Ladebalken nach 60–90 Sekunden verschwindet, obwohl Backend-Render/Provider noch arbeitet.

### 6. UI-Karten-Status klarer machen

**Datei:** `src/components/video-composer/SceneClipProgress.tsx` oder SceneCard-Statusbereich

Wenn `clip_url` aus `talking-head-renders` kommt, aber die Szene als Composer-LipSync/Cinematic-Sync markiert ist, wird das nicht still als fertige Szene akzeptiert. Stattdessen:

- Status „Falscher Renderpfad erkannt“
- Button „Sauber neu starten“
- Reset entfernt Talking-Head-URL und startet die Cinematic-Sync-Pipeline neu

Das verhindert, dass ein falscher alter Render als „ready“ angezeigt wird.

## Nicht ändern

- Kein Umbau der gesamten v169-Pipeline.
- Keine Migration, außer falls das Interface-Feld typisiert werden muss.
- Kein Credit-System-Umbau.
- Keine Änderungen an HappyHorse/Hailuo Provider-Auswahl.

## Verifikation

Nach Umsetzung:

1. Neue S01 mit `5s happyhorse` und Lip-Sync generieren.
2. Direkt nach Klick muss DB zeigen:
   - `engine_override = cinematic-sync`
   - `clip_status = generating`
   - `twoshot_stage = audio` oder `master_clip`
   - `lip_sync_status = pending`
3. `clip_url` darf nicht mehr aus `talking-head-renders` kommen.
4. `dialog_shots` wird erzeugt.
5. `syncso_dispatch_log` bekommt mindestens einen Dispatch-Eintrag.
6. Für Multi-Speaker darf kein Dispatch `auto_detect:true` enthalten.
7. Der Clip-Preview bleibt nicht schwarz/infinite, sondern zeigt klar Master-Plate → LipSync → final ready oder einen echten Fehler mit Reset.