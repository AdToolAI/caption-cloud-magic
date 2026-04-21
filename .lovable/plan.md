
## Bugfix: KI-Bild-Szenen werden im Vollvideo als schwarze Frames behandelt

### Ursache
Der Full-Preview-Player erkennt Bildszenen aktuell fast ausschließlich über `uploadType === 'image'`.

Das ist fragil, weil bei frisch generierten KI-Bild-Szenen die lokale UI-State-Aktualisierung in `ClipsTab.tsx` nur `clipStatus` und `clipUrl` setzt — **nicht** `uploadType`. Gleichzeitig pollt `pollScenes()` nur diese Felder aus der DB:

```ts
.select('id, clip_status, clip_url, duration_seconds')
```

Dadurch entsteht dieser Zustand:
- Szene hat `clipSource: 'ai-image'`
- Szene hat `clipUrl`
- aber lokal fehlt `uploadType: 'image'`

Der Preview-Player behandelt sie dann als Video statt als Bild:
- `<img>` wird nicht gerendert
- beide `<video>`-Slots bleiben effektiv leer
- Ergebnis: schwarzes Vollvideo

### Was ich ändern würde

#### 1) Bildszenen robust erkennen — nicht nur über `uploadType`
**Datei:** `src/components/video-composer/ComposerSequencePreview.tsx`

Ein zentrales `isImageScene` ableiten, z. B. über:
- `scene.uploadType === 'image'`
- **oder** `scene.clipSource === 'ai-image'`

Dann diese Logik überall im Player verwenden:
- `currentScene`-Erkennung
- `mediaUrl`
- `preloadSlot()`
- Image/Video-Transitions
- Scrubbing
- sichtbares `<img>` vs. `<video>`

Damit funktionieren KI-Bild-Szenen auch dann korrekt, wenn `uploadType` lokal noch nicht synchronisiert wurde.

#### 2) Polling um `upload_type` erweitern
**Datei:** `src/components/video-composer/ClipsTab.tsx`

Die Poll-Abfrage erweitern auf:
```ts
.select('id, clip_status, clip_url, duration_seconds, upload_type')
```

Und beim Mergen in die lokale Scene-State auch `uploadType` aktualisieren:
```ts
uploadType: dbScene.upload_type || scene.uploadType
```

So wird die UI nach DB-Sync sauber korrigiert.

#### 3) Sofortige lokale Rückgabe für KI-Bilder vollständig übernehmen
**Datei:** `src/components/video-composer/ClipsTab.tsx`

Wenn `compose-video-clips` für `ai-image` direkt `status: 'ready'` + `clipUrl` zurückgibt, lokal zusätzlich sofort setzen:
```ts
uploadType: scene.clipSource === 'ai-image' ? 'image' : scene.uploadType
```

Dann funktioniert der Wechsel zu „Voiceover & Untertitel“ direkt ohne Reload oder Poll-Abwarten.

#### 4) Thumbnail-Komponenten gegen denselben Fehler härten
**Dateien:**
- `src/components/video-composer/SceneClipProgress.tsx`
- `src/components/video-composer/SceneCard.tsx`

Auch dort nicht nur `uploadType === 'image'` prüfen, sondern denselben robusten Bild-Check verwenden. So bleiben Clips-Ansicht und Vollvideo logisch konsistent.

### Empfohlene konkrete Logik
Einheitliche Regel:
```ts
const isImageScene = (scene: ComposerScene | undefined) =>
  !!scene && (scene.uploadType === 'image' || scene.clipSource === 'ai-image');
```

Für Bild-URLs:
```ts
const imageUrl = scene?.clipUrl || scene?.uploadUrl;
```

### Erwartetes Ergebnis nach dem Fix
- KI-Bild-Szenen werden im Full Preview als echte Bilder angezeigt
- kein schwarzer Player mehr bei `ai-image`-Storyboard-Projekten
- Verhalten funktioniert direkt nach Generierung, nicht erst nach Reload
- Clips-Tab, Scene Cards und Vollvideo behandeln Bildszenen überall gleich

### Verifikation
1. Briefing → „KI Bild-Szenen“ wählen
2. Storyboard generieren
3. Im Clips-Tab alle Bilder generieren
4. Direkt zu „Voiceover & Untertitel“ wechseln, ohne Reload
5. Full Preview muss alle Szenen als Bilder zeigen, nicht schwarz
6. Scrubbing, Play/Pause und Szenenwechsel müssen weiterhin funktionieren

### Risiko
Niedrig. Es ist eine gezielte UI-/State-Synchronisationskorrektur ohne Datenbankschema-Änderung.
