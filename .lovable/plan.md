

## Plan: Wizard-Stepper vereinfachen und Fehler beheben

### Probleme
1. **Zu viele Stufen** — Manual-Modus hat 13 Steps, Full-Service 9. Das überflutet die Stepper-Leiste und ist auf dem Bildschirm nicht mehr lesbar.
2. **Fehlende Übersetzungen** — `uvc.stepProductImages` und `uvc.stepProductImagesDesc` existieren nicht in `src/lib/translations.ts`, daher werden die rohen Keys angezeigt.
3. **Leere Seite nach Beratung** — Die Consultation-Validation-Warnung ist nicht kritisch, aber die Seite zeigt keinen Content.
4. **Service-Worker Cache-Fehler** — `PUT`/`PATCH` Methoden werden vom SW-Cache versucht.

### Änderungen

**1. Stepper zu kompakten Punkten zusammenfassen (`UniversalVideoWizard.tsx`)**

Statt jeden einzelnen Step als breiten Button mit Label anzuzeigen, werden die Steps zu **Phasen-Gruppen** zusammengefasst:

- **Full-Service** (aktuell 9 → 5 Punkte):
  - Vorbereitung (Kategorie + Bilder + Stimmung + Stil + Modus)
  - Beratung
  - Generierung
  - Vorschau
  - Export

- **Manual** (aktuell 13 → 6 Punkte):
  - Vorbereitung (Kategorie + Bilder + Stimmung + Stil + Modus)
  - Beratung
  - Konzept (Briefing + Script + Storyboard)
  - Produktion (Visuals + Animation)
  - Audio
  - Export

Der Stepper zeigt nur **kleine Kreise/Punkte** mit kurzen Labels statt der aktuellen breiten Buttons. Auf Mobile wird nur der aktuelle Punkt + Nummer angezeigt.

**2. Fehlende Übersetzungen in `src/lib/translations.ts` hinzufügen**

Neue Keys für EN, DE, ES:
- `stepProductImages` / `stepProductImagesDesc`

**3. Service-Worker Cache-Fix (`sw.js` oder relevante SW-Datei)**

Die `PUT`/`PATCH`-Fehler kommen daher, dass der Service Worker versucht, nicht-GET-Requests zu cachen. Einen Check hinzufügen der nur `GET`-Requests cached.

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/universal-video-creator/UniversalVideoWizard.tsx` | Stepper zu Phasen-Gruppen zusammenfassen, kompaktere Punkt-Darstellung |
| `src/lib/translations.ts` | Fehlende `stepProductImages`-Keys für EN/DE/ES |
| Service-Worker Datei | GET-only Cache-Check |

### Ergebnis
- Stepper hat 5-6 übersichtliche Punkte statt 9-13 überladene Buttons
- Keine rohen Translation-Keys mehr sichtbar
- Keine Cache-Fehler mehr im Console-Log

