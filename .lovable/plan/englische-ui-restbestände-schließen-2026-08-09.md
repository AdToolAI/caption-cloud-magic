# Englische UI: Restbestände schließen

Ergebnis der vollständigen Prüfung (Frontend `src/` + Edge Functions). Die große Welle von letzter Woche hat gewirkt — es bleiben drei klar abgegrenzte Lücken.

## Befund (gemessen, nicht geschätzt)

1. **Frontend: 139 deutsche Strings in 84 Dateien.** Kurze Labels, die durch das Raster der Automatik gefallen sind — z. B. „Stimme wählen", „Neue Szene hinzufügen", „Vorschau fehlgeschlagen", „Bild hochladen für Image-to-Video". Schwerpunkte: Video Composer, Motion Studio, Audio Studio, Picture Studio, Autopilot-Preflight, AI Companion.
2. **Wörterbuch-Lücken in `translations.ts`.** Deutsch hat 5.838 Schlüssel, Englisch fehlen davon **34**, Spanisch **157**. Fehlt ein Schlüssel, zeigt die App den rohen Schlüsselnamen an (z. B. `calendar.messages.copySuccess`) — sichtbarer Fehler, nicht nur eine falsche Sprache. Betroffen u. a. Kalender-Meldungen, Pricing-Beschreibungen, Hero-Banner und Social-Proof (ES).
3. **Backend: 272 deutsche, nutzersichtbare Texte in Edge Functions.** Diese landen als Toast im UI oder als E-Mail beim Kunden — z. B. „Meta-Rate-Limit erreicht. Bitte einige Minuten warten", „Token konnte nicht entschlüsselt werden", Lifecycle-/Aktivierungs-Mails. Auch bei englischer UI kommen sie heute auf Deutsch.

Positiv: im englischen und spanischen Wörterbuch stecken **keine** deutschen Texte — die vorhandenen Übersetzungen sind sauber.

## Umsetzung

### Welle 1 — Frontend-Reste (139 Strings)
Alle verbleibenden Literale und JSX-Texte auf `tx({ de, en, es })` umstellen, mit derselben Pipeline wie bisher (Batch-Übersetzung, Platzhalter wie `${scene}` bleiben erhalten). Danach Typprüfung.

### Welle 2 — Wörterbuch vervollständigen
Die 34 fehlenden EN- und 157 fehlenden ES-Schlüssel aus der deutschen Struktur ergänzen und übersetzen, sodass nirgends mehr ein Schlüsselname im UI erscheint.
Zusätzlich: `t()` gibt bei fehlendem Schlüssel künftig den englischen Text zurück statt des Schlüsselnamens — als Sicherheitsnetz für zukünftige Lücken.

### Welle 3 — Backend-Meldungen und E-Mails
- Alle Client-Aufrufe schicken die aktive UI-Sprache mit; Edge Functions geben Fehlermeldungen in dieser Sprache zurück (DE/EN/ES), über eine kleine gemeinsame Hilfsdatei in `supabase/functions/_shared/`.
- Priorität: Meldungen, die real im Toast landen (Publishing/Meta, Rendering, Voice/Lip-Sync, Autopilot, Trial/Billing).
- Kunden-E-Mails (Aktivierung, Winback, Lifecycle) folgen der im Profil hinterlegten Sprache; ohne Angabe bleibt Deutsch.

### Welle 4 — Absicherung
Automatischer Test, der Frontend und Edge Functions auf deutsche Texte außerhalb von `tx()`/`de:`-Blöcken prüft und die Schlüssel-Parität DE/EN/ES erzwingt — damit die Lücken nicht zurückkehren.
Abschließend ein Durchgang durch die Hauptrouten mit `lang=en` (Dashboard, Video Composer, Motion Studio, Picture Studio, Audio Studio, Autopilot, Planner, Konto, Einstellungen) mit Screenshots als Nachweis.

## Technische Details
- Helper bleibt `src/lib/i18nText.ts` (`tx`/`useTx`), Sprache aus `localStorage['adtool-ai-lang']`.
- Übersetzungen per Batch über das AI-Gateway, Cache unter `/tmp/i18n/cache.json`; Platzhalter, Markup und Produktnamen bleiben unverändert.
- Prompt-Strings für KI-Modelle bleiben bewusst unangetastet (Ausgabequalität), ebenso Log-Ausgaben.
