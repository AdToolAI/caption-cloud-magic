# Englische UI vollständig entdeutschen

Ziel: In der englischen Oberfläche taucht kein deutscher Text mehr auf — von der Landingpage bis in Admin-, Debug- und Legal-Bereiche.

## Befund

- Die zentrale Übersetzungsdatei ist sauber: der `en`-Block enthält keine deutschen Werte.
- Das Problem sind fest verdrahtete Texte in Komponenten, Hooks, Configs und Fehlermeldungen, die unabhängig von der Sprachwahl immer deutsch ausgegeben werden. Eine erste Messung zeigt Treffer in rund 670 Dateien, mit Schwerpunkten in Video-Composer, AI-Video-Studio, Motion Studio, Director's Cut, Autopilot, Planner, Media, Support, Onboarding und den Legal-Seiten.

## Vorgehen

Da die Menge groß ist, wird in festen Wellen gearbeitet — jede Welle ist für sich abgeschlossen und überprüfbar. Es wird nur Englisch repariert; Spanisch bleibt für einen späteren Durchgang.

**Welle 0 — Inventar**
Ein Erkennungs-Skript listet alle deutschen Literale mit Datei, Zeile und Text. Ergebnis ist eine priorisierte Arbeitsliste, sortiert nach Klickpfad (vorne nach hinten).

**Welle 1 — Öffentliche Flächen**
Landing/Storylines, Onboarding, Welcome, Pricing, FAQ, Support, Footer, Legal-Seiten (Datenschutz, AGB, Impressum, AUP, Refund Policy, Takedown).

**Welle 2 — Kern-Studios**
Video Composer inkl. Briefing/Szenen/Clips/Dialog-Studio, AI Video Toolkit, Motion Studio, Director's Cut, Picture Studio, Voice Studio.

**Welle 3 — Arbeitsflächen**
Planner, Media Library, Media Profiles, Brand Kit, Autopilot, Marketplace, Analytics/Performance, Content Studio.

**Welle 4 — Konto & System**
Account inkl. Verbindungen/Privacy/Promo, Billing, Delete Account/Data, Integrationen, Social-Publishing-Dialoge.

**Welle 5 — Fehler, Toasts, Hintergrund**
`authErrors`, `template-errors`, Hook-Meldungen, Preflight-/Guard-Texte, Consent-Dialoge.

**Welle 6 — Admin & Debug**
Admin-Dashboards, QA-Cockpit, Monitoring, Feature-Flag- und PostHog-Demoseiten.

## Technische Umsetzung

- Jeder gefundene deutsche Text wird entweder in die bestehende Übersetzungsstruktur (`translations.ts`, `en`/`de`) überführt und per `t()` gelesen, oder — bei lokalen `COPY`-Objekten nach dem Muster von `EvidenceBoostBanner` — um einen korrekten `en`-Zweig ergänzt, der bei englischer Sprache tatsächlich greift.
- Bestehende Muster werden beibehalten: `useTranslation()` in Komponenten, sprachindizierte `COPY`-Maps dort, wo sie schon existieren. Keine neue i18n-Bibliothek.
- Nur Präsentations- und Textebene: keine Änderungen an Logik, Datenflüssen, Edge Functions oder Prompts. Visuelle Prompts für KI-Modelle bleiben unangetastet englisch.
- Fallback-Verhalten bleibt wie bisher: fehlt ein Schlüssel, wird der Schlüssel zurückgegeben — daher wird jeder neue Schlüssel in `en` und `de` gleichzeitig angelegt.
- Deutsche Texte in Kommentaren, Doku-Dateien und Memory-Dateien werden nicht angefasst, da sie nie im UI landen.

## Ergebnis pro Welle

Nach jeder Welle: Liste der geänderten Dateien und eine kurze Angabe, was noch offen ist. Nach der letzten Welle ein finaler Durchlauf des Erkennungs-Skripts, damit belegbar ist, dass keine deutschen UI-Literale mehr übrig sind.
