

# Plan: Dashboard-Bereinigung — echte Realität anzeigen

## Was die Daten zeigen

Letzter Run (vor < 1 Min): **11/11 Szenarien grün** ✅
- Alle Caption/Bio/Image/Campaign/Performance/Hashtag/Posting/Comments/Trends → HTTP 200
- Bio (DE/ES) jetzt 2.5s statt 429er — Test-Account-Bypass funktioniert
- Comments Analysis jetzt 200 statt 400er — projectId-Flow funktioniert

Was noch nervt:
1. **Pass-Rate zeigt 33%/67%** weil alle 3 historischen Runs zusammengezählt werden (1 alter Fail + 2 neue Pass)
2. **Hooks Generation + Reel Script (30s)** stehen weiter rot in der Liste — obwohl die Szenarien aus dem Code entfernt wurden, leben ihre alten Runs noch in der DB
3. Trend Radar Latenz: 932ms — **massiv besser** als 84s vorher (vermutlich Cache-Hit)

## Fix 1 — Karteileichen entfernen

In `src/pages/admin/AISuperuserAdmin.tsx` die Aggregations-Logik filtern:
- Liste der **aktuell aktiven Szenarien** aus dem Test-Runner spiegeln (11 Namen)
- Szenarien deren Name nicht in der aktiven Liste vorkommt → **gar nicht anzeigen**
- Damit verschwinden „Hooks Generation" und „Reel Script (30s)" sofort aus der Übersicht

Alternativ via SQL-Cleanup (einmalig):
```sql
DELETE FROM ai_superuser_runs 
WHERE scenario_name IN ('Hooks Generation', 'Reel Script (30s)');
```
Beides — UI-Filter als dauerhafte Schutzschicht + DB-Cleanup für saubere Historie.

## Fix 2 — Pass-Rate ehrlich berechnen

Aktuelles Problem: `passes / total` über alle 3 Runs eines Szenarios → 2 Pass + 1 alte Fail = 67%

Lösung in `AISuperuserAdmin.tsx`:
- **Default-Window: letzte 5 Runs** (Sliding Window war schon geplant, scheint aber nicht aktiv)
- Sicherstellen dass `summary.pass_rate` aus den **5 neuesten** Runs berechnet wird, nicht aus allen 24h-Runs
- Zusätzlich: Pass-Rate-Badge **grün ab ≥ 80%**, gelb 50-79%, rot < 50% (aktuell zeigt 67% rot)

## Fix 3 — „Alle Tests jetzt grün"-Banner

Wenn alle aktiven Szenarien im letzten Run grün waren → grünes Erfolgs-Banner oben:
> ✅ **Alle 11 Szenarien laufen stabil** — Letzter Komplett-Test vor X Minuten

Damit sieht man auf einen Blick ob das System gesund ist, ohne durch jede Pass-Rate-Spalte scrollen zu müssen.

## Fix 4 — „Historie zurücksetzen"-Button

Neuer Button neben „Alte Runs löschen":
- **„Pass-Rate zurücksetzen"** löscht alle Runs > 1 Stunde alt
- Nutzbar nach jedem größeren Fix um saubere Baseline zu starten
- Mit Bestätigungs-Dialog (irreversibel)

## Reihenfolge

1. SQL-Cleanup: Alte Runs der entfernten Szenarien löschen
2. `AISuperuserAdmin.tsx`: 
   - Whitelist-Filter aktiver Szenarien
   - Pass-Rate strikt über letzte 5 Runs
   - Farbgebung Badge nach Schwellwert (80/50)
   - Grünes „All systems operational"-Banner
   - „Pass-Rate zurücksetzen"-Button
3. Kurzer Re-Check: Schnell-Test ausführen → Erwartung **11/11 grün, alle Pass-Rates 100%**

## Erwartetes Ergebnis

- ✅ Liste zeigt nur noch die 11 aktiven Szenarien (keine Karteileichen)
- ✅ Pass-Rates rechnen ehrlich über die letzten 5 Runs → nach nächstem Schnell-Test 100% überall
- ✅ Großes grünes Banner wenn alles läuft → sofortiger Health-Check ohne scrollen
- ✅ Reset-Button damit historische Altlasten bei künftigen Fixes nicht mehr stören

