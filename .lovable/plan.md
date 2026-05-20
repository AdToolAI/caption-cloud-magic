## Befund

Ja, der Fehler ist noch nicht behoben. Ich habe jetzt die konkrete Kette gefunden:

1. **Der falsche Anchor kommt vom Client, nicht vom Server-Fix.**
   - Log: `compose-scene-anchor ok sceneId=scene_1779283998318_0 portraits=3`
   - Die aktuelle Szene `95200c0b-f032-4c71-bfe8-601ebd076fa4` nutzt genau diesen Anchor als `reference_image_url`.
   - Deshalb sind weiterhin **3 Personen** im Bild.

2. **Warum sendet der Client 3 Portraits?**
   - `prepareSceneAnchor()` ruft `resolveSceneCharacterAnchorsAll()` auf.
   - Diese Funktion nimmt:
     - die 2 expliziten `characterShots` Matthew + Samuel,
     - plus zusätzlich einen `brand-name-match` / `cast-name-match` aus dem Prompt, wenn der Name nochmal im Text vorkommt.
   - Dadurch kann derselbe echte Charakter nochmal als dritter Anchor-Slot dazukommen, besonders wenn Cast-ID und Brand-Character-ID unterschiedlich sind.
   - Es fehlt dort eine harte Regel: **bei Dialogszenen zählt die deduplizierte Sprecherliste, nicht Prompt-Namensmatches.**

3. **Der Server-Sicherheitsanker hätte das korrigieren sollen, konnte aber nicht.**
   - Log: `compose-video-clips ... composing multi-cast anchor (2 portraits)`
   - Direkt danach: `compose-scene-anchor failed 401 {"error":"unauthorized"}`
   - Ursache: `compose-video-clips` ruft `compose-scene-anchor` intern mit Service-Key im `Authorization` Header auf, aber `compose-scene-anchor` akzeptiert aktuell nur einen echten User-JWT via `auth.getUser()`.
   - Ergebnis: Der geprüfte 2-Personen-Anchor wird **nie** erzeugt, und Hailuo rendert weiter mit dem falschen 3-Personen-Anchor.

4. **Der Lip-Sync ist danach aus einem zweiten Grund fehlgeschlagen.**
   - Sync.so wurde mit Face-Koordinaten aus dem Anchor-Bildraum `1024x1024` gestartet.
   - Das echte Hailuo-Video ist aber `768x768`.
   - Gesendet wurde z. B. `[109,417]`; korrekt skaliert wäre ungefähr `[82,313]`.
   - Dadurch landet der Target-Punkt nicht sauber auf dem Gesicht, was zu `generation_pipeline_failed` passt.

5. **Der Prompt bleibt zusätzlich gefährlich.**
   - In der DB steht noch ein widersprüchlicher Prompt:
     - `[Dialog] ... Matthew ... Samuel ... Matthew ...`
     - `Featuring Matthew ... Samuel Dusatko ...`
   - Der Sanitizer entfernt zwar den Dialogblock und den `Featuring`-Prefix, aber nicht zuverlässig die komplette widersprüchliche `Featuring ...`-Beschreibung. Für Two-Shots sollte der visuelle Prompt deshalb neutral aus der Sprecherliste gebaut werden.

## Plan zur echten Behebung

### 1. Client darf bei Cinematic-Sync keine ungeprüften Anchors mehr einfrieren

In diesen Stellen wird die clientseitige Pre-Composition für `engineOverride === 'cinematic-sync'` deaktiviert bzw. umgestellt:

- `src/components/video-composer/SceneDialogStudio.tsx`
- `src/components/video-composer/ClipsTab.tsx`

Änderung:
- Bei Two-Shot/Cinematic-Sync wird **kein** `prepareSceneAnchor()` mehr vorab ausgeführt.
- `referenceImageUrl` wird nicht mehr mit einem clientseitigen 3-Portrait-Anchor befüllt.
- Der Server `compose-video-clips` ist allein verantwortlich für Anchor-Erzeugung, Audit und Retry.

### 2. `prepareSceneAnchor()` trotzdem robust machen

Für andere Renderpfade bleibt `prepareSceneAnchor()` nötig, wird aber gehärtet:

- Dialog-Script parsen: `Matthew, Samuel, Matthew -> Matthew, Samuel`
- Anchors nach dieser Sprecherliste filtern.
- Namen-basiert deduplizieren, nicht nur per ID.
- `activeBrandChar` nicht nochmal hinzufügen, wenn derselbe Name bereits über `characterShots` vorhanden ist.

Betroffene Dateien:

- `src/lib/motion-studio/prepareSceneAnchor.ts`
- `src/lib/motion-studio/resolveSceneCharacterAnchor.ts`

### 3. Server-interner Anchor-Aufruf mit korrekter Auth

In `compose-video-clips`:

- Interner Aufruf von `compose-scene-anchor` verwendet den echten User-Authorization-Header (`authHeader`) statt Service-Key als Bearer Token.
- Das betrifft den Cinematic-Sync-Anchor und den Universal-Anchor.

Betroffene Datei:

- `supabase/functions/compose-video-clips/index.ts`

### 4. Two-Shot-Visualprompt neutralisieren

In `compose-video-clips` und `compose-scene-anchor`:

- Wenn `dialogScript` mit 2+ eindeutigen Sprechern vorhanden ist, wird der Anchor-Prompt aus der Sprecherliste gebaut:

```text
Exactly 2 distinct people: Matthew Dusatko and Samuel Dusatko, each visible exactly once, in a modern office conversation scene. No other humans. No rendered text.
```

- Widersprüchliche `Featuring ...`-Abschnitte werden nicht mehr als Restprompt weiterverwendet.
- Cache-Version erneut erhöhen, damit alte fehlerhafte Anchors nicht recycelt werden.

Betroffene Dateien:

- `supabase/functions/compose-scene-anchor/index.ts`
- `supabase/functions/compose-video-clips/index.ts`

### 5. Anchor-Audit darf bei Extras nicht weiter rendern

Die Server-Pipeline bricht ab, wenn der Anchor nach Retry nicht exakt passt:

- Erwartet 2 Sprecher, aber 3 Menschen sichtbar -> kein Hailuo-Render
- Erwartet Matthew + Samuel, aber Matthew/Samuel doppelt/vertauscht -> kein Hailuo-Render
- Fehler wird konkret in `clip_error` geschrieben, statt später bei Lip-Sync zu scheitern.

### 6. Sync.so-Koordinaten auf echte Videoabmessungen skalieren

In `compose-twoshot-lipsync` und `poll-twoshot-lipsync`:

- `faceMap` speichert zusätzlich `normCenter`.
- Vor jedem Sync.so-Job werden Zielkoordinaten auf die tatsächliche Videoauflösung skaliert.
- Für die aktuelle Fehlerart wäre das z. B. `1024x1024 -> 768x768`.
- Falls Video-Dims nicht verfügbar sind, wird proportional aus Anchor-Dims skaliert.

Betroffene Dateien:

- `supabase/functions/compose-twoshot-lipsync/index.ts`
- `supabase/functions/poll-twoshot-lipsync/index.ts`

### 7. Betroffene Szene zurücksetzen

Für die konkrete Szene wird der alte fehlerhafte Stand entfernt:

- `reference_image_url` mit dem `scene_1779283998318_0`-3-Portrait-Anchor löschen
- `clip_url` / `lip_sync_source_clip_url` löschen
- `lip_sync_status`, `twoshot_stage`, `clip_error` zurücksetzen
- `audio_plan.twoshot.faceMap`, `syncJobs`, `heartbeat`, alte Auditdaten entfernen
- `scene_anchor_cache` für diese Szene leeren

Danach erzeugt der nächste Renderlauf einen neuen geprüften 2-Personen-Anchor.

## Erwartetes Ergebnis

- Dialogzeilen dürfen weiterhin 3 sein.
- Visuell werden aber nur **2 eindeutige Sprecher** gerendert.
- Matthew wird nicht doppelt visualisiert, nur weil er zweimal spricht.
- Samuel/Matthew werden nicht durch Prompt-Namensmischung vertauscht.
- Lip-Sync startet erst, wenn ein sauberer 2-Personen-Anchor vorhanden ist.
- Sync.so bekommt Koordinaten im richtigen Video-Koordinatensystem.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>