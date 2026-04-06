

## Plan: Hinweis beim Verlassen während Video-Generierung — AIVideoStudio

### Problem

Die Sicherheitsfeatures (beforeunload-Warnung, Toast bei Navigation, Minimize-Button) wurden nur im **Universal Video Creator** implementiert. Der User generiert Videos aber über die **AI Video Studio** Seite (`/ai-video-studio` / `AIVideoStudio.tsx`), wo keine dieser Warnungen existieren.

### Umsetzung

**Datei: `src/pages/AIVideoStudio.tsx`**

1. **`beforeunload`-Warnung** — Wenn ein Video gerade generiert wird (Status "generating"/"processing"), Browser-Warning beim Tab-Schließen aktivieren

2. **Tab-Wechsel absichern** — Wenn der User während einer aktiven Generierung den Tab wechselt (z.B. von "Generieren" zu "Verlauf"), einen Toast anzeigen:
   > "Dein Video wird im Hintergrund fertig generiert. Du findest es im Verlauf, sobald es bereit ist."

3. **Navigationswarnung** — Beim Verlassen der Seite (Route-Wechsel) ebenfalls Toast-Hinweis anzeigen, wenn eine Generierung aktiv ist

**Datei: `src/components/ai-video/VideoGenerationHistory.tsx`**

4. **Aktive Generierungen hervorheben** — Bei Videos mit Status "Wird generiert..." einen deutlicheren Hinweis anzeigen, dass die Generierung im Hintergrund weiterläuft (z.B. pulsierender Indikator + Text "Generierung läuft im Hintergrund weiter")

### Technische Details

- Generierungsstatus wird aus dem bestehenden State in AIVideoStudio ermittelt (polling/generation state)
- `beforeunload` Event Listener analog zur bestehenden Implementierung im UniversalVideoWizard
- Toast via `sonner` (bereits importiert)
- `useNavigate` + `useEffect` cleanup für Route-Wechsel-Erkennung

### Ergebnis
- Warnungen greifen jetzt auf der Seite, die der User tatsächlich nutzt
- Klarer Hinweis beim Tab-Schließen, Tab-Wechsel und Navigation

