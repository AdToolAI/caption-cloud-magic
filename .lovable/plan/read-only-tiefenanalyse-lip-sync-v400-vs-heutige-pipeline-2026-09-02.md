# Read-only Tiefenanalyse: Lip-Sync v400 vs. heutige Pipeline

## Korrektur

Die zuvor genannten **81 % waren falsch** und werden vollständig verworfen.

Der Fehler hatte zwei Ebenen:

1. `composer_scenes.updated_at` misst die letzte Änderung einer Szenenzeile, nicht den
   Start eines neuen Lip-Sync-Laufs. Dadurch wurden historische Zustände in ein
   aktuelles Zeitfenster gezogen.
2. Noch wichtiger: `pipeline_state = complete`, erfolgreiche Jobs oder Pässe beweisen
   nur einen technischen Abschluss — **nicht**, dass im fertigen Video sichtbarer,
   korrekter Lip-Sync vorhanden ist.

Für die letzten zwei Wochen gilt deshalb als Ausgangslage:

> **0 visuell bestätigte funktionierende 3+-Sprecher-Szenen.**

Die technisch als `complete` markierten Runs sind keine Gegenbeweise, sondern mögliche
**False-Positive-Completions**, bis ihre Endvideos geprüft wurden.

## Ziel der Analyse

Ohne Code-, Datenbank-, Deployment- oder Konfigurationsänderungen entscheiden:

1. Ist ein echter Rückbau auf den letzten nachweislich funktionierenden v400-Zustand
   technisch möglich?
2. Welche späteren Änderungen sind notwendige Sicherheitsverträge und welche erzeugen
   die heutigen Ausfälle oder False-Positive-Completions?
3. Soll die Pipeline auf einen kleinen stabilen Kern reduziert, der heutige Stand
   repariert oder Lip-Sync für bestimmte Sprecherzahlen vorläufig begrenzt werden?
4. Welche messbare Definition von „funktioniert“ beendet die viermonatige Iteration?

## Gate A — Wahrheitsfähiges Run-Inventar der letzten 14 Tage

Jeden eindeutigen 3+-Sprecher-Run über `run_id` und `plate_generation` erfassen — nicht
über den aktuellen Szenenstatus. Pro Run festhalten:

- Szene, Run-ID, Generation, Start/Ende und Anzahl erwarteter Pässe
- tatsächlich erzeugte Preclips, Provider-Dispatches, Callbacks und Mux-Ergebnis
- erster terminaler Fehler oder letzter belegter Zustand
- Endvideo vorhanden ja/nein
- sichtbarer Lip-Sync pro Sprecher: korrekt / kein Lip-Sync / falsches Gesicht /
  nicht prüfbar
- technischer Status versus tatsächliches Ergebnis

Die derzeit sichtbaren technischen Completes werden ausdrücklich als
False-Positive-Kandidaten geprüft. Ein `complete` zählt erst als Erfolg, wenn das
Endvideo pro Sprecher sichtbare Mundbewegung auf der richtigen Person zeigt.

**Ergebnis:** vollständige Run-Matrix; keine Erfolgsquote ohne verifizierbaren
Endvideo-Beleg.

## Gate B — Schichtweiser Vergleich mit v400

Die Pipeline nicht nach Versionsnamen, sondern nach den realen 16 Stufen des
hochgeladenen v400-Dokuments vergleichen:

```text
Run-Start → Anchor → Plate → Face-Layout → Assignment → Voiceover
→ Preclip → Face-Gate → Provider → Webhook → Outcome-Gate
→ Reprojektion → Mux → Abschluss → Watchdog
```

Für jede Stufe dokumentieren:

- exakter heutiger Codepfad und aktiver Vertrag
- identisch zu v400 / ersetzt / erweitert / gelöscht
- Einfluss auf 1, 2 und 3+ Sprecher
- kann vor Provider blockieren, nach Provider falsch abschließen oder das Endbild
  sichtbar beschädigen?
- Produktionsbeleg aus Gate A

Besonders zu klären:

- Das v400-Outcome-Gate (`unknown` blockiert) existiert laut aktuellem Code nicht mehr.
  Damit kann `complete` ohne bewiesene Mundbewegung entstehen.
- Das feste 62-%-Mundframing aus dem PDF entspricht nicht dem heutigen Code und auch
  nicht dem gemessenen Golden Run.
- v461/v464/v536 sowie v506–v530 haben zusätzliche Abbruch- oder Autoritätspfade
  eingeführt.
- Der 2-Sprecher-Pfad und der `speakers.length >= 3`-Pfad sind getrennt zu analysieren;
  eine Verallgemeinerung auf `>= 2` wird **nicht** vorweggenommen.

## Gate C — Zwei Fehlerklassen strikt trennen

### Klasse 1: Die Szene bricht ab

Pro Pass den ersten ursächlichen Blocker bestimmen, unter anderem:

- `dynamic_mouth_crop_infeasible`
- v461 Face-Share / Face-Size / Mouth-ROI
- v464 ASD-Vertragsverletzung
- unresolved identity / Face-Repair
- FA-4 Turn-/Pass-Mismatch
- Worker-, Lock- oder Watchdog-Abbruch

Folgefehler wie `fanout_closed` werden nicht als Ursache gezählt.

### Klasse 2: Die Szene wird `complete`, aber Lip-Sync fehlt

Für jeden False-Positive-Complete nachvollziehen:

- war der Provider-Output gegenüber dem Preclip tatsächlich verändert?
- waren Mundbewegungen im Output vorhanden?
- wurde der richtige Sprecher-Crop reprojiziert?
- wurde ein `motion_unverified` oder nicht messbarer Probe-Zustand als Erfolg gewertet?
- enthielt der finale Mux den synchronisierten Output oder wieder die ursprüngliche Plate?

Diese zweite Klasse ist für die Aussage „seit zwei Wochen funktioniert nichts“
entscheidend und wurde von der vorherigen Analyse fälschlich ignoriert.

## Gate D — Rückbau-Entscheidung

Drei Optionen werden erst nach A–C bewertet:

### Option 1: Exakter Rückbau

Nur möglich, wenn ein konkreter historischer Commit plus damalige Funktionen,
Datenbankverträge und Provider-Payloads gemeinsam reproduzierbar sind. Das PDF allein
ist **kein** ausführbarer Baseline-Stand, weil einzelne Angaben vom Golden Run und vom
heutigen Code abweichen.

### Option 2: v400-Kern auf heutiger Infrastruktur

Die vier Kernverträge behalten:

- Run-Identität
- Anchor-/Plate-Kohärenz
- unveränderlicher Assignment-Lock
- Callback-/Run-Guard

Danach nur die durch Produktionsbelege notwendigen Gates behalten. Das ist kein
blindes Zurückrollen, sondern ein kontrollierter Abbau späterer Gate-Inflation.

### Option 3: Sprecherzahl begrenzen

Wenn 3+ Sprecher nicht reproduzierbar stabil werden, wird der Modus vorläufig auf die
nachweislich stabile Sprecherzahl begrenzt, statt weiter bezahlte Beta-Runs als
Erfolg zu deklarieren. Auch 1 oder 2 Sprecher gelten erst nach visueller Verifikation
als stabil.

## Definition von „gut genug“

Kein DB-Status gilt als Erfolg. Eine Szene besteht nur, wenn:

1. alle erwarteten Sprecher im richtigen Gesicht synchronisiert sind,
2. sichtbare Mundbewegung für jeden gesprochenen Turn vorhanden ist,
3. keine falsche Person spricht und keine stillen Passthroughs vorkommen,
4. das finale Mux genau diese geprüften Outputs enthält,
5. Credits und Terminalstatus korrekt abgeschlossen sind.

Vorgeschlagener Freeze-Punkt:

- mindestens 20 aufeinanderfolgende kontrollierte Runs,
- getrennte Kohorten für 1, 2 und 3+ Sprecher,
- mindestens 90 % **visuell bestätigte** Szenenerfolge je freigegebener Kohorte,
- 100 % korrekte Zuordnung von Sprecher zu Gesicht,
- kein `complete` ohne nachgewiesene Mundbewegung.

Erreicht eine Kohorte das nicht, wird sie nicht als stabil angeboten. Nach Erreichen
des Ziels wird die Pipeline eingefroren und nur noch für P0-Datenverlust,
Abrechnungsfehler oder nachgewiesene Regressionen verändert.

## Lieferumfang der Read-only-Analyse

- Run-für-Run-Matrix der letzten 14 Tage
- v400-vs-heute-Differenzmatrix für alle 16 Stufen
- Root-Cause-Rangliste, getrennt nach Abbruch und False-Positive-Completion
- belegte Bewertung der drei Rückbauoptionen
- kleinster möglicher späterer Reparatur-Scope mit Regressionstest-Matrix
- klare Empfehlung: Kern reduzieren, gezielt reparieren oder Sprecherzahl begrenzen

Danach **STOP**. Keine Implementierung ohne ein separates ausdrückliches GO.