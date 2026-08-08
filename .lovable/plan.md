# Was der Scope-Test bedeutet und was jetzt zu tun ist

## Die Messung (aus der Datenbank gelesen)

Deine beiden Scope-Tests von heute sind protokolliert:

| Zeit (Berlin) | Angefragt | Von Meta erteilt |
| --- | --- | --- |
| 11:01:04 | nur `business_management` | pages_show_list, pages_read_engagement, pages_manage_posts, public_profile — **kein business_management** |
| 11:01:44 | nur `business_management` | dieselbe Liste — **kein business_management** |

Zum Vergleich: der Connect des alten Profils (…329815) um 10:33 hat `business_management` erhalten und 2 Seiten geliefert. Das neue Profil (…337304) bekommt bei jedem Versuch 0 Seiten.

## Warum läuft es beim alten Konto und beim neuen nicht?

Nicht wegen „Admin ja/nein" im Business-Portfolio — deine Portfolio-Rolle ist laut Screenshot bereits uneingeschränkt. Der Unterschied liegt eine Ebene tiefer: **Meta erteilt eine Berechtigung nur, wenn es dem Profil dafür überhaupt Assets anbieten kann.**

- Altes Profil: ist Seiten-Admin der 2 Seiten und diese Seiten liegen im Portfolio, das auch die App kennt → Meta zeigt die Seiten-Auswahl und erteilt `business_management`.
- Neues Profil: hat keine eigene Seiten-Rolle und keine Asset-Zuweisung → Meta zeigt nur 3 Toggles und lässt `business_management` weg. Ohne diesen Scope liefert `me/accounts` 0 Seiten und `me/businesses` „Missing Permission".

Wichtige Einschränkung, die ich nicht verschweigen will: dein Screenshot vom Test zeigt den Bildschirm „Du hast dich zuvor bereits angemeldet — Als Samuel fortfahren". Meta hat dort **gar keinen Berechtigungsdialog** mehr angezeigt, sondern still die bereits gespeicherte Zustimmung wiederverwendet. `auth_type=rerequest` wird zwar mitgeschickt, greift aber nicht, wenn Meta die bestehende App-Zustimmung recycelt. Die Messung „Scope nicht erteilt" steht, aber sie beweist noch nicht endgültig, dass Meta ihn *verweigern würde*, wenn es neu fragen müsste.

## Nächste Schritte

1. **Ein sauberer Test ohne Alt-Zustimmung** — auf facebook.com mit dem neuen Profil: Einstellungen → Apps und Websites → „AdTool AI Integration" **entfernen**. Danach im AdTool den Scope-Test erneut starten. Jetzt muss Meta den Dialog frisch zeigen. Erscheint `business_management` dann immer noch nicht als Option, ist der Befund endgültig.
2. **Ergebnis wird sichtbar gemacht** (Code, siehe unten) — heute verschwindet das Ergebnis in einem kurzen Toast; künftig steht es dauerhaft im Diff-Panel.
3. **Je nach Ergebnis:**
   - Scope taucht auf und wird erteilt → Ursache war die Alt-Zustimmung; normal neu verbinden, Thema erledigt.
   - Scope taucht gar nicht auf → dem neuen Profil fehlen im Business-Portfolio die Asset-Zuweisungen (Seite *und* App dem Profil zuweisen). Das ist eine Meta-Einstellung, keine App-Änderung.

## Was ich am Code baue

1. **Dauerhafte Ergebnis-Karte im Diff-Panel**: die letzten Scope-Tests mit Zeitpunkt, Facebook-Profil-ID, Diagnostic-ID und Klartext-Urteil („erteilt" / „nicht erteilt"). Kein Toast mehr nötig.
2. **Klartext-Auswertung** direkt darunter, inklusive des Hinweises, wenn Meta den Dialog übersprungen hat (erkennbar daran, dass die erteilten Scopes exakt der vorherigen Zustimmung entsprechen) — dann steht dort die Anleitung „App im Facebook-Profil entfernen und Test wiederholen".
3. **Scope-Tests in der Vergleichsliste kennzeichnen**, damit sie nicht wie normale Connects mit „0 Seiten" aussehen.
4. **Rücksprung auf die Seite, von der der Test gestartet wurde**, mit markierter neuester Messung.

## Technische Details

- `supabase/functions/meta-oauth-diff/index.ts`: zusätzliche Rückgabe `scope_probes` (Zeilen mit `provider = 'facebook_scope_probe'`, inkl. `requested_scopes`, `granted_scopes`, `fb_user_id`, `created_at`).
- `src/components/performance/MetaOAuthDiff.tsx`: Ergebnis-Liste im Scope-Test-Block, Badge für Probe-Einträge, Auto-Refresh nach Rückkehr mit `status=probe_done`.
- `supabase/functions/meta-scope-probe-start/index.ts` / `oauth-callback`: Rücksprungziel aus dem Startaufruf übernehmen statt fest `/integrations`.
- `src/lib/translations.ts`: neue Schlüssel `metaDiff.probeResults*` in DE/EN/ES.
- Keine Datenbank-Migration, keine Änderung an Scopes oder gespeicherten Verbindungen.
