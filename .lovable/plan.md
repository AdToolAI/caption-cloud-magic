## Problem

Die Edge Function `smoke-matrix-run` ist deployed und kennt alle 467 Functions in 32 Kategorien. **Aber das Cockpit-Dropdown (`FunctionMatrixTab.tsx`) hat eine hartkodierte `CATEGORY_LABELS`-Map mit nur 10 alten Kategorien.** Dadurch:

- Im Dropdown erscheinen nur die alten Buckets (`ai-video-providers`, `lipsync-dialog`, `briefing-composer`, `picture-image`, `audio-music-sfx`, `social-publishing`, `billing-credits`, `admin-cron`, `analytics-reports`, `misc`).
- Neue Buckets wie `calendar-planning`, `notifications-email`, `qa-testing`, `automation-jobs-1/2`, `picture-image-1/2`, `admin-cron-1/2`, `audio-music-sfx-1/2`, `social-meta`, `social-tiktok-twitch`, `social-google`, `social-other`, `community-coach`, `utilities`, `data-fetch`, `planner-strategy`, `ai-text-generation`, `briefing-director`, `composer-render`, `image-providers`, `misc-1/2/3` etc. fehlen — daher nichts „Neues" sichtbar.
- Der Hinweistext spricht noch von „Block 1 — kuratierte Auswahl".

Die Registry liegt in `supabase/functions/_shared/smokeRegistry.ts` (Deno-Pfad, kann das Frontend nicht direkt importieren).

## Lösung

1. **Neue Shared-Quelle für Frontend**: `src/lib/qa/smokeCategories.ts` anlegen mit einer manuell gepflegten Liste, die 1:1 zu `SMOKE_CATEGORIES` in der Registry passt (32 Einträge mit `id` + `label`). Diese Datei ist die Single-Source-of-Truth für das Cockpit-Dropdown.

2. **`FunctionMatrixTab.tsx` umstellen**:
   - Alte hartkodierte `CATEGORY_LABELS`-Map durch Import aus `@/lib/qa/smokeCategories` ersetzen.
   - Dropdown rendert jetzt alle 32 Kategorien in der definierten Reihenfolge (statt alphabetisch über `Object.keys`).
   - `grouped`-Sektion benutzt dasselbe Label-Lookup.
   - Hinweistext aktualisieren: „467/473 Functions in 32 Kategorien à ≤25 Functions — Rate-Limit-safe, bitte kategorieweise sweepen."

3. **Keine Backend-Änderung nötig** — `smoke-matrix-run` ist bereits aktuell deployed, akzeptiert die neuen `category`-Strings und liefert für jede einen vollständigen Sweep.

## Out-of-Scope

- Keine Änderungen an `smokeRegistry.ts` oder Edge Functions.
- Keine Auto-Sync-Mechanik Registry↔Frontend (eine spätere Iteration könnte die Kategorien über einen `GET`-Endpoint von `smoke-matrix-run` ausliefern, aber das ist hier overkill).
- Keine Änderungen am Sweep-Loop, an der DB oder an den Status-Badges.

## Files

- **Neu**: `src/lib/qa/smokeCategories.ts` (32 Einträge `{ id, label }` in fester Reihenfolge).
- **Geändert**: `src/components/admin/qa-cockpit/FunctionMatrixTab.tsx` — Import aus neuer Datei, alte Map entfernt, Hinweistext aktualisiert.
