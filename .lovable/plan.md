## Was ich im Code gesehen habe

Der Prompt in deinem Screenshot ist wörtlich ein generiertes Template, kein Inhalt aus deinem Briefing:

`src/hooks/useStoryboardTransition.ts:659`
```
`${beatLabel} beat for ${briefing.productName ?? 'the brand'}: cinematic ${framing} shot, ${movement}, ${lighting} lighting.`
```
Das ergibt exakt „Hook beat for AdTool AI: cinematic medium-close-up shot, slow-push-in, soft-window lighting." — also der **Local-Fallback-Plan** (`buildLocalFallbackPlan`), der greift, wenn `briefing-deep-parse` in Timeout/Fehler läuft (Grace-Window 45s, danach Toast „Basis-Plan bereit").

Zweites Problem, unabhängig davon: `extractSceneHints` (Zeile 532 ff.) liest pro Szenenblock nur **strukturierte Marker** — `SHOT:`, `DIALOG: "…"`, `KAMERA:`, `EMOTION:`. Dein Briefing ist Fließtext („Drei Personen stehen in einem normalen Büroaufzug…", Dialog als „…" ohne das Wort DIALOG). Ergebnis: `shot` = leer → generischer Anchor, `dialog` = leer → kein Voiceover, keine Lip-Sync-Szenen, und die 5s-Zeitfenster („0–5 Sekunden") werden nicht gelesen → 3s-Kacheln.

Nicht verifiziert: ob die Analyse tatsächlich fehlgeschlagen ist (keine Konsolen-Logs im Snapshot). Deshalb ist Schritt 1 eine Diagnose.

## Plan

### 1. Diagnose (zuerst)
- `_meta.source` des zuletzt gespeicherten Plans in `composer_production_plans` prüfen: `local-fallback` vs. AI-Ergebnis.
- Edge-Function-Logs von `briefing-deep-parse` für den Zeitraum lesen (Timeout / Moderation / Status).
- Damit steht fest, ob nur der Fallback repariert werden muss oder auch die Server-Analyse.

### 2. Prose-Parser für den Fallback (`useStoryboardTransition.ts`)
Aus jedem `SZENE N`-Block ohne Marker gewinnen:
- **Anchor**: die ersten 1–2 beschreibenden Prosa-Sätze des Blocks (Zeilen ohne Anführungszeichen, ohne Titelzeile) statt des Templates.
- **Dialog**: alle Zeilen in „…" / "…" / “…” — auch ohne `DIALOG:`-Präfix; Sprecherzuordnung über vorangehende Zeile („Person 1:", „Person 2, trocken:") und Mapping auf die gewählten Cast-Einträge.
- **Dauer**: Muster `0–5 Sekunden` / `5-10 Sek` → `durationSec` pro Szene, Summe respektiert weiter den User-Slider.
- **Beat/Label**: Titel nach dem Em-Dash („Der Auftrag", „Die unmögliche Etage", „Der fertige Spot") als Szenenlabel, Beat-Ring nur noch als Notnagel.
- **Text-Overlay**: Endcard-Zeilen („AdTool AI / Deine Idee wird zur Szene.") als `textOverlay` der letzten Szene.
- Framing/Movement/Lighting weiterhin per Token-Klassifikation, aber jetzt auf dem Prosa-Text statt auf leerem `SHOT:`.

### 3. Gleiche Prosa-Regeln serverseitig absichern
In `briefing-deep-parse` (Pass A) explizit erzwingen: bei Fließtext-Briefings werden Szenenbeschreibung und wörtliche Rede **literal** übernommen (kein Umschreiben zu generischen Beats), Szenenanzahl und Sekundenfenster aus dem Text gewinnen Vorrang. Bestehender Scene-Count-Guard (v177) bleibt.

### 4. Sichtbarkeit
Im Production-Plan-Sheet ein deutliches Badge „Basis-Plan (Analyse fehlgeschlagen)" mit Button „Analyse erneut starten", wenn `_meta.source === 'local-fallback'` — damit ein Fallback nie wieder unbemerkt als AI-Ergebnis durchgeht.

### Nicht angefasst
Lip-Sync-Pipeline, Render, Anchor-/Face-Map-Pfade, `dialog_shots`, `syncso_*`. Änderungen betreffen nur Briefing → Plan → Storyboard.
