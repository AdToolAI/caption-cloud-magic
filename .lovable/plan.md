

# Plan: Phase 3 — Kritische Hochrisiko-Pfade in den AI-Superuser aufnehmen

## Warum jetzt erweitern

Der Superuser deckt aktuell **15 Szenarien** ab — fast alles davon sind günstige Text/Analytics-Calls. Die **teuersten und ausfallanfälligsten** Bereiche der Plattform sind **gar nicht überwacht**:

- AI-Video-Pipelines (Replicate / Sora / ElevenLabs) — kosten echtes Geld pro Fehler
- Remotion Lambda Renderer — häufigste Quelle für Credit-Refund-Tickets
- TTS / Voice — ElevenLabs-Quota-Ausfälle bleiben unbemerkt
- Video Composer & Director's Cut — komplette Render-Pipelines
- Storage Health (Buckets + RLS) — silent failures bei Uploads

Wenn da was kaputtgeht, merkst du es heute erst wenn ein User sich beschwert.

## Neue Szenarien (8 zusätzlich → insgesamt 23)

### Block A — Provider Reachability (sicher + günstig, kein Verbrauch)
Diese Tests rufen externe Provider-Endpoints **ohne** echte Generierung auf, nur Auth/Quota-Check:

1. **Replicate API Health** — `GET /v1/account` über trackProviderCall, prüft Token gültig + Quota lesbar
2. **ElevenLabs Quota Check** — `GET /v1/user/subscription`, prüft verfügbare Characters
3. **OpenAI / Sora Reachability** — `GET /v1/models`, prüft Auth + Modell-Liste
4. **Lovable AI Gateway Reachability** — Mini-Prompt an `gemini-2.5-flash-lite` (billigstes Modell, ~0,001 Cent)

Diese 4 sind **fast** (< 2s), kosten praktisch nichts und decken 90 % der Provider-Ausfälle ab.

### Block B — Render Pipeline Health
5. **Lambda Render Webhook Reachability** — `remotion-webhook` mit `expectFailure` (Signatur-Guard), analog zum Stripe-Pattern
6. **Render Queue Manager** — `render-queue-manager` im Dry-Run-Mode, prüft dass Queue lesbar ist und kein Backlog-Block existiert
7. **Health-Check Aggregator** — bestehender `health-check` Endpoint, prüft Database/Storage/Queue/Connection-Pool in einem Aufruf

### Block C — Storage Integrity
8. **Storage Bucket Health** — listet alle erwarteten Buckets (`background-projects`, `media-library`, `video-renders` etc.), failt wenn einer fehlt oder unzugänglich ist

## Bewusst NICHT getestet (zu teuer)

- **Echte Video-Generierung** (Sora/Kling/Seedance/Hailuo): ein einziger Test-Run = 0,50–2 € echter Credit-Verbrauch × täglich = ~60 €/Monat nur für Monitoring. Stattdessen testen wir die Provider-Reachability (Block A), das fängt 90 % der Probleme ohne Kosten.
- **Echter Lambda-Render**: ~0,30 € pro Test-Render, plus 30–60s Wartezeit. Stattdessen Webhook-Reachability + Queue-Health (Block B).
- **Echte ElevenLabs-Synthese**: verbraucht Characters aus dem Monatskontingent. Quota-Check reicht.

Wenn du später echte End-to-End-Tests möchtest, machen wir das in einer **Wochen-Kadenz** statt 4×/Tag.

## Umsetzung

### Geänderte Dateien
- `supabase/functions/ai-superuser-test-runner/index.ts` — 8 neue Einträge in `SCENARIOS`, alle als `optional: true` markiert (damit fehlende Provider-Keys nur Warnings statt Fails geben)
- `src/pages/admin/AISuperuserAdmin.tsx` — `ACTIVE_SCENARIOS` Whitelist um die 8 neuen Namen ergänzen, Latenz-Schwellen anheben (45s → 60s grün, 75s → 100s gelb)

### Neues Test-Pattern
Zwei neue Felder am `Scenario`-Typ für direkte HTTP-Calls (statt Edge-Function-Invoke):

- `directCall?: { url: string; method: string; headers: Record<string,string> }` — für externe Provider-Endpoints
- `secretEnv?: string` — zeigt im Dashboard „kein Key konfiguriert" als gelbe Warnung statt rotem Fehler

### Verifikation
1. „Komplett-Test" auslösen → erwartet **23 Zeilen**
2. Banner: „Alle 23 Szenarien laufen stabil"
3. Falls ein Provider-Key fehlt: gelbe Warnung mit klarer Meldung („ELEVENLABS_API_KEY not set"), nicht roter Fail
4. Gesamtlatenz: ~45–70s (8× zusätzliche `fast` Calls à ~1–3s, parallel in 3er-Batches)

## Erwartetes Ergebnis

- **23/23 Szenarien** stabil sichtbar
- Erstmals Sichtbarkeit auf Replicate/ElevenLabs/OpenAI/Lambda-Health
- Kein zusätzlicher Credit-Verbrauch (Provider-Reachability-Pattern)
- Fehlende Provider-Keys werden als Warnung gemeldet, nicht als Fail
- Template `directCall` + `expectFailure` macht künftige Erweiterungen (z. B. Meta-Webhook, TikTok-Webhook) trivial

