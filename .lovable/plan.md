# Diff-Panel wählt die falschen Datensätze aus — Befund und Fix

## Befund (aus der Diagnose-Tabelle, nicht vermutet)

Die Zuordnung im Callback ist **korrekt**. Die letzten Einträge:

| Zeit (Berlin) | Diagnostic-ID (kurz) | meta_user_id | granted | Seiten |
|---|---|---|---|---|
| 8.8. 00:01 | 45159e4a | 1221 1625 9151 337304 (neu) | ohne `business_management` | 0 |
| 7.8. 23:57 | 835e7fbd | 1223 3704 2788 329815 (alt) | **mit `business_management`** | **2** |
| 7.8. 23:56 | 229a2768 | 1221 1625 9151 337304 (neu) | ohne `business_management` | 0 |
| 7.8. 23:36 | 46df1c4d | — | — (abgebrochen, kein Callback) | — |

Beide Meta-Profile werden also sauber getrennt gespeichert, mit den genau erwarteten Werten. Der historisch funktionierende Account liefert auch **jetzt** wieder `business_management` + 2 Seiten (Eintrag 835e7fbd, 23:57).

**Ursache deines Screenshots:** Im Panel stand als A der Versuch von 23:56:35 (das ist das **neue** Profil, 0 Seiten) und als B der abgebrochene Versuch von 23:36:25 (gar keine Daten). Der gute Datensatz von 23:57 lag genau dazwischen und war nicht ausgewählt. Es wurden also zwei falsche Zeilen verglichen — kein Datenfehler, ein Auswahlfehler im Panel.

## Fix (nur Anzeige/Auswahl, keine OAuth-Änderung)

1. **Identität prominent zeigen**
   - Über der Tabelle je Spalte eine Kopfzeile mit: Meta-Profil-Name, **vollständige `meta_user_id`**, Zeitstempel und kurze Diagnostic-ID.
   - Sind beide Spalten dieselbe `meta_user_id`, erscheint ein deutlicher Warnhinweis: „Beide Spalten stammen vom selben Meta-Profil — der Vergleich ist nicht aussagekräftig."

2. **Abgebrochene Versuche nicht mehr vergleichbar machen**
   - Einträge ohne `callback_completed_at` werden in den Auswahllisten in einen eigenen, ausgegrauten Abschnitt „abgebrochen (keine Messdaten)" verschoben und sind nicht mehr vorauswählbar.

3. **Sinnvolle Vorauswahl**
   - Beim Laden wählt das Panel automatisch die **zwei jüngsten abgeschlossenen Versuche mit unterschiedlicher `meta_user_id`**.
   - Zusätzlich ein Umschalter „nur abgeschlossene Versuche zeigen" (Standard: an).

4. **Aussagekräftige Beschriftung in den Listen**
   - Format: `Meta-ID …337304 · 2 Seiten · 8.8. 00:01` statt nur Name und Zeit — der Name ist bei beiden Profilen identisch („Samuel Dusatko") und taugt nicht zur Unterscheidung.

Nach dem Fix zeigt der Standardvergleich direkt 835e7fbd (alt, 2 Seiten) gegen 45159e4a (neu, 0 Seiten) — genau die Gegenüberstellung, die du auswerten wolltest.

## Technische Details

- `src/components/performance/MetaOAuthDiff.tsx`: Auswahl-Logik (Filter auf `callback_completed_at`, Auto-Pick unterschiedlicher `fb_user_id`), Kopfzeile mit Identität, Warnhinweis bei gleicher ID, neue Options-Labels.
- `supabase/functions/meta-oauth-diff/index.ts`: `fb_user_id`, `fb_user_name`, `callback_completed_at` und `id` in der Attempt-Liste mitliefern, falls noch nicht enthalten.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an Scopes, OAuth-Start, Callback-Logik oder Meta-Einstellungen.
