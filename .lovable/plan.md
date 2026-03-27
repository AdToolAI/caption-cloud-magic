

## Problem: useadtool.ai zeigt "Your app will live here"

### Diagnose

Die App funktioniert in der Lovable-Preview einwandfrei (Session Replay zeigt die Landing Page mit Animationen). Das Problem betrifft nur die deployed Version auf `https://www.useadtool.ai`.

Die Meldung "Your app will live here / Ask Lovable to build it" ist der Standard-Platzhalter von Lovable, der erscheint, wenn kein aktueller Build deployed ist.

### Ursache

Nach den vielen Code-Änderungen (DirectorsCutPreviewPlayer, NativeTransitionLayer etc.) wurde die Frontend-Version nicht neu published. Backend-Änderungen (Edge Functions, DB) deployen automatisch, aber **Frontend-Änderungen erfordern einen manuellen Klick auf "Update"** im Publish-Dialog.

### Lösung — kein Code-Change nötig

1. In Lovable oben rechts auf **"Publish"** klicken
2. Im Dialog auf **"Update"** klicken
3. Warten bis der Build durchgelaufen ist
4. `https://www.useadtool.ai` neu laden

Falls die Seite danach immer noch nicht geht:
- Prüfen ob die Custom Domain (`useadtool.ai`) noch korrekt in den Project Settings unter "Domains" verknüpft ist
- Den `www`-Subdomain-Redirect prüfen (dein Screenshot zeigt `www.useadtool.ai` — möglicherweise ist nur `useadtool.ai` ohne `www` konfiguriert)

### Hinweis zum www-Redirect

Dein Screenshot zeigt `https://www.useadtool.ai`. Falls die Domain nur als `useadtool.ai` (ohne www) konfiguriert ist, musst du bei deinem DNS-Provider einen CNAME-Eintrag für `www` anlegen, der auf dieselbe Lovable-App zeigt — oder einen Redirect von `www` auf die nackte Domain einrichten.

