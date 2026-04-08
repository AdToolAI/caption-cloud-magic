

## Plan: F5 setzt Director's Cut zurück zur Video-Auswahl

### Problem

Der Draft wird in `sessionStorage` gespeichert und beim Laden der Seite via `loadDraft()` wiederhergestellt. Da `sessionStorage` innerhalb desselben Tabs über Seiten-Refreshes (F5) hinweg bestehen bleibt, wird der Nutzer direkt zurück ins Studio gebracht statt zur Video-Auswahl.

### Lösung

**Datei: `src/pages/DirectorsCut/DirectorsCut.tsx`**

Beim initialen Laden der Seite (`useEffect` mit leerem Dependency-Array) `clearDraft()` aufrufen, **bevor** der Draft geladen wird. Dazu einen Check einbauen, ob die Seite frisch geladen wurde (via `performance.navigation.type === 1` / `PerformanceNavigationTiming`) oder einfacher: einen `sessionStorage`-Flag (`directors-cut-session-active`) setzen. Wenn das Flag beim Laden **bereits** existiert, wurde die Seite refresht → Draft löschen und bei Video-Auswahl starten. Wenn es nicht existiert, ist es ein frischer Besuch → Flag setzen und normal fortfahren (Draft auch ignorieren, da kein vorheriger State).

Alternativ (einfachster Ansatz): Die Draft-Wiederherstellung komplett entfernen. Der Draft dient dann nur noch der internen Auto-Save-Logik innerhalb einer Session, wird aber bei F5 nie wiederhergestellt.

**Konkreter Ansatz**: Im `useEffect` das `loadDraft()` durch `clearDraft()` ersetzen, sodass bei jedem Mount der Seite der Draft gelöscht wird und der Nutzer immer bei der Video-Auswahl startet.

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `src/pages/DirectorsCut/DirectorsCut.tsx` | Draft-Wiederherstellung entfernen, stattdessen `clearDraft()` beim Mount |

### Ergebnis

- F5 / Page Refresh → Nutzer landet bei der Video-Auswahl
- Alle vorherigen Änderungen werden zurückgesetzt
- Innerhalb einer laufenden Session funktioniert Auto-Save weiterhin (Step-Navigation etc.)

