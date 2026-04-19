

## Befund — zwei Fragen, zwei Antworten

### 1) Werden hier schon Credits abgezogen? **Ja.**
Im Edge-Function `compose-video-clips/index.ts` (Zeile 354-376) zieht der Server **direkt nach erfolgreichem Render-Start** den vollen Betrag pro AI-Clip vom AI-Video-Wallet ab — über `deduct_ai_video_credits` RPC. Konkret:

- **Pro Klick auf „Generieren"** (einzeln) oder **„Alle generieren"** wird der Wallet-Stand geprüft.
- Hat der User genug → Lambda/Replicate-Call wird gestartet → **sofortige Belastung** (z. B. €1.51 für eine 10s Hailuo-Szene).
- Schlägt der Replicate-Start fehl (`status: 'failed'`) → wird **nicht** abgezogen (nur `'generating'` zählt).
- Schlägt der Render danach im Hintergrund fehl (Webhook meldet Fehler) → **aktuell kein automatischer Refund** ⚠️ (das wäre ein separater Hardening-Schritt — sage an, ob ich das auch mit angehen soll).

### 2) Re-Roll bei Unzufriedenheit — **technisch da, aber unsichtbar.**
Der „Neu generieren"-Button (`RefreshCw`-Icon) existiert bereits in `ClipsTab.tsx` Zeile 481-496 für jede fertige AI-Szene. Aber:

- Es ist **nur ein 7×7px Icon ohne Label** → User sieht es nicht.
- Es gibt **keinen Hinweis**, dass das Geld kostet (User klickt vielleicht versehentlich auf einen €1.51-Reroll).
- Es gibt **keinen Hinweis-Banner** der dem User die Möglichkeit erklärt.

## Plan: Transparente Re-Roll-Möglichkeit

### A) Info-Banner oben in der Clips-Liste
Ein dezenter Hinweis-Block (Lightbulb-Icon, gold/amber Tönung im Bond-Stil) **über der Scene-Liste**, einmalig sichtbar:

> 💡 *„Nicht zufrieden mit einer Szene? Klicke auf das ↻-Icon rechts neben einer fertigen Szene, um sie neu zu generieren — jeder Re-Roll kostet erneut Credits, aber du kannst Stil, Prompt oder Charakter-Shot vorher anpassen."*

Mit kleinem Dismiss-X (gespeichert in `localStorage` als `composer-reroll-hint-dismissed`).

### B) Re-Roll-Button sichtbarer machen
Statt nur ein Icon → ein Text-Button **„↻ Neu generieren (€X.XX)"** rechts an jeder fertigen AI-Szene. Konsistent mit dem „Generieren"-Button bei pending Szenen.

### C) Bestätigungs-Dialog beim Re-Roll
Bevor Credits ein zweites Mal verbrannt werden:

> *„Szene 3 neu generieren?  
> Dies kostet erneut **€1.51**. Der vorherige Clip wird ersetzt.  
> Tipp: Passe vorher den Prompt im Storyboard-Tab oder den Charakter-Shot-Typ an, um ein anderes Ergebnis zu bekommen."*  
> [Abbrechen] [Neu generieren €1.51]

Standard `AlertDialog` aus shadcn — keine neue Dependency.

### D) Klare Credit-Deduction-Info im bestehenden Cost-Banner
In der Summary-Bar (`8/8 Clips fertig`) oben einen Mini-Hinweis hinzufügen:

> *„Credits werden pro Generierung abgezogen — Re-Rolls kosten erneut."*

Klein, subtil, einmalig sichtbar.

## Betroffene Dateien
- `src/components/video-composer/ClipsTab.tsx` — Banner + größerer Re-Roll-Button + AlertDialog

## Optional — bitte sag Bescheid
**E) Auto-Refund bei Background-Render-Failure:** Aktuell werden Credits abgezogen sobald Replicate `'generating'` meldet — wenn der Render dann später (im Webhook) fehlschlägt, bleibt das Geld weg. Soll ich `compose-clip-webhook` so erweitern, dass es bei `status: 'failed'` automatisch `refund_ai_video_credits` aufruft? (Schließt einen Reliability-Lücke nach unserer Memory-Policy „Credit Refund Automation".)

