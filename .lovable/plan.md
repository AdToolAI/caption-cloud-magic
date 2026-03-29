

## Diagnose: Warum Übergänge nicht aktualisiert werden

### Bisherige Analyse

Ich habe den gesamten Datenfluss von der UI (SceneEditingStep) bis zum Renderer (useTransitionRenderer) nachvollzogen. Der Code sieht architektonisch korrekt aus:

1. User wählt "Slide" → `handleTransitionTypeChange` → `onTransitionsChange(transitions.map(...))` → neues Array
2. Parent-State (`DirectorsCut.tsx`) wird aktualisiert
3. Neues `transitions`-Array fließt in `DirectorsCutPreviewPlayer` → `useTransitionRenderer`
4. `resolvedTransitions` wird via `useMemo` neu berechnet
5. `useEffect` mit rAF-Loop startet neu mit neuen `resolvedTransitions`

**Trotzdem zeigt die Vorschau die alten Übergänge.** Da der Code logisch korrekt aussieht, muss ich mit Diagnose-Logging herausfinden, was zur Laufzeit tatsächlich passiert.

### Plan

**1. Diagnose-Logging in `useTransitionRenderer.ts` einfügen**
- Bei jedem Neustart des rAF-Loops: `resolvedTransitions` loggen (Anzahl, baseType jedes Eintrags)
- Im `tick`: wenn `findActiveTransition` matcht, den `baseType` und `direction` loggen
- Damit sehe ich, ob der Renderer überhaupt "slide" als Typ bekommt

**2. Diagnose-Logging in `resolveTransitions`**
- Jeden Input-Transition loggen: `transitionType`, `sceneId`
- Jeden aufgelösten Output loggen: `baseType`, `direction`, `tStart`, `tEnd`
- Damit prüfe ich, ob "slide" korrekt aufgelöst wird oder ob irgendwo "crossfade" / "none" zurückfällt

**3. Diagnose-Logging in `DirectorsCutPreviewPlayer.tsx`**
- Wenn `transitions` prop sich ändert, die neuen Transition-Typen loggen
- Damit prüfe ich, ob der Player überhaupt die aktualisierten Transitions erhält

**4. Basierend auf den Logs das eigentliche Problem fixen**
- Sobald die Console-Logs den Fehler zeigen, behebe ich die Ursache

### Warum Logging statt weiterem Raten

Wir sind jetzt an einem Punkt, wo der Code strukturell korrekt aussieht. Weiteres Raten führt zu noch mehr Patches ohne Ergebnis. Die Console-Logs werden beim nächsten Abspielen sofort zeigen, wo die Kette bricht — ob der Renderer die falschen Transition-Typen bekommt, ob die Bitmaps fehlen, oder ob der Resolver nicht getriggert wird.

