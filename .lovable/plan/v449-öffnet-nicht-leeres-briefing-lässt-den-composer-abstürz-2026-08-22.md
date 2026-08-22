# V449 öffnet nicht — leeres Briefing lässt den Composer abstürzen

## Ursache (geprüft)

Das Projekt `ed82075f-…` (V449) wurde mit `briefing = {}` und
`assembly_config = {}` angelegt. Beim Laden ersetzt der Composer sein
Standard-Briefing durch diesen leeren Wert (`briefing ?? prev.briefing` greift
nur bei `null`, nicht bei `{}`). Danach liest der Briefing-Tab
`briefing.productName.trim()` — auf `undefined`. Genau das ist die Meldung
„Cannot read properties of undefined (reading 'trim')".

Die Szene selbst ist vollständig und korrekt (4 Cast-Einträge, 6 Dialog-Turns,
deutsche Stimmen, `clip_status = pending`).

## Was gemacht wird

1. **Datenkorrektur für V449**
   Das Projekt bekommt ein vollständiges Briefing (Modus, Produktname
   „V449 — Rooftop Movement Lipsync Test", Beschreibung aus der Szenen-Regie,
   Tonalität, Dauer 15 s, Seitenverhältnis) und eine gültige Assembly-Config,
   passend zu den Standardwerten der App.

2. **Code-Härtung, damit das nie wieder crasht**
   - Beim Laden werden Briefing und Assembly-Config aus der Datenbank über die
     Standardwerte *gemerged* statt sie zu ersetzen.
   - Der Briefing-Tab liest Textfelder defensiv, sodass ein unvollständiger
     Datensatz höchstens leere Felder zeigt statt die Seite abzuschießen.

3. **Verifikation**
   Projektlink im Browser öffnen und bestätigen: Briefing-Tab rendert,
   1 Szene sichtbar, kein Fehler in der Konsole. Kein Render, keine Credits.

## Technische Details

- `UPDATE composer_projects SET briefing = <vollständiges JSON>, assembly_config = <Default>` nur für `ed82075f-f888-4b17-ba00-ecf506eb6363`.
- `src/components/video-composer/VideoComposerDashboard.tsx` (Hydration ~Z. 344/346): `{ ...DEFAULT_BRIEFING, ...(projRow.briefing ?? {}) }` bzw. gleiches Muster für `assemblyConfig`.
- `src/components/video-composer/BriefingTab.tsx` Z. 316 und 501: `(briefing.productName ?? '').trim()`.
- Keine Änderung an der Lip-Sync-Kette, an Edge Functions oder an anderen Projekten.
