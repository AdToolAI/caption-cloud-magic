## Ziel

Das **bestehende €-basierte AI Video Wallet** (`ai_video_wallets`, `balance_euros`, RPCs `deduct_ai_video_credits` / `refund_ai_video_credits`) wird **erweitert um AI-Bilder**. Kein neues System, keine Migration der alten `wallets`-Tabelle. Frontend zeigt überall denselben €-Saldo — egal ob für Sora, Kling, Luma oder jetzt für Bilder.

---

## 1. Naming & UI-Sprache

- Wallet wird im UI umbenannt von „AI Video Credits" → **„AI Credits"** (deckt jetzt Video + Bild ab).
- Tabellenname `ai_video_wallets` bleibt aus Kompatibilitätsgründen technisch bestehen (kein DB-Rename, vermeidet Risiko an 30+ Edge Functions).
- `useAIVideoWallet` Hook wird zu **`useAICredits`** alias-weitergegeben (alter Name bleibt als Re-Export für Backwards-Compat).

## 2. Neue Bild-Modelle (Replicate) — Pricing mit 30 % Marge

| Tier | Modell | Replicate-Kosten | Endpreis Nutzer |
|---|---|---|---|
| **Fast** | Seedream 4 | $0.030 | **€0.04** |
| **Pro** | Imagen 4 Ultra | $0.060 | **€0.08** |
| **Ultra** | Nano Banana 2 | $0.067 – $0.151 | **€0.20** (Worst-Case-kalkuliert, immer ≥30 % Marge) |

→ Diese €-Beträge werden via `deduct_ai_video_credits(user_id, amount_euros, generation_id)` abgezogen, exakt wie bei den Videos.

## 3. Backend — neue Edge Function `generate-image-replicate`

Eine neue Edge Function (analog zu `generate-kling-video`) für die drei Replicate-Modelle:

```
supabase/functions/generate-image-replicate/index.ts
```

Flow (identisch zum Video-Pattern):
1. Auth-Check (JWT)
2. Wallet-Balance prüfen (`balance_euros >= cost`)
3. Replicate-API aufrufen (Seedream 4 / Imagen 4 Ultra / Nano Banana 2 — Routing über `model` Param, internes Backend-Mapping)
4. Bei Erfolg: Bild in `background-projects` Storage speichern + `deduct_ai_video_credits` aufrufen
5. Bei Fehler: kein Abzug (kein Refund nötig, da pre-charge erst nach Erfolg) — analog zur bestehenden Refund-Automation

Cost-Mapping im Backend:
```ts
const IMAGE_COSTS_EUROS = {
  fast:  0.04, // Seedream 4
  pro:   0.08, // Imagen 4 Ultra
  ultra: 0.20, // Nano Banana 2
};
```

Secret nötig: **`REPLICATE_API_TOKEN`** (falls noch nicht gesetzt, frage ich davor an).

## 4. Bestehende Function `generate-studio-image` (Lovable AI Gateway / Gemini)

Diese bleibt **unverändert und kostenlos** (im 19,99 € Abo enthalten), da sie über das günstige Lovable AI Gateway läuft. Sie ist der „Schnell & Gratis"-Fallback im Picture Studio.

→ Im Picture Studio bekommt der User also:
- **Standard (Gemini, gratis im Abo)** — bleibt wie heute
- **Fast / Pro / Ultra (Replicate, kostet €-Credits)** — neu

## 5. Frontend — Picture Studio UI

`src/components/picture-studio/ImageGenerator.tsx` bekommt:

1. **Quality-Toggle** mit 4 Stufen statt 2:
   - `Standard` (gratis, Gemini) — Default
   - `Fast` (€0.04, Seedream 4)
   - `Pro` (€0.08, Imagen 4 Ultra)
   - `Ultra` (€0.20, Nano Banana 2)
2. **Advanced-Toggle**: Erlaubt Power-User explizite Modellwahl statt Auto-Routing
3. **Cost-Badge** neben dem Generate-Button (€-Preis sichtbar, wie in `MotionStudio/Hub.tsx`)
4. **Wallet-Balance-Display** im Studio-Header via `useAICredits`
5. **Insufficient-Balance-Modal** identisch zu Video-Studios (führt zu `/ai-video-purchase-credits`)

## 6. Aufgelöste / aufgeräumte Stellen

- `src/lib/featureCosts.ts`: `STUDIO_IMAGE_GENERATE` Eintrag wird entfernt (Bilder laufen nicht mehr über das alte `wallets`-Credit-System)
- `CreditGuard.tsx` wird im Picture Studio **nicht mehr verwendet** — stattdessen die €-Wallet-Logik wie in den Video-Studios
- `track-credit-usage` Edge Function bleibt bestehen für Analytics (loggt jetzt auch Bilder)

## 7. Was wir NICHT anfassen

- ❌ Tabelle `wallets` (alte Credits) — bleibt für andere interne Features unangetastet
- ❌ Bestehende Video-Edge-Functions (Kling, Sora, Luma, Hailuo, Wan, Seedance, Veo) — funktionieren bereits korrekt mit `ai_video_wallets`
- ❌ `useCredits` Hook — bleibt für andere Features
- ❌ `credit-preflight` / `credit-reserve` / `credit-commit` / `credit-refund` Edge Functions — bleiben für ihren bestehenden Use Case

## 8. Reihenfolge der Umsetzung

1. Edge Function `generate-image-replicate` anlegen + deployen
2. `REPLICATE_API_TOKEN` Secret prüfen / anfragen
3. `useAIVideoWallet` → Re-Export als `useAICredits` (UI-Sprache "AI Credits")
4. `ImageGenerator.tsx` um 4-Stufen-Toggle + Advanced-Modus + Cost-Badge erweitern
5. Wallet-Header im Picture Studio zeigen
6. Aufräumen: `STUDIO_IMAGE_GENERATE` aus `featureCosts.ts`, `CreditGuard` aus Picture-Studio-Pfad

---

**Soll ich so loslegen?**