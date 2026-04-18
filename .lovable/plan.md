

## Befund — Warum das Voiceover beim ersten Übergang abgeschnitten wird

In `src/remotion/templates/ComposedAdVideo.tsx` Z. 261–283 berechnen wir die **Gesamt-`durationInFrames`** im Render mit Crossfade-Überlappung — **jede** Transition kürzt die Timeline um `transitionFrames`. Bei 7 Szenen mit je 0.4s fade entfallen 6 × 0.4s = **2.4 Sekunden** an Gesamtlaufzeit.

Das Voiceover wird dann ab Frame 0 abgespielt:
```tsx
<Sequence from={0}>
  <Audio src={voiceoverUrl} volume={1} pauseWhenBuffering />
</Sequence>
```

Das Voiceover ist aber für die **ungekürzte** Zeitachse generiert worden (Summe der Szenen-Dauern OHNE Überlappung). Ergebnis:
- Das Voiceover ist 2.4s **länger** als die Komposition
- Remotion **schneidet das Audio am Ende der Komposition hart ab** → der letzte VO-Satz wird gekappt
- Während des **ersten Crossfades** bei ~5s kollabiert die Timeline um 0.4s → das VO „springt" relativ zur Bildebene → klingt wie abgeschnitten

Genauer: Beim ersten Übergang läuft das Audio linear weiter, während die Bilder durch die Überlappung „komprimiert" sind → die Lippen-Synchronität & der Rhythmus reißen ab und dem Nutzer fällt es als „Cut-Off" beim ersten Übergang auf.

Das Voiceover-Asset wurde basierend auf der **alten** Gesamtdauer (Summe ohne Crossfade-Verkürzung) generiert. Das Audio ist also korrekt — aber unsere Komposition ist jetzt kürzer als das Audio.

## Plan — Audio-Timeline an die echte Komposition anpassen

### Fix 1 — `compose-video-assemble`: Voiceover-Sync respektieren
In `compose-video-assemble/index.ts` zwei Strategien kombinieren:

**A) Komposition lang genug halten, damit das VO komplett spielt**

Wir berechnen zusätzlich die **VO-Dauer** (aus `assemblyConfig.voiceover.durationSeconds`, falls verfügbar) und nehmen das **Maximum** aus Video-Total und VO-Total für `durationInFrames`. So wird das Voiceover NIE abgeschnitten, auch wenn die Crossfade-Überlappung die Bildspur verkürzt:

```ts
const voDurationSeconds = Number(assemblyConfig.voiceover?.durationSeconds) || 0;
const voFrames = Math.ceil(voDurationSeconds * fps);
const finalDurationInFrames = Math.max(durationInFrames, voFrames);
```

**B) Letzte Szene leicht verlängern statt abzuschneiden**

Falls das VO länger als die Bildspur ist, halten wir den letzten Frame der letzten Szene per `Sequence.durationInFrames`-Padding bis zum VO-Ende. Das vermeidet ein Schwarzbild am Ende.

### Fix 2 — `ComposedAdVideo.tsx`: Voiceover gegen Cut-Off absichern
Im Audio-Element pausieren wir nicht beim Buffering (das verursacht zusätzliche Drift) und stellen sicher, dass das VO über die volle Komposition spielt:

```tsx
{voEnabled && (
  <Audio 
    src={voiceoverUrl as string} 
    volume={1} 
    pauseWhenBuffering={false}  // ← keine Pausen, lieber leichten Drift akzeptieren
  />
)}
```

Außerdem entfernen wir das umgebende `<Sequence from={0}>`-Wrapper — bei `Audio` ohne Sequence läuft das Asset einfach von Anfang an parallel zur Komposition mit, und Remotion respektiert die volle Audio-Länge bis `durationInFrames` der Komposition.

### Fix 3 — Voiceover-Dauer in DB speichern (falls nicht schon)
Falls `assemblyConfig.voiceover.durationSeconds` nicht persistiert wird, müssen wir das in der VO-Generierungs-Funktion (`generate-voiceover` o.ä.) sicherstellen. Die ElevenLabs-Antwort liefert eine geschätzte Dauer (siehe `generate-voiceover/index.ts` Z. ~115: `estimatedDuration`) — diese muss in `composer_projects.assembly_config.voiceover.durationSeconds` geschrieben werden.

Ich prüfe in der Implementierung, wo das VO im Composer generiert wird, und stelle sicher, dass die Dauer mit gespeichert wird.

### Skalierbarkeit
- Reine Frame-Math, null Render-Overhead pro Lambda
- Funktioniert auch wenn VO kürzer als Video ist (kein Padding)
- Kein zusätzlicher Audio-Decode, keine zusätzliche Bandbreite
- 100% Lambda-safe

## Geänderte Dateien

- `supabase/functions/compose-video-assemble/index.ts` — VO-Dauer einlesen, `durationInFrames` als Max(Video, VO) berechnen
- `src/remotion/templates/ComposedAdVideo.tsx` — Audio-Sequence-Wrapper entfernen, `pauseWhenBuffering={false}` für VO
- ggf. `src/components/video-composer/VoiceSubtitlesTab.tsx` oder die VO-Generierungs-Funktion — sicherstellen, dass `durationSeconds` in `assembly_config.voiceover` persistiert wird

## Verify

1. 7-Szenen-Projekt mit fade-Transitions (0.4s) rendern → VO spielt vollständig durch, kein Cut-Off am ersten Übergang
2. Letzter VO-Satz ist im Output hörbar und endet sauber
3. Übergänge bleiben smooth (keine Regression auf der jüngst gefixten Crossfade-Architektur)
4. Bei VO kürzer als Video → keine Stille am Ende, Bild läuft normal weiter
5. Bei VO länger als Video → letzte Szene hält den Frame, VO endet sauber
6. Untertitel-Timing passt weiterhin

