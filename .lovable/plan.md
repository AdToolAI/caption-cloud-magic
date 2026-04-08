

## Plan: Auto-Untertitel-Erkennung deaktivieren — nur auf Nutzerwunsch

### Problem
Beim Öffnen eines Videos im Studio werden automatisch Untertitel erkannt und hinzugefügt (Zeile 550-608 in `CapCutEditor.tsx`). Der Nutzer wird nicht gefragt, ob er das möchte.

### Lösung
Den `useEffect`-Block (Zeile 550-608) entfernen, der automatisch `generate-subtitles` aufruft. Die Untertitel-Erkennung bleibt als **manuelle Aktion** erhalten — der Nutzer kann sie jederzeit über den "Retry Detection"-Button oder den Text-Tab in der Sidebar starten.

### Änderung

**Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`**

- **Zeile 545-608 entfernen** — den gesamten `useEffect`-Block für Auto-Detection löschen
- Die manuellen Handler (`handleRetryDetection`, `handleRemoveOriginalSubtitles`, `handleRemoveAllSubtitles`) bleiben bestehen, damit der Nutzer bei Bedarf Untertitel generieren kann

### Ergebnis
Keine automatischen Untertitel mehr beim Öffnen. Der Nutzer entscheidet selbst, wann und ob Untertitel generiert werden sollen.

