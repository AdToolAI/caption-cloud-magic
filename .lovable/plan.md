# Testprotokoll: Briefing → fertiger Clip

Die drei Korrekturen von eben sind live (Dialogszenen bis 30 s auf Seedance 2.5,
einheitliche 4-s-Untergrenze, sichtbare Warnung bei fehlgeschlagenem Abzug).
Jetzt einmal die ganze Strecke durchspielen. Nach jedem Schritt melde ich dir,
was Szenenstatus, Funktions-Logs und Gate-Ergebnisse sagen.

## Vorbereitung

- Guthaben notieren (Konto-Seite), Sprache der Oberfläche auf Deutsch lassen.
- Ein frisches Projekt im Video Composer anlegen, nicht ein altes wiederverwenden.

## Schritt 1 — Briefing analysieren

Briefing mit bewusst gemischten Szenen eingeben:
- Szene A: 8 s Establisher, kein Dialog
- Szene B: 25 s Dialog, eine Figur aus Cast & World
- Szene C: 12 s ohne Dialog, soll optisch an B anschließen

Erwartung: Analyse läuft durch, Plan zeigt drei Szenen, Szene B bleibt bei 25 s.
Fehlerbild, auf das du achten solltest: Szene B auf 15 s gekürzt, oder Dialogzeile
fehlt im Plan.

## Schritt 2 — Plan übernehmen

Erwartung: Szene B trägt Seedance 2.5 als Quelle, Modus-Vorschlag ist „Direkt"
(weil Sprache vorkommt), keine leeren Geister-Slots im Plan-Sheet.

## Schritt 3 — Szene A rendern (kein Dialog)

Provider-Ton erlaubt lassen. Erwartung: Clip in ~8 s Länge, Ton vom Modell
vorhanden, Vorschau nicht verzerrt.

## Schritt 4 — Szene B rendern (Dialog + Lip-Sync)

Zweimal testen, damit der Hybrid-Modus abgedeckt ist:
1. Mit „Umgebungston vom Modell" AUS — erwartet: Platte stumm, Stimme nur aus
   dem Studio, Lippen synchron.
2. Mit „Umgebungston vom Modell" AN — erwartet: Platte stumm gesprochen,
   Atmo/Foley leise darunter, Sprach-Gate meldet `passed` (spricht die Platte
   doch, muss das Gate auf `muted` schalten und die Atmo verwerfen).

Fehlerbilder: doppelte Stimme, Atmo lauter als die Stimme, Lippen laufen weg,
Render bricht mit Längenfehler ab.

## Schritt 5 — Szene C mit Bildanschluss „Nahtlos"

Erwartung: Szene C startet auf dem letzten brauchbaren Bild von Szene B, kein
Sprung in Farbe/Kadrierung, Figur bleibt erkennbar dieselbe.
Gegentest: einmal auf „Harter Schnitt" stellen und prüfen, dass dann bewusst
kein Anschlussbild verwendet wird.

## Schritt 6 — Randfälle (kurz)

- Eine Szene auf 3 s stellen: muss abgelehnt oder auf 4 s angehoben werden,
  nicht still fehlschlagen.
- Eine Szene auf 30 s stellen: muss durchlaufen.
- Einen laufenden Render abbrechen: Projekt muss sauber in „abgebrochen" landen.
- Browser-Tab während eines Seedance-Renders schließen und wieder öffnen: der
  Auftrag muss weiterlaufen und die Szene später fertig sein.

## Schritt 7 — Mux, Export und Abrechnung

- Finalen Zusammenschnitt erzeugen: Stimme vorn, Atmo leise darunter,
  Untertitel korrekt gesetzt und nicht abgeschnitten.
- Export prüfen (Bundle bzw. EDL/FCPXML): Bild identisch zur Vorschau.
- Guthaben nachher notieren und mit der Kalkulation vergleichen
  (Seedance 2.5: 19,90 € für 30 s). Warnung im Ereignis-Log darf nicht
  auftauchen — falls doch, sag Bescheid, dann schaue ich in den Abzug.

## Was ich parallel prüfe

Nach jedem Render lese ich Szenenstatus, die Logs von `compose-video-clips`,
`modelark-poll`, `compose-clip-webhook` und dem Mux sowie das
`ambientGate`-Ergebnis der Szene und melde Auffälligkeiten.
