

## Fix: Legal-Seiten, tote Links und Navigation

### Problem-Analyse

1. **Doppelter Header auf Legal-Seiten**: AppLayout rendert den `<Header />` fuer Landing-Routen (inkl. `/imprint`), UND Legal.tsx rendert seine eigene `<nav>`. Das ergibt zwei Header uebereinander.

2. **Tote Links im Footer**: Viele Links in `BlackTieFooter.tsx` zeigen auf `#` (Blog, Tutorials, API Docs, Status, Ueber uns, Karriere, Kontakt, Presse, Roadmap, Cookie-Einstellungen).

3. **Header-Links funktionieren nur auf Startseite**: "Preise" (`#pricing`) und "FAQ" (`#faq`) sind Anker-Links, die nur auf der Index-Seite funktionieren.

4. **"Kostenlos starten" Button**: Verlinkt auf `/generator` statt `/auth` fuer nicht-eingeloggte Nutzer.

---

### Aenderungen

**1. `src/pages/Legal.tsx`** -- Eigene `<nav>` aus allen 4 Bloecken entfernen
- Die Navigation kommt bereits vom AppLayout-Header
- Stattdessen einen einfachen "Zurueck zur Startseite"-Link als Breadcrumb oben im Content-Bereich einbauen

**2. `src/components/landing/BlackTieFooter.tsx`** -- Tote Links fixen
- Alle `#`-Links entweder auf echte Seiten verlinken oder auf `/coming-soon` umleiten:
  - Blog, Tutorials, API Docs, Status -> `/coming-soon`
  - Ueber uns, Karriere, Kontakt, Presse -> `/coming-soon`
  - Roadmap -> `/coming-soon`
  - Cookie-Einstellungen -> Cookie-Consent-Dialog oeffnen (oder `/coming-soon`)
- AVV-Link hinzufuegen unter "Rechtliches"

**3. `src/components/Header.tsx`** -- Navigation-Links fixen
- "Preise" von `#pricing` auf `/pricing` aendern
- "FAQ" von `#faq` auf `/faq` aendern
- "Kostenlos starten" Button von `/generator` auf `/auth` aendern (fuer nicht-eingeloggte Nutzer)

**4. `src/App.tsx`** -- `/coming-soon` Route hinzufuegen (falls noch nicht vorhanden)
- Pruefen ob `/coming-soon` bereits existiert, sonst Route anlegen

**5. Englisch-Kompatibilitaet pruefen**
- Footer-Labels und Legal-Inhalte sind aktuell nur Deutsch
- Footer-Labels sollten ueber das Translation-System (`t()`) laufen statt hardcoded Deutsch
- Alternativ: Footer bleibt Deutsch (da Impressum/AGB deutsches Recht), aber UI-Labels uebersetzen

---

### Betroffene Dateien
- `src/pages/Legal.tsx` -- Nav entfernen
- `src/components/landing/BlackTieFooter.tsx` -- Links fixen, i18n
- `src/components/Header.tsx` -- Anker-Links und CTA fixen
- Ggf. `src/App.tsx` -- Coming-Soon Route

