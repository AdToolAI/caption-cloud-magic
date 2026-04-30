## Problem

Im letzten Deep Sweep ist **Flow 4 (Talking Head HeyGen)** mit HTTP 500 fehlgeschlagen:

```
HeyGen talking_photo upload failed [400]:
{"code":400127,"message":"No face detected in the image ..."}
```

HeyGens `/v1/talking_photo` Endpoint führt eine harte **Face-Detection** auf dem Upload durch und lehnt jedes Bild ohne erkennbares menschliches Gesicht ab.

Das aktuell vom Bootstrap bereitgestellte `test-image.png` ist aber ein **neutrales Produktfoto auf weißem Studio-Hintergrund** (entweder via Gemini-2.5-Flash-Image generiert mit Prompt `"A simple neutral product on a clean white studio background ..."` oder via Fallback `lovable-public/qa-mock/sample-1024.jpg`). Beide enthalten kein Gesicht → 400127.

Zusätzlicher Nebenbefund im Screenshot: **Flow 2 (Director's Cut Lambda)** schlägt mit `AWS Concurrency limit reached` fehl. Das ist ein bekanntes, transientes AWS-Lambda-Problem (Rate Exceeded) — nicht durch Code, sondern durch zeitgleiche Renders verursacht. Wird hier nur dokumentiert, kein Code-Fix nötig (Memory `lambda-concurrency-stability-policy` deckt das bereits ab; Retry beim nächsten Sweep löst es).

## Lösung: Dediziertes Portrait-Asset für HeyGen

Wir erweitern den Bootstrap um ein **5. Asset** `test-portrait.png` — explizit ein Gesicht, das HeyGens Face-Detection besteht — und nutzen es ausschließlich für Flow 4.

### Schritt 1 — Bootstrap erweitern (`qa-live-sweep-bootstrap/index.ts`)

Neuer Block nach dem FLUX-Mask-Asset:

- Asset-Name: `test-portrait.png` (1024x1024, PNG)
- **Primärquelle**: Lovable AI Gateway, Modell `google/gemini-2.5-flash-image`, Prompt:
  > "Professional studio portrait photograph of a friendly adult person, looking directly into the camera, neutral expression, clean white background, soft front lighting, sharp focus on face, photo-realistic, 1024x1024"
- **Fallback** (falls AI Gateway nicht verfügbar): öffentliches Portrait von `https://storage.googleapis.com/lovable-public/qa-mock/sample-portrait-1024.jpg` (existierende Lovable-Public-CDN-Konvention; falls die Datei dort noch nicht liegt, nutzen wir alternativ `https://thispersondoesnotexist.com/` als zweiten Fallback — liefert garantiert ein generiertes Gesicht).
- Idempotent über `uploadIfMissing` (kein Re-Upload wenn bereits vorhanden).

### Schritt 2 — Deep Sweep nutzt Portrait für Flow 4 (`qa-weekly-deep-sweep/index.ts`)

In `loadAssets` (Zeile ~185) zusätzliche Probe:
```ts
const candidatePortrait = tryUrl("test-portrait.png") || candidateImage;
```
und im `assets`-Objekt mitführen (`portrait: candidatePortrait`).

In `flowTalkingHead` (Zeile ~522):
```ts
const portraitUrl = ctx.assets.portrait || ctx.signedAssets.image || ctx.assets.image;
```
Wenn `test-portrait.png` noch nicht bootstrapped wurde, fällt es sauber auf das alte Verhalten zurück (führt dann erneut zum 400127, aber mit klarer Fehlermeldung).

### Schritt 3 — Defensive Pre-Flight Check in Flow 4

Vor dem `callEdge("generate-talking-head", ...)` einen lightweight Check ergänzen: Wenn HeyGen mit `400127` zurückkommt, setze `result.status = "skipped"` mit Message:
> "Bootstrap-Asset enthält kein Gesicht. Klicke 'Bootstrap Assets' im Live Sweep Tab, um test-portrait.png zu provisionieren, dann erneut starten."

So entsteht — analog zu Magic Edit (`budget_skipped` mit Mask-Hinweis) — ein selbsterklärender Skip statt eines harten 500.

### Schritt 4 — UI-Hinweis im DeepSweepTab (optional, minimal)

Im bereits existierenden Hinweisblock ("Vor dem ersten Run einmal Bootstrap Assets klicken …") den Asset-Namen `test-portrait.png` zur Aufzählung hinzufügen, damit User wissen, dass beim ersten Bootstrap nach dem Update ein zusätzliches Asset provisioniert wird.

## Technische Details

**Geänderte Dateien:**
- `supabase/functions/qa-live-sweep-bootstrap/index.ts` — neuer `uploadIfMissing`-Block für `test-portrait.png` mit AI-Gateway-Primärquelle + öffentlichem Fallback
- `supabase/functions/qa-weekly-deep-sweep/index.ts` — `loadAssets` lädt Portrait-URL, `flowTalkingHead` nutzt sie, defensiver Skip bei `400127`
- `src/pages/admin/DeepSweepTab.tsx` — Hinweistext um `test-portrait.png` ergänzt

**Keine DB-Migrationen, keine neuen Secrets, keine Frontend-Logik-Änderungen.**

**Validierung nach Implementierung:**
1. `qa-live-sweep-bootstrap` einmal manuell triggern → bestätigt dass `test-portrait.png` im `qa-test-assets` Bucket landet (HeyGen erkennt Gesicht → kein 400127 mehr)
2. Deep Sweep erneut starten → Flow 4 sollte jetzt entweder `success` oder `async_processing` zurückgeben

**Erwartetes Ergebnis nach Fix:**
- Pass-Rate steigt von 3/7 auf mindestens 4/7 (Talking Head wieder grün)
- Flow 2 (Lambda Concurrency) ist orthogonal und löst sich i.d.R. beim nächsten Run von selbst auf

Soll ich loslegen?
