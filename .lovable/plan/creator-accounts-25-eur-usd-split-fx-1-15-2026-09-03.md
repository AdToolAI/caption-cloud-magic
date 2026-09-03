# Creator-Accounts 25 % + EUR/USD-Split (FX 1,15)

## 1. Creator-Standard auf 25 %

- `admin-create-creator-account`: Default-Rabatt von 40 % auf **25 %** ändern (Parameter bleibt überschreibbar). Alles andere (einmalige Gutschrift, voller Plattform-Zugang, Idempotenz) bleibt.
- Neuer Account **ani.who@web.de**: 50 EUR-Guthaben, 25 % Rabatt, zufälliges Passwort. Zugangsdaten nenne ich dir im Chat.
- Bestehender Account **dsftoronto@gmail.com**: Rabatt von 40 % auf 25 % senken (Guthaben 50,00 und Creator-Status bleiben unangetastet, kein neues Passwort).

## 2. Rabatt bleibt an der Abbuchung

Keine Änderung an der Mechanik: `get_ai_discount_factor` wird weiterhin zentral in den Deduct-/Refund-Funktionen angewendet, die Preisanzeige (`pricing-catalog`) spiegelt denselben Faktor. Damit gilt der Rabatt automatisch für jedes heutige und künftige KI-Modell, auch für geschenktes Guthaben, und Rückerstattungen erstatten exakt den rabattierten Betrag. Kein Bonus beim Kauf, kein doppelter Nachlass.

## 3. EUR/USD-Split über einen einzigen FX-Faktor

Heute stehen alle Modelle 1:1 (0,44 € = $0.44), obwohl 1 € ≈ 1,15 $ ist — bei USD-Kunden verlieren wir dadurch rund 13 % Marge.

Neu: **eine** Konstante `USD_PER_EUR = 1.15` als Wahrheit. Jeder USD-Preis wird daraus abgeleitet statt separat gepflegt:

```text
Katalog:  sellEUR (gepflegt)  ->  sellUSD = round2(sellEUR * 1.15)
Anzeige:  Wallet-Waehrung EUR -> EUR-Preis
          Wallet-Waehrung USD -> USD-Preis
Abbuchung: exakt derselbe Preis wie die Anzeige (gleiche Waehrung)
```

Credit-Packs bleiben unverändert 1:1 ($50-Pack = 50 Guthaben-Einheiten). Der USD-Kunde bekommt also gleich viele Einheiten, verbraucht sie aber 15 % schneller — wirtschaftlich exakt die FX-Korrektur, ohne dass jemand ein kleineres Guthaben angezeigt bekommt.

Wichtig für die Preisehrlichkeit: die Abbuchung muss in der **Wallet-Währung** rechnen, nicht fix in EUR. Sonst zeigt die UI $0.51 an und zieht 0,44 Einheiten ab.

## Technische Details

- `supabase/functions/_shared/videoPricingCatalog.ts`: `USD_PER_EUR = 1.15` einführen, `sellUSD` je Eintrag daraus ableiten (keine handgepflegten USD-Zahlen mehr).
- Client-Spiegel `src/config/aiVideoModelRegistry.ts` (und ggf. `src/types/video-composer.ts`) auf denselben Faktor ziehen, damit `src/test/pricing-catalog-parity.test.ts` weiter grün ist; Test um eine explizite `sellUSD == round2(sellEUR * 1.15)`-Prüfung ergänzen.
- Preisauflösung: `resolveAccountCostPerSecond` bekommt die Währung aus `ai_video_wallets.currency` des Nutzers statt eines Aufrufer-Defaults; ein kleiner Helfer `resolveWalletCurrency(userId)` im `_shared`-Ordner, den die generate-*-Funktionen nutzen. `pricing-catalog` liefert zusätzlich `walletCurrency`, damit die UI dieselbe Währung anzeigt.
- Rabatt-Default in `admin-create-creator-account` 40 -> 25.
- Migration für `dsftoronto@gmail.com`: gezieltes `UPDATE profiles SET ai_discount_percent = 25` für diese eine User-ID.
- Anlegen von `ani.who@web.de` über die bestehende Admin-Funktion (50 EUR, 25 %).
- Keine Änderung an Stripe-Preisen, Packs, Abo, Refund-Logik, Lip-Sync- oder Render-Pipeline.

## Verifikation

- Unit-Test: `sellUSD` aller Katalog-Einträge = `sellEUR * 1,15` (auf Cent gerundet), Parity-Test UI ↔ Backend grün.
- DB-Check nach Umsetzung: beide Creator-Accounts mit `account_type = creator`, `ai_discount_percent = 25`, Guthaben 50,00.
- Stichprobe: Anzeige-Preis eines Modells für einen EUR- und einen USD-Wallet-Nutzer entspricht exakt dem abgebuchten Betrag inkl. 25 % Creator-Rabatt.
