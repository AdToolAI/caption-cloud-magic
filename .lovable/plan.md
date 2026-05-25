## Ziel
Während der aktiven Testphase (`trial_status = 'active'`) bekommen User Vollzugriff auf **alle** Features — keine "Upgrade Required"-Modals mehr, Brand Kit, API-Connections, Kalender, AI-Video, X/Twitter, Carousel, Coach, Campaigns, BioOptimizer, ImageCaptionPairing usw. sind freigeschaltet. Die Upgrade-Prompts greifen erst, wenn der Trial abläuft (Grace Period / Expired).

## Hintergrund
- Trial-User bekommen heute schon `plan_code = 'enterprise'` in `wallets` (DB-Check bestätigt: 3 aktive Trials laufen alle als enterprise).
- Trotzdem ploppt im Screenshot ein **PlanLimitDialog** "API Connections requires a Pro or higher plan" auf — d.h. einzelne Gates prüfen **nicht** das tatsächliche `plan_code`, sondern öffnen den Dialog hart, oder lesen einen veralteten Plan-Status.
- Es gibt zwei zentrale Gate-Mechanismen:
  1. `useFeatureGate` → triggert `SmartUpgradeModal` über `useUpgradeTrigger`
  2. `PlanLimitDialog` (statische Variante, wird in 7 Seiten direkt geöffnet)
- Dazu kommen die Helpers in `src/lib/entitlements.ts` (`canUseTeamFeatures`, `canUseWhiteLabel`, `canUseApi`, `canUseXTwitter`, `canUseAIVideoGeneration`, `canQuickCalendarPost`), die rein auf `PlanId` schauen und Trial nicht kennen.

## Was geändert wird (Frontend only)

### 1. Neuer zentraler Helper `useTrialAccess`
Neue Datei `src/hooks/useTrialAccess.ts`:
- Liest `useTrialStatus()` + `useCredits()`
- Liefert `hasFullAccess: boolean` = `trial.status === 'active'` **oder** `plan_code in ['pro','enterprise']`
- Wird in allen Gates verwendet.

### 2. `useFeatureGate` Trial-Bypass
`src/hooks/useFeatureGate.ts`:
- Vor dem Plan-Rank-Check: wenn `trial.status === 'active'` → sofort `return true`.
- Verhindert SmartUpgradeModal für Sora/Pro-Features während Trial.

### 3. `PlanLimitDialog` Auto-Bypass
`src/components/performance/PlanLimitDialog.tsx`:
- Im Component selbst `useTrialAccess` lesen.
- Wenn `hasFullAccess === true` und `open === true` → `useEffect` ruft `onOpenChange(false)` und Dialog rendert `null`.
- Dadurch wirken alle 7 Aufrufstellen (BioOptimizer, BrandKit, Calendar, Campaigns, Carousel, Coach, ImageCaptionPairing, ConnectionsTab) automatisch mit, ohne dass jede Seite angepasst werden muss.

### 4. `UpgradeModal` (alte Variante) Auto-Bypass
`src/components/UpgradeModal.tsx`:
- Gleiche Logik wie PlanLimitDialog (Sicherheit, falls noch Aufrufe existieren).

### 5. `useUpgradeTrigger` Trial-Bypass
`src/hooks/useUpgradeTrigger.tsx`:
- In `trigger()` zu Beginn: wenn `trial.status === 'active'` **und** `source !== 'trial-progress'` **und** `source !== 'trial_expired'` → no-op (`return`).
- Trial-Progress-Banner ("noch 14 Tage") bleibt sichtbar — der User soll ja konvertieren, aber nicht durch Feature-Walls blockiert werden.

### 6. Entitlements-Helper trial-aware machen (optional, defensiv)
`src/lib/entitlements.ts`:
- Neue Variante exportieren: `useEntitlement(feature)` Hook, der intern `useTrialAccess` kombiniert.
- Bestehende reine PlanId-Funktionen bleiben (kein Breaking Change) — aber überall, wo sie direkt UI-Sichtbarkeit steuern, prüfen wir, ob Trial-User schon korrekt durchkommen (in den meisten Fällen ja, weil `plan_code='enterprise'`).

### 7. Sicherheits-Check Brand Kit
`src/pages/BrandKit.tsx` Zeile ~915 öffnet `PlanLimitDialog` — durch Schritt 3 automatisch entschärft. Zusätzlich verifizieren wir, dass die Brand-Kit-Erstellung selbst nicht auf einem zusätzlichen Server-Gate hängt (kurzer Read-Only-Check).

## Was **nicht** geändert wird
- Keine DB-Migration (Trial-User haben bereits `plan_code='enterprise'`).
- Keine Backend-/Edge-Function-Änderungen — Credits-Wallet und RLS bleiben unangetastet.
- Trial-Banner ("14 Tage verbleibend") bleibt sichtbar, damit Konversion getriggert wird.
- Nach Trial-Ende (`grace` / `expired`) greifen alle Gates wieder wie bisher.

## Verifikation
1. Als aktiver Trial-User auf `/performance` → "Verbinden" klicken → kein Upgrade-Modal, OAuth-Flow startet.
2. Auf `/brand-kit` → Brand Kit kann gespeichert werden ohne Modal.
3. Auf `/calendar`, `/carousel`, `/coach`, `/campaigns`, `/bio-optimizer`, `/image-caption-pairing` → keine Plan-Limit-Modals.
4. Als `expired`-User → Modals erscheinen wieder.
5. Konsole prüfen, dass kein "trial-progress"-Modal versehentlich unterdrückt wird.