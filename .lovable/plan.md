## Problem

Edge-Function-Logs zeigen den echten Grund:

```
Replicate error: Prediction failed: The input or output was flagged
as sensitive. Please try again with different inputs. (E005)
Tier=ultra Model=google/nano-banana
```

Nano-Banana hat das Referenzbild (Menschenmenge / biblische Szene) als „sensitiv" eingestuft und blockiert. Die UI zeigt nur das generische **„Bildgenerierung fehlgeschlagen"** — der Kunde weiß nicht, was zu tun ist. Credits wurden korrekt **nicht** abgezogen (Deduct läuft erst nach Success), aber das ist für den User unsichtbar.

## Lösung — 3 kleine Änderungen

### 1. Edge Function `generate-image-replicate` — Safety-Filter erkennen

Im `catch (replicateError)` (Zeile 220) den Fehlertext auf `E005` / `flagged` / `sensitive` prüfen und einen klaren Code zurückgeben:

```ts
const msg = String(replicateError?.message ?? '');
const isSafety = /E005|flagged as sensitive|safety/i.test(msg);

return new Response(JSON.stringify({
  error: isSafety
    ? 'Das Referenzbild oder der Prompt wurde vom Sicherheitsfilter blockiert. Bitte nutze ein anderes Referenzbild oder formuliere den Prompt um.'
    : `Bildgenerierung fehlgeschlagen: ${msg}`,
  code: isSafety ? 'SAFETY_FILTERED' : 'REPLICATE_ERROR',
  hint: isSafety ? 'try_other_reference_or_tier_pro_text_only' : undefined,
}), { status: isSafety ? 422 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```

Kein Credit-Refund nötig (Deduct erfolgt erst nach Success — bereits korrekt).

### 2. Frontend `ImageGenerator.tsx` — bessere Fehlermeldung

In `generateOne` (Zeile 265–277) auch bei erfolgreicher HTTP-Response den `code` lesen und im `handleGenerate`-Catch eine spezifische Toast-Meldung mit Action-Hint zeigen:

- **SAFETY_FILTERED** → Toast (lang, Variante `warning`):
  „Sicherheitsfilter ausgelöst — Referenzbild oder Prompt enthält Inhalte, die das Modell nicht generieren darf (häufig bei vielen Personen, religiösen oder gewaltvollen Motiven). Tipps: anderes Referenzbild wählen, Motiv beschreiben statt vorzulegen, oder Tier **„Pro"** ohne Referenz testen."
- Sonst: bisherige generische Meldung.

Außerdem: bei Promise.allSettled wird der konkrete Fehler aktuell verschluckt, wenn ≥1 Variante scheitert — wenn **alle** scheitern und es `SAFETY_FILTERED` war, die Safety-Toast statt der generischen zeigen.

### 3. Optional (klein) — Hinweis im PreflightCheck

Wenn `tier='ultra'` (Nano Banana) + Referenzbild gesetzt: dezenten Hinweis ergänzen: „Nano Banana hat strikte Inhaltsfilter — bei Menschenmengen, Politik oder religiösen Motiven nutze ggf. ‚Pro' ohne Referenz."

## Was NICHT geändert wird

- Kein Auto-Retry auf anderes Modell (Imagen 4 Ultra unterstützt kein `image_input`, also nicht hilfreich)
- Keine Pricing- / Wallet-Logik
- Keine UI-Restrukturierung

## Dateien

- `supabase/functions/generate-image-replicate/index.ts` (Catch-Block + Response)
- `src/components/picture-studio/ImageGenerator.tsx` (Toast-Mapping in `handleGenerate`)
- `src/components/picture-studio/PreflightCheck.tsx` (1 Hinweis-Zeile)
