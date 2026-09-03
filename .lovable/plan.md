# Ein Bereich für Plan & Guthaben — statt Billing + Pricing doppelt

Zur Ausgangsfrage: Code-seitig ist bei den Zahlungsarten alles fertig und deployed (automatische Stripe-Methoden, Adress-/Namenserhebung, Apple/Google-Pay-Domains registriert, lokalisierte Fehler). Dein Screenshot vom Live-Checkout bestätigt das — dort greift nur zuerst „Link", weil eine gespeicherte Karte existiert; über „Pay without Link" erscheinen die übrigen Methoden. Was jetzt stört, ist die Navigation drumherum. Genau das räumt dieser Plan auf.

## Was heute passiert (geprüft)

- Das Guthaben-Icon im Header verlinkt auf `/billing`. Dort stehen Abo, Portal, Rechnungen — aber **kein** Guthaben und kein Credit-Kauf.
- `/pricing` ist eine öffentliche Marketing-Seite ohne App-Shell. Eingeloggt wirkt sie deshalb wie „ausgeloggt" und zeigt zusätzlich dieselben Plan-Infos plus die Credit-Pakete.
- Die Credit-Pakete gibt es doppelt: einmal auf `/pricing`, einmal im AI-Video-Studio.
- Auf `/pricing` fehlt am Credit-Paket-Block der Zahlungsarten-Hinweis (den gibt es nur im Studio-Block), deshalb sieht der Kauf dort „ohne Stripe" aus.
- Der Checkout öffnet immer in einem neuen Tab (`window.open`) — bei Popup-Blockern passiert scheinbar nichts.

## Was ich ändere

**1. `/billing` wird der eine Bereich — „Plan & Guthaben"**
Reihenfolge auf der Seite, Guthaben zuerst:
1. **KI-Guthaben** — aktueller Kontostand groß, direkt darunter die vier Credit-Pakete mit Kauf-Button (derselbe Baustein wie im Studio, keine zweite Logik).
2. **Abo** — aktueller Plan, Preis, Portal öffnen, kündigen.
3. **Rechnungen & Belege** — unverändert.
Seitentitel/Untertitel entsprechend angepasst (EN/DE/ES).

**2. `/pricing` bleibt nur noch die öffentliche Verkaufsseite**
Eingeloggte Nutzer werden von `/pricing` auf `/billing` geleitet. Damit verschwindet die „ausgeloggte" Ansicht und die Doppelung. Der Eintrag „Pricing" im Nutzer-Menü heißt künftig „Plan & Guthaben" und zeigt auf `/billing`; die öffentliche Preisseite bleibt für Besucher und für Footer-Links erreichbar.

**3. Zahlungsarten überall sichtbar machen**
- Der Hinweis „Karte · Apple Pay · Google Pay · PayPal · SEPA · Klarna · iDEAL und weitere" steht künftig auch über den Credit-Paketen auf der öffentlichen Preisseite und im neuen Guthaben-Block.
- Ergänzt um eine kurze Zeile „Sichere Zahlung über Stripe".

**4. Checkout-Öffnung robuster**
Wenn der neue Tab vom Browser blockiert wird, wird im selben Tab weitergeleitet statt stillschweigend nichts zu tun.

## Was unberührt bleibt

Preise, FX-Faktor 1,15, Creator-Rabatt, Gründer-Rabatt, Guthaben-Ledger, Refunds, Promo-Codes, alle Edge Functions (kein Redeploy nötig), Video- und Lip-Sync-Pipeline.

## Technisch

- `src/pages/Billing.tsx`: neuer Guthaben-Abschnitt oben (`useAIVideoWallet` + `AIVideoCreditPurchase`), bestehende Abschnitte darunter.
- `src/pages/Pricing.tsx`: Redirect für eingeloggte Nutzer auf `/billing`; Zahlungsarten-/Stripe-Hinweis über dem Paket-Grid.
- `src/components/layout/UserMenu.tsx`: Menüpunkt auf `/billing` umgestellt und umbenannt.
- `src/components/ai-video/AIVideoCreditPurchase.tsx`: Popup-Fallback beim Checkout.
- `roadmap.md`: Aufgabe eintragen.
- Prüfung: Typecheck, Build, Browser-Check auf `/billing` und `/pricing` (eingeloggt und ausgeloggt).
