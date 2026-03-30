

## Plan: Director's Cut — Zustand bei Navigation beibehalten

### Problem
Alle Einstellungen im Director's Cut (ausgewähltes Video, Szenen, Übergänge, Effekte, Schritt-Position etc.) liegen in ~20 `useState`-Hooks in `DirectorsCut.tsx`. Beim Seitenwechsel wird die Komponente unmounted und alles geht verloren.

### Lösung: SessionStorage-basierte Persistenz

Ähnlich wie das Picture Studio einen In-Memory-Cache nutzt und der Universal Video Creator `localStorage`-Drafts hat, bekommt der Director's Cut eine **SessionStorage-Persistenz** (überlebt Navigation, wird bei Tab-Schließen automatisch aufgeräumt).

### Umsetzung

**1. Neuer Helper: `src/lib/directors-cut-draft.ts`**
- Speichert/lädt den gesamten Projekt-Zustand als JSON in `sessionStorage` unter einem festen Key
- Enthält: `selectedVideo`, `currentStep`, `scenes`, `transitions`, `appliedEffects`, `audioEnhancements`, `exportSettings`, `styleTransfer`, `colorGrading`, `sceneColorGrading`, `speedKeyframes`, `kenBurnsKeyframes`, `chromaKey`, `upscaling`, `interpolation`, `restoration`, `textOverlays`, `voiceOverUrl`, `backgroundMusicUrl`
- Funktionen: `saveDraft()`, `loadDraft()`, `clearDraft()`, `hasDraft()`
- Version-Feld für Kompatibilität bei zukünftigen Änderungen

**2. Integration in `DirectorsCut.tsx`**
- Beim Mount: `loadDraft()` aufrufen und alle States initialisieren (statt Default-Werte)
- Per `useEffect` mit Debounce (~500ms): bei jeder relevanten State-Änderung `saveDraft()` aufrufen
- Bei erfolgreichem Export oder explizitem "Neues Projekt": `clearDraft()` aufrufen
- Kein Wiederaufnahme-Dialog nötig — der Zustand wird einfach still wiederhergestellt

**3. Was NICHT persistiert wird**
- `isAnalyzing` (laufende Prozesse)
- `currentTime` (Playback-Position)
- `user` (wird separat geladen)
- `projectId` (wird aus URL/Supabase geladen)
- Temporäre UI-States wie `editorMode`

### Betroffene Dateien
- **Neu:** `src/lib/directors-cut-draft.ts`
- **Geändert:** `src/pages/DirectorsCut/DirectorsCut.tsx` — Draft-Load beim Mount, Auto-Save per useEffect, Clear bei Export/Reset

### Ergebnis
- Seitenwechsel → zurück zum Director's Cut = alles ist noch da (Video, Schritt, Szenen, Effekte)
- Tab schließen = automatisch aufgeräumt (sessionStorage)
- Export abgeschlossen = Draft wird gelöscht, sauberer Neustart

