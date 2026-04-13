

## Plan: Untertitel-Daten für den Export bereinigen

### Problem
Die Untertitel sind in der Studio-Vorschau sichtbar, fehlen aber im exportierten Video. Die Ursache: Der Editor sendet das gesamte `subtitleTrack`-Objekt mit zusätzlichen Feldern (`style`, `source`, `maxLines`, `textStroke*`, `color`, `icon`), die nicht im Remotion Zod-Schema definiert sind. Je nach Remotion-Version kann die Schema-Validierung fehlschlagen und `subtitleTrack` komplett verwerfen, statt nur die unbekannten Felder zu entfernen.

### Fix
Die Untertitel-Daten beim Export auf genau die Felder reduzieren, die das Remotion-Schema erwartet.

**Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`** (Export-Body, ca. Zeile 1136)

Statt:
```ts
subtitle_track: showSubtitles ? subtitleTrack : undefined,
```

Sanitized Version:
```ts
subtitle_track: showSubtitles && subtitleTrack.clips.length > 0 ? {
  id: subtitleTrack.id,
  name: subtitleTrack.name,
  clips: subtitleTrack.clips
    .filter(c => c.text?.trim())
    .map(c => ({
      id: c.id,
      startTime: c.startTime,
      endTime: c.endTime,
      text: c.text,
      position: c.position,
      fontSize: c.fontSize,
      color: c.color,
      backgroundColor: c.backgroundColor,
      fontFamily: c.fontFamily,
    })),
  visible: subtitleTrack.visible,
} : undefined,
```

Das stellt sicher:
- Nur Schema-konforme Felder werden gesendet
- Leere Clips (ohne Text) werden herausgefiltert
- Keine Untertitel gesendet wenn keine Clips vorhanden

### Betroffene Dateien
- **Edit:** `src/components/directors-cut/studio/CapCutEditor.tsx` — Export-Body sanitizen

