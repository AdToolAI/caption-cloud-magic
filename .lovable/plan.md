# AI Video Studio: Upgrade-Sperre entfernen

## Befund

Die Seite `/n` (AI Video Studio / Toolkit) hat eine eigene, veraltete Plan-Sperre. Sie liest `plan_code` aus der `wallets`-Tabelle und lässt nur `pro` oder `enterprise` durch. Alles andere landet auf der Karte „Dieses Feature ist nur für Pro und Enterprise Nutzer verfügbar."

Das passt nicht mehr zum aktuellen Modell:

- Es gibt nur noch **Beta-Basic** (14,99 €) plus Trial. Ein Plan „pro" existiert nicht mehr.
- In der Datenbank hat aktuell **kein einziges** Wallet den Wert `pro`: 50× `free`, 6× `enterprise`, 1× `basic`. Alle zahlenden Beta-Basic-Nutzer und alle Testnutzer werden also ausgesperrt.
- Wer gar keine Wallet-Zeile hat, wird ebenfalls ausgesperrt, weil ein fehlender Wert als „kein Zugang" gilt.
- Der Rest der App macht es längst anders: `useFeatureGate` und `useTrialAccess` sind auf „Zugang über aktives Abo oder laufende Testphase" umgestellt. Nur diese eine Seite hängt noch am alten System.

## Fix

- Die Plan-Sperre auf der AI-Video-Studio-Seite auf denselben Zugangsweg umstellen wie im Rest der App: **aktives Abo oder laufende Testphase = voller Zugang** (`useTrialAccess`). Enterprise-Nutzer behalten selbstverständlich Zugang.
- Solange der Abo-Status noch geladen wird, keine Upgrade-Karte zeigen — sonst blitzt die Sperre beim Seitenaufruf kurz auf. Stattdessen ein neutraler Ladezustand.
- Die Upgrade-Karte bleibt erhalten, greift aber nur noch für Nutzer ohne Abo und ohne aktive Testphase. Ihr Text wird auf das aktuelle Angebot angepasst („Beta-Basic" statt „Pro und Enterprise"), und der Button führt auf die Preisübersicht statt auf `/settings/plan`.
- Die nun überflüssige `wallets`-Abfrage für den Plan-Check entfällt; das AI-Video-Guthaben (`useAIVideoWallet`) bleibt davon unberührt.

## Prüfung nach dem Fix

Kontrolle im Preview mit dem laufenden Konto: `/n` öffnet direkt das Studio, keine Upgrade-Karte, Guthabenanzeige und Generierungs-Tab sind erreichbar.

## Technische Details

- `src/pages/AIVideoToolkit.tsx`: `useQuery` auf `wallets.plan_code` und `canUseAIVideoGeneration` entfernen, stattdessen `useTrialAccess()` (`hasFullAccess`) plus Ladezustand aus `useAuth().subscribed`.
- `src/lib/entitlements.ts`: `canUseAIVideoGeneration` hat danach keinen Aufrufer mehr — Funktion entfernen, damit die veraltete `pro`/`enterprise`-Regel nicht erneut irgendwo eingebunden wird.
- `src/lib/translations.ts`: `aiVid.upgradeMessage` in DE/EN/ES auf das Beta-Basic-Angebot umformulieren.
- Keine Änderungen an Backend, Credits oder Generierungslogik.
