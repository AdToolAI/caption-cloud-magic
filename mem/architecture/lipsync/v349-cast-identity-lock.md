---
name: v349 Cast Identity Lock (Rekognition Face Collection)
description: Deterministic face→character binding via AWS Rekognition Face Collections plus repaired motion-probe decoding with byte-hash fallback
type: architecture
---

# v349 — Cast Identity Lock

## Warum
Similarity-Ranking (`CompareFaces`) lieferte für alle vier Sprecher identische
Confidence (0.93) → Sprecher-Audio landete auf dem falschen Gesicht,
Charaktere wurden doppelt animiert.

## Regeln
- Jedes Cast-&-World-Portrait wird **einmal** in eine Rekognition Face
  Collection pro User indexiert (`ExternalImageId = brand_character_id`),
  persistiert in `brand_characters.rekognition_face_ids` /
  `_collection_id` / `_portrait_hash` / `_indexed_at`.
- Identität = FaceId-Lookup, **kein** Ähnlichkeits-Ranking.
- Reihenfolge im Dispatcher: v349 Cast Identity Lock → v278 Hungarian Router
  → Legacy `resolvePlateFaceIdentities`.
- Verdicts: `ok` (bijektiv), `duplicate`, `missing`, `unavailable`.
  Nur `ok` setzt die `plateIdentityMap`; `duplicate`/`missing` werden als
  `v349_identity_integrity_violation` geloggt statt geraten.
- Rekognition kann keine MP4-Bytes lesen → Identifikation läuft auf dem
  Still-Anchor (`lock_reference_url` / `reference_image_url`).

## Motion-Probe (Teil D)
- `decodeFrame` ersetzt `frameToGrid`: Decoder-Fehler werden nicht mehr
  verschluckt, sondern als `frameErrors` (`decode:*`) gemeldet.
- Zwei Decoder-Versuche (npm + deno.land imagescript).
- Byte-Hash-Fallback: identische SHA-256 über verschiedene Timestamps =
  harter Beweis für `static` (`mouth_band_static_identical_frame_bytes`).
- Sonst `unknown` mit konkreter Ursache statt nacktem `decoded_0`.

Dateien: `_shared/rekognition-face-collection.ts`,
`_shared/cast-identity-lock.ts`, `_shared/mouth-motion-verdict.ts`,
`compose-dialog-segments/index.ts`.
