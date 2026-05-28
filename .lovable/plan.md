## Neuer "Neues Projekt"-Button im Universal Creator

### Problem
Im Wizard (Schritte 1–6) gibt es keine Möglichkeit, den aktuellen Fortschritt zu verwerfen und ein frisches Projekt zu starten. Da `localStorage` automatisch sichert, bleibt der Nutzer in der letzten Session hängen.

### Lösung
Einen **"Neues Projekt"**-Button rechts oben in der Stepper-Card platzieren (neben/über dem Stepper, sichtbar in allen Schritten).

### Verhalten
1. Klick → Bestätigungs-Dialog (AlertDialog): *"Aktuellen Fortschritt verwerfen und neues Projekt starten?"*
2. Bei Bestätigung:
   - `localStorage.removeItem('universal-creator-backup')`
   - Alle States zurücksetzen: `currentStep=0`, `formatConfig=null`, `contentConfig=null`, `backgroundAsset=null`, `audioConfig=null`, `scenes=[]`, `subtitleConfig` auf Default
   - Toast: *"Neues Projekt gestartet"*

### Datei
- `src/pages/UniversalCreator/UniversalCreator.tsx`
  - Stepper-Card-Header umbauen: Titel links, "Neues Projekt"-Button (Outline, `Plus`-Icon) rechts
  - `handleNewProject()`-Funktion + AlertDialog ergänzen
  - i18n-Keys für Button + Dialog (DE/EN/ES)

### Scope
Nur Frontend, kein Backend-Eingriff. Bestehende Draft-Persistenz für DB-Projekte (`projectId`) bleibt unberührt — der Button setzt nur den lokalen Wizard-State zurück.
