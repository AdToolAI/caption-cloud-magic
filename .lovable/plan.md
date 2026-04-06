

## Plan: Hinweis beim Verlassen während Video-Generierung

### Problem
Wenn ein Nutzer während der Video-Generierung die Seite verlässt (z.B. navigiert weg oder klickt "Neues Video starten"), gibt es keinen Hinweis, dass das Video im Hintergrund weiter generiert wird und später in der Mediathek/im Verlauf zu finden ist.

### Umsetzung

**Datei: `src/components/universal-video-creator/UniversalVideoWizard.tsx`**

1. **`beforeunload`-Warnung** — Wenn `isAutoGenerating === true`, Browser-Warning beim Tab-Schließen/Verlassen aktivieren (Standard-Browser-Dialog)

2. **Toast-Hinweis bei Navigation weg** — Wenn der Nutzer während der Generierung auf "Neues Video starten", "Zurück" oder eine andere Seite navigiert, einen persistenten Toast anzeigen:
   > "Dein Video wird im Hintergrund fertig generiert. Du findest es in deinem Verlauf unter **Sora AI Videos**, sobald es bereit ist."

3. **"Neues Video starten"-Button absichern** — Während `isAutoGenerating` einen Bestätigungs-Dialog zeigen: "Die Generierung läuft noch im Hintergrund weiter. Du findest das Video später im Verlauf."

**Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`**

4. **Minimieren-Button** — Einen "Im Hintergrund weiterlaufen lassen"-Button unter dem Fortschrittsbalken hinzufügen, der den Nutzer zurück zur Hauptseite navigiert und den Toast-Hinweis zeigt.

### Ergebnis
- Nutzer werden informiert, dass die Generierung weiterläuft
- Klarer Verweis auf den Verlauf/Mediathek wo das fertige Video erscheint
- Kein versehentlicher Datenverlust durch Navigation

