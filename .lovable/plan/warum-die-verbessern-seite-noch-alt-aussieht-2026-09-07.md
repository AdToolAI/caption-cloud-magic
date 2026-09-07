# Warum die Verbessern-Seite noch alt aussieht

Der neue Stand ist gebaut, aber **noch nicht scharf geschaltet**:

1. Die neuen Auswahlfelder (Modell, Dateiqualität, Bewegungsglättung, Startsperre
   mit Begründung) stehen fertig im Code der Oberfläche und werden von der
   Vorschau auch schon ausgeliefert — der geöffnete Tab im Screenshot zeigt noch
   den vorher geladenen Stand.
2. Der **Serverteil wurde bewusst nicht ausgerollt** (letzte Runde: „nicht
   deployed"). Deshalb kennt der Server die neuen Topaz-Modellnamen nicht,
   schickt den Auftrag weiter an ByteDance und antwortet mit
   „Invalid combination: unknown_mode". Genau das steht im Screenshot.

Es fehlt also kein Bau — es fehlt das Ausrollen plus ein sauberer Neuaufbau der
Seite.

## Was gemacht wird

### 1. Serverteil ausrollen
Die vier Funktionen der Verbessern-Kette (`video-enhance`,
`video-enhance-webhook`, `video-enhance-reconcile`, `video-enhance-cost-closure`)
und `enhance-image` werden mit dem aktuellen Stand ausgerollt, damit Server und
Oberfläche denselben Modellkatalog benutzen.

### 2. Kostenlos gegenprüfen
Ohne einen einzigen bezahlten Lauf:
- Preisvorschau (`estimate`) für Topaz Hochkant-4K: erwartet Topaz als
  ausführende Engine, echtes Ziel 2160×3840, kein „unknown_mode".
- Preisvorschau für ein Modell mit festem Vergrößerungsfaktor bei
  unpassendem Ziel: erwartet saubere Absage mit genanntem Grund, kein stilles
  Umschreiben.
- Preisvorschau ohne Bildratenwechsel: erwartet keine Bewegungsglättung im
  Auftrag und nicht im Preis.
- Ungültige Dateiqualität und unbekanntes Bewegungsmodell: erwartet klare
  Ablehnung.

### 3. Oberfläche am echten Bildschirm nachsehen
Die Verbessern-Seite wird im laufenden Programm geöffnet und abfotografiert:
Modellauswahl, Dateiqualität, Bewegungsglättung (nur bei geänderter Bildrate),
Zielgröße und der Übersichtsblock vor dem Start müssen sichtbar sein.

### 4. Nur dann Code anfassen
Zeigt einer der Punkte einen echten Fehler, wird er behoben; sonst bleibt der
Code unverändert.

## Technische Details

- Deploy über die Edge-Function-Deployment-Funktion; keine Migration nötig
  (`requested_output_quality`, `executing_topaz_model`, `interpolation_model`
  existieren bereits).
- Prüfung der `estimate`-Route per direktem Funktionsaufruf mit gültigem Token
  des QA-Kontos; `estimate` bucht nichts und startet keinen Anbieterlauf.
- Sichtprüfung per Playwright gegen `localhost:8080` mit wiederhergestellter
  Sitzung.
- Unverändert: Preisdeckel, Gutschriftlogik, Wallet, Lip-Sync, Director's Cut.

## Was danach noch offen bleibt

Ein bezahlter Live-Lauf je Engine (Topaz Hochkant-4K, ByteDance) und das
Veröffentlichen der App — beides nur auf deine ausdrückliche Freigabe.
