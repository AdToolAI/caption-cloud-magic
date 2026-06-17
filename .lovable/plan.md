## Root Cause

Die Forensik zeigt `frame_extract_unavailable: replicate_api_token_missing`. Das Projekt-Secret heißt aber **`REPLICATE_API_KEY`** (alle anderen 11 Provider-Functions lesen diesen Namen). Mein v129.11 Frame-Extractor liest fälschlich `REPLICATE_API_TOKEN` — der existiert nicht, also bricht die Extraktion sofort ab → keine JPEG → Face-Probe `warn` → Sync.so dispatched ohne echte Verifikation → Fail.

## Fix (v129.12 — One-Line-Fix)

**`supabase/functions/_shared/face-frame-extract.ts`** (Zeilen 72–109):
- Lese Secret als `Deno.env.get("REPLICATE_API_KEY") ?? Deno.env.get("REPLICATE_API_TOKEN")` (Fallback für beide Namen).
- Fehlermeldung von `replicate_api_token_missing` → `replicate_api_key_missing` (klarer).
- Variable umbenennen für Konsistenz mit Rest der Codebase.

## Deployment & Verify

1. Deploy `syncso-preflight` und `compose-dialog-segments` (beide nutzen den shared Extractor).
2. Forensik-Sheet für Scene `ea542657…` neu öffnen → Reload-Button bei Preflight klicken.
3. **Erwartung**: `Gesicht am ASD-Frame` zeigt jetzt `PASS` (oder `BLOCKED` mit echtem Verdict) statt `WARN`, plus inline JPEG-Thumbnail. `EXTRACT_MS > 0`.
4. Wenn `PASS` → neuer Genery-Versuch sicher.
5. Wenn `BLOCKED` mit `no_face`/`not_at_coord` → Root-Cause ist ASD-Koordinate (separates Thema, kein Credit-Loss da Pre-Sync Refund greift).

## Bump

- `SyncsoForensicsSheet.tsx` Version-Badge: `v129.11` → `v129.12`.

## Out of Scope

- Keine Änderungen an Gate-Logik, Gemini-Prompt, Sync.so-Payload, ASD-Algorithmus.
- Keine neuen Migrations.