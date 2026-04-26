# Motion Studio Superuser — Fix Plan für die 3 letzten Fehler

Nach der Diagnose der Edge-Function-Logs sind 3 verschiedene Root-Causes identifiziert. Alle drei sind echte Bugs, keine Plattform-Hiccups.

---

## 🔴 Bug 1: MS-10 Brand Voice Analysis — `HTTP 500: column updated_at not found`

**Root Cause:** `supabase/functions/analyze-brand-voice/index.ts` (Zeile 104) versucht `updated_at: new Date().toISOString()` in die `brand_kits` Tabelle zu schreiben — diese Spalte existiert dort jedoch **nicht** (nur `created_at` ist vorhanden, verifiziert via Schema-Query).

**Fix:**
- In `analyze-brand-voice/index.ts` das `updated_at` Feld aus dem `.update({...})` Payload entfernen.
- Nur `brand_voice: voiceProfile` updaten.

---

## 🟡 Bug 2: MS-3 Auto-Director Compose — `Missing expected keys: scenes`

**Root Cause:** Der Test sendet `stage: "plan"`. In `auto-director-compose/index.ts` retourniert die `plan`-Stage zwar Scenes, aber der **Test-Runner** (motion-studio-superuser, Zeile 572-579) prüft `expectedKeys: ["scenes"]` direkt auf der Top-Level-Response. Die Plan-Response hat das Feld vermutlich verschachtelt (z. B. unter `data.scenes` oder `preview.scenes`).

**Fix-Optionen** (eine wählen nach Inspektion der tatsächlichen Plan-Response):
- **Option A (bevorzugt):** Die `expectedKeys` in MS-3 anpassen auf den korrekten Top-Level-Key (z. B. `["preview"]` oder `["plan"]`), oder verschachtelte Key-Prüfung implementieren (`scenes` in `responseData.preview`).
- **Option B:** Den Schema-Check in `motion-studio-superuser` so erweitern, dass er auch in einer Ebene tiefer sucht (rekursiv 1-level).

Vorgehen: Erst kurz Plan-Response-Form via einem Diagnostic-Call verifizieren, dann gezielt fixen.

---

## 🟡 Bug 3: MS-12 Reframe Fallback Hardening — `HTTP 500: Project not found`

**Root Cause:** Der Test sendet bewusst eine ungültige Project-ID (`00000000-...`), um das Fallback-Verhalten zu testen. `analyze-scene-subject/index.ts` (Zeile 205) wirft daraufhin `throw new Error("Project not found")` → HTTP 500. Der Test-Runner mappt `>= 500` als Failure (warning weil `optional: true`), aber **fachlich richtig** wäre HTTP **404** für "Resource not found", damit der Härtungstest grün laufen kann.

**Fix:**
- In `analyze-scene-subject/index.ts` den "Project not found"-Pfad in eine **strukturierte 404-Response** umwandeln statt eines generischen 500-Throws.
- Damit wird MS-12 grün (HTTP 404 = `< 500` = `pass`).

---

## 📋 Umsetzungsschritte (nach Approval)

1. **Fix 1 — `analyze-brand-voice/index.ts`:** `updated_at` aus dem brand_kits Update entfernen.
2. **Fix 2 — `auto-director-compose` Plan-Response inspizieren:** Kurzer Diagnose-Curl auf die Funktion, dann entweder die `expectedKeys` in `motion-studio-superuser/index.ts` korrigieren oder die Plan-Response um ein Top-Level `scenes` Feld erweitern.
3. **Fix 3 — `analyze-scene-subject/index.ts`:** Den `Project not found`-Throw durch eine `return new Response(JSON.stringify({error:"Project not found"}), {status: 404, headers: corsHeaders})` ersetzen.
4. **Deploy** der 3 Edge Functions: `analyze-brand-voice`, `auto-director-compose` (falls geändert), `analyze-scene-subject`, `motion-studio-superuser` (falls geändert).
5. **Verifizieren** durch erneutes Ausführen des Motion Studio Superuser Fast Run — Ziel: 14/14 grün (oder 13/14 mit MS-12 als pass).

## ✅ Erwartetes Ergebnis

- MS-10 → ✅ pass (HTTP 200)
- MS-3 → ✅ pass (scenes-Key gefunden)
- MS-12 → ✅ pass (HTTP 404, korrekt für ungültige ID)
- Erfolgsquote: **14/14 (100 %)** statt aktuell 11/14 (79 %)
