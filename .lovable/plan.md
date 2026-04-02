

## Feature: Original-Untertitel automatisch erkennen

### Idee

Beim Laden des Videos im Audio Studio (Schritt 9) soll die KI automatisch die Originalsprache aus dem Video transkribieren — genau wie der "Original Audio"-Clip automatisch erscheint. Diese Original-Untertitel sind löschbar und ersetzbar, analog zur Originalmusik.

### Wie es funktioniert

1. Wenn der CapCutEditor initialisiert wird und noch keine Untertitel existieren, wird automatisch die `generate-subtitles` Edge Function mit der **Video-URL** (= Originalaudio) aufgerufen
2. Die erkannten Untertitel werden als `SubtitleClip[]` in den `subtitleTrack` geladen und mit `source: 'original'` markiert
3. Ein Banner/Badge zeigt "Original-Untertitel erkannt" an
4. Nutzer kann diese mit einem Klick löschen ("Original-Untertitel entfernen") oder durch KI-generierte ersetzen

### Umsetzung

**1. `src/components/directors-cut/studio/CapCutEditor.tsx`**
- Neuer `useEffect`: Wenn `subtitleTrack.clips.length === 0` und `videoUrl` vorhanden, automatisch `generate-subtitles` mit `videoUrl` aufrufen
- Erkannte Untertitel als Clips mit einem Flag (`source: 'original'` o.ä.) in den Track laden
- Loading-State für "Originaluntertitel werden erkannt..."

**2. `src/types/timeline.ts`**
- `SubtitleClip` um optionales `source?: 'original' | 'ai-generated' | 'manual'` erweitern

**3. `src/components/directors-cut/studio/CapCutSidebar.tsx`**
- Im Untertitel-Tab: Info-Banner wenn Original-Untertitel vorhanden ("🎬 Original-Untertitel erkannt")
- Button "Original-Untertitel entfernen" → löscht alle Clips mit `source: 'original'`
- "Neu generieren" ersetzt die Original-Untertitel durch KI-Transkription vom Voiceover (bestehendes Verhalten)

### Betroffene Dateien

1. `src/types/timeline.ts` — `source` Feld zu `SubtitleClip` hinzufügen
2. `src/components/directors-cut/studio/CapCutEditor.tsx` — Auto-Erkennung beim Init
3. `src/components/directors-cut/studio/CapCutSidebar.tsx` — UI für Original-Untertitel verwalten

