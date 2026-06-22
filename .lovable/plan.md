## Ziel

Im Motion Studio gilt ab sofort ein **hartes Gesamt-Budget von 10 Minuten (600 s)** pro Projekt. Szenen werden weiterhin **einzeln** erzeugt (kein Massen-Render), aber die Summe aller Szenen-Dauern darf 600 s **niemals** überschreiten – weder beim Anlegen neuer Szenen noch beim Verlängern bestehender.

Lipsync-, Render- und Stitch-Pipeline werden **nicht** angefasst.

## Verhalten

- **Briefing-Slider** (Ziel-Gesamtdauer): 15 s – 600 s (Step 15 s).
- **Per-Szene-Slider** (`SceneCard`): bleibt technisch 3–15 s, wird aber **dynamisch geclamped** auf `min(15, 600 − sumOfOtherScenes)`. Beispiel: 595 s schon verplant → Slider geht nur bis 8 s.
- **"Szene hinzufügen"-Button**: deaktiviert, sobald `sumOfScenes ≥ 597 s` (kein Platz mehr für minimale 3-s-Szene). Tooltip: *"Budget voll – kürze oder lösche eine Szene, um Platz zu schaffen."*
- **Auto-Director / Ad-Director / Scene-Director**: wenn die KI mehr Sekunden plant als verfügbar, wird die Szenen-Liste server­seitig auf das Restbudget gekürzt (letzte Szenen abgeschnitten) – Logging + UI-Hinweis.
- **Budget-Anzeige**: oben im Composer-Dashboard sichtbare Leiste `mm:ss / 10:00` mit Farb-Stufen (grün < 8 min, amber 8–10 min, rot = voll).
- **Freigewordene Zeit** nach Kürzen/Löschen wird automatisch verfügbar – nichts Manuelles, einfach: jeder Slider liest live `remaining = 600 − sumOfOthers`.

## Was sich technisch ändert

| Datei | Änderung |
|---|---|
| `src/components/video-composer/BriefingTab.tsx` | Slider `max=600 step=15`, Label-Formatter (s ↔ `m:ss`) |
| `src/components/video-composer/SceneCard.tsx` | Duration-Slider `max = Math.min(15, 600 − sumOfOtherScenes)`; dabei mind. `min=3`; bei `remaining<3` Slider disabled mit Tooltip |
| `src/components/video-composer/VideoComposerDashboard.tsx` | Neue Budget-Leiste `mm:ss / 10:00` + Farblogik; "Add Scene"-Button disabled-State |
| `src/components/video-composer/AutoDirectorWizard.tsx` + `AdDirectorWizard.tsx` | Target-Sec auf max 600 begrenzen; vor Submit prüfen ob `600 − sumExistingScenes` verbleibt |
| `supabase/functions/auto-director-compose/index.ts` | Server-Cap: kumulierte `n_seconds` der Szenen ≤ `min(targetSec, 600)`; überschüssige Szenen werden gedroppt und im Response gemeldet |
| `supabase/functions/ad-director-*` (sofern Szenen erzeugt) | gleiche 600-s-Hard-Cap |
| `src/locales/{en,de,es}/translation.json` | Neue Keys: `videoComposer.budgetLabel`, `budgetFull`, `budgetExceededTooltip` |

Helfer:
- Neue Util `src/lib/composer/budget.ts` mit `MAX_PROJECT_SECONDS = 600`, `getRemainingBudget(scenes, currentSceneId?)`, `formatDuration(s)`. Wird von allen oben genannten Komponenten genutzt → eine Wahrheit.

## Was explizit unberührt bleibt

- **Pro-Szene-Render** (`generate-scene-visual`, Hailuo/Kling/Pika/Vidu/Runway/Sora/HappyHorse/Seedance/Luma/Wan/Hedra) – jede Szene rendert einzeln wie bisher, keine Pipeline-Änderung.
- **Lipsync** komplett: `generate-scene-dialog`, `compose-dialog-scene`, `poll-dialog-shots`, `sync-so-webhook`, HeyGen Talking-Head, Cinematic-Sync – nichts angefasst (arbeiten pro Szene, kennen Projekt-Gesamtdauer nicht).
- **Stitch & Director's Cut**: `compose-stitch-and-handoff`, Lambda-Render – unverändert.
- **Per-Provider-Limits** (3–15 s pro Clip) – bleiben hartes Provider-Cap.

## Edge-Cases

- Beim **Initialisieren eines neuen Projekts** mit z.B. 8 Default-Szenen × 5 s = 40 s → reichlich Budget, keine Sichtveränderung.
- **Bestehende Projekte > 600 s** (sollte praktisch keine geben): kein Auto-Cut; Budget-Leiste wird rot, Slider auf 0 zusätzlicher Sekunden geclamped, User muss manuell kürzen/löschen.
- **Frame-Picker / Hybrid-Extend**: prüft vor Verlängerung Restbudget; sonst Toast *"Kein Budget mehr – kürze eine andere Szene."*
