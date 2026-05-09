## Diagnose
Du hast fachlich komplett recht: Ein normaler Video-Prompt kann keinen echten Mehrsprecher-Lip-Sync garantieren. Der Provider muss pro Clip eine eindeutige Eingabe bekommen:

```text
Charakter-Portrait + exakt diese Audio-Datei + exakt diese Dauer
```

Aktuell ist zwar ein Audio-first-SRS-Pfad vorhanden, aber es gibt noch zwei gefährliche Stellen, die das Ergebnis wieder kaputtmachen können:

1. **Sub-Szenen werden als `ai-hailuo` angelegt**
   - Dadurch können sie später vom normalen Composer-Render erneut als AI-B-Roll/HeyGen-Auto-Route behandelt werden.
   - Das kann wieder Text aus dem Prompt bzw. `dialogScript` verwenden, statt die bereits erzeugte Sprecher-Audio-Datei als einzige Wahrheit zu nehmen.

2. **Die erzeugten SRS-Sub-Szenen speichern nicht hart genug ihre Audio-/Speaker-Metadaten**
   - `generate-talking-head` speichert `character_audio_url`, aber beim Anlegen der Sub-Szene fehlen noch explizite Felder wie `dialogScript`, `dialogVoices`, `engineOverride: 'heygen'`, `clipSource: 'upload'`/HeyGen-safe Routing.
   - Dadurch weiß die spätere Pipeline nicht eindeutig: „Diese Szene ist bereits ein fertiger HeyGen-Lip-Sync-Job und darf nicht neu interpretiert werden.“

## Plan

### 1. SRS-Sub-Szenen als finale Talking-Head-Szenen markieren
Beim Splitten wird jede Sub-Szene nicht mehr als normale `ai-hailuo`-B-Roll-Szene angelegt, sondern als explizite Talking-Head/Lip-Sync-Szene:

- `engineOverride: 'heygen'`
- `lipSyncWithVoiceover: true`
- `dialogScript: "Speaker: Text"`
- `dialogVoices` nur für genau diesen Speaker
- `aiPrompt` nur als lesbare Beschreibung, nicht als Timing-Quelle
- `durationSeconds` = echte TTS-Audiodauer
- `characterShots` = genau ein Charakter

### 2. Audio-URL als einzige Wahrheit erzwingen
Der SRS-Flow bleibt:

```text
Dialogblock -> Voiceover generieren -> audioUrl + duration messen -> Sub-Szene anlegen -> HeyGen mit audioUrl aufrufen
```

Wichtig: Der Talking-Head-Call bekommt **kein `text` für internes Re-TTS**, sondern ausschließlich:

```text
imageUrl: Portrait dieses Charakters
audioUrl: bereits generierte Stimme dieses Blocks
composerCharacterId: dieser Charakter
sceneId: diese Sub-Szene
```

Damit kann HeyGen nicht raten, welche Stimme oder welche Sprechdauer gemeint ist.

### 3. Composer-Render darf fertige SRS-Clips nicht neu rendern
In `compose-video-clips` wird eine Schutzregel ergänzt:

- Wenn eine Szene `cinematic_preset_slug = dialog-srs:<parentId>` hat und bereits `character_audio_url` oder `clip_status = generating/ready`, dann wird sie vom normalen AI-B-Roll-Dispatch übersprungen.
- Falls sie noch keine `clip_url` hat, bleibt sie auf `generating`, bis der HeyGen-Poller sie setzt.

So überschreibt kein späterer Composer-Render den richtigen Speaker-Clip wieder mit „erster Sprecher spricht alles“ oder mit falscher Stimme.

### 4. Reihenfolge und alte Szenen sauber halten
Der bestehende Cleanup bleibt, aber wird robuster:

- alte SRS-Sub-Szenen dieses Parent werden vor Neu-Split gelöscht
- neue Sub-Szenen werden in exakter Dialog-Reihenfolge erzeugt
- jede Sub-Szene trägt den Marker `dialog-srs:<parentSceneId>`

### 5. UI-Text ehrlicher machen
Der Split-Button/Tooltip wird klarer formuliert:

- Nicht „Prompt aktualisiert“ oder „KI weiß es aus dem Prompt“
- Sondern: „Split erzeugt pro Dialogzeile erst Audio und rendert danach je Sprecher einen eigenen Talking-Head-Clip.“

## Ergebnis
Nach der Änderung gibt es keine Interpretation über den Prompt mehr. Die KI bekommt für jeden Sprecher-Block eine feste Audio-Datei und ein festes Portrait. Timing, Stimme und Charakter sind damit 1:1 gekoppelt; Multi-Speaker funktioniert als Shot-Reverse-Shot, nicht als frei geratener Prompt-Lip-Sync.