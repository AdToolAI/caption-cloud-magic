## Landing-Page Audit — Ergebnisse

Ich habe die Startseite (`/`) headless im Browser durchgetestet: alle Buttons/Links extrahiert, Console/Netzwerk mitgelesen, komplette Seite gescrollt. Der Rest der Seite (Hero-Video, Founders-Dialog, Sprachumschalter, Cookie-Banner, FAQ-Accordion, Footer-Legal, FeatureGrid-Links `/calendar`, `/analytics`, `/brand-kit`, `/coach`, `/composer`, `/goals`) funktioniert sauber. Nur ein Sentry-Envelope 400 (externer Dienst, kein App-Bug) im Log.

### Gefundene Probleme

| # | Ort | Problem | Fix |
|---|---|---|---|
| 1 | `UDCShowcase.tsx` L71 | Button „Open Directors Cut" verlinkt auf **`/directors-cut`** — Route existiert **nicht** (nur `/universal-directors-cut`). Klick landet auf NotFound. | Link auf `/universal-directors-cut` umstellen. |
| 2 | `UDCShowcase.tsx` L73/79 | CTA-Labels **„Open Directors Cut" / „See pricing"** sind Englisch mitten auf der deutschen Startseite. | Übersetzen: „Directors Cut öffnen" / „Preise ansehen" (via `useTranslation` oder direkt). |
| 3 | `BlackTieHero.tsx` L64–69 | Pricing-Hint-Link `href="#pricing"` — auf `Index.tsx` gibt es **keinen** `#pricing`-Anker (PricingSection ist auf der Startseite nicht mehr eingebunden). Klick tut nichts. | `<a href="#pricing">` durch `<Link to="/pricing">` ersetzen. |
| 4 | `BlackTieHero.tsx` L88 | Sekundär-CTA **„Demo ansehen"** verlinkt auf `/pricing` statt auf eine Demo. Erwartungsbruch. | Auf die vorhandene `LiveDemoShowcase` scrollen (`#live-demo`) und in `LiveDemoShowcase` ein `id="live-demo"` setzen. |
| 5 | `BlackTieFooter.tsx` L26 | Footer-Eintrag **„Status"** zeigt auf `/coming-soon`, obwohl die echte `/status`-Seite existiert und live ist. | Href auf `/status` ändern. |

### Nicht anzufassen (bewusst so)
- Header-CTA „Kostenlos starten" → `/auth`, Hero-CTA → `/generator` (ProtectedRoute leitet gast-user ohnehin nach `/auth`). Unterschied ist beabsichtigt, damit angemeldete User direkt in den Generator kommen.
- Footer-Legal doppelt (`/privacy` + `/legal/privacy`): beide Routen zeigen auf denselben `Legal`-Renderer, keine Kollision.
- Sentry 400: externer Ingest-Endpoint, kein Deploy-Blocker.

### Umsetzung
Fünf gezielte Search/Replace-Edits in 3 Dateien:
- `src/components/landing/UDCShowcase.tsx` (Punkt 1 + 2)
- `src/components/landing/BlackTieHero.tsx` (Punkt 3 + 4)
- `src/components/landing/LiveDemoShowcase.tsx` (Punkt 4 — `id="live-demo"` an die Section)
- `src/components/landing/BlackTieFooter.tsx` (Punkt 5)

Anschließend die Seite nochmal headless durchklicken und die vier vorher toten/irreführenden Ziele verifizieren.

Kein Backend-, kein Business-Logic-Change — reine Frontend-Verdrahtung.
