# Testergebnis ist da — es wird nur nirgends angezeigt

## Befund (aus der Datenbank gelesen)

Deine beiden Scope-Tests von heute sind sauber protokolliert:

| Zeit (Berlin) | Angefragt | Von Meta erteilt |
| --- | --- | --- |
| 11:01:04 | `business_management` | pages_show_list, pages_read_engagement, pages_manage_posts, public_profile — **kein business_management** |
| 11:01:44 | `business_management` | dieselbe Liste — **kein business_management** |

Damit ist die offene Frage beantwortet: Meta erteilt `business_management` diesem Profil **auch dann nicht, wenn ausschließlich dieser eine Scope angefragt wird**. Es ist keine Kombinationsfrage und kein App-Fehler — der Scope ist für dieses Facebook-Profil gesperrt. Dazu passt dein Screenshot: Meta zeigt gar keinen Berechtigungsdialog mehr, sondern nur „Als Samuel fortfahren“ und gibt still die alten Berechtigungen zurück.

Warum du nichts gesehen hast: das Ergebnis wird nur als kurzer Toast nach dem Rücksprung auf `/integrations` gezeigt und sonst nirgends gespeichert sichtbar. Startest du den Test aus dem Diff-Panel auf einer anderen Seite oder verpasst den Toast, ist das Ergebnis weg.

## Was ich baue

1. **Dauerhafte Ergebnis-Karte im Diff-Panel**: unter „Isolierter Scope-Test“ werden die letzten Scope-Tests dieses Kontos gelistet — Zeitpunkt, Facebook-Profil-ID, Diagnostic-ID und ein klares Urteil („business_management erteilt“ / „von Meta verweigert“). Kein Toast nötig, das Ergebnis bleibt sichtbar und ist beim nächsten Laden noch da.
2. **Klartext-Auswertung**: bei „verweigert“ steht direkt darunter, was das bedeutet — Meta blockiert den Scope für dieses Profil; App-, Scope- oder Codeänderungen ändern daran nichts, der Weg führt über ein Profil mit korrekter Portfolio-Rolle bzw. Meta-Support.
3. **Erkennbare Einträge in der Vergleichsliste**: Scope-Test-Versuche bekommen ein eigenes Label „Scope-Test“, damit sie nicht wie normale Connects mit „0 Seiten“ aussehen.
4. **Rücksprung auf die richtige Seite**: nach dem Test landest du wieder dort, wo das Panel steht, und die neueste Messung ist markiert.

## Technische Details

- `supabase/functions/meta-oauth-diff/index.ts`: zusätzliche Rückgabe `scope_probes` — die letzten Zeilen mit `provider = 'facebook_scope_probe'` inkl. `requested_scopes`, `granted_scopes`, `fb_user_id`, `created_at`.
- `src/components/performance/MetaOAuthDiff.tsx`: neue Ergebnis-Liste im Scope-Test-Block, Badge für Probe-Einträge in den Auswahllisten, Auto-Refresh nach Rückkehr mit `status=probe_done`.
- `supabase/functions/meta-scope-probe-start/index.ts` / `oauth-callback`: Rücksprungziel aus dem Startaufruf übernehmen statt fest `/integrations`.
- `src/lib/translations.ts`: neue Schlüssel `metaDiff.probeResults*` in DE/EN/ES.
- Keine Datenbank-Migration, keine Änderung an Scopes oder gespeicherten Verbindungen.
