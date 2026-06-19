## Befund

**Do I know what the issue is?** Ja.

Der neue Fehler ist **nicht** der Watchdog/20-Minuten-Timeout. Der Screenshot zeigt:

`v107_preclip_required_for_multispeaker: face_gate_failed:count=0`

Das bedeutet: Die Pipeline hat für die 4. Sprecherin einen Single-Face-Preclip gebaut, aber beim Face-Gate wurden **0 Gesichter** im Preclip gefunden. Deshalb wurde **vor** dem Sync.so-Dispatch hart abgebrochen. Es ist also ein **Master-Plate / Preclip-Visibility-Problem**, nicht primär ein Lip-Sync-Provider-Problem.

Konkret zur aktuellen Szene:
- Pass 1–3 wurden erzeugt.
- Pass 4 / Sarah scheitert vor Provider-Start.
- Sarah sitzt sehr weit oben/links im Bild; ihr Turn ist spät im Clip.
- Die aktuelle Pipeline prüft die Plate vorher nur zu grob, aber nicht zuverlässig je Sprecher im tatsächlichen Turn-Fenster.
- Dadurch starten wir Lip-Sync auf einer Szene, die für den betroffenen Sprecher zur Sprechzeit nicht stabil/erkennbar genug ist.

## Ziel

Nicht mehr mit Retries auf kaputte Eingangsvideos reagieren, sondern **vor dem ersten kostenpflichtigen Lip-Sync-Start** sicherstellen, dass alle Sprecher im jeweiligen Dialog-Turn sichtbar sind — oder automatisch auf eine stabile Dialog-Plate gehen.

## Plan

### 1. Turn-Level Plate-Gate vor Lip-Sync einbauen

In der Dialog-Lip-Sync-Funktion wird vor dem ersten Sync-Dispatch für jeden Sprecher geprüft:

- Sprecher-Koordinate vorhanden
- Turn-Zeitfenster vorhanden
- Face sichtbar am Anfang/Mitte/Ende des Sprecher-Turns
- Bei 3–4 Personen: alle erwarteten Gesichter bleiben in den relevanten Turn-Frames detektierbar

Wenn ein Sprecher im Turn nicht sichtbar ist, startet Lip-Sync **gar nicht**. Stattdessen:

- Credits direkt zurückgeben
- Szene als `needs_clip_rerender` / `failed` mit klarer Ursache markieren
- UI-Fehler verständlich machen: „Sprecher im Scene-Clip nicht sichtbar — Scene-Plate neu rendern“

### 2. Stable-Dialog-Plate Fallback statt Provider-Retry

Für 3–4 Sprecher-Dialoge wird ein stabiler Fallback aktiviert:

- Wenn die bewegte Hailuo/Video-Plate beim Turn-Level-Gate scheitert, verwendet die Pipeline eine stabile Referenz-/Anchor-Plate als Dialog-Master.
- Preclips werden dann aus einem stabilen Bild/Frame erzeugt, in dem alle Sprecher sichtbar sind.
- Der finale Dialog-Stitch nutzt dieselbe stabile Dialog-Plate, damit der Lip-Sync nicht gegen eine bewegte Plate mismatcht.

Das ist der eigentliche Ursachen-Fix: Der Kunde bekommt kein 20-Minuten-Retry-Verhalten, sondern eine deterministische Dialog-Plate, die beim ersten Versuch lip-syncbar ist.

### 3. Clip-Generation für Multi-Speaker-Dialoge härten

In der Scene-Clip-Generierung werden für Dialog-Szenen mit mehreren Sprechern härtere Prompt-/Engine-Regeln gesetzt:

- locked camera
- all speakers visible for entire duration
- no cuts, no camera pan away
- faces unobstructed
- no split-screen/panel layout
- group composition in one continuous frame

Wenn ein Modell trotzdem eine schlechte Plate liefert, blockt das neue Turn-Level-Gate sofort und triggert Re-Render statt Lip-Sync.

### 4. Fehlertext und Forensik klar machen

Der aktuelle kryptische Fehler wird ersetzt/ergänzt durch:

- betroffener Sprecher
- betroffener Turn-Zeitraum
- erkanntes Problem: `face_missing_in_turn_frame`
- empfohlene Aktion: Scene-Plate neu rendern oder Stable-Dialog-Plate verwenden

Das Forensik-Panel soll nicht nur `face_gate_failed:count=0` zeigen, sondern direkt sagen: **„Der Sprecher war im eigentlichen Sprechfenster nicht detektierbar.“**

### 5. Aktuelle Szene reparierbar machen

Für bereits fehlgeschlagene Szenen wie diese:

- `Sauber neu starten` soll stale Preclips und kaputte Pass-Daten entfernen.
- Der nächste Lauf soll nicht wieder in denselben Preclip-Fehler laufen, sondern erst das neue Turn-Level-Gate verwenden.
- Wenn nötig wird die Scene-Plate automatisch neu gerendert oder auf die Stable-Dialog-Plate gewechselt.

### 6. Regression absichern

Tests/Fälle:

- 4 Sprecher, letzter Sprecher oben am Bildrand → kein Provider-Start, wenn Gesicht im Turn fehlt.
- 4 Sprecher mit stabiler Anchor-Plate → Lip-Sync startet beim ersten Versuch.
- Pass 1–3 done, Pass 4 preclip count=0 → kein Watchdog-Loop, keine Provider-Retries, klare Refund-/Rerender-Aktion.
- Existing watchdog/pass-level fixes bleiben erhalten.

## Wahrscheinliche Dateien

- Backend function: Dialog-Lip-Sync / Segment-Composer
- Shared preclip renderer
- Shared face-gate / plate-face detection
- Clip-generation function für Dialog-Scene-Prompts
- UI: Scene error / Forensics display
- Memory-Dokumentation für die neue v132-Regel

## Was ich bewusst nicht mache

- Kein 20-Minuten-Timeout erhöhen.
- Keine weiteren blinden Provider-Retries.
- Kein Full-Plate-Fallback, der wieder falsche Münder animiert.
- Keine Abrechnung, wenn die Eingangsszene nicht lip-syncbar ist.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>