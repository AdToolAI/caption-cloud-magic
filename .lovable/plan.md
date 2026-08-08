# Warum das Diff-Panel den Versuch von gestern 21:08 zeigt

## Befund (aus der Datenbank gelesen, nicht vermutet)

Deine beiden Connects von heute sind **beide** korrekt protokolliert:

| Zeit (Berlin) | Facebook-Profil | Seiten | AdTool-Konto |
| --- | --- | --- | --- |
| 10:33:15 | …329815 | 2 | Konto **B** (8948d3d9…) |
| 10:34:25 | …337304 | 0 | Konto **A** (ab6bf0d1…) |

Das Diff-Panel liest aber ausschließlich Versuche des **gerade angemeldeten** AdTool-Kontos (`meta-oauth-diff` filtert auf `user_id = auth.uid()`). Du warst dabei in Konto A angemeldet. Der 2-Seiten-Connect von heute 10:33 gehört zu Konto B und ist deshalb dort unsichtbar.

Der neueste 2-Seiten-Versuch, der zu Konto A gehört, stammt vom 7.8. um 19:08 UTC = **21:08 Berlin** — genau der Eintrag im Screenshot. Es ist also kein alter Cache und kein Zuordnungsfehler, sondern die Konto-Trennung des Panels.

## Was ich ändere

Damit ein kontoübergreifender Vergleich möglich ist, ohne die Privatsphäre anderer Nutzer aufzugeben:

1. **Admin-Modus im Diff-Panel**: Für Nutzer mit Admin-Rolle (`has_role(auth.uid(),'admin')`, serverseitig geprüft) gibt es einen Schalter „Alle Konten einbeziehen". Damit erscheinen beide Versuche von heute nebeneinander, jeweils mit AdTool-Konto-Kennung.
2. **Ohne Admin-Rolle**: Vergleich per **Diagnostic-ID**. Im anderen Konto die ID kopieren, hier einfügen — der Server gibt nur die tokenfreie Zusammenfassung dieser einen ID heraus.
3. **Klarer Zeitstempel-Hinweis**: Über der Tabelle steht sichtbar, aus welchem AdTool-Konto und von welchem Zeitpunkt jede Spalte stammt, plus Hinweis „ältere Messung — heutiger Versuch liegt in einem anderen Konto", wenn der gewählte Versuch nicht der neueste des Profils ist.

Am OAuth-Flow, an Scopes oder an gespeicherten Verbindungen ändert sich nichts — reine Diagnose-Anzeige.

## Technische Details

- `supabase/functions/meta-oauth-diff/index.ts`: optionale Parameter `include_all_accounts` (nur wirksam bei Admin-Rolle, per Service-Client gegen `user_roles` geprüft) und `attempt_ids` (direkte Auswahl per Diagnostic-ID, unabhängig vom `user_id`-Filter). Standardverhalten bleibt unverändert.
- Rückgabe je Versuch zusätzlich `account_ref` (gekürzte AdTool-User-ID) und `is_latest_for_profile`.
- `src/components/performance/MetaOAuthDiff.tsx`: Schalter „Alle Konten einbeziehen" (nur sichtbar bei Admin), Eingabefeld für Diagnostic-ID, Konto- und Aktualitäts-Hinweis über der Tabelle.
- `src/lib/translations.ts`: neue Schlüssel DE/EN/ES unter `metaDiff.*`.
- Keine Datenbank-Migration nötig.

## Der eigentliche Meta-Befund bleibt

Unabhängig davon: Profil …337304 bekommt von Meta weiterhin `business_management` nicht erteilt und liefert 0 Seiten — das ist ein Meta-/Business-Portfolio-Thema, kein Fehler der App.
