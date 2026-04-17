

## Befund

Der User hat absolut recht — die Text-Overlay-Szenen (wie "Revolutioniere dein Marketing mit KI." mit Position "Top") sollten **nicht** als separate Storyboard-Szenen existieren. 

**Logischer Workflow laut User:**
1. **Storyboard:** Nur reine Video-Szenen (KI-generiert oder Stock) — **kein** Text, **keine** Titelkarten
2. **Voiceover & Untertitel-Tab:** Hier werden später Texte/Untertitel/Overlays hinzugefügt — als **globale Overlays** über den fertigen Clips

Aktuell mischt der Composer beides im Storyboard, was verwirrt und die Trennung „erst Bild generieren, dann Text drüberlegen" aufweicht.

## Plan

### 1. Text-Szenen aus dem Storyboard entfernen

In `StoryboardTab.tsx`:
- Den `+ Text/Titel`-Button (oder ähnlichen Trigger zum Anlegen von `sceneType === 'text'` / `clipSource === 'text'`) **entfernen**
- Beim Hinzufügen neuer Szenen wird **nur noch** zwischen KI/Stock/Upload gewählt — keine reinen Textkarten mehr
- Bestehende Text-Szenen werden in der Liste **automatisch ausgeblendet** (mit einmaligem Hinweis-Toast: „Text-Overlays wurden in den Voiceover & Untertitel-Tab verschoben")

### 2. SceneCard `T`-Variante entfernen

In `SceneCard.tsx`:
- Den Render-Zweig für Text-Only-Szenen (gold "T"-Icon + Text-Vorschau + `Top/Mitte/Unten`-Badge) entfernen
- SceneCard rendert nur noch echte Video-Clip-Karten

### 3. Migration bestehender Text-Szenen → globale Overlays

Beim Laden eines Projekts in `VideoComposerPage.tsx` (oder `useComposerProject`-Hook):
- Alle `composer_scenes` mit `clipSource === 'text'` (oder `sceneType === 'text'`) **automatisch** in `composer_global_overlays` migrieren:
  - `text` ← `scene.textOverlay.text`
  - `position` ← Mapping `top/center/bottom` aus `scene.textOverlay.position`
  - `startTime` ← berechnete Position basierend auf `orderIndex` der vorherigen Szenen
  - `endTime` ← `startTime + scene.durationSeconds`
- Anschließend die Text-Szenen aus `composer_scenes` löschen (oder auf `archived` setzen)
- Migration läuft **idempotent** und nur einmal pro Projekt (Flag in `composer_projects.metadata.text_scenes_migrated`)

### 4. Voiceover/Untertitel-Tab als klaren Ort für Texte etablieren

Im entsprechenden Tab (`VoiceoverTab.tsx` o. ä.) — falls noch nicht vorhanden:
- Sektion „Text-Overlays" hinzufügen (oder hervorheben), in der globale Texte mit Start-/End-Zeit, Position, Animation und Style verwaltet werden
- Das nutzt bereits den bestehenden `PreviewTextOverlayLayer`-Renderer

(Falls die Sektion schon existiert: nur Migration + Storyboard-Cleanup nötig.)

### 5. Klärungsfrage zur Storyboard-Architektur

Nur noch unklar: Soll der „+ Szene"-Button im Storyboard künftig direkt eine **KI-Video-Szene** anlegen, oder weiterhin einen Auswahl-Dialog (KI / Stock / Upload) öffnen? Aktuell nehme ich an: bestehender Auswahl-Flow bleibt, nur die Text-Option entfällt.

## Geänderte Dateien

- `src/components/video-composer/StoryboardTab.tsx` — Text-Szenen-Anlage entfernen, Filterung beim Rendern
- `src/components/video-composer/SceneCard.tsx` — Text-Only-Render-Zweig entfernen
- `src/pages/VideoComposerPage.tsx` (oder `src/hooks/useComposerProject.ts`) — einmalige Migration `text-scenes → global_overlays`
- *(optional, falls fehlend)* `src/components/video-composer/VoiceoverTab.tsx` — Text-Overlay-Sektion sichtbarer machen

## Verify

- Im Storyboard-Tab gibt es **keinen** Button mehr, der eine reine Text-Szene anlegt
- Bestehende Text-Szenen erscheinen nicht mehr als Karten — stattdessen tauchen sie als Overlays im Voiceover & Untertitel-Tab auf
- KI-Generierung im Clips-Tab betrifft nur noch echte Video-Szenen → keine „Top"-Position-Tokens mehr in Prompts
- Vorschau zeigt Texte korrekt zur richtigen Zeit über den Clips (via bestehendem `PreviewTextOverlayLayer`)
- Reload / erneutes Öffnen des Projekts: Migration läuft nicht doppelt

