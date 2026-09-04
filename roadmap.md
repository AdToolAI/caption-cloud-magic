# Roadmap

## Offen
- Topaz bleibt global aus (`PICTURE_TOPAZ_*_ENABLED=false`, nur String `"true"` aktiviert); Freigabe nur über `PICTURE_ENHANCE_TEST_USER_IDS`. Secrets nicht löschen, nur Werte auf `false`.
- Echte Validierungsläufe (Upscale, Dust & Scratch, Colorization): erwartete vs. tatsächliche Providerkosten/Units, Parameterübertragung, Ausgabemaße, Wallet, Mediathek, Refund. Danach Preisfreigabe, dann Flags auf `true`.

## Erledigt
- Zahlungsarten: Stripe automatische Methoden, Apple/Google-Pay-Domains, lokalisierte Fehler, Hinweiszeilen.
- Ein Bereich für Plan & Guthaben (`/billing`): Guthaben zuerst, Abo und Rechnungen darunter; `/pricing` nur noch öffentlich; lokalisierte Titel EN/DE/ES; Popup-Fallback beim Checkout.
