

## Bugfix: Erster Satz im gerenderten Voiceover fehlt komplett

### Symptom
Preview im Editor klingt korrekt (0,4 s Pause, dann sauberer Satz-Start). Im **gerenderten MP4** fehlt der gesamte erste Satz — die Stimme setzt mitten im Text ein („Er liebte Gott…").

### Ursache

In `src/remotion/templates/ComposedAdVideo.tsx` (Zeilen 393–412) ist die Pre-Buffer-Mathematik kaputt:

```tsx
const VO_LEAD_IN_FRAMES = Math.round(fps * 0.4); // = 12 bei 30 fps
<Sequence
  from={VO_LEAD_IN_FRAMES - fps}        // = -18 (Sequence startet 18 Frames vor Frame 0)
  durationInFrames={...}
>
  <Audio
    startFrom={fps}                      // = 30 (springt 30 Frames in die MP3)
  />
</Sequence>
```

**Frame-Mathematik:** Bei Frame 12 (= 0,4 s) ist die Sequence seit `12 - (-18) = 30` Frames aktiv. Mit `startFrom={30}` wird die MP3 ab Frame `30 + 30 = 60` abgespielt — also **2 Sekunden zu spät**. Der gesamte erste Satz wird verschluckt.

Die Live-Preview ist davon nicht betroffen, weil `ComposerSequencePreview.tsx` die Audio-Position imperativ über `audio.currentTime = globalTime - VO_LEAD_IN_SECONDS` setzt — eine völlig andere Logik als Remotion.

### Fix

**Datei:** `src/remotion/templates/ComposedAdVideo.tsx` (Zeilen 393–412)

Korrekte Berechnung von `startFrom`, sodass die MP3 bei Frame `VO_LEAD_IN_FRAMES` exakt bei Sekunde 0 beginnt:

```tsx
{voEnabled && (() => {
  const VO_LEAD_IN_FRAMES = Math.round(fps * 0.4);  // 12 frames @ 30fps = 0,4s breath
  const PRE_BUFFER_FRAMES = fps;                     // 30 frames decoder warm-up

  return (
    <Sequence
      from={VO_LEAD_IN_FRAMES - PRE_BUFFER_FRAMES}                       // -18: Sequence startet 18f vor Frame 0
      durationInFrames={durationInFrames - VO_LEAD_IN_FRAMES + PRE_BUFFER_FRAMES}
    >
      <Audio
        key="composer-voiceover-stable"
        src={voiceoverUrl as string}
        volume={1}
        loop={false}
        startFrom={PRE_BUFFER_FRAMES - VO_LEAD_IN_FRAMES}                // = 18: MP3 spielt 18f stumm im Pre-Buffer,
                                                                          //   bei Frame 12 (0,4s) startet hörbar Sek. 0 der MP3
      />
    </Sequence>
  );
})()}
```

**Verifikation der Mathematik:**
- Bei Frame `-18` startet Sequence → MP3 ab Sekunde `18/30 = 0.6` der Datei? **Nein** — `startFrom={18}` sagt Remotion: „spiele die MP3 ab Frame 18".
- Bei globalem Frame `-18` ist Sequence-Frame `0` → MP3-Frame `18` läuft (im Pre-Buffer, noch nicht sichtbar).
- Bei globalem Frame `0` ist Sequence-Frame `18` → MP3-Frame `36` läuft (Decoder eingeschwungen).
- Bei globalem Frame `12` (= 0,4 s) ist Sequence-Frame `30` → MP3-Frame `48`. 

**Korrektur:** Damit bei Frame 12 die MP3 bei Sekunde 0 startet, muss gelten: `startFrom = PRE_BUFFER_FRAMES - VO_LEAD_IN_FRAMES = 30 - 12 = 18`. Bei Frame 12 ist Sequence-Frame `30`, also MP3-Frame `30 - 18 = 12`? Nein — `startFrom` verschiebt den **Anfang der Datei**, nicht den Offset.

Die einfachere und narrensichere Lösung: **Pre-Buffer komplett weglassen**, da der 0,4 s Lead-In dem Decoder bereits genug Zeit zum Aufwärmen gibt (12 Frames Stille = 400 ms, mehr als genug für MP3-Init):

```tsx
{voEnabled && (() => {
  const VO_LEAD_IN_FRAMES = Math.round(fps * 0.4);  // 12 frames @ 30fps

  return (
    <Sequence
      from={VO_LEAD_IN_FRAMES}                                           // hörbarer Start bei Frame 12
      durationInFrames={durationInFrames - VO_LEAD_IN_FRAMES}
    >
      <Audio
        key="composer-voiceover-stable"
        src={voiceoverUrl as string}
        volume={1}
        loop={false}
        // KEIN startFrom → MP3 spielt von Sekunde 0
      />
    </Sequence>
  );
})()}
```

### Verifikation
1. Composer → neues Voiceover generieren (mit Wort am Anfang, z. B. „Hallo, mein Name ist…")
2. Editor-Preview: ~0,4 s Stille, dann beginnt die Stimme bei „Hallo" ✓
3. Render starten → fertiges MP4 herunterladen
4. **Im MP4: ~0,4 s Stille, dann beginnt die Stimme ebenfalls bei „Hallo"** (vorher: erstes Wort/Satz fehlte)
5. Längere Voiceover (>20 s) → komplett hörbar, kein abgeschnittenes Ende (Edge-Function-Duration-Logik bleibt unverändert)
6. Hintergrundmusik-Pre-Buffer (Zeile 416) bleibt unverändert — dort gibt es kein Lead-In-Konzept

### Risiko & Aufwand
- **Risiko: sehr niedrig.** Reine Frame-Mathematik in einer Datei, ~10 Zeilen, keine API-/DB-/Schema-Änderung.
- **Aufwand:** ~3 Min — 1 Datei (`ComposedAdVideo.tsx`), Edge Function bleibt wie sie ist (Duration-Padding ist bereits korrekt).

