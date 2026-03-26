

## Fix: Voiceover-Wiederholung + sichtbare Übergänge in der Preview

### Ursache 1 — Voiceover wiederholt sich
In `DirectorsCutPreviewPlayer.tsx` (Zeile 401-404) wird die Voiceover-Position an die **Video-Zeit** gebunden. Die Drift-Korrektur setzt `voiceoverAudioRef.current.currentTime = time` (= aktuelle Videozeit). Problem:
- Wenn das Video an einer Szenengrenze kurz springt oder sich die Zeit leicht verschiebt, wird das Voiceover zu einer bereits gehörten Stelle zurückgesetzt
- Bei 6-7 Szenen passiert das an mehreren Stellen → "wiederholt sich an 3 Stellen"
- Das Voiceover soll linear durchlaufen, unabhängig von der Videozeit

**Fix**: Drift-Korrektur für Voiceover komplett entfernen. Das Voiceover startet bei Play und läuft linear bis zum Ende. Nur die Source-Audio (Originalton) bleibt an die Videozeit gekoppelt.

### Ursache 2 — Keine sichtbaren Übergänge
Die Preview-Mode-Logik (Zeile 720-742) erzeugt nur einen subtilen schwarzen Overlay (`rgba(0,0,0,0.3-0.5)`). Das ist auf den meisten Videos unsichtbar. Es gibt keine visuellen Bewegungen (Wipe, Slide, Zoom).

**Fix**: Übergänge als CSS-Transformationen auf dem einzelnen Video-Element umsetzen:
- **fade/crossfade/dissolve**: Opacity-Dip auf 0.3 und zurück (stärker als aktuell)
- **wipe**: `clip-path: inset()` Animation, die das Bild von einer Seite aufdeckt
- **slide/push**: `translateX/Y` Verschiebung des Videos
- **zoom**: `scale()` Vergrößerung als visueller Akzent
- **blur**: `filter: blur()` wie bisher, aber stärker

### Änderungen

**`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**
- Zeile 401-404: Voiceover-Drift-Korrektur entfernen (nur 3 Zeilen löschen)

**`src/remotion/templates/DirectorsCutVideo.tsx`**
- Preview-Mode-Block (Zeile 719-742): Transition-Berechnung erweitern
  - Statt nur `transitionOverlayOpacity` auch `transitionTransform` und `transitionClipPath` berechnen
  - Diese Werte direkt auf das `<Video>`-Element anwenden (style-Attribute)
  - Jeder Transition-Typ bekommt eine eigene, sichtbare CSS-Animation
  - Overlay bleibt als zusätzliche Ebene für Blend-Effekte

### Was sich nicht ändert
- Single-Video-Architektur in der Preview bleibt
- TransitionSeries für finalen Render bleibt unverändert
- Source-Audio-Drift-Korrektur bleibt (nur für Originalton)
- Native Audio-Architektur bleibt

