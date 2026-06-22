## Lip-Sync Anhebung (Cap = 3.5× Marge)

**Roh-Kost:** Sync.so lipsync-2-pro ≈ **$0.05/s ≈ €0.046/s** (Creator Plan, mem://architecture/lipsync/sync-so-pro-model-policy).

**Ziel-Marge:** **3.5× max** → Sell ≈ €0.161/s ≈ **16 Cr/s** (single).

| | Heute (9 Cr/s) | Neu (16 Cr/s, 3.5×) |
|---|---|---|
| 1 Speaker, 6s | 54 Cr / €0.54 | **96 Cr / €0.96** |
| 2 Speaker, 6s | 108 Cr / €1.08 | **192 Cr / €1.92** |
| 3 Speaker, 6s | 162 Cr / €1.62 | **288 Cr / €2.88** |
| 4 Speaker, 6s | 216 Cr / €2.16 | **384 Cr / €3.84** |

Bleibt **deutlich unter** HeyGen/Synthesia für vergleichbare Multi-Speaker-Cinematic-Szenen, weiterhin Alleinstellung bei 3–4 Sprechern in einem Stack.

## Transparenter Render-Confirm-Dialog

**Heute:** Dialog zeigt Szene → Zeilen mit Label + nur Credits, dann Gesamtsumme. Detail-Subtext & EUR pro Zeile werden zwar berechnet, aber **nicht angezeigt**.

**Neu:** Pro Zeile sichtbar
- Label (z.B. `Video (ai-hailuo, standard, 6s)`)
- **Detail-Subtext** in kleiner Schrift (z.B. `6s × 16 Cr/s × 2 Sprecher`, `Hailuo Std 6s @ 9 Cr/s`)
- **Credits + EUR** rechtsbündig (`192 Cr · €1.92`)
- Optionale "wofür?"-Tooltip mit 1-Satz-Erklärung pro Komponente

**Layout-Skizze pro Szene-Card:**
```text
Szene 2                              288 Cr · €2.88
─────────────────────────────────────────────────
Video (ai-hailuo, standard, 6s)      54 Cr · €0.54
  Hailuo 2.3 Std · 9 Cr/s
Voiceover (ElevenLabs)                5 Cr · €0.05
  Flat-Rate pro Szene
Lip-Sync (Sync.so pro, 3× Passes)   288 Cr · €2.88
  3 Sprecher · 6s × 16 Cr/s × 3
```

**Gesamt-Block** (unverändert prominent): `Gesamt: 347 Cr · €3.47`

## Änderungen

### Code
1. `src/lib/composer/estimateSceneRenderCost.ts`
   - `LIPSYNC_CREDITS_PER_SEC_PER_PASS = 9` → **`16`**
   - Provider-Zeile: `detail` ergänzen (z.B. `${quality} · ${creditsPerSec} Cr/s`)
   - VO-Zeile: `detail: 'Flat-Rate pro Szene'`
2. `src/components/video-composer/SceneRenderConfirmDialog.tsx`
   - Pro `<li>`: zweite Zeile mit `line.detail` (text-[10px] muted)
   - Pro `<li>`: rechte Spalte zeigt `formatCredits · formatEur` statt nur Credits
   - Kleiner Info-Header über der Liste: „Genaue Aufschlüsselung pro Komponente"

### Edge Functions
3. Suche nach hardcoded `9` für Sync.so-Charging (z.B. `compose-dialog-scene`, `sync-credit-charge`, `poll-dialog-shots`) → auf **16** angleichen, damit Backend-Charge und Frontend-Preview übereinstimmen.

### Memory
4. `mem://architecture/lipsync/sync-so-pro-model-policy` aktualisieren (9 → 16, Marge-Cap 3.5×).

## Nicht angefasst
- Pipeline-Logik (1 Plate + N chained Passes, Hard Cap 4 Sprecher, ASD, Webhook, Watchdog)
- Alle anderen Provider-Preise (Hailuo, Kling, Sora, Vidu, Pika, etc.)
- Refund-Logik (bleibt idempotent über `video_id` UUID)
- Welcome-Intro / Page-Reload-Logik

## Frage vor Build
Soll der Detail-Subtext (z.B. „6s × 16 Cr/s × 3 Sprecher") **immer** sichtbar sein oder nur **auf Hover/Click expandierbar** für ein cleaneres Default-Layout?