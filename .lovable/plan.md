# Video Composer: Modus-Umschalter aufräumen + Atlantis-Briefing-Fehler beheben

## Teil 1 — Quick / Direct / Studio

Die drei Panels sind nicht überflüssig: `editorMode` blendet im Briefing echte Blöcke aus
(Quick = Briefing + Szenen, Direct = zusätzlich Visueller Stil / Marken-Kit / Stock-First,
Studio = alle Expertenblöcke). Überflüssig ist nur die **Doppelung**: derselbe Schalter
existiert als großer Film-Strip oben im Briefing *und* als `ModeSwitch` in der DirectorBar.

Smarteste Lösung:

1. Großen `FilmStripModeSelector` aus dem Briefing entfernen (Datei löschen).
2. Der kompakte `ModeSwitch` in der DirectorBar bleibt der einzige Umschalter — global sichtbar,
   gilt für alle Tabs, kostet keinen vertikalen Platz.
3. Modus wird nach einer Briefing-Analyse **einmalig automatisch vorgeschlagen** (nur solange der
   Nutzer ihn in dieser Session nicht selbst gesetzt hat):
   - Plan enthält Sprache/Cast, Marken-Kit oder Stilvorgaben → `direct`
   - sonst → `quick`
   - `studio` wird nie automatisch gesetzt.
4. Wenn ein Panel durch den Modus versteckt ist, aber Daten enthält (z. B. Marken-Kit gewählt),
   erscheint in der DirectorBar ein dezenter Hinweis „Mehr Panels anzeigen“, der auf `direct` schaltet.
   So gehen keine gesetzten Werte unsichtbar verloren.

## Teil 2 — Fehler aus dem Atlantis-Briefing

1. **30-s-Szenen erzwingen Seedance 2.5**: neue Hilfsdatei wählt anhand der Szenendauer die
   Clip-Quelle; > 15 s ⇒ Seedance 2.5, weil kein anderes Modell das schafft.
2. **Dauer-Cap dynamisch**: Der Storyboard-Slider liest das Maximum aus der Modell-Registry
   (30 s bei Seedance) statt fix 15 s.
3. **Geister-Cast**: „S0x Sprecher“-Slots nur anzeigen, wenn das Briefing wirklich Sprache enthält.
4. **Sprachreinheit**: Negative Prompts kommen künftig auf Englisch aus der Analyse (visuelle
   Prompts müssen englisch bleiben); die UI-Beschriftung bleibt lokalisiert.
5. **Audio-Besitz**: Sprachlose Szenen auf Modellen mit nativem Ton (Seedance 2.5, Veo)
   nutzen `provider`-Audio statt stumm zu fallen.
6. **Untertitel-Anzeige**: Der Untertitel-Block zeigt „Burn-In: an“ nicht mehr, wenn Untertitel
   deaktiviert sind.

## Technische Details

- Neu: `src/lib/composer/pickClipSourceForDuration.ts` (Registry-getriebene Modellwahl + Dauer-Caps)
- `src/hooks/useApplyProductionPlan.ts`: Clip-Quelle vor Audio-Quelle bestimmen, neue Auswahl nutzen,
  Cast-Slots nur bei Sprache, Modusvorschlag auslösen
- `src/components/video-composer/BriefingTab.tsx`: Film-Strip-Import und -Render entfernen
- `src/components/video-composer/stage/FilmStripModeSelector.tsx`: löschen
- `src/components/video-composer/stage/DirectorBar.tsx`: Hinweis „Mehr Panels anzeigen“
- `src/hooks/useStudioPreferences.ts`: Flag „Modus manuell gesetzt“ ergänzen
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: Cast- und Untertitel-Block bedingt
- `supabase/functions/_shared/briefing/deep/index.ts`: englische Negative Prompts erzwingen
- `src/lib/composer/budget.ts`: `MAX_SCENE_SECONDS` aus der Registry ableiten
