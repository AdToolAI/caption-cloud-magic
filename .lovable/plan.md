# Full Production Release — Topaz Video Upscale & ByteDance vCube

Beide Engines gehen global live. Kalibrierung läuft ab jetzt aus echter Produktionsnutzung, blockiert aber keinen Lauf mehr. Alle Sicherheits-, Preis- und Abrechnungsmechanismen bleiben unverändert aktiv.

## 1. Freischaltung

- `enabled: true` für `topaz-video-upscale` und `bytedance-vcube` in der Modellliste; die beiden Frontend-Flags entfallen als Voraussetzung.
- Backend-Schalter `VIDEO_ENHANCE_TOPAZ_ENABLED` und `VIDEO_ENHANCE_BYTEDANCE_ENABLED` global auf `true` setzen.
- **Beide Flag-Ebenen bleiben als Not-Aus erhalten** — Frontend-Sichtbarkeit und der autoritative Backend-Schalter werden nicht ausgebaut. Bei Providerausfall, falscher Abrechnung oder P0-Bug lässt sich jedes Modell sofort einzeln abschalten.
- Test-Allowlist bleibt bestehen (nur noch für den Fail-once-Testschalter), ist aber für die Nutzung dieser beiden Modelle keine Bedingung mehr.
- `estimator_calibrating` und `cost_unverified` werden weiter protokolliert, sind aber nie ein Startverbot — nur interner Preis-/Admin-Status.


## 2. ByteDance Pro

Pro bleibt Entitlement-gebunden. Vor der Freigabe prüfe ich das Recht auf unserem echten Provider-Konto. Bestätigt → Pro erscheint; nicht bestätigt → Pro bleibt ausgeblendet, Standard/AIGC sind vollständig global verfügbar.

## 3. Gültige Kombinationen

- Alle vom Provider-Endpoint unterstützten Auflösungen, Bildraten und Modi bleiben nutzbar; nicht unterstützte Kombinationen und echte Downscale-Fälle bleiben gesperrt.
- Die Geometrie-Projektion blockiert künftig nur bei sicher verifizierter Regel. Ein reines Schätzergebnis mit niedriger Konfidenz erzeugt nur einen Hinweis und Telemetrie, keinen harten Abbruch mehr.

## 4. Preislogik

Unverändert: degressive Kurve 1,8×–3,0×, harter Deckel 3,0×, Preis vor dem Lauf aus der besten Kostenschätzung, keine Nachbelastung, idempotente Gutschrift bis auf 3,0× sobald echte Providerkosten vorliegen. Einzige Änderung: `pricing_gate = review_required` allein aus `estimator_calibrating`/`cost_unverified` verhindert keinen Produktionslauf mehr — es wird als Grund gespeichert und im Admin ausgewiesen.

Für ByteDance ohne autoritative Kostenzahl gilt ausdrücklich: der Kundenlauf wird normal fertig, es wird **keine Ist-Kostenzahl erfunden** und kein True-up gerechnet. Der verifizierte Faktor bleibt leer, der Admin zeigt „Ist-Kosten-Abdeckung: ausstehend/unbestätigt". Sobald eine autoritative Kostenquelle eintrifft, holt der Reconciler den 3×-Check und gegebenenfalls die Gutschrift nach. Nach außen wird für ByteDance bis dahin keine 3×-Garantie behauptet.

## 5. Nutzeroberfläche

**AI Video Studio ist der Haupteinstieg und Teil dieses Releases.** Dort entsteht der vollständige Enhance-Bereich; Mediathek und Director's Cut nutzen exakt denselben Dialog und dieselbe Engine. Motion Studio und Universal Content Creator folgen später und blockieren das Release nicht.

- Modellauswahl mit echten Namen: „ByteDance vCube — AI-native video enhancement, besonders geeignet für KI-Material" und „Topaz Video Upscale — High-fidelity professional video upscaling". Kein „Coming Soon".
- Auflösung und Bildrate, für ByteDance zusätzlich Modus und Stufe.
- Vor dem Start sichtbar: Ausgangsauflösung/-bildrate, erwartete Ausgabemaße, Preis, gegebenenfalls Hinweis „AdTool adjusted".
- Nach dem Lauf: Vorher/Nachher-Vergleich des Ergebnisses.
- Kein Kalibrierungs- oder „experimental pricing"-Hinweis in der Nutzeroberfläche; dieser Status lebt nur im Admin.
- Texte in EN/DE/ES.

## 6. Telemetrie je Lauf

Bereits gespeichert: Modell, Modus/Tier, Quellmodell, Quellmaße/Bildrate/Dauer, Ziel, projizierte und tatsächliche Maße, geschätzte Kosten, Ist-Kosten, Kostenquelle, geschätzte Einheiten, Kundenpreis, effektiver und verifizierter Faktor, Gutschrift, Providerstatus, Persistenzversuche, Stornowunsch, Ausgabe-Asset. Ergänzt werden: tatsächliche Einheiten, Anzahl Provider-Wiederholungen und die Verarbeitungsdauer als eigenes Feld.

## 7. Admin-Kalibrierung

Neue Kalibrierungs-Ansicht je Modell: Läufe gesamt, erfolgreiche Läufe, Fehlerquote, mittlerer und Median-Schätzfehler, Median-Ist-Faktor, Abdeckung echter Kosten in Prozent, Summe und Quote der Gutschriften, Durchschnitts-/Median-Verarbeitungszeit, Verteilung nach Auflösung/Bildrate/Modus. Für Topaz zusätzlich geschätzte vs. tatsächliche Einheiten je Dauer, Ausgabemaß und Bildrate, damit die echte Einheitenformel ableitbar wird.

## 8. Re-Kalibrierung

Historische Preise werden nie rückwirkend geändert. Bei 25, 50, 100 und danach fortlaufend je 100 erfolgreichen Läufen pro Modell entsteht ein Pricing-/Estimator-Report im Admin; ab 50–100 Läufen wird der Schätzer aus echten Daten neu gesetzt (bewusste Entscheidung, kein Automatismus auf den Preis).

## 9. Unverändert aktiv

Server-autoritative Preisbildung, 3×-Deckel, True-up, Idempotenzschlüssel, Wallet-Ledger-Idempotenz, Webhook/Poll-Wettlaufschutz, Erstattung bei Providerfehler, Persistenz-Wiederholung, Staging, Ausgabeprüfung, Abstammung, Mediathek-Speicherung, Reconciliation/manuelle Prüfung, Kombinationsprüfung, Downscale-Sperre.

## 10. Abnahme nach Aktivierung

Je ein echter Lauf Topaz und ByteDance als normaler Produktionsnutzer (nicht auf der Allowlist), Nachweis dass kein Allowlist-Gate greift, Prüfung von Wallet, Speicherung, Mediathek und Download, dazu Typprüfung, relevante Tests und Produktions-Build. Abschlussbericht mit „Topaz: GLOBAL LIVE / ByteDance: GLOBAL LIVE" und den offenen Kalibrierungspunkten.

Kein Zurückdrehen wegen laufender Kalibrierung — nur echter P0-Fehler, falsche Abrechnung oder kritischer Providerfehler rechtfertigen einen Kill-Switch.

## Technische Details

- `src/config/videoEnhanceModels/models.ts`: `enabled: true` für beide Einträge; `src/config/videoEnhanceModels/flags.ts` bleibt als Mechanik, wird aber nicht mehr benötigt, um die zwei Modelle sichtbar zu machen.
- Secrets `VIDEO_ENHANCE_TOPAZ_ENABLED=true`, `VIDEO_ENHANCE_BYTEDANCE_ENABLED=true`; `isModelUnlocked()` in `supabase/functions/_shared/video-enhance-models.ts` bleibt unverändert (Backend-Flag hat Vorrang vor Allowlist).
- Projektion: in `video-enhance/index.ts` blockt nur `projection_confidence === 'verified'` mit Downscale-Ergebnis; geschätzte Projektionen schreiben weiter `projected_*` und `projection_matched`, brechen aber nicht ab.
- Migration (nur additiv) auf `video_enhance_runs`: `actual_units numeric`, `provider_retry_count integer default 0`, `processing_seconds numeric`; gefüllt in `_shared/video-enhance-finalize.ts` aus der Provider-Metrik bzw. `provider_completed_at - provider_submitted_at`.
- Admin: neue `VideoEnhanceCalibrationCard.tsx` neben `VideoEnhanceMultiplierCard.tsx` in `src/pages/admin/CostMonitor.tsx`; Aggregation über eine Read-only-SQL-Ansicht bzw. eine RPC mit `has_role(auth.uid(),'admin')`.
- UI: neues `src/components/video-enhance/EnhanceVideoDialog.tsx` auf `useEnhanceVideo`, eingebunden in Mediathek und Director's Cut. Der Altpfad `director-cut-upscale` bleibt vorerst bestehen und wird erst nach nachgewiesener Migration entfernt.
- Prüfungen: `bunx tsgo --noEmit`, `bunx vitest run src/test/videoEnhance*.test.ts`, `bun run build`; Edge Functions `video-enhance`, `video-enhance-webhook`, `video-enhance-reconcile` neu deployen.
