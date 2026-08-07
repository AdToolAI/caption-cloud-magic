# Meta-Diff: AdTool-Konto und Facebook-Profil eindeutig trennen

## Sicher gemessener Befund

Die drei aktuellen, abgeschlossenen OAuth-Callbacks waren:

| Zeit (Berlin) | AdTool-Konto | Meta-User-ID | Ergebnis |
|---|---|---|---|
| 7.8. 23:56 | `ab6b…` | `122116259151337304` (neu) | 0 Seiten, `business_management` fehlt |
| 7.8. 23:57 | `8948…` | `122337042788329815` (alt) | 2 Seiten, `business_management` erteilt |
| 8.8. 00:01 | `ab6b…` | `122116259151337304` (neu) | 0 Seiten, `business_management` fehlt |

Jeder Versuch hat eine eigene Diagnostic-ID und einen eigenen State. Callback und Datenbankzuordnung sind korrekt; es werden keine Zeilen überschrieben oder vermischt.

## Warum das Panel trotzdem irreführend wirkt

`meta-oauth-diff` lädt aus Sicherheitsgründen nur Diagnosen des **aktuell angemeldeten AdTool-Kontos** (`user_id = aktueller Nutzer`). Der funktionierende Versuch um 23:57 gehört zum anderen AdTool-Konto und kann deshalb im Panel des neuen AdTool-Kontos nicht erscheinen.

Im Screenshot wurde daher verglichen:

- A: neuer Meta-User um 23:56 (0 Seiten)
- B: abgebrochener Versuch um 23:36 (keine Callback-Daten)

Der Name „Samuel Dusatko“ ist bei beiden Facebook-Profilen gleich und verdeckt zusätzlich, welches Profil wirklich gemeint ist. Das Panel zeigt also nicht Daten des alten Accounts; seine Beschriftung macht nur die Identität und den Abbruchstatus zu unklar.

## Umsetzung

1. **Identität je Spalte unübersehbar anzeigen**
   - Vollständige `meta_user_id`
   - Meta-Profilname
   - lokaler Zeitstempel
   - kurze Diagnostic-ID
   - Status „abgeschlossen“ oder „abgebrochen“

2. **Auswahllabels eindeutig machen**
   - Format: `Meta-ID …337304 · 0 Seiten · 8.8. 00:01 · Diagnostic 45159e4a`
   - Nicht mehr primär über den identischen Namen „Samuel Dusatko“ beschriften.

3. **Abgebrochene Versuche aus dem normalen Vergleich entfernen**
   - Standardmäßig nur abgeschlossene Callbacks anbieten.
   - Abgebrochene Starts separat und ausgegraut anzeigen; sie dürfen nicht automatisch als A oder B gewählt werden.

4. **Falsche Vergleiche verhindern**
   - Bei gleicher `meta_user_id` Warnung anzeigen: „Beide Spalten gehören zum selben Facebook-Profil.“
   - Bei fehlender zweiter unterschiedlicher Meta-ID klar erklären: „Für dieses AdTool-Konto liegt nur ein Facebook-Profil vor.“
   - Automatisch die zwei jüngsten abgeschlossenen Datensätze mit unterschiedlichen Meta-IDs wählen, sofern beide im aktuellen AdTool-Konto vorhanden sind.

5. **Kontogrenze ehrlich erklären statt aufzuweichen**
   - Das Panel bleibt strikt auf das aktuelle AdTool-Konto begrenzt; Diagnosen eines anderen Kundenkontos dürfen nicht sichtbar werden.
   - Für den kontrollierten internen A/B-Test wird im Diagnose-Panel eine kompakte, tokenfreie Vergleichszusammenfassung exportierbar gemacht (Meta-ID, Scopes, Counts, Status, Diagnostic-ID). Die Zusammenfassungen beider Testkonten können anschließend ohne Tokens nebeneinander geprüft werden.

## Technische Details

- `src/components/performance/MetaOAuthDiff.tsx`: eindeutige Labels, Identitätskopf, Completed-Filter, Warnzustände und sichere Zusammenfassungs-Kopie.
- `supabase/functions/meta-oauth-diff/index.ts`: `callback_completed_at` explizit im Summary zurückgeben; bestehende `user_id`-Filterung unverändert beibehalten.
- `src/lib/translations.ts`: Texte in DE/EN/ES.
- Keine Änderung an OAuth-Scopes, Callback-Zuordnung, Meta-Konfiguration oder Zugriffsgrenzen.

## Abnahme

- Im neuen AdTool-Konto erscheinen die beiden abgeschlossenen neuen Meta-Versuche, eindeutig als Meta-ID `…337304` und 0 Seiten markiert; abgebrochene Einträge werden nicht vorausgewählt.
- Im alten AdTool-Konto erscheint der funktionierende Meta-Versuch eindeutig als Meta-ID `…329815`, 2 Seiten und `business_management` erteilt.
- Kein AdTool-Konto kann die Rohdiagnosen eines anderen Kontos laden.