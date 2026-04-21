

# Option A.1 + A.2 — TikTok Sync-Test + Warmer-Erweiterung

## Status der drei Sub-Optionen

| Sub | Aufgabe | Status |
|-----|---------|--------|
| A.1 | TikTok Sync-Test mit captiongenie.app | ⏳ Noch zu testen |
| A.2 | Warmer-Liste um TikTok erweitern | ⏳ Noch zu tun |
| A.3 | Posting-Times-Cache language-aware für TikTok | ✅ **Bereits erledigt** — TikTok ist in `posting-times-api` (Z.145) und `generate-posting-slots` (Z.16) als Plattform definiert; Cache-Key enthält `lang` (Z.358). Nichts zu ändern. |

## A.1 — TikTok Sync-Test (Live-Verifikation)

**Was wir testen:**
1. `tiktok-sync` Edge Function aufrufen (mit deiner Auth)
2. Prüfen, ob Token-Refresh-Logik korrekt durchläuft
3. Prüfen, ob `getUserInfo` Daten zurückgibt (Display-Name, Avatar)
4. DB-Updates verifizieren in `social_profiles` und `social_connections`

**Wie:**
- `supabase--curl_edge_functions` POST `/tiktok-sync` (nutzt deinen Auth-Token automatisch)
- `supabase--read_query` auf `social_connections` + `social_profiles` für captiongenie.app
- `supabase--edge_function_logs` für `tiktok-sync` zur Verifikation des Flows

**Erwartetes Ergebnis:**
- HTTP 200 mit `{ success: true, profile: {...}, synced_at }`
- `social_connections.last_sync_at` = jetzt
- `social_profiles.display_name`, `avatar_url` gesetzt
- Logs zeigen sauberen Flow ohne Token-Refresh-Errors

**Bekannte Limitierung (kein Fehler):** `follower_count`, `following_count`, `video_count` bleiben 0, da Sandbox/Login-Kit diese Felder nicht freigibt — bestätigt mit grünem TikTok-Hinweis in der UI.

## A.2 — Edge Function Warmer erweitern

**Datei:** `supabase/functions/edge-function-warmer/index.ts`

**Änderung:** TikTok-relevante Functions zur `CRITICAL_FUNCTIONS` Liste hinzufügen. Konkret:
- `tiktok-sync` — wird nach jedem Connect und für Scheduled-Sync genutzt
- `tiktok-oauth-start` — kalt → langsamer Connect-Klick
- `tiktok-health` — wird im Health-Check beim Connect-Flow genutzt
- `publish-to-tiktok` — wird für Direct-Posts ohne Vorlauf benötigt

**Begründung pro Function:**

| Function | Kalt-Start-Impact | Häufigkeit |
|----------|-------------------|------------|
| `tiktok-sync` | ~2-3s Latenz beim ersten Sync nach Connect | Bei Connect + alle 6h via cron |
| `tiktok-oauth-start` | ~1-2s Latenz beim Connect-Klick | Pro neuem Connect |
| `tiktok-health` | ~1s Latenz beim Pre-Connect-Check | Pro Connect |
| `publish-to-tiktok` | ~2s Latenz beim ersten Direct-Post | Pro Veröffentlichung |

**Code-Diff (Vorschau):**
```ts
const CRITICAL_FUNCTIONS = [
  'check-subscription',
  'planner-list',
  'calendar-timeline-slots',
  'generate-campaign',
  'posting-times-api',
  'sync-social-posts-v2',
  'get-credits',
  'render-with-remotion',
  'generate-caption',
  // NEU:
  'tiktok-sync',
  'tiktok-oauth-start',
  'tiktok-health',
  'publish-to-tiktok',
];
```

**Wichtig:** Der Warmer schickt `{ warmup: true }` als Body. Wir verifizieren in den 4 TikTok-Functions, dass dieser Warmup-Aufruf nicht crasht (z.B. wenn Auth-Header fehlt). Falls eine Function bei Warmup-Calls 500 zurückgibt, fügen wir am Anfang einen Early-Return hinzu:
```ts
const body = await req.json().catch(() => ({}));
if (body?.warmup) {
  return new Response(JSON.stringify({ warmed: true }), { headers: corsHeaders });
}
```

## Reihenfolge der Schritte (nach Approval)

1. **A.1 — Sync-Test ausführen** (3 Schritte parallel)
   - `curl_edge_functions` POST `/tiktok-sync`
   - `read_query` auf `social_profiles` + `social_connections`
   - `edge_function_logs` für `tiktok-sync`
   - Ergebnis als Tabelle präsentieren

2. **A.2 — Warmer erweitern**
   - `edge-function-warmer/index.ts` Liste um 4 TikTok-Functions ergänzen
   - In jeder der 4 TikTok-Functions sicherstellen, dass `{ warmup: true }` Early-Return funktioniert (falls noch nicht vorhanden)
   - Deploy via `supabase--deploy_edge_functions`
   - Warmer manuell auslösen via `curl_edge_functions` und Logs prüfen

3. **Verification**
   - Warmer-Logs zeigen alle 13 Functions mit `OK (XXXms)`
   - Memory-Update (optional): `mem://infrastructure/hosting/cloudflare-tiktok-proxy` mit „verified working + warmer integrated" finalisieren

## Geänderte/Neue Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/edge-function-warmer/index.ts` | 4 TikTok-Functions zur `CRITICAL_FUNCTIONS` Liste |
| `supabase/functions/tiktok-sync/index.ts` | Early-Return bei `{ warmup: true }` (falls noch nicht vorhanden) |
| `supabase/functions/tiktok-oauth-start/index.ts` | Early-Return bei `{ warmup: true }` (falls noch nicht vorhanden) |
| `supabase/functions/tiktok-health/index.ts` | Early-Return bei `{ warmup: true }` (falls noch nicht vorhanden) |
| `supabase/functions/publish-to-tiktok/index.ts` | Early-Return bei `{ warmup: true }` (falls noch nicht vorhanden) |

## Risiko & Rollback

- **Risiko:** Sehr niedrig. Warmer-Liste ist additiv. Early-Returns sind defensiv.
- **Rollback:** 4 Einträge aus `CRITICAL_FUNCTIONS` Array entfernen → 30s Fix.

## Was du tust

- **„OK, mach"** → ich starte mit A.1 (Sync-Test) und gehe direkt in A.2 über
- **„Nur A.1"** oder **„Nur A.2"** → ich mache nur den gewählten Teil

