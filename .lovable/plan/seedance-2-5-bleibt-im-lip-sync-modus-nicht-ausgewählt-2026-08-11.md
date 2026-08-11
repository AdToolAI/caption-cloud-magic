# Seedance 2.5 bleibt im Lip-Sync-Modus nicht ausgewählt

## Befund (geprüft im Code)

Der Model-Picker zeigt Seedance 2.5 inzwischen korrekt an (Screenshot: „22 Modelle
· … · Seedance 2.5 …"). Zurückgesetzt wird die Auswahl von einer alten
Auto-Migration in `SceneCard.tsx` (Zeilen 470–478):

```text
useEffect:
  wenn Szene im Lip-Sync-Motor läuft
  und clipSource NICHT in der eingefrorenen Liste LIPSYNC_CLIP_SOURCES steht
  -> clipSource = HappyHorse 1.0
```

Diese Liste stammt aus der Zeit vor Seedance 2.5 und enthält
`ai-seedance25` nicht. Der Effekt läuft bei jeder Änderung von `clipSource`,
also sofort nach dem Klick — daher der Sprung zurück auf HappyHorse 1.0.

Die flag-bewusste Variante (`lipsyncClipSources(flag)`) existiert bereits und
wird an anderer Stelle in derselben Datei verwendet; nur dieser Effekt kennt
sie noch nicht.

## Umsetzung

1. Auto-Migration flag-bewusst machen: Der Effekt prüft künftig gegen
   `lipsyncClipSources(seedance25LipsyncEnabled)` statt gegen die
   eingefrorene Liste. Ist Seedance 2.5 freigeschaltet, gilt die Auswahl als
   gültig und bleibt stehen; ohne Flag bleibt das bisherige Verhalten exakt
   erhalten (Alt-Projekte mit Veo/Sora werden weiter auf HappyHorse migriert).
2. Gegenprüfen: Szene mit Dialog & Lip-Sync, Seedance 2.5 wählen — Auswahl
   bleibt, Dauer-Slider geht bis 30 s, Kostenanzeige wechselt auf den
   Seedance-2.5-Satz.

## Technische Details

- Datei: `src/components/video-composer/SceneCard.tsx`, useEffect bei Zeile
  ~470 — `isLipsyncClipSource(scene.clipSource)` wird durch die
  flag-abhängige Prüfung ersetzt, `seedance25LipsyncEnabled` kommt in die
  Dependency-Liste.
- Keine Änderung an `modelMapping.ts` nötig; `isLipsyncClipSource` bleibt für
  andere Aufrufer (Render-Preflight) unverändert.
- Keine Datenbank- oder Edge-Function-Änderung: Der Server prüft das Flag
  bereits selbst beim Dispatch.
