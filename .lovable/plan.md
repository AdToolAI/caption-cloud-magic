# Alt-vs-Neu-Diff für Meta-Verbindungen — Beweis vor Fix

Deine Korrektur ist berechtigt. Ich streiche die Ursachen-Behauptung und baue stattdessen genau den strukturellen Diff. **Keine Änderung am OAuth-Flow** in diesem Schritt.

## Was tatsächlich belegt ist

- `META_LOGIN_CONFIG_ID` fehlt in den Secrets (Liste geprüft) → `facebook-oauth-start` und `instagram-oauth-start` fallen beide auf den klassischen Dialog zurück (Code geprüft: `configId = Deno.env.get('META_LOGIN_CONFIG_ID') || null`, `config_id` wird nur bei gesetztem Wert angehängt).
- Die einzige gespeicherte Meta-Verbindung in der Datenbank ist die **fehlschlagende neue**: `Samuel Dusatko`, FB-User-ID `122116259151337304`, `granted_scopes: [pages_show_list, pages_read_engagement, pages_manage_posts, public_profile]` (kein `business_management`), `meta_pages_found_count: 0`, `meta_page_discovery_status: meta_pages_hidden_or_unavailable`, `meta_list_error: null`.

**Nicht belegt:** dass die fehlende Configuration ID die Ursache ist. Das bleibt Hypothese, bis der Diff sie stützt oder widerlegt.

Wichtige Einschränkung: Vom funktionierenden alten Konto liegt **keine** Verbindung mehr in der Datenbank vor (0 Zeilen). Der Diff braucht also einen frischen Connect mit dem alten Konto — sonst gibt es keine B-Seite zum Vergleich.

## Schritt 1: Beweis-Protokoll pro Connect (nur Messung)

Neue Tabelle `meta_oauth_diagnostics` (append-only, ein Eintrag pro Verbindungsversuch), befüllt an zwei Stellen:

- `facebook-oauth-start` / `instagram-oauth-start` schreiben beim Start: angeforderte Scopes, vollständige Dialog-URL ohne Secrets, `uses_config_id` (true/false), `auth_type`, Zeitstempel.
- `oauth-callback` ergänzt nach dem Tausch denselben Eintrag über den `state`-Schlüssel mit den Roh-Messwerten:
  - `GET /me?fields=id,name` → Facebook-User-ID + Name
  - `GET /me/permissions` → tatsächlich gewährte vs. abgelehnte Scopes
  - `GET /debug_token` → `scopes`, **`granular_scopes` inklusive `target_ids`**, `data_access_expires_at`, `issued_at`
  - `GET /me/accounts` → Roh-Antwort (auch leer, mit `paging`)
  - `GET /me/businesses` → Roh-Antwort inklusive Fehlercode, falls Berechtigung fehlt

Gespeichert wird die Roh-Antwort gekürzt und **ohne Tokens** (Token-Felder werden vor dem Schreiben entfernt).

## Schritt 2: Diff-Ansicht

Neue Funktion `meta-oauth-diff` liefert die letzten Einträge des angemeldeten Nutzers nebeneinander; das Diagnose-Panel zeigt eine Vergleichstabelle:

```text
Feld                       | Konto A (alt)      | Konto B (neu)
FB-User-ID                 | ...                | 122116259151337304
config_id verwendet        | ...                | nein
angeforderte Scopes        | ...                | ...
gewährte Scopes            | ...                | pages_show_list, pages_read_engagement, pages_manage_posts, public_profile
granular_scopes target_ids | ...                | (leer)
/me/accounts Anzahl        | ...                | 0
/me/businesses             | ...                | ...
```

Abweichende Zeilen werden hervorgehoben, plus Kopier-Button für das Roh-JSON beider Seiten.

## Schritt 3: Messung durchführen (du)

1. Mit dem **alten, funktionierenden** Facebook-Konto verbinden.
2. Abmelden, mit dem **neuen** Konto verbinden.
3. Ich lese den Diff aus und benenne den Unterschied.

Auswertung nach deiner Logik:
- Altes Konto **ohne** `config_id`, aber **mit** `target_ids`/Seiten → fehlende Configuration ID ist nicht die Ursache; die Spur führt auf Konto-/Asset-Ebene (Seitenrolle, Portfolio-Zuordnung, Seitenstatus).
- Altes Konto **mit** Asset-Zuordnung, neues **ohne** → Eingrenzung auf Metas Asset-Zuordnung; erst dann lohnt der kontrollierte Test mit einer Business-Login-`config_id`.

## Schritt 4: Erst nach dem Befund

Fix wird nach der Messung geplant. Zwei Punkte sind allerdings vom Diff unabhängig und ohnehin falsch — die ziehe ich schon jetzt mit, weil sie das Messergebnis sonst verfälschen können:

- `_shared/meta-page-discovery.ts` verwirft in `collectMetaPagesAllSources` jede Seite ohne `access_token` (`if (p?.id && p.access_token)`). Seiten aus `target_ids` oder Portfolio-Quellen liefern beim Hydrieren oft nur `id`/`name` — die verschwinden dadurch aus der Zählung. Künftig behalten und Token in einem zweiten gezielten Aufruf nachholen; ohne Token bleibt die Seite sichtbar, markiert als „Posten nicht möglich".
- Der Facebook-Zweig in `oauth-callback` führt weder Long-Lived-Token-Tausch noch Scope-Abfrage aus (anders als der Instagram-Zweig). Für das Protokoll aus Schritt 1 wird die Scope-Abfrage dort ohnehin gebraucht.

## Technische Details

- Migration: Tabelle `meta_oauth_diagnostics` (`id`, `user_id`, `provider`, `state_key`, `requested_scopes`, `dialog_url`, `uses_config_id`, `granted_scopes`, `declined_scopes`, `granular_scopes`, `me_accounts_raw`, `me_businesses_raw`, `debug_token_raw`, `created_at`), RLS: nur eigener `user_id` lesbar; `GRANT SELECT ON ... TO authenticated`, `GRANT ALL ... TO service_role`; Schreiben ausschließlich per Service-Role aus den Edge-Funktionen.
- `supabase/functions/facebook-oauth-start/index.ts`, `instagram-oauth-start/index.ts`: nur Protokollschreiben ergänzen — Scopes, `auth_type` und Dialogaufbau bleiben unverändert.
- `supabase/functions/oauth-callback/index.ts`: Messblock für Meta-Provider (fünf Graph-Aufrufe, rein lesend), Ergebnis in die Diagnose-Tabelle; Token-Felder vor dem Speichern entfernen.
- Neu: `supabase/functions/meta-oauth-diff/index.ts` — JWT-verifiziert, liefert die Einträge des Nutzers.
- `src/components/performance/ConnectionDiagnostics.tsx`: Vergleichstabelle „Alt vs. Neu"; `src/lib/translations.ts`: DE/EN/ES.
- `supabase/functions/meta-page-probe` bleibt unverändert als Ad-hoc-Werkzeug für eine bestehende Verbindung.
