# Abo-Neupositionierung: Studio statt Credit-Rabatt

Das Abo wird als komplettes Studio dargestellt: enthaltene Nutzung + Profi-Werkzeuge. Credits sind nur noch Zusatznutzung. Abrechnung, Rückerstattungen, Speicher und Verlauf bleiben unverändert, außer wo unten ausdrücklich genannt.

## 1. Founder-Vorteil: 20 % → 10 %

Bleibt wie heute ein Rabatt beim Credit-Kauf an der Kasse, nur der Prozentsatz ändert sich.

- Neuer Gutschein `FOUNDERS_VIDEO_10` (10 %, 24 Monate) ersetzt `FOUNDERS_VIDEO_20` beim Checkout.
- Bestehende Founder behalten ihren laufenden 20-%-Gutschein, bis er ausläuft — keine rückwirkende Änderung.
- Alle Texte (Founder-Dialog, Preisseite, Landing, Legal) werden auf: „10 % auf bezahlte KI-Nutzung — 24 Monate" umgestellt, DE/EN/ES.
- Neue Beschreibung: Als einer der ersten 1.000 Founder erhältst du 24 Monate lang 10 % Rabatt auf zusätzlich gekaufte KI-Nutzung — zusätzlich zu den Werkzeugen und den monatlich enthaltenen Generierungen deines Abos.

Wichtig: Der Gutschein muss in Stripe angelegt sein (Test + Live), sonst schlägt der Checkout fehl. Das kann ich nicht selbst tun — bitte anlegen oder bestätigen, dass er existiert.

## 2. Preis-Darstellung

- Ein Abo statt „ein Modell": „Ein Abo. Voller Studio-Zugang. 14,95 €/Monat."
- Währung nach Sprache: € für DE/ES, $ für EN. Ein zentraler Helfer liefert den Preistext, alle Upgrade-Dialoge und Karten nutzen ihn — keine verstreuten Festwerte mehr.

## 3. Preisseite neu strukturiert

Sechs Wertkarten statt Rabatt-Fokus:

1. Ein Abo. Voller Studio-Zugang.
2. Führende KI-Modelle enthalten — ChatGPT Astra · Claude 4.1 Opus · Gemini · GPT Image · Gemini Image
3. Monatlich enthaltene Generierung — 10 Fast AI Videos, KI-Musik, ausgewählte Bildmodelle, Text Studio
4. Kompletter Profi-Workflow — Motion Studio, Specialist-Modelle, Topaz Enhance, Content Command Center, Social Connections
5. 10 % auf bezahlte KI-Nutzung — 24 Monate
6. Direkter Draht zum Team — früher Zugang, priorisierter Support, Founder-Status

Kein „unbegrenzt" in der Außenkommunikation, keine Anbieter- oder Kostenangaben. Videos werden als „10 Fast AI Videos / Monat · 5 Sek. · 720p" beworben, ohne Modellnamen.

## 4. Enthaltene Freikontingente (neu)

Zwei getrennte Zähler, kein Credit-Guthaben, keine Übertragung, keine Auszahlung.

- **10 Fast AI Videos/Monat** — intern Replicate `lightricks/ltx-2-distilled`, 5 s, 720p.
- **50 KI-Songs/Monat** — MiniMax Music 1.5, ohne Credit-Abzug.

Regeln (serverseitig durchgesetzt):
- Nur erfolgreiche Generierungen zählen; Fehlschläge und Anbieterfehler geben das Kontingent zurück.
- Reset zum Stripe-Abrechnungsdatum; Creator-Konten laufen auf Kalendermonat.
- Solange Kontingent frei ist: kein Credit-Abzug. Danach normale Credit-Abrechnung, sichtbar in der Oberfläche.
- Wiederholungen und Doppel-Jobs verbrauchen das Kontingent nur einmal.

## 5. Bestehende Sperren nur prüfen

Motion Studio, Render-Queue, Content Command Center, Social Connections, Specialist-Bildmodelle und Topaz sind bereits abo-pflichtig. Ich prüfe Zugriff, Texte und Sprachparität und vereinheitliche nur die Upgrade-Texte auf die neue Preis-Darstellung. Bestehende Projekte, Verbindungen und Verläufe bleiben erhalten und werden nur schreibgeschützt.

## Technische Umsetzung

- `supabase/functions/_shared/stripe-config.ts`: `FOUNDERS_CREDIT_COUPON = "FOUNDERS_VIDEO_10"`, Prozent-Konstante zentral; `ai-video-purchase-credits` und Metadaten (`founders_discount: '10'`) angepasst.
- Neue Tabelle `public.included_allowances` (user_id, period_start, period_end, included_fast_video_limit/used, included_music_limit/used) mit RLS (eigener Lesezugriff, Schreibzugriff nur service_role) und GRANTs.
- Neues geteiltes Modul `_shared/included-allowance.ts`: `claimAllowance(user, kind, jobKey)` / `releaseAllowance(...)` mit deterministischem Idempotenz-Schlüssel pro Job, Period-Rollover aus dem Abo-Zeitraum. Wird in `generate-ltx-video` (Fast-Video-Pfad) und `generate-music-track` **vor** dem Credit-Abzug aufgerufen; bei Provider-Fehler Freigabe im bestehenden Fehlerpfad.
- Zentrale Entitlement-Schicht: `_shared/subscription-entitlement.ts` bleibt Server-Wahrheit; clientseitig wird `useSubscriptionAccess` um `canUseSpecialistModels`, `canUseTopazImageEnhance` und die Kontingent-Restanzeige erweitert, damit keine Zugriffslogik mehr verstreut liegt.
- Neuer Preis-Helfer `src/lib/pricingDisplay.ts` (Locale → Betrag/Währung) plus Umbau von `src/pages/Pricing.tsx`, `components/landing/PricingSection.tsx`, `FoundersBenefitsDialog.tsx`, `UpgradeAccessDialog.tsx`, `MotionStudioGate.tsx`, `PicturePremiumDialog.tsx`.
- Tests: Deno-Tests für Kontingent-Anspruch, Freigabe bei Fehlschlag, Idempotenz bei Wiederholung, Rollover an der Periodengrenze und Übergang auf Credits nach Ausschöpfung; Vitest für Preis-Helfer und Sprachparität DE/EN/ES.

Unverändert: Wallet, Rückerstattungen, Preisberechnung bezahlter Nutzung, Routing, Orchestrierung, Speicherung, Job-Verlauf, Lip-Sync.
