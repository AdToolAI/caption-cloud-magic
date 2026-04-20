

# Plan: Letzte Failures beheben + Pass-Rate-Anzeige korrigieren

## Diagnose

Die Tests zeigen **50 % weil jedes Szenario 2 Runs hat** (1 alter roter + 1 neuer grüner). Die Pass-Rate berechnet beide zusammen statt nur den letzten Lauf. Echte Failures sind nur noch **4 von 13**:

| # | Szenario | Echter Grund |
|---|---|---|
| **1** | Bio Generation (DE) — `HTTP 429` | `generate-bio` hat ein hartes **Daily-Limit von 2 Bios/Tag** für Non-Pro. Test-User wird als Free behandelt (`profile.plan` ≠ `'pro'`) |
| **2** | Bio Generation (ES) — `HTTP 429` | Selbe Ursache wie #1 |
| **3** | Comments Analysis — `HTTP 400 "projectId is required"` | Test schickt `comments`-Array, aber `analyze-comments` erwartet eine **`projectId`** und liest Kommentare aus der DB |
| **4** | Hooks Generation — `HTTP 500` | Edge Function `generate-hooks` **existiert gar nicht** (siehe `supabase/functions/`-Listing). Test ruft eine nicht-existente Function auf |
| **5** | Reel Script (30 s) — `HTTP 400` | Edge Function `generate-reel-script` **existiert ebenfalls nicht** |

Plus: **Latenz-Anzeige in der UI ist irreführend**, weil sie über alle 2 Runs gemittelt wird statt den letzten Run anzuzeigen.

## Was wird gefixt

### Fix 1 — Bio-Daily-Limit für Test-Account umgehen
In `supabase/functions/generate-bio/index.ts` einen Bypass für Test-Accounts ergänzen:
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('plan, is_test_account')
  .eq('id', user.id)
  .single();

const isPro = profile?.plan === 'pro' || profile?.is_test_account === true;
```
Damit hat der KI-Superuser unbegrenzte Bios — alle anderen User bleiben ans 2/Tag-Limit gebunden.

### Fix 2 — Comments-Analysis-Test korrigieren
Test-Runner umstellen auf den echten Flow:
1. Setup-Phase: Lege im Test-Workspace ein **Demo-Project** (`projects` Tabelle) + 2 Demo-Comments (`comments` Tabelle) an, falls noch nicht vorhanden
2. Speichere `demo_project_id` im Test-Context
3. Comments-Szenario sendet `{ projectId: demo_project_id }` statt rohe Comments

### Fix 3 — Nicht-existente Functions entfernen
`generate-hooks` und `generate-reel-script` existieren nicht im Repo. Zwei Optionen, ich empfehle **A**:

- **A) Aus Test-Suite streichen** (sauber): die zwei Szenarien aus `SCENARIOS` löschen → von 13 auf 11 Szenarien
- B) Edge Functions neu bauen (großer Aufwand, unklarer Mehrwert weil Feature existiert nicht im Frontend)

Falls du das Feature später bauen willst, ergänzen wir die Tests dann wieder.

### Fix 4 — Pass-Rate-Anzeige korrigieren
In `src/pages/admin/AISuperuserAdmin.tsx` die Aggregations-Logik anpassen:
- **Heute:** Pass-Rate = `passed / total` über alle Runs eines Szenarios → bei 1 alter Fail + 1 neuer Pass = 50 %
- **Neu:** Pass-Rate über die **letzten 5 Runs** (Sliding Window) + **Letzter Status** als großes Icon
- Latenz-Spalte zeigt **letzte Latenz** statt Durchschnitt

Zusätzlich: Button **„Alte Runs löschen"** der Runs > 7 Tage entfernt (verhindert dass alte Failures die Stats dauerhaft drücken).

### Fix 5 — Latenz-Warnung Trend Radar
84 s Latenz für Trend Radar bleibt grenzwertig. In `analyze-superuser-anomalies` Schwellwert auf 60 s setzen → erzeugt automatisch einen Warning-Anomaly-Eintrag, ohne dass wir jetzt sofort optimieren müssen.

## Implementierungsreihenfolge

1. `generate-bio`: Test-Account-Bypass für Daily-Limit
2. Test-Runner: Demo-Project + Demo-Comments seeden, Comments-Szenario auf `projectId` umbauen, `generate-hooks` und `generate-reel-script` entfernen
3. `AISuperuserAdmin.tsx`: Pass-Rate auf letzte 5 Runs umstellen, Latenz auf letzten Run, „Alte Runs löschen"-Button
4. `analyze-superuser-anomalies`: 60 s-Latenz-Schwellwert
5. **Schnell-Test ausführen → Erwartung: 11/11 grün**

## Erwartetes Ergebnis

- ✅ **11/11 Szenarien grün** beim nächsten Schnell-Test
- ✅ Pass-Rate-Anzeige ehrlich (zeigt Realität, nicht historische Altlasten)
- ✅ Latenz-Anzeige zeigt aktuellen Stand statt verfälschten Durchschnitt
- ✅ Trend-Radar-Latenz wird automatisch als Warning getrackt

