# Sind wir dem Fehler näher? Ja — der Befund steht jetzt fest

## Was die Datenbank für deine heutigen Connects sagt

| Zeit (Berlin) | Facebook-Profil | Seiten | AdTool-Konto | business_management |
| --- | --- | --- | --- | --- |
| 10:33:15 | …329815 | 2 | Konto B | erteilt |
| 10:34:25 | …337304 | 0 | Konto A | **nicht erteilt** |

Beide Versuche von heute sind sauber protokolliert. Das Diff-Panel zeigte trotzdem 21:08 von gestern, weil es nur Versuche des **angemeldeten** AdTool-Kontos liest (`user_id = auth.uid()`). Du warst in Konto A angemeldet; der 2-Seiten-Connect von heute gehört zu Konto B. Der jüngste 2-Seiten-Versuch von Konto A war der von gestern 21:08. Also kein Cache, kein Zuordnungsfehler — eine Anzeige-Einschränkung.

## Der eigentliche Fehler ist damit eingekreist

Gleiche App, gleiche `client_id`, identische angefragte Scopes, gleicher Browser, gleicher Mensch — der einzige Unterschied ist das Facebook-Profil. Bei …337304 erteilt Meta `business_management` gar nicht erst und liefert deshalb `me/accounts = 0` und `me/businesses = (#100) Missing Permission`. Das ist kein Code-Fehler der App: Meta zeigt diesem Profil im Dialog nur 3 Toggles, weil ihm keine App-/Seiten-Assets im Business-Portfolio zugewiesen sind.

Offen ist genau eine Frage: Fehlt bei …337304 die **Asset-Zuweisung** (Seite und App im Portfolio), oder blockiert Meta den Scope für dieses Profil grundsätzlich. Das lässt sich messen, ohne in der Business Suite zu raten.

## Was ich baue

1. **Isolierter Scope-Test** (`meta-scope-probe`): ein Connect, der ausschließlich `business_management` mit `auth_type=rerequest` anfragt. Erteilt Meta ihn allein → das Problem ist die Kombination/Asset-Zuweisung. Verweigert Meta ihn auch allein → der Scope ist für dieses Profil gesperrt, und keine App-Änderung hilft. Ergebnis landet als eigener Eintrag im Diagnose-Protokoll.
2. **Kontoübergreifender Vergleich im Diff-Panel**: Schalter „Alle Konten einbeziehen" für Admins (serverseitig gegen `user_roles` geprüft) plus Vergleich per eingefügter Diagnostic-ID für alle anderen. Über jeder Spalte steht künftig, aus welchem AdTool-Konto und von wann die Messung stammt, inklusive Hinweis „nicht der neueste Versuch dieses Profils".
3. **Ehrliche Fehlermeldung in der Verbindungskarte**: bei fehlendem `business_management` kein technisches Roh-JSON, sondern der konkrete Satz, was bei Meta fehlt und dass es kein App-Fehler ist.

## Technische Details

- Neue Edge Function `meta-scope-probe-start` + Auswertung im bestehenden Callback; schreibt nach `meta_oauth_diagnostics` mit `provider = 'facebook_scope_probe'`, ändert keine gespeicherte Verbindung und keinen Token.
- `supabase/functions/meta-oauth-diff/index.ts`: optionale Parameter `include_all_accounts` (nur mit Admin-Rolle) und `attempt_ids`; Rückgabe zusätzlich `account_ref` und `is_latest_for_profile`.
- `src/components/performance/MetaOAuthDiff.tsx`: Admin-Schalter, Eingabefeld für Diagnostic-ID, Konto- und Aktualitätshinweis, Button „Scope-Test starten".
- `src/lib/translations.ts`: neue Schlüssel DE/EN/ES unter `metaDiff.*` und `metaProbe.*`.
- Keine Datenbank-Migration, keine Änderung an Scopes des normalen Connect-Flows.
