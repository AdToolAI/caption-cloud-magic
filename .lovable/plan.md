
Ziel: Die Preview-Übergänge zuverlässig sichtbar machen und alle angebotenen Typen auf denselben Stand bringen.

Do I know what the issue is? Ja. Es ist kein einzelner Opacity-Bug mehr, sondern eine Kombination aus 3 echten Ursachen:

1. `useTransitionRenderer.ts` macht ein Pre-Seek/Pre-Play des Incoming-Videos, pausiert dieses aber im selben Tick im „no transition“-Reset wieder. Dadurch wird der Incoming-Layer nie sauber vorgewärmt.
2. Die angebotenen Transition-Typen sind inkonsistent: `AITransitions.tsx` bietet `morph`, aber `TransitionPicker.tsx`, `VisualTimeline.tsx` und `getTransitionStyles()` sind dafür nicht vollständig synchronisiert.
3. Die aktuelle Preview-Architektur ist halb auf „unified CSS dual-video“ umgestellt, enthält aber noch alte Annahmen/Dead Paths (`frameCacheRef`, Canvas-Kommentare), wodurch das Verhalten schwer reproduzierbar und fehleranfällig bleibt.

Was ich umsetzen würde:

1. `useTransitionRenderer.ts` stabilisieren
- Den Tick in klare Phasen aufteilen: `idle`, `preparing`, `active`.
- Im Pre-Seek-Fenster das Incoming-Video seeken und vorbereitet halten, aber nicht im selben Frame wieder pausieren.
- Das harte `incoming.pause()` nur dann ausführen, wenn wirklich weit weg von jeder Transition.
- Die Renderer-Ownership für `opacity`, `pointerEvents`, `transform`, `clipPath`, `filter` beibehalten.

2. Incoming-Layer-Lifecycle sauber machen
- In `DirectorsCutPreviewPlayer.tsx` einen gemeinsamen `resetIncomingLayer()`-Pfad definieren.
- Bei `handleSeek` und `handleReset` nicht nur Styles resetten, sondern auch den Transition-Zustand sauber invalidieren, damit dieselbe Transition nach Scrubbing erneut korrekt vorbereitet wird.
- Falls nötig einen kleinen „transition session key“ oder Reset-Trigger an den Hook geben, damit interne Refs wie `lastIncomingSeekRef` zuverlässig zurückgesetzt werden.

3. Transition-Katalog vereinheitlichen
- Eine gemeinsame Quelle für verfügbare Typen schaffen und in allen UIs nutzen:
  - `TransitionPicker.tsx`
  - `AITransitions.tsx`
  - `VisualTimeline.tsx`
  - Preview-Renderer
- Nur Typen anbieten, die in der Preview wirklich unterstützt sind, oder fehlende Typen vollständig ergänzen.

4. Fehlende Preview-Stile ergänzen
- `getTransitionStyles()` in `NativeTransitionLayer.tsx` für alle angebotenen Typen explizit machen.
- Für `morph` einen echten Preview-Fallback einbauen, z. B.:
  - outgoing: leichte Skalierung + Blur + Opacity runter
  - incoming: Gegen-Scale + Blur raus + Opacity rauf
- Default-Fallback stärker und sichtbar machen, statt still auf einen schwachen Standard zu fallen.

5. Architektur aufräumen
- Wenn die Preview jetzt vollständig dual-video/CSS-basiert bleibt, den nicht mehr genutzten Frame-Capture-/Canvas-Pfad im Preview konsequent entschärfen bzw. entfernen.
- Veraltete Kommentare anpassen, damit Preview und Export wieder denselben mentalen Modell folgen.

Betroffene Dateien
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/NativeTransitionLayer.tsx`
- `src/components/directors-cut/ui/TransitionPicker.tsx`
- `src/components/directors-cut/features/AITransitions.tsx`
- `src/components/directors-cut/ui/VisualTimeline.tsx`

Erwartetes Ergebnis
- Crossfade, Dissolve, Fade, Wipe, Slide und Morph sind im Preview sichtbar.
- Kein sofortiges „Wegpausieren“ des Incoming-Videos mehr.
- Kein Zustand, in dem Transition-Dots gesetzt sind, aber die Preview wie ein Hard Cut aussieht.
- Scrubbing, Reset und wiederholtes Abspielen bleiben stabil.

Technische Kurznotiz
```text
Aktuell:
Pre-seek -> incoming.play()
im selben Tick -> no-transition reset -> incoming.pause()
=> Transition startet ohne vorbereiteten Incoming-Layer

Nach Fix:
idle -> preparing -> active
=> Incoming bleibt vorbereitet
=> CSS-Transition kann wirklich sichtbar werden
```
