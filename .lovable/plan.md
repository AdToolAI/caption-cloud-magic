

## Du hast recht — und ich habe noch einen echten Bug gefunden

Du hast den entscheidenden Hinweis gegeben: **„aus- und wieder einbauen"** — denn das eigentliche Problem ist, dass `audioUrl` **gecached** wird. Schau:

### Bug A — Browser-Cache am `audioUrl`

In `generate-voiceover/index.ts` Z. 132 (alte Version) wurde noch ein `?v=${Date.now()}` Cache-Buster angehängt. Das ist **immer noch da**:
```ts
const cacheBustedUrl = `${urlData.publicUrl}?v=${Date.now()}`;
```
Aber: bei `upsert: true` (Z. 113) wird **dieselbe Datei** überschrieben (`${projectId}_voiceover.mp3`). Wenn Remotion Lambda dann die URL lädt, kann es eine **gecachte alte Version** treffen — entweder vom Supabase CDN oder vom Lambda-Worker-Cache. Das erklärt warum **manche Übergänge gut und manche schlecht** sind: jeder der 3 parallelen Lambda-Worker (siehe Memory-Policy `framesPerLambda: 270, max 3 parallel`) lädt das Audio **unabhängig** — wenn einer eine alte 1.0x-Version cached und der andere die neue 1.2x-Version, hörst du an den Chunk-Grenzen Sprünge die wie „Wiederholungen" oder „Cuts" klingen.

### Bug B — `voiceover` in Closure beim Browser-Probe

In `VoiceSubtitlesTab.tsx` Z. 200-211: das `loadedmetadata`-Callback nutzt `...voiceover` aus der Closure **vom Zeitpunkt des Generate-Klicks**. Wenn der User danach Settings ändert, wird ein veralteter State zurückgeschrieben. Aber das ist nur ein Sekundär-Bug.

### Der echte Fix-Plan

**1. Echter Cache-Buster: eindeutiger Pfad pro Generierung**

In `generate-voiceover/index.ts`: statt `${projectId}_voiceover.mp3` mit `upsert: true` einen **timestamp-basierten** Pfad verwenden:
```ts
const fileName = `${projectId}_${Date.now()}_voiceover.mp3`;
// upsert: false (jede Generierung = neue Datei)
```
Damit ist jede Generierung eine **physisch neue Datei** mit eigener URL. Kein CDN-Cache, kein Lambda-Worker-Cache kann zuschlagen. Optional: alte Files für denselben `projectId`-Prefix nach erfolgreichem Upload löschen (Storage sauber halten).

**2. `?v=` Cache-Buster aus URL entfernen**

Wenn der Pfad schon eindeutig ist, ist `?v=${Date.now()}` redundant — und kann auf manchen CDNs sogar Probleme machen (Lambda-Fetcher behandelt URL mit Query-String anders als ohne). Saubere URL ohne Query-String an Remotion übergeben.

**3. Browser-Probe: aktuellen State über Funktional-Update setzen**

In `VoiceSubtitlesTab.tsx`: das `loadedmetadata`-Callback soll nicht aus der Closure lesen, sondern explizit nur `durationSeconds` und `audioUrl` setzen — alle anderen Felder werden vom aktuellen State gelesen. Da `onUpdateAssembly` nur die Top-Level keys mergt, wäre der korrekte Aufruf:
```ts
onUpdateAssembly({
  voiceover: { ...voiceover, audioUrl: data.audioUrl, durationSeconds: realDur, /* nur diese 2 */ },
});
```
Aber sauberer: `voiceover` Ref nutzen oder den onUpdate Callback so umbauen dass er funktional updated.

**4. Antwort auf deine Frage „Voiceover aus- und wieder einbauen?"**

**Ja, das hilft als Workaround** — weil dabei der Pfad gecleart wird und die nächste Generierung eine neue URL bekommt. **Aber** mit Fix 1 (eindeutiger Pfad pro Generierung) wird das überflüssig: jedes Klicken auf „Voiceover generieren" liefert sofort eine frische, ungecachte Datei.

## Geänderte Dateien

- `supabase/functions/generate-voiceover/index.ts` — eindeutiger Timestamp-Pfad + `upsert: false` + saubere URL ohne `?v=` Query
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Browser-Probe Closure-Bug fixen, optional alte VO-URL invalidieren wenn Speed/Voice geändert wird (UI-Hinweis: „Settings geändert — bitte VO neu generieren")

## Warum diesmal das echte Problem getroffen ist

Bisher haben wir an Schätzungs-Heuristiken, Fade-Math, Audio-Mixer und OffthreadVideo geschraubt. Aber **das Audio-File selbst wurde überschrieben statt neu geschrieben** → Lambda-Worker-Caches hatten an manchen Chunk-Grenzen alte Daten. Das erklärt **exakt** dein Symptom: „manche Übergänge gut, manche schlecht" — weil Chunk-Boundaries zufällig verteilt sind und nur einige Worker frische Daten ziehen.

## Verify

1. VO mit `speed=1.2` generieren → URL enthält neuen Timestamp im Pfad
2. Render → VO komplett, keine Wiederholungen, keine Cuts an irgendeinem Übergang
3. VO erneut generieren (gleicher Speed) → wieder neuer Pfad, sauberer Render
4. Speed auf 1.0 zurück → neue Datei, sauberer Render
5. Storage-Liste prüfen: alte VO-Dateien können stehen bleiben oder per Cleanup-Job gelöscht werden

