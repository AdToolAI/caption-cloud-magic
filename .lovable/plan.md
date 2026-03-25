

## Editor-Voreinstellung + KI-Auto-Beschreibung aus Video

### Problem
1. Wenn der Editor geoeffnet wird, zeigt er immer 12:00 statt der tatsaechlichen (ggf. neu berechneten) Post-Zeit
2. Es gibt keine "KI Auto-Ausfuellen"-Funktion, die anhand des Videos automatisch Caption und Hashtags generiert

### Aenderungen

#### 1. `src/components/dashboard/WeekPostEditor.tsx` — Zeit-Voreinstellung + KI-Auto-Button

**Zeit-Fix**: Der `useState`-Initialwert fuer `time` nutzt bereits `post?.suggestedTime`, aber der Reset-Effekt (aktuell faelschlicherweise als `useState(() => ...)` statt `useEffect`) wird korrigiert zu einem richtigen `useEffect` mit `[post]` Dependency, damit bei jedem neuen Post die korrekte `suggestedTime` (z.B. "21:00" bei rescheduled Posts) gesetzt wird.

**Neuer "KI Auto-Ausfuellen" Button**: Neben dem bestehenden "KI optimieren" Button kommt ein neuer Button, der:
- Prüft ob ein Video/Bild vorhanden ist (`mediaUrl`)
- Die `mediaUrl` + Plattform + Content-Idee an die Edge Function `generate-post-caption` sendet
- Caption und Hashtags automatisch befuellt
- Falls kein Medium vorhanden: nur anhand der `contentIdea` generieren

#### 2. `supabase/functions/generate-post-caption/index.ts` — Neue Edge Function

Diese Edge Function existiert noch nicht. Sie wird erstellt mit:
- Empfaengt `description`, `platform`, `language`, `tone`, optional `media_url`
- Nutzt Lovable AI Gateway um Caption + Hashtags zu generieren
- Bei `media_url`: Sendet die URL als Kontext mit (Beschreibung: "Erstelle eine Caption fuer dieses Video/Bild")
- Rueckgabe: `{ caption: string, hashtags: string[] }`

#### 3. `useEffect`-Fix in WeekPostEditor

Aktuell wird `useState(() => { ... })` als Effekt missbraucht (Zeile 36-43). Das wird zu `useEffect` korrigiert, damit sich das Formular korrekt aktualisiert wenn ein neuer Post geklickt wird.

### Zusammenfassung
- Editor oeffnet mit korrekter rescheduled Zeit (z.B. 21:00)
- "KI Auto-Ausfuellen" analysiert das vorhandene Video/Bild und generiert Caption + Hashtags
- Edge Function wird neu erstellt mit Lovable AI Gateway

