

## Befund

Der User möchte das AI-Video-Wallet-Guthaben für den Account `bestofproducts4u@gmail.com` auf **€200** setzen.

Relevante Tabelle: `ai_video_wallets` (separates Wallet für AI-Video-Generierung, getrennt vom regulären Credit-`wallets`-System).

## Plan

### 1. User-ID ermitteln
Per SQL die `auth.users.id` für die E-Mail `bestofproducts4u@gmail.com` nachschlagen.

### 2. Wallet aktualisieren / anlegen
In `ai_video_wallets`:
- Falls Eintrag existiert: `balance_euros = 200`, `updated_at = now()`
- Falls kein Eintrag: neuen Datensatz anlegen mit `balance_euros = 200`, `currency = 'EUR'`, `total_purchased_euros = 200`, `total_spent_euros = 0`

Per `UPSERT` (`ON CONFLICT (user_id) DO UPDATE`) in einem Schritt erledigt.

### 3. Transaktion protokollieren
Optional, aber sauber: einen Eintrag in `ai_video_transactions` erzeugen (`type = 'adjustment'` oder `'manual_credit'`) mit `amount_euros = differenz`, `balance_after = 200`, `description = 'Manual balance adjustment by admin'`.

Falls der `type`-Check-Constraint nur `purchase|bonus|deduction|refund` zulässt, wird der Eintrag als `bonus` mit Beschreibung "Manual admin adjustment" gebucht.

### 4. Verifikation
Nach dem Update: `SELECT balance_euros FROM ai_video_wallets WHERE user_id = ...` → muss **200.00** zurückgeben. Realtime-Subscription im `useAIVideoWallet`-Hook aktualisiert die UI automatisch beim nächsten Reload des Users.

## Betroffene Daten
- `ai_video_wallets` — Balance auf 200 EUR setzen (Insert/Update)
- `ai_video_transactions` — Audit-Log-Eintrag

## Verify
- Nach Reload zeigt der Account `bestofproducts4u@gmail.com` im AI-Video-Bereich €200 verfügbares Guthaben
- Die im Composer fehlgeschlagene Generierung (€4.50 benötigt) lässt sich nun problemlos starten

