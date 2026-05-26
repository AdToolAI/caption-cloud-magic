## Ziel

Da Meta jetzt **Advanced Access** für alle relevanten Scopes (`pages_read_engagement`, `pages_show_list`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`) gewährt hat, wird Verbinden + Posten von Facebook/Instagram (und konsistent auch der anderen Plattformen) für **jeden eingeloggten Nutzer** freigegeben — ohne Plan-Gate, ohne Review-Sonderpfad, ohne 3-Connections-Limit.

## Scope (was sich ändert)

Nur Frontend-Gating + UI-Texte. Die OAuth-Flows, Edge Functions, RLS-Policies, Token-Refresh-Cron und Publishing-Pipelines bleiben **unverändert** — sie funktionieren bereits korrekt, sie waren nur durch UI-Schranken künstlich limitiert.

## Änderungen im Detail

### 1. `src/components/performance/ConnectionsTab.tsx`
- **Plan-Gate entfernen** (Zeilen 251–269):
  - `if (!hasFullAccess && !planIsPaid) { setShowUpgradeDialog(true); return; }` → entfernen.
  - 3-Connections-Limit für Pro → entfernen.
- **"Instagram für Review verbinden"-Button** (Zeilen 1164–1197) → entfernen. Der reguläre Connect-Button nutzt bereits denselben Backend-Hard-Reset-Flow.
- `forReview`/`forceReconsent` Options + Confirm-Dialog (Zeilen 299–313, 327, 337) → entfernen, da nicht mehr nötig.
- `useTrialAccess`-Import & `hasFullAccess`-Verwendung → entfernen (nur noch `user != null` als Gate).
- `PlanLimitDialog`-Import + `showUpgradeDialog`-State → entfernen.

### 2. `src/pages/Integrations.tsx`
- `planLimits.free` von `connections: 0` auf `connections: Infinity` setzen, Label auf `socialIntegrations.unlimited`.
- "Pro-Hint"-Box (Zeilen ~149–162) entfernen oder durch neutralen Info-Block ersetzen ("Verbinde so viele Accounts wie du möchtest").
- Alternativ: Komplette `planLimits`-Logik entfernen, da nicht mehr relevant.

### 3. i18n-Strings (`src/lib/translations/*` bzw. `useTranslation`-Keys)
- `socialIntegrations.unlimited` ggf. neu anlegen / wiederverwenden.
- `socialIntegrations.proHint`, `socialIntegrations.upgradeNow`, `socialIntegrations.noConnections`, `socialIntegrations.upTo3` werden nicht mehr referenziert — können bleiben (keine Aufräumarbeit nötig) oder optional entfernt werden.

### 4. Sanity-Check: andere Gates
- `src/hooks/useSocialPublishing.ts` und `useScheduledPublishing.ts` kurz prüfen, dass dort **kein** zusätzliches Plan-Gate Posten blockiert. (Read-only-Audit, Fix nur falls nötig.)
- `usePlatformCredentials.ts` ist plan-agnostisch — keine Änderung.

### 5. Memory aktualisieren
- `mem://auth/social/meta-reviewer-credentials` → markieren als historisch / "Review abgeschlossen, Advanced Access granted für alle Scopes, Reviewer-Pfad entfernt".
- `mem://constraints/social-integrations/platform-portal-and-review-requirements` → Meta-Sektion auf "Advanced Access live, kein Review-Gate mehr" updaten.

## Was bewusst **nicht** geändert wird
- TikTok-Sandbox-Beschränkung (separates Konstrukt, hängt nicht an Meta).
- X Basic-API-Limit (Twitter-spezifisch).
- OAuth-Edge-Functions, `instagram-oauth-start`, `oauth-callback`, Token-Refresh-Cron.
- RLS auf `social_connections`, `app_secrets`.
- LinkedIn / YouTube / Facebook-Page-Select-Dialog-Logik.

## Akzeptanzkriterien
1. Ein frisch registrierter **Free-User** kann ohne Upgrade-Dialog auf "Verbinden" klicken und den OAuth-Flow für Instagram/Facebook/TikTok/LinkedIn/X/YouTube starten.
2. Es gibt **kein** Connection-Cap mehr (auch nicht 3 für Pro).
3. Der "Instagram für Review verbinden"-Button und der Confirm-Hinweistext sind weg.
4. Posting (sofort + geplant) funktioniert für Free-User exakt wie zuvor für Pro-User.
5. Bestehende Verbindungen / Tokens bleiben unberührt.
6. Keine neuen Console-Errors, OAuth-Callback-Handling unverändert.
