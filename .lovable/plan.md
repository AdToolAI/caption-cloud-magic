# Plan v270 — Anchor-Modell: Nano Banana 2 → Seedream 4

## Ziel
Die wiederkehrenden Identity-Fehler (`anchor_identity_duplicate_detected`, `missing character`) bei 3–4-Sprecher-Szenen an der Wurzel beheben, indem der Anchor-Compose-Schritt auf **Seedream 4 (ByteDance)** umgestellt wird. Seedream 4 unterstützt Multi-Image-Reference nativ und hält 3–4 unterschiedliche Identitäten stabil — genau der Punkt, an dem Nano Banana 2 seit Wochen kippt.

Erwartung realistisch:
- Duplikate ("Matthew 2×") und Missing-Characters sollten bei ~80% der Fälle wegfallen.
- Kein Rückschritt zu Morphs, weil der Anchor als `reference_image_url` weiter an Hailuo/HappyHorse geht (v267-Pfad bleibt).
- Der Soft-Audit aus v267 bleibt als Sicherheitsnetz aktiv — bei Seedream sollte er nur noch selten anschlagen.

## Scope
- **Nur der Anchor-Compose-Call** wird umgestellt. Video (Hailuo), Lip-Sync (Sync.so/Kling Omni), Portraits, Voiceover bleiben unverändert.
- Feature-Flag-gesteuert, damit wir bei Problemen ohne Deploy auf Nano Banana 2 zurückfallen können.

## Umsetzung

### 1. Modell-Wiring (`supabase/functions/compose-scene-anchor/`)
- Neuen Provider-Pfad `seedream4` neben dem bestehenden `nanoBanana2` einführen.
- Multi-Image-Reference-Aufruf: pro Sprecher wird das Charakter-Portrait (Cast & World `reference_image_url`) als eigenes Reference-Image mitgegeben — das ist der eigentliche Unterschied zu Nano Banana, wo alle Charaktere in einen Text-Prompt gequetscht werden.
- Prompt-Struktur beibehalten (Framing, CastActions, `[7 CAMERA LOCK]`, Min-Face-Size 12%) — nur der Payload-Aufbau wird auf Seedreams Reference-Array angepasst.

### 2. Feature-Flag
- `ANCHOR_MODEL` env (Werte: `seedream4` | `nano_banana_2`), Default `seedream4`.
- Für 1-Sprecher-Szenen bleibt Nano Banana 2 (dort funktioniert es gut und ist billiger).
- Für N≥2 → Seedream 4.

### 3. Audit bleibt Soft-Signal (v267)
- Keine Änderung an `identity-audit.ts`. Wenn Seedream einen Ausreißer produziert, greift weiter der Soft-Pass — kein Hard-Fail, kein Re-Render-Loop.

### 4. Kostenkontrolle
- Seedream 4 über Replicate: Preis prüfen und in `happyhorseVideoCredits.ts` bzw. Anchor-Kostenposten einpflegen, damit die 3.0× Marge gehalten wird.
- Falls Seedream teurer ist als Nano Banana 2, Anchor-Kosten in der UI-Kostenvorschau anpassen (Media Credits).

### 5. Rollout
- Auf einer Test-Szene mit 4 Sprechern (bestehende Fail-Szene `d2aa4ad5…`) rendern, Anchor visuell prüfen.
- Wenn OK → Flag global auf `seedream4` lassen.
- Wenn nicht OK → Flag zurück auf `nano_banana_2`, ohne Deploy.

### 6. Dokumentation
- `mem/architecture/lipsync/v270-seedream4-anchor.md`: Warum gewechselt, Flag-Bedienung, Rollback-Pfad, Kosten-Delta.
- Memory-Index aktualisieren.

## Technische Details
- Replicate-Model-ID: `bytedance/seedream-4` (exakter Slug wird beim Implementieren gegen die Replicate-Doku verifiziert, bevor Code geschrieben wird — kein Guessing).
- Input-Payload: `prompt`, `image_input[]` (Portrait-URLs in Sprecher-Reihenfolge), `size`, `seed`.
- Fehlerbehandlung: wenn Seedream 4 einen 4xx/5xx liefert → automatischer Fallback auf Nano Banana 2 im selben Request (kein User-Facing-Fail).

## Nicht enthalten
- Kein Grid-Composer (Stufe B) — kann später nachgezogen werden, wenn Seedream 4 die 80% nicht liefert.
- Keine Änderung an Video-/Lip-Sync-Providern.
- Keine UI-Änderung außer ggf. Kostenanzeige.

## Erfolgs-Kriterium
- Nächste 4-Sprecher-Testszene: alle 4 Charaktere unterscheidbar, keine Duplikate, kein Missing — ohne Soft-Pass-Warnung.
