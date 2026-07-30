## Ziel

Die ~20 Minuten Wartezeit im KI-Autopilot werden zu einer bewussten "Warte-Lounge": links sieht der Kunde jederzeit exakt, wo die KI steht (inkl. Restzeit-Schätzung), rechts kann er zwischen **Infos** (tagesaktuell, auf seine Brand zugeschnitten) und **Spielen** (leichte Klassiker) wählen.

## 1. Fortschritt sichtbar machen (wie im Content Creator)

Neue Komponente `src/components/autopilot/ProductionLounge.tsx`, die die bestehende `ProductionStage` als linke Spalte aufnimmt (2/3 Breite) und rechts das Lounge-Panel setzt. Ergänzungen an der Fortschrittsseite:

- **ETA-Berechnung** (`src/lib/autopilot/eta.ts`): Restzeit aus Szenenanzahl × Phasen-Durchschnitt (Anchor / Motion / Lip-Sync / Endschnitt) und bereits abgeschlossenen Szenen. Anzeige als „noch ca. 12 Min." mit Unschärfe-Formulierung, nie als exakte Sekunde.
- **Phasen-Ticker**: kompakte Zeile „Was gerade passiert" mit der letzten Director-Log-Meldung in Klartext (Technik-Jargon wird gefiltert, wie bei `planDisplayFilter`).
- Alle Wartezustände nutzen die vorhandene `StageProgressBar` (Gold-Sweep), damit nichts „hängt".
- Browser-Benachrichtigung + Toast, wenn der Clip fertig ist (Opt-in beim Start), damit man wirklich weggehen kann. Titel-Tab zeigt `(fertig)`.

## 2. Entertainment-Panel

Neue Komponente `src/components/autopilot/lounge/LoungePanel.tsx` mit zwei Tabs, Auswahl bleibt in `localStorage` gemerkt. Das Panel läuft komplett unabhängig vom Polling — kein Re-Mount bei Statusupdates, damit ein laufendes Spiel nicht zurückgesetzt wird (State liegt oberhalb des Poll-Renders bzw. in einem Context).

### Tab „Infos" — brandrelevant und tagesaktuell
- Neue Edge Function `autopilot-lounge-feed`: kombiniert vorhandene Quellen (`news_hub_articles`, `brand_trends_cache`, `fetch-news-radar`) und rankt sie per Lovable AI gegen das aktive Brand-Kit (Branche, Zielgruppe, Tonalität) — kurze Begründung pro Karte („relevant für dich, weil …").
- Ergebnis wird pro Brand-Kit + Tag gecacht (24 h), Refresh-Button erzwingt Neuberechnung. Sprache folgt der UI-Sprache (DE/EN/ES).
- Kartenformat: Headline, 2-Zeilen-Insight, konkreter Handlungsimpuls, Quelle. Optional „Als Idee übernehmen" → legt direkt eine Autopilot-Idee an.

### Tab „Spiele" — leicht, offline, keine Konten
Drei bewusst simple Titel, alle rein clientseitig, Zustand nur lokal:
- **Solitär (Klondike)** — Drag/Klick-Steuerung, Auto-Ablage, Neu-Spiel.
- **Schach** — Brett + Regelwerk über `chess.js`, Gegner über eine schlanke Engine mit drei Stufen (leicht/mittel/schwer). Nur als Zeitvertreib, kein Ranking.
- **2048** — Tastatur + Swipe, Highscore lokal.

Spiele werden per `React.lazy` geladen, damit sie das Autopilot-Bundle nicht belasten. Optik im Bond-Gold-Stil: Deep Black, Glas, goldene Akzente, keine Fremd-UI.

## 3. Sauberkeit / Grenzen

- Kein zusätzlicher Poll-Traffic: die Lounge liest denselben `useAutopilotProduction`-State.
- Kein Guthaben-Verbrauch durch die Lounge; die AI-Rankung läuft einmal pro Tag pro Brand-Kit (gecacht).
- Bei „fertig" wird das Entertainment nicht abgewürgt: es erscheint ein prominenter Gold-Banner „Dein Clip ist fertig — ansehen", Spiel läuft weiter, bis der Kunde wechselt.
- Mobil: Lounge rutscht unter den Fortschritt, Spiele-Tab bleibt bedienbar (Touch).

## Technische Details

Neue Dateien: `ProductionLounge.tsx`, `lounge/LoungePanel.tsx`, `lounge/InfoFeed.tsx`, `lounge/games/{Solitaire,Chess,Game2048}.tsx`, `src/lib/autopilot/eta.ts`, `supabase/functions/autopilot-lounge-feed/index.ts`.
Geändert: `DirectorsTable.tsx` (rendert Lounge statt nackter `ProductionStage`).
Neue Abhängigkeit: `chess.js` (Regellogik). Tabelle: `autopilot_lounge_feed_cache` (user_id, brand_kit_id, language, payload jsonb, expires_at) mit RLS + GRANTs.
