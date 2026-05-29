## Einschätzung

Artlist veröffentlicht keine exakten SLA-Zeiten für Lip-Sync. Der entscheidende Unterschied ist aber: Bei Artlist/HappyHorse läuft Dialog/Lip-Sync möglichst provider-nativ in einer Generation bzw. stark gekapselt, nicht als lange Kette aus Szene → Preclip → externer Lip-Sync pro Turn → Stitch. Für kurze 5–10s Dialog-Clips sollte ein robuster Zielwert bei uns eher bei ca. 2–5 Minuten liegen, nicht 15 Minuten.

Was ich gerade sehe:
- Der Backend-Status ist gesund.
- Die aktuelle Szene hängt nicht an der Datenbank, sondern an Sync.so-Failures/Retry-Schleifen.
- Es gab mehrere `sync_FAILED → retry 1/3 ... retry 3/3` für einzelne Turns.
- Der Watchdog steht aktuell effektiv bei 15 Minuten pro Shot. Das ist zu lang für UX und fühlt sich wie „nie fertig“ an.
- Zusätzlich sehe ich doppelte Dispatch-Logs für denselben Turn. Das kann durch parallele Poller/Webhook-Kicks passieren und erhöht Kosten, Wartezeit und Fehlerwahrscheinlichkeit.

## Ziel

Die Pipeline soll nicht versuchen, jeden einzelnen Turn endlos perfekt zu retten, sondern wie ein Produktivsystem arbeiten:

```text
schnell versuchen → gezielt 1x retten → sauber degradieren → Video fertigstellen
```

Das senkt die sichtbare Fehlerquote, weil der Gesamtprozess nicht mehr an einem einzelnen problematischen Mund-Fenster hängen bleibt.

## Plan

### 1. Sync.so-Risiko wieder reduzieren

Ich würde die letzte „Smoothness“-Änderung teilweise entschärfen:
- `occlusion_detection_enabled` vorerst wieder entfernen oder nur optional senden.
- Temperatur konservativ lassen, aber nicht auf Retry-Werte hochziehen, die wieder Zappeln/Failures provozieren.
- Lead-In/Tail moderat halten, aber keine aggressiven Extra-Fenster bei sehr kurzen Turns.

Warum: Smoothness darf nicht die Completion-Rate verschlechtern. Erst Stabilität, dann Feinschliff.

### 2. Watchdog von 15 Minuten auf produktive Grenze senken

Ändern in `poll-dialog-shots`:
- Sync.so-Shot-Timeout: ca. 4 Minuten statt 15 Minuten.
- Preclip-Timeout: ca. 3–4 Minuten statt 10 Minuten.
- Max. Sync-Retries: von 3 auf 1–2 reduzieren.

Effekt: Ein kaputter Turn blockiert nicht den ganzen Clip.

### 3. Graceful Fallback statt kompletter Pipeline-Fehler

Wenn ein Turn nach kurzer Retry-Phase weiter fehlschlägt:
- Nicht die ganze Szene als failed markieren.
- Den Turn als „degraded ready“ behandeln.
- Beim Stitch wird für diesen Turn die originale Master-Plate verwendet, also keine perfekte Mundbewegung, aber das Video wird fertig.

Das ist näher an professioneller Produktlogik: Lieber 95% Output fertig liefern als 0% wegen eines 0.9s-Turns.

### 4. Duplicate-Dispatch-Schutz einbauen

Ich würde eine kleine Szenen-Lock-Logik ergänzen, damit parallele Poller/Webhooks nicht denselben Turn mehrfach an Sync.so schicken.

Technisch:
- Pro Szene ein kurzer `dialog_shots.processing_lock_until` Marker oder eine kleine DB-Lock-Funktion.
- Wenn ein Poller schon arbeitet, skippt der nächste sauber.
- Dadurch weniger doppelte Jobs, weniger Provider-Stress, weniger Kosten.

### 5. Progress-Anzeige ehrlicher machen

Aktuell wirkt `95% / 14:28 min` wie fast fertig, obwohl intern noch ein Turn hängt. Ich würde den Status granular machen:
- „Preclips fertig“
- „Lip-Sync Turn 2/3“
- „Retry 1/1“
- „Fallback aktiv“
- „Stitching“

Und die Fortschrittslogik nicht bei 95% festkleben lassen.

### 6. Aktuelle hängende Szene retten

Nach dem Code-Fix:
- Den aktuellen hängenden Lip-Sync-Status kontrolliert weiterführen oder nur den Lip-Sync-Teil resetten.
- Keine Szenengenerierung neu starten, wenn die Clips schon da sind.
- Danach einmal durchlaufen lassen und Logs prüfen.

## Erwartetes Ergebnis

- Normale kurze Dialogszene: ca. 2–5 Minuten Zielzeit.
- Problematische Szene: sauberer Abschluss mit Degradation statt 15-Minuten-Hänger.
- Weniger Sync.so-Jobs durch Dispatch-Lock.
- Geringere sichtbare Fehlerrate, weil ein einzelner Provider-Fail nicht mehr den ganzen Export blockiert.

## Nicht anfassen

- Keine Änderung an der funktionierenden Szene-Generierung.
- Kein kompletter Pipeline-Rewrite.
- Keine riskante Parallelisierung aller Sync.so-Turns.
- Keine Änderung an Credits/Refund-Logik außer bestehende Fail-Safes beizubehalten.