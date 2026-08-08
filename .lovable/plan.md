# Befund des neuen Scope-Tests — jetzt eindeutig

## Die Messung (11:18 Uhr, Diagnostic-ID 54c3821d)

| Feld | Wert |
| --- | --- |
| Facebook-Profil | 122116259151337304 (Samuel Dusatko, das neue) |
| Angefragt | nur `business_management`, `auth_type=rerequest` |
| Erteilt | **nur `public_profile`** |
| Abgelehnt (`declined_scopes`) | leer |
| `/me/accounts` | 200, 0 Seiten |
| `/me/businesses` | 400 · „(#100) Missing Permission" |

Entscheidend ist der Vergleich zu den Tests von 11:01: dort standen im Token noch die alten Berechtigungen (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`). Jetzt steht dort nur noch `public_profile`. Die alte Zustimmung ist also tatsächlich weg — Meta hat frisch entschieden. Und in dieser frischen Entscheidung erteilt Meta `business_management` nicht, listet es aber auch nicht als „abgelehnt". Das heißt: Meta hat die Berechtigung diesem Profil gar nicht erst zur Auswahl gestellt.

## Was das konkret heißt

Damit ist die Frage aus dem letzten Test beantwortet und die Unsicherheit („vielleicht nur recycelte Zustimmung") ausgeräumt:

- Es liegt **nicht** an unserem Code, nicht an den angefragten Scopes, nicht an der App-Konfiguration — dieselbe App, dieselbe `client_id`, derselbe Request erteilt dem alten Profil `business_management` und 2 Seiten.
- Es liegt auch nicht an „Admin ja/nein" im Business-Portfolio; die Rolle ist uneingeschränkt.
- Es liegt daran, dass dieses Facebook-Profil **keine Assets hat, auf die sich die Berechtigung beziehen könnte**: keine Seiten-Rolle, keine dem Profil zugewiesene App/Seite im Portfolio. Meta blendet die Berechtigung deshalb aus, statt sie zur Ablehnung anzubieten.

Kurz: Das neue Profil ist bei Meta schlicht kein Verwalter der Seiten. Kein Code-Fix kann das ändern.

## Nächste Schritte

1. **Meta-seitig lösen** (einmalig, in der Business-Suite mit dem alten, funktionierenden Profil als Portfolio-Admin):
   - Das neue Profil als Person zum Portfolio hinzufügen (falls nicht vorhanden).
   - Unter *Konten → Seiten* beiden Seiten das neue Profil als **Seiten-Admin** zuweisen.
   - Unter *Konten → Apps* der App „AdTool AI Integration" das neue Profil zuweisen.
   - Danach Scope-Test wiederholen — dann muss `business_management` im Dialog erscheinen.
2. **Kein Warten darauf für den Produktivbetrieb**: das alte Profil funktioniert nachweislich. Der Launch hängt nicht an diesem Punkt.
3. **Für Kunden absichern** (Code): Genau dieser Fall wird jeden Kunden treffen, der ohne Seiten-Rolle verbindet. Statt „verbunden, aber 0 Seiten" muss die App den Befund im Klartext zeigen und sagen, was beim eigenen Facebook-Konto fehlt.

## Was ich am Code baue

1. **Dauerhafte Ergebnis-Karte im Diff-Panel**: letzte Scope-Tests mit Zeitpunkt, Facebook-Profil-ID, Diagnostic-ID und Klartext-Urteil („erteilt" / „nicht angeboten" / „abgelehnt" — unterschieden über `declined_scopes`). Kein flüchtiger Toast mehr.
2. **Klartext-Diagnose in der Verbindungskarte**: bei fehlendem `business_management` + 0 Seiten der konkrete Satz „Dein Facebook-Profil verwaltet keine Seite bzw. ist der App im Business-Portfolio nicht zugewiesen" statt Roh-JSON, plus Kurzanleitung.
3. **Scope-Tests in der Vergleichsliste kennzeichnen**, damit sie nicht wie normale Connects mit „0 Seiten" wirken.
4. **Rücksprung auf die Startseite des Tests** mit markierter neuester Messung.

## Technische Details

- `supabase/functions/meta-oauth-diff/index.ts`: zusätzliche Rückgabe `scope_probes` (Zeilen mit `provider = 'facebook_scope_probe'` inkl. `requested_scopes`, `granted_scopes`, `declined_scopes`, `fb_user_id`, `created_at`).
- `src/components/performance/MetaOAuthDiff.tsx`: Ergebnis-Liste im Scope-Test-Block, Badge für Probe-Einträge, Auto-Refresh nach Rückkehr mit `status=probe_done`.
- `supabase/functions/meta-scope-probe-start/index.ts` / `oauth-callback`: Rücksprungziel aus dem Startaufruf übernehmen statt fest `/integrations`.
- `src/components/performance/ConnectionsTab.tsx`: Klartext-Befund bei fehlendem Scope / 0 Seiten.
- `src/lib/translations.ts`: neue Schlüssel `metaDiff.probeResults*` in DE/EN/ES.
- Keine Datenbank-Migration, keine Änderung an Scopes oder gespeicherten Verbindungen.
