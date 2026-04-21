

# Plan: Stripe Webhook Reachability Test korrekt machen

## Problem

Der Test im AI-Superuser-Runner ruft `stripe-webhook` mit einem leeren Test-Payload und ohne `stripe-signature`-Header auf. Die Funktion lehnt das richtigerweise mit `HTTP 400 "No signature"` ab — das ist Sicherheitsverhalten, kein Bug. Der Test wertet das aber als `fail`, daher 0% Pass-Rate.

Den Signatur-Check zu lockern wäre ein Sicherheitsproblem. Stattdessen ändern wir den Test so, dass er prüft, ob der Webhook-Endpoint **erreichbar und korrekt geschützt** ist.

## Lösung — „Reachability + Signature-Guard" prüfen statt Erfolg

Die Definition von „gesund" ändern wir so:

- Endpoint antwortet überhaupt (kein 502/504/Timeout) → erreichbar
- Endpoint lehnt unsignierte Calls mit **HTTP 400 „No signature"** ab → Signaturschutz aktiv
- Beides zusammen = `pass`
- Alles andere (5xx, Timeout, 200 ohne Signatur) = `fail` mit aussagekräftiger Fehlermeldung

Damit ist der Test:
- ehrlich (testet was wirklich gewünscht ist: „Webhook ist live und sicher")
- ohne Stripe-Test-Mode-Signaturen auskommend
- ohne Sicherheits-Backdoor

## Umsetzung

### 1. Spezial-Handling für „Stripe Webhook Reachability" im Runner
In `supabase/functions/ai-superuser-test-runner/index.ts`:

- Statt das generische `invokeFn` zu nutzen, fügen wir einen kleinen Sonderfall hinzu (oder ein `expectStatus`-Feld am Szenario)
- Für dieses Szenario gilt: **HTTP 400 mit Body enthält „No signature" → pass**
- Andere 4xx/5xx → `fail`

Konkret entweder:
- **Variante A** (minimal-invasiv): Inline-Check nur für dieses eine Szenario.
- **Variante B** (sauberer): Neues optionales Feld `expectFailure: { status: 400, bodyIncludes: "No signature" }` im Szenario-Objekt — wiederverwendbar für künftige Reachability-Checks (z. B. Webhook für Meta, TikTok).

Empfehlung: **Variante B**, weil wir schon absehen können, dass es ähnliche signaturgeschützte Endpoints gibt (Replicate-Webhook, Render-Webhooks usw.).

### 2. Latenz-Schwelle bleibt
1015 ms ist absolut OK für einen Cold-Start-Edge-Call mit Stripe-SDK-Init.

### 3. Verifikation
- „Komplett-Test" erneut auslösen
- Erwartung: `Stripe Webhook Reachability` → grün, 100 % Pass-Rate
- Andere 14 Szenarien bleiben unverändert grün
- Banner: „Alle 15 Szenarien laufen stabil"

## Geänderte Dateien

- `supabase/functions/ai-superuser-test-runner/index.ts`
  - neues optionales Feld `expectFailure` im Szenario-Typ
  - Auswertung im Test-Loop ergänzen
  - Szenario „Stripe Webhook Reachability" mit `expectFailure: { status: 400, bodyIncludes: "No signature" }` markieren

## Erwartetes Ergebnis

- Stripe-Webhook-Test wird grün, ohne dass die Signatur-Sicherheit aufgeweicht wird
- Wiederverwendbares Muster `expectFailure` für künftige geschützte Endpoints
- 15/15 Szenarien stabil, keine falschen Roten mehr im Dashboard

