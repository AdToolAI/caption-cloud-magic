

## Bugfix: Genre & Mood sollen leer starten (keine Kollision mit Suche)

### Problem
Beim Aktivieren von „Hintergrundmusik" werden Genre auf `electronic` und Mood auf `energetic` vorbelegt. Diese Werte werden bei jeder Suche **immer** als Filter an `search-stock-music` mitgesendet (`AudioTab.tsx` Zeile 146) — auch wenn der Nutzer im Freitext „Fantasy" sucht. Ergebnis: die Suche wird durch die voreingestellten Filter eingeengt und liefert teils irrelevante Treffer.

### Fix

**Datei:** `src/components/video-composer/AudioTab.tsx`

1. **Default leer setzen** (Zeile 233): Beim Aktivieren des Music-Switches `genre: ''` und `mood: ''` statt `'electronic'` / `'energetic'`.

2. **Selects zeigen Placeholder** (Zeilen 267–296): Beide `<Select>`-Komponenten erhalten:
   - `<SelectValue placeholder="Beliebig" />` (lokalisiert via neuem Key `videoComposer.anyOption`)
   - Eine zusätzliche „Beliebig"-Option mit Wert `''`, sodass der Nutzer aktiv zurücksetzen kann

3. **Suche respektiert leere Filter** (Zeilen 144–146):
   - `effectiveQuery`: Wenn Freitext leer **und** beide Filter leer → klare Toast-Meldung „Bitte Suchbegriff oder Genre/Stimmung wählen" statt einer leeren Query
   - Im Body: `genre` und `mood` nur mitsenden wenn nicht leer (`...(music.genre && { genre: music.genre })`)

4. **Übersetzungs-Key ergänzen** in `src/lib/translations.ts` für DE/EN/ES:
   - `anyOption`: „Beliebig" / „Any" / „Cualquiera"

### Verhalten danach
- Music-Switch aktivieren → Genre + Stimmung stehen auf „Beliebig"
- Freitext „Fantasy" eingeben → Suche läuft **nur** über den Begriff, ohne Genre-Filter
- Optional Genre/Stimmung wählen → wird zusätzlich als Filter mitgegeben
- Alles leer + Suche klicken → Hinweis-Toast statt leerer Query

### Risiko & Aufwand
Sehr niedrig. ~3 Min, eine UI-Datei + 3 Übersetzungs-Strings. Keine API- oder DB-Änderung; `search-stock-music` ignoriert fehlende `genre`/`mood`-Felder bereits.

