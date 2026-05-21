## Befund

Statt einen zweiten Modus parallel zu pflegen, ersetzen wir den bestehenden Two-Shot-Pfad komplett durch eine echte, dialogbasierte Shot-Pipeline. Das skaliert sauber von 1 über 2 bis N Sprecher und beseitigt die Schwachstelle, dass ein einziger Two-Shot-Clip mehrere Mund-/Sprecherwechsel halten muss.

## Zielarchitektur

Eine Pipeline für 1, 2, 3 oder mehr Sprecher. Kein Sonderfall für Two-Shot mehr.

```text
Dialog-Skript (N Sprecher)
  → Shot Plan: 1 Shot pro Sprecher-Turn (+ optional Establishing / Reaction)
  → pro Shot:
       eigener Charakter-Plate (richtige Person, Outfit, Szene, Mund frei)
       genau das Audio dieses Turns
       Lip-Sync nur auf dieses eine Gesicht
       QC: richtiger Charakter, Mund sichtbar, Dauer passt
  → Scene Assembly: Shots in Reihenfolge schneiden, Audio durchlaufen lassen
  → ein einziger Szenen-Clip als finaler clip_url (kompatibel zum Composer)
```

Damit gibt es kein „Pass 1 / Pass 2" mehr und kein Multi-Window-Targeting auf demselben Bild.

## Was aus dem alten Two-Shot-Pfad wird

- Das Datenmodellfeld `engine_override = 'cinematic-sync'` bleibt als Trigger erhalten.
- Die Two-Shot-Anchor-/Pass-1-/Pass-2-Logik wird ersetzt.
- Stages werden generischer:
  ```text
  audio → shot_plan → shot_render[i] → shot_lipsync[i] → assemble → done
  ```
- Alte Felder wie `twoshot_stage='lipsync_1' | 'lipsync_2'` werden ersetzt durch eine generische Shot-Liste pro Szene.
- Bestehende, bereits fertige Szenen bleiben spielbar. Neue Renders gehen automatisch durch die neue Pipeline.

## Was wir konkret umbauen

### 1. Dialog-Parsing für N Sprecher
- Speaker-Erkennung aus `Name: Zeile` für beliebig viele Sprecher.
- Audio wird weiterhin als ein sample-genaues Master-WAV erzeugt, zusätzlich pro Turn eine eigene Mini-WAV (genau der Audioabschnitt dieses Turns).
- Pausen, Reihenfolge, Sprecher-IDs werden deterministisch festgehalten.

### 2. Shot Planner
- Erzeugt pro Turn einen Shot mit Sprecher, Audiofenster, Zielcharakter, Outfit, Szene, Kameraeinstellung.
- Optional Establishing-Shot am Anfang, Reaction-Shot bei langen Pausen.
- Bei nur 1 Sprecher → ein einziger Sprecher-Shot.
- Bei 3+ Sprechern → genauso viele Shots wie Turns. Keine Sonderlogik.

### 3. Shot-Renderer
- Pro Shot wird ein eigener Plate generiert (richtiger Charakter, sichtbarer Mund, korrektes Outfit, gewünschte Location).
- Multi-Charakter-Szenen liefern weiterhin Establishing-Shot mit allen Personen, aber das ist ein eigener Shot ohne Lip-Sync.

### 4. Shot-Lip-Sync
- Pro Shot genau ein Lip-Sync-Job auf genau ein Gesicht mit genau einem Audiosegment.
- Kein Multi-Window, kein zweiter Pass, kein Face-Switching im selben Clip.
- Skaliert linear mit Anzahl Turns: 3 Turns = 3 Jobs, 7 Turns = 7 Jobs.

### 5. QC-Gate pro Shot
- Richtiger Charakter sichtbar
- Mund nicht verdeckt
- Shotdauer passt zur Audiodauer
- Outfit/Location plausibel
- Falls Fail: nur dieser Shot wird neu erzeugt, nicht die ganze Szene.

### 6. Scene Assembly
- Alle Shots in Reihenfolge zu einem MP4 stitchen.
- Audio = das bekannte sample-genaue Master-WAV (so bleibt es perfekt synchron zum Composer/Export).
- Resultat wird in `clip_url` geschrieben wie heute, damit der Composer/Export nichts merken muss.

### 7. UI / Fortschritt
- Pro Szene wird die Shot-Liste mit Status angezeigt.
- Echte Steps statt globalem 95-%-Spinner.
- Retry-Button pro Shot.
- Anzahl Sprecher wird nicht mehr begrenzt — UI zeigt N Sprecher korrekt an.

### 8. Watchdog / Refund
- Heutige Two-Shot-Watchdog-Logik wird auf Shot-Level umgestellt.
- Refund passiert pro Shot-Fehlversuch, nicht pauschal pro Szene.

## Reihenfolge der Umsetzung

1. Datenmodell erweitern: Shot-Liste pro Szene, Shot-Status, Shot-Audiofenster.
2. Dialog-Parser auf N Sprecher umstellen.
3. Shot Planner.
4. Shot Renderer (ein Provider-Aufruf pro Shot).
5. Turn-Lip-Sync (ein Job pro Shot).
6. QC-Gate pro Shot.
7. Scene Assembly zu einem `clip_url`.
8. UI: Shot-Liste mit Live-Status, Retry pro Shot.
9. Watchdog/Refund auf Shot-Ebene migrieren.
10. Alten Two-Shot-Codepfad entfernen, sobald die neue Pipeline grün ist.
11. Mit deiner aktuellen 2-Sprecher-Szene gegentesten, dann eine 3-Sprecher-Szene als Abnahmefall.

## Was du als Ergebnis bekommst

- Ein konsistenter Pfad für 1, 2 und mehr Sprecher.
- Keine „zweiter Satz fehlt" Bauchredner-Effekte mehr, weil jeder Satz seinen eigenen Shot hat.
- Echte filmische Schnitte statt einer einzigen langen Aufnahme.
- Fehler werden auf Shot-Ebene sichtbar und gezielt wiederholbar.
- Klare Skalierung Richtung Mehrpersonen-Dialoge ohne neuen Sondercode.