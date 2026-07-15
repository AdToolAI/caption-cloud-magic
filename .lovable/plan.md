## Ziel

Das alte generische Credit-System (aus der Pre-Beta-Ära) UI-seitig komplett unsichtbar machen. Nur **Media Credits** für AI-Video / Music / Bilder (`ai_video_wallets`) bleiben sichtbar und aktiv. Alles andere ist im **Beta-Basic-Abo (14,99 €)** enthalten. Hooks bleiben als No-Op im Code, damit bestehende Aufrufe nicht brechen.

## Was aktuell noch sichtbar ist (und weg soll)

- `/credits` Route + `Credits.tsx` Seite
- User-Menü-Eintrag „Credits" mit Balance-Anzeige (`UserMenu.tsx`)
- `CreditThresholdWatcher`, `TrialUpgradeWatcher`, `StreakMilestoneUpsellWatcher`, `FeatureDiscoveryWatcher` (alle triggern Upsell-Modals basierend auf altem Balance)
- `CreditGuard`, `CreditBalance`, `CreditHistory`, `CreditsHeroHeader`, `CreditLimitWarning` Komponenten
- `CreditUsageDashboard` in Analytics / `UsageReports.tsx`
- `CreditSystemTest.tsx` Beispieldatei

## Änderungen

### 1. Routing & Navigation
- **`src/App.tsx`**: Route `/credits` entfernen, Lazy-Import raus.
- **`src/components/layout/UserMenu.tsx`**: „Credits"-Eintrag + Balance-Chip entfernen. `useCredits`-Import raus.

### 2. Watcher deaktivieren
- **`src/components/upgrade/UpgradeMount.tsx`**: `CreditThresholdWatcher`, `TrialUpgradeWatcher`, `StreakMilestoneUpsellWatcher`, `FeatureDiscoveryWatcher` aus dem Mount entfernen. `SmartUpgradeModal` bleibt (wird von Founders-Flow genutzt).

### 3. Hooks als No-Op belassen
Bestehende `import`-Statements in ~15 Dateien bleiben stehen, damit nichts bricht. Die Hooks selbst werden neutralisiert:
- **`src/hooks/useCredits.ts`**: gibt konstant `{ balance: Infinity, loading: false, error: null }` zurück, kein DB-Read auf `wallets`.
- **`src/hooks/useFeatureGate.ts`**: gibt immer `{ allowed: true }` zurück (Beta-Abo deckt alles).
- **`src/hooks/useTrialAccess.ts`**: neu verdrahtet gegen aktive Stripe-Subscription statt Balance. Nutzt existierende `check-subscription` Edge-Function bzw. `useSubscription` Hook falls vorhanden — ansonsten kurze eigene Abfrage. Ohne aktive Sub → `trialActive: false`, mit Sub → `trialActive: true`. Keine Credit-Logik mehr.

### 4. Analytics-Dashboards
- **`src/components/analytics/CreditUsageDashboard.tsx`**: durch leere Placeholder-Komponente ersetzen die einen kurzen Hinweis rendert („Credit-Nutzung ist im Beta-Abo enthalten. Media-Credits siehst du im AI Video Studio.") — nichts crashen lassen, aber keine alten Zahlen mehr zeigen.
- **`src/pages/Analytics/UsageReports.tsx`**: falls das Dashboard eingebettet ist, ersetzen oder ausblenden.

### 5. Aufräumen / Deaktivieren
- **`src/examples/CreditSystemTest.tsx`**: nicht angefasst (Beispieldatei, wird nicht gerendert).
- `CreditGuard` / `CreditBalance` etc. bleiben im Repo, werden aber nur noch von `Credits.tsx` genutzt — nach Route-Entfernung dead code, aufräumen später.

### 6. AI-Media-Wallet bleibt unverändert
`useAIVideoWallet`, `ai_video_wallets`, `AIVideoCreditPurchase`, `AIVideoCostConfirmDialog` — alles unverändert. Das ist das aktive System für Video/Music/Bild-Generierung.

## Technischer Kontext (Non-Techies können überspringen)

- **DB**: Die Tabelle `public.wallets` bleibt stehen (die Escalation-Policy wurde bereits gefixt). Kein Migration nötig, kein Datenverlust.
- **`useTrialAccess`-Umbau**: falls kein zentraler `useSubscription`-Hook existiert, wird die Prüfung direkt gegen die `check-subscription` Edge-Function laufen (mit React-Query Cache), analog zum bestehenden Muster.
- **RLS**: unverändert. `wallets`-Zugriff bleibt gesperrt für Clients.

## Verifikation

Nach dem Build:
1. User-Menü: kein „Credits" mehr, kein Balance-Chip.
2. `/credits` liefert 404 / NotFound.
3. AI Video Studio zeigt weiterhin Media-Credits-Kosten (aus `ai_video_wallets`).
4. Keine Upsell-Modals aufgrund von „niedrigem Credit-Stand" mehr.
5. Console keine Fehler von `useCredits`-Consumern (Hook returned safe defaults).
6. Feature-Zugang gated nur noch nach Abo-Status (Stripe-Subscription).

## Nicht in diesem Plan

- Löschen der `wallets`-Tabelle (bleibt für Audit-Trail).
- Refactor der 15+ `useCredits`-Consumer (unnötig — Hook liefert safe defaults).
- Neue Media-Credit-Chip im Header (kam als Alternative, User hat konservative Option gewählt).
