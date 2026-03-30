

## Plan: Reset-Button für Director's Cut

### Änderung

Ein "Neues Projekt"-Button wird im Header des Director's Cut (Steps-Modus) neben dem bestehenden Back-Button eingefügt. Er setzt alle States auf ihre Defaults zurück und löscht den SessionStorage-Draft.

### Umsetzung in `src/pages/DirectorsCut/DirectorsCut.tsx`

**1. Reset-Handler hinzufügen** (nach `handleBackNavigation`):
- Ruft `clearDraft()` auf
- Setzt alle ~20 States auf ihre Initialwerte (Video=null, Step=1, Szenen=[], etc.)
- Zeigt Toast-Bestätigung

**2. Button im Header** (Zeile 874, neben dem Back-Button):
- Icon: `RotateCcw` (oder `Trash2`) aus lucide-react
- Label: "Neues Projekt"
- Variant: `outline` mit destructive Styling
- Bestätigungsdialog (AlertDialog) vor dem Zurücksetzen, damit man nicht versehentlich alles löscht

### Betroffene Datei
- `src/pages/DirectorsCut/DirectorsCut.tsx` — Reset-Handler + Button mit Bestätigungsdialog

