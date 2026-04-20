

# Plan: Lösch-Buttons reparieren — DELETE-Policy + sofortige Wirkung

## Diagnose

Zwei voneinander unabhängige Bugs blockieren das Löschen:

### Bug 1 — Fehlende RLS-DELETE-Policy (Hauptursache)
Auf `ai_superuser_runs` existieren nur diese Policies:
| Policy | Operation |
|---|---|
| Admins can view all superuser runs | SELECT |
| Service role can insert superuser runs | INSERT |
| Service role can update superuser runs | UPDATE |

**Es gibt keine DELETE-Policy.** Bei aktiver RLS bedeutet das: Jeder Admin-DELETE aus dem Browser löscht **0 Zeilen ohne Fehler** — Supabase gibt einfach `null` Error + leeres Result zurück. Der Toast zeigt „erfolgreich", weil unser Code nur auf `error` prüft, nicht auf die Anzahl gelöschter Zeilen.

### Bug 2 — Cutoffs greifen nicht
Aktuelle Daten: alle 50 Runs sind in den letzten 30 Minuten entstanden. Selbst mit funktionierender DELETE-Policy würde:
- „Alte Runs löschen" (>7 Tage) → 0 Zeilen treffen
- „Pass-Rate zurücksetzen" (>1 Stunde) → 0 Zeilen treffen

Du brauchst eine Möglichkeit, die **aktuelle** Historie zu leeren ohne den letzten Run zu zerstören.

## Fixes

### Fix 1 — DELETE-Policy für Admins anlegen (Migration)
```sql
CREATE POLICY "Admins can delete superuser runs"
ON public.ai_superuser_runs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```
Gleicher Fix für die Anomalien-Tabelle, damit Admins auch dort aufräumen können:
```sql
CREATE POLICY "Admins can delete superuser anomalies"
ON public.ai_superuser_anomalies
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

### Fix 2 — Buttons schreiben um auf „behalte nur die letzten N Runs"
Aktuell hängen die Buttons an Zeit-Cutoffs, die bei frischer Historie nichts treffen. Stattdessen:

- **„Alte Runs löschen"** → behält **die letzten 5 Runs pro Szenario**, löscht den Rest. Nutzt eine RPC-Function damit die Logik in der DB lebt:
```sql
CREATE OR REPLACE FUNCTION public.cleanup_superuser_runs(keep_per_scenario int DEFAULT 5)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted_count int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY scenario_name ORDER BY started_at DESC) AS rn
    FROM public.ai_superuser_runs
  )
  DELETE FROM public.ai_superuser_runs
  WHERE id IN (SELECT id FROM ranked WHERE rn > keep_per_scenario);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $$;
```

- **„Pass-Rate zurücksetzen"** → bleibt drastischer: **alles außer dem letzten Run pro Szenario löschen** (`keep_per_scenario = 1`). So startet die Pass-Rate sofort bei 100 % wenn der letzte Run grün war.

### Fix 3 — Frontend ehrlich machen
In `AISuperuserAdmin.tsx`:
- Beide Buttons rufen `supabase.rpc('cleanup_superuser_runs', { keep_per_scenario: 5 / 1 })` auf
- Toast zeigt **die echte Anzahl** gelöschter Zeilen (`X Runs gelöscht`)
- Bei `data === 0` zeigt der Toast „Keine Runs zum Löschen — bereits sauber"
- Buttons werden umbenannt für Klarheit:
  - „Alte Runs löschen" → **„Historie kürzen (letzte 5 behalten)"**
  - „Pass-Rate zurücksetzen" → **„Komplett zurücksetzen (nur letzten Run behalten)"**

## Reihenfolge

1. Migration: DELETE-Policies für `ai_superuser_runs` + `ai_superuser_anomalies` + RPC `cleanup_superuser_runs`
2. `AISuperuserAdmin.tsx`: Beide Buttons auf RPC umbauen, Labels anpassen, echte Lösch-Anzahl anzeigen
3. Verifikation: Du klickst „Komplett zurücksetzen" → Erwartung: Toast zeigt z.B. „40 Runs gelöscht", Pass-Rate-Spalte zeigt 100 % bei allen grünen Szenarien

## Erwartetes Ergebnis

- ✅ Lösch-Buttons funktionieren wirklich (statt stumm zu scheitern)
- ✅ Toast zeigt echte Anzahl gelöschter Zeilen — keine falschen Erfolgsmeldungen mehr
- ✅ Pass-Rate-Reset wirkt sofort, unabhängig vom Alter der Runs
- ✅ Bonus: Comments Analysis fix wird sichtbar sobald die alten Fail-Runs weg sind

