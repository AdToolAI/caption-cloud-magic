## Ziel

Vier Produktionsfehler beheben (kein Zusammenhang zwischen Szenen, falscher/fehlender Charakter, ungewolltes und schlechtes Lip-Sync, Produktion bleibt bei Szene 4 hängen) und die Warte-Lounge um funktionierende Spiele erweitern.

## 1. Lounge: 2048 reparieren + 3 Spiele mehr

- `Game2048.tsx`: Der Zug-Handler ruft `setScore`/`setBest` **innerhalb** des `setGrid`-Updaters auf. Unter React StrictMode läuft der Updater doppelt, dadurch springt das Brett unkontrolliert bzw. reagiert nicht sauber. Umbau auf einen puren Reducer (`useReducer`) mit Zustand `{grid, score, best}`, ein Zug = eine Aktion. Zusätzlich Fokus-/Scroll-Handling: Pfeiltasten nur abfangen, wenn das Board im Viewport/aktiv ist.
- Neue Spiele im gleichen Stil (leichtgewichtig, kein neues Paket, Partie überlebt Status-Updates):
  - **Minesweeper** (9×9, Flaggen per Rechtsklick/Long-Press)
  - **Memory / Pairs** (Bond-Gold-Kartenrücken, Zug- und Zeitzähler)
  - **Snake** (Tastatur + Wisch, lokaler Highscore)
- `LoungePanel.tsx`: Spieleauswahl von 3 auf 6 Einträge, umbrechende Chip-Leiste.

## 2. Look-Konsistenz über alle Szenen (Anime-Ausreißer)

Ursache: `compileAnchorPrompt` baut jeden Anker isoliert; es gibt keine produktionsweite Stilvorgabe, und das Ankerbild jeder Szene wird ohne Bezug zu den vorherigen erzeugt.

- **Style-Bible**: Aus Idee/Treatment einmal pro Produktion ein englischer Stil-Block ableiten (Filmstock, Farbwelt, Licht, Objektiv, Grading) und in `promptGrammar.compileAnchorPrompt`/`compileMotionPrompt` in **jede** Szene einsetzen, plus harte Negativliste (`anime, illustration, cartoon, 3d render, CGI, painting`).
- **Look-Anker**: Die freigegebene Ankergrafik der ersten Szene wird als zusätzliche Referenzbild-URL an `autopilot-anchor-gate` aller Folgeszenen übergeben („match this film's look, not its content").
- **Judge-Achse**: `autopilot-anchor-gate` bekommt eine siebte Achse `style_match` (Abweichung vom Stilblock = Durchfall), damit Anime-Frames gar nicht erst freigegeben werden.

## 3. Cast-Identität (Sarah Dusatko taucht in keinem Clip auf)

- **Durchreichen prüfen und erzwingen**: `DirectorsTable` baut `portraitUrls` nur aus `scene.characterIds`. Wenn das Treatment einer Szene keine IDs zuweist, läuft die Szene ohne Portrait. Fix: Bei ausdrücklich gewählten Charakteren (Launcher-Auswahl) wird jede Szene mit mindestens einem dieser Charaktere besetzt; Szenen ohne Cast erben den Hauptcharakter.
- **Namentliche Bindung im Prompt**: Anker-Prompt nennt den Charakter explizit als Subjekt („<Name>, identical to reference portrait 1") statt einer generischen Beschreibung.
- **Identitäts-Gate scharf**: Fehlt `identity_fidelity` (Score unter Schwelle) trotz Portraits, wird repariert statt akzeptiert — `pass_score` für Szenen mit Portraits von 78 auf 82.
- Charaktere ohne `portrait_url`/`reference_image_url` werden vor dem Start in der Director's Table sichtbar gewarnt (sonst ist Identitätstreue technisch unmöglich).

## 4. „Kein Lip-Sync" respektieren

Ursache: Der Launcher-Schalter `lipSync: false` wird nirgends weitergereicht — `DirectorsTable` setzt `lipSyncEnabled` aus „gibt es Dialog?", und der Orchestrator startet Lip-Sync für jede Szene mit Dialog.

- Option `lipSync` von `AutopilotIdeaLauncher` → Briefing → `autopilot-treatment` → Szenenzeile durchreichen.
- Bei `lipSync: false`: Das Treatment schreibt **Voiceover statt On-Camera-Dialog** (kein sichtbares Sprechen, `narratorOnly`), Anker-/Motion-Prompt bekommt „nobody speaks on camera, mouth closed".
- `autopilot-orchestrate`: Stage 3 ruft nur noch Voiceover ab, wenn Lip-Sync aus ist; `speakAndSync` wird übersprungen (spart auch die Credits).
- Bei `lipSync: true` bleibt die bestehende, gehärtete Strecke (Face-Gate, sequenzielle Sync-Pässe) unverändert.

## 5. Produktion bleibt bei Szene 4 auf „Bild wird geprüft"

- **Zeitbudget**: `autopilot-anchor-gate` läuft bis zu 4 Anläufe × (90 s Bild + Judge). Bei drei parallelen Szenen kann ein Anlauf länger als das Heartbeat-Fenster laufen — der Watchdog resumt dann in eine noch laufende Szene. Fix: Heartbeat läuft künftig auf einem Intervall-Timer (alle 60 s) während der gesamten Produktion, nicht nur zwischen Szenen.
- **Hartes Limit pro Szene**: Anker-Phase bekommt ein Gesamt-Timeout (6 min). Läuft es ab, wird die Szene als `failed` mit Klartext markiert statt endlos auf „Bild wird geprüft" zu stehen — die Produktion läuft mit den restlichen Szenen weiter.
- **Sichtbarkeit**: Szenenkarte zeigt bei `anchor` Anlauf-Zähler und verstrichene Zeit („Anlauf 2/4 · 1:20"), damit ein langer Prüflauf nicht wie ein Hänger aussieht.
- Watchdog-Regel prüfen: Szenen im Status `anchor`/`motion` älter als das Szenen-Timeout werden beim Resume auf `pending` zurückgesetzt, damit sie erneut aufgegriffen werden.

## Technische Details

- Betroffen: `src/components/autopilot/lounge/games/*` (+3 neue Dateien), `LoungePanel.tsx`, `src/lib/autopilot/promptGrammar.ts`, `src/lib/autopilot/types.ts`, `src/components/autopilot/DirectorsTable.tsx`, `ProductionStage.tsx`, `AutopilotIdeaLauncher.tsx`, `supabase/functions/autopilot-treatment/index.ts`, `autopilot-anchor-gate/index.ts`, `autopilot-orchestrate/index.ts`, `autopilot-watchdog/index.ts`.
- Keine Schemaänderung nötig; Style-Bible und `lipSync` werden im vorhandenen `grammar`-JSON der Szenenzeile abgelegt.
- Verifikation: Testlauf mit 5 Szenen, Lip-Sync AUS, einem gewählten Charakter — erwartet: einheitlicher fotorealistischer Look, Charakter in jeder Szene, kein Sync-Pass, keine Szene bleibt im Anker-Status hängen.
