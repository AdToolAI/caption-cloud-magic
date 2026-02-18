

# Fix: Interview-Antworten gehen verloren bei "Zurueck zum Interview"

## Problem

Wenn die Video-Generierung fehlschlaegt und der Nutzer "Zurueck zum Interview" klickt, ist der gesamte Chat-Verlauf weg. Der Nutzer muss alle 22 Phasen von vorne durchlaufen.

## Ursache

In `UniversalVideoConsultant.tsx` wird `localStorage.removeItem('universal-video-consultant-state')` aufgerufen, **bevor** die Generierung ueberhaupt startet (Zeilen 187 und 266). Sobald die Beratung abgeschlossen ist und `onConsultationComplete` ausgeloest wird, ist der localStorage leer.

Wenn der Nutzer dann zurueck navigiert, mountet der Consultant neu und findet keinen gespeicherten Zustand -- die Konversation beginnt von vorne.

```
Ablauf (aktuell):
Interview fertig --> localStorage geloescht --> Generierung startet --> Fehler --> "Zurueck" --> leerer Chat
```

## Loesung

**localStorage NICHT in der Consultant-Komponente loeschen.** Stattdessen nur loeschen wenn:
1. Die Generierung **erfolgreich** abgeschlossen ist (im Wizard nach Completion)
2. Der Nutzer bewusst zurueck zur Kategorie-Auswahl navigiert (bereits implementiert)

### Aenderung 1: Consultant -- localStorage-Bereinigung entfernen
**Datei:** `src/components/universal-video-creator/UniversalVideoConsultant.tsx`

- **Zeile 187:** `localStorage.removeItem('universal-video-consultant-state')` entfernen
- **Zeile 266:** `localStorage.removeItem('universal-video-consultant-state')` entfernen

Die Daten bleiben erhalten, bis die Generierung erfolgreich ist oder der Nutzer manuell zuruecksetzt.

### Aenderung 2: Wizard -- localStorage nach erfolgreicher Generierung loeschen
**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

- In der Completion-Logik (wenn Auto-Generierung erfolgreich abschliesst) `localStorage.removeItem('universal-video-consultant-state')` hinzufuegen
- Sicherstellen, dass `handleBackToCategory` weiterhin alles bereinigt (ist bereits der Fall, Zeile 121)

### Aenderung 3: consultationResult im Wizard persistieren
**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

- `consultationResult` ebenfalls in `universal-video-wizard-state` localStorage speichern
- Beim Laden aus localStorage wiederherstellen
- Damit kann nach "Zurueck zum Interview" und erneuter Beratungs-Bestaetigung die Generierung sofort neu gestartet werden, ohne dass die Ergebnisse verloren gehen

## Erwartetes Ergebnis

```
Ablauf (nachher):
Interview fertig --> localStorage bleibt --> Generierung startet --> Fehler --> "Zurueck" --> Chat mit allen Antworten
                                                                --> Erfolg --> localStorage geloescht
```

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `UniversalVideoConsultant.tsx` | 2x `localStorage.removeItem` entfernen |
| `UniversalVideoWizard.tsx` | `localStorage.removeItem` bei Erfolg hinzufuegen + `consultationResult` persistieren |

