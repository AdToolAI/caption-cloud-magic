# Picture Studio — Live-Referenzläufe (Abnahme)

Datum: 2026-09-05 · Konto: rodger@dusatko.com · Referenzbild 1024×768 (Storage, öffentlich)
Prompt beider Läufe: „same scene, warm evening light" · Stil: kein Stil · Regler: 30 · Format: **Source**

## Lauf A — prompt-geführte Referenzstärke (Nano Banana / `ultra`)

| Stufe | Wert |
| --- | --- |
| Oberfläche (Absicht) | Modus „transform", Regler 30, Format „Source", Stil „kein Stil" |
| Client-Normalisierung (`buildPictureRequest`) | `requestedFormat: source`, `resolvedFormat: 4:3`, Modifier `intent:close`, Hinweise `STRENGTH_AS_LANGUAGE`, `STYLE_NONE`, kein Zahlenwert |
| Server-Normalisierung (persistiert) | `metadata_json.requestedFormat: source`, `resolvedFormat.aspectRatio: 4:3` |
| Anbieter-Payload (Function-Log) | `Tier=ultra Model=google/nano-banana aspect=4:3 images=1`, Prompt inkl. Satz „Keep the reference image exactly as it is …", **kein** Stärke-Feld |
| Ergebnis | HTTP 200, Bild `ultra-1788614688368.jpg`, Kosten €0,20 |

## Lauf B — nativer Stärke-Parameter (FLUX 1.1 Pro Ultra / `flux`)

| Stufe | Wert |
| --- | --- |
| Oberfläche (Absicht) | identisch zu Lauf A |
| Client-Normalisierung | `requestedFormat: source`, `resolvedFormat: 5:4` + sichtbare Anpassung `Source 1.33:1 → 5:4`, `image_prompt_strength = 0.7`, kein Prompt-Satz |
| Server-Normalisierung (persistiert) | `requestedFormat: source`, `resolvedFormat.aspectRatio: 5:4`, `adjustment.from: Source 1.33:1`, `adjustment.to: 5:4` |
| Anbieter-Payload (Function-Log) | `format Source 1.33:1 → 5:4 for flux`, `Tier=flux Model=black-forest-labs/flux-1.1-pro-ultra aspect=5:4`, `image_prompt_strength` gesetzt |
| Ergebnis | HTTP 200, Bild `flux-1788614702904.jpg`, Kosten €0,10 |

## Befund

- Client und Server erzeugen dieselbe normalisierte Absicht — beide laufen über dasselbe Modul
  (`supabase/functions/_shared/picturePromptBuilder.ts`, im Frontend nur re-exportiert).
- Genau ein Stärke-Mechanismus pro Modell: Satz im Prompt **oder** Zahlenwert im Payload, nie beides.
- `requestedFormat` bleibt in beiden Läufen `source`; die Modell-Auflösung unterscheidet sich (4:3 vs. 5:4)
  und die Abweichung wird bei FLUX ausgewiesen.
- Kein Stil-Zusatz bei „kein Stil" in beiden Prompts.
