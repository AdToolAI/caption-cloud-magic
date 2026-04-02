

## Fix: Original-Untertitel werden in Schritt 9 nicht angezeigt

### Ursache

Zwei Probleme gefunden:

1. **Fehler wird verschluckt**: Wenn die `generate-subtitles` Edge Function fehlschlägt (z.B. Timeout bei grossen Videos, Download-Fehler), wird der Fehler nur als `console.warn` geloggt — kein Toast, kein UI-Feedback. Der User sieht nichts.

2. **Kein Timeout-Schutz**: Die Edge Function hat kein erhöhtes Timeout konfiguriert. Grosse Videos brauchen länger zum Downloaden und Transkribieren.

3. **Kein Retry/Feedback**: Wenn die Erkennung fehlschlägt, gibt es keinen Button zum manuellen Neu-Versuchen. Der `originalSubsDetectedRef` verhindert auch einen automatischen Retry.

### Umsetzung

**1. `supabase/config.toml`**
- Timeout für `generate-subtitles` auf 120 Sekunden erhöhen

**2. `src/components/directors-cut/studio/CapCutEditor.tsx`**
- Bei Fehler einen Toast mit Fehlermeldung anzeigen statt nur `console.warn`
- `originalSubsDetectedRef` bei Fehler zurücksetzen, damit ein Retry möglich ist
- Loading-State mit Info-Text anzeigen ("Originaluntertitel werden erkannt...")

**3. `src/components/directors-cut/studio/CapCutSidebar.tsx`**
- "Erneut erkennen"-Button anzeigen wenn keine Original-Untertitel vorhanden und nicht gerade am Laden
- Lade-Indikator ("Erkennung läuft...") sichtbar im Untertitel-Tab

### Betroffene Dateien

1. `supabase/config.toml` — Timeout erhöhen
2. `src/components/directors-cut/studio/CapCutEditor.tsx` — Fehlerbehandlung + Retry-Logik
3. `src/components/directors-cut/studio/CapCutSidebar.tsx` — Retry-Button + besseres Feedback

