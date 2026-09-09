# Footer aufräumen, FAQ-Fehler beheben, persönliche Daten entfernen

## 1. FAQ zeigt "Something went wrong"

Der Fehler ("Failed to fetch dynamically imported module") entsteht, wenn der Browser noch die alte Version der Seite geladen hat und eine Datei anfordert, die es nach dem letzten Update nicht mehr gibt.

Es gibt bereits eine automatische Neuladen-Rettung, sie greift aber nur bei Fehlern, die nicht schon von der Fehleranzeige abgefangen werden — genau das passiert beim Laden von Unterseiten. Deshalb bleibt der Nutzer auf der roten Fehlerkarte hängen.

Lösung: Ein kleiner Lade-Helfer, der beim Laden jeder Unterseite einmal automatisch neu versucht und, wenn die Datei wirklich veraltet ist, die Seite genau einmal frisch lädt. Danach öffnet FAQ (und jede andere Unterseite) normal, ohne dass der Nutzer etwas tun muss.

## 2. Footer: unfertige Links entfernen

Aus der unteren Leiste fliegen alle Einträge raus, die nur auf "Coming Soon" führen: Roadmap, Blog, Tutorials, API Docs, Über uns, Karriere, Kontakt (Platzhalter), Presse.

Danach bleibt:
- Produkt: Features, Preise, FAQ
- Ressourcen: Status
- Unternehmen: entfällt komplett (Spalte wird ausgeblendet)
- Recht: Datenschutz, AGB, Impressum, AVV, KI-Video-Erstattung, Cookie-Einstellungen

Ein echter Kontaktpunkt bleibt über die Support-Seite und die Adresse info@useadtool.ai erhalten; ich ergänze "Kontakt" in der Ressourcen-Spalte mit Link auf die vorhandene Support-Seite.

## 3. "Made with ♥ in Germany" entfernen

Die Zeile ganz unten rechts wird ersatzlos gelöscht; die Copyright-Zeile bleibt.

## 4. TikTok-Icon ergänzen

Neben Twitter/X, LinkedIn, Instagram und YouTube kommt ein TikTok-Icon dazu (passendes Icon, gleicher Stil).

Wichtig: Alle fünf Icons zeigen aktuell ins Leere. Ich lasse sie zunächst optisch gleich, brauche aber von dir die echten Profil-Links (TikTok, Instagram, LinkedIn, YouTube, X) — sonst führen sie weiterhin nirgendwo hin.

## 5. Name und Telefonnummer

- Telefonnummer **+49 173 5802069** wird aus dem Hilfe-Panel entfernt (inklusive WhatsApp-Direktlink). Stattdessen: Support-Formular und info@useadtool.ai.
- Dein Name bleibt ausschließlich dort, wo er rechtlich vorgeschrieben ist: Impressum, Datenschutzerklärung, AVV.
- Überall sonst (Support-Texte, Beispiel-Inhalte, Hinweise in der App) prüfe ich auf Namensnennungen und entferne sie. Beispielnamen in internen Entwickler-Kommentaren sind nicht öffentlich sichtbar und bleiben unverändert.

## Technische Details

- Neuer Helfer `src/lib/lazyWithRetry.ts`: `import()` mit einem Retry plus einmaligem `location.reload()` über denselben sessionStorage-Guard wie in `main.tsx`; alle `lazy(...)`-Aufrufe in `src/App.tsx` darauf umstellen.
- `src/components/landing/BlackTieFooter.tsx`: `footerLinks.company` entfernen, `/coming-soon`-Einträge löschen, Grid-Spalten von 6 auf 5 anpassen, `madeWith`/`inGermany`-Block löschen, TikTok-Icon ergänzen (lucide hat kein TikTok-Icon → schlankes Inline-SVG im gleichen 16px-Stil).
- `src/components/support/QuickHelpPanel.tsx`: WhatsApp-Block entfernen.
- Übersetzungs-Keys `landing.footer.madeWith`, `inGermany`, `aboutUs`, `careers`, `press`, `contactLink` bleiben in `translations.ts` bestehen (ungenutzt, kein Risiko) oder werden entfernt, falls sie nirgends sonst verwendet werden.
- Keine Änderungen an Billing, Credits, Entitlements, Routing-Logik oder Backend.
