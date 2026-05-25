## Root Cause

In `src/components/performance/ConnectionsTab.tsx` prüft `handleConnect` zuerst:

```ts
if (userPlan === 'free') {
  setShowUpgradeDialog(true);
  return;
}
if (userPlan === 'pro' && connections.length >= 3) { ... return; }
```

`userPlan` kommt aus `profiles.plan` — Trial-User stehen dort weiterhin auf `'free'` (Trial-Status liegt in `wallets`/`useTrialStatus`, nicht in `profiles`). Folge:

1. Klick auf „Verbinden" → `userPlan === 'free'` → `setShowUpgradeDialog(true)` + `return` (kein OAuth-Redirect).
2. Der `PlanLimitDialog` öffnet sich, schließt sich aber durch unseren letzten Trial-Bypass (`useTrialAccess`) sofort wieder.
3. Für den User sieht das aus, als würde der Button gar nicht reagieren.

## Fix (1 Datei, rein Frontend)

**`src/components/performance/ConnectionsTab.tsx`**

1. `useTrialAccess` importieren und in der Komponente verwenden:
   ```ts
   const { hasFullAccess } = useTrialAccess();
   ```
2. In `handleConnect` die Plan-Gates überspringen, wenn `hasFullAccess === true`:
   - Free-Check (`userPlan === 'free'`) nur ausführen, wenn **nicht** `hasFullAccess`.
   - Pro-3-Connections-Limit nur ausführen, wenn **nicht** `hasFullAccess` (Trial = unlimited, wie Enterprise).
3. Bonus (optional, gleicher PR): das Plan-Badge im Header von `/integrations` (`src/pages/Integrations.tsx`) zeigt aktuell „FREE" für Trial-User. Wenn `hasFullAccess`, Label auf „TRIAL – Unlimited" mappen, damit der Hinweistext „Free-Plan kann keine Konten verbinden" verschwindet.

Keine DB-, Edge-Function- oder Backend-Änderungen. Kein Eingriff in die eigentliche OAuth-Logik — der bisherige Redirect (Instagram/TikTok/X/Facebook/LinkedIn/YouTube) bleibt 1:1 erhalten und wird nur nicht mehr vorzeitig durch den Plan-Gate abgebrochen.

## Verifikation

- Als Trial-User auf `/integrations` jeden Provider anklicken → erwartet: sofortiger Redirect zur jeweiligen OAuth-Seite, keine Upgrade-Modal mehr.
- Console-Log `=== handleConnect START ===` sollte erscheinen, gefolgt von `Plan check passed, proceeding...` (statt `User on FREE plan, showing upgrade dialog`).
