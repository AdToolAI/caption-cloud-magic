---
name: Gemini Vision MP4 Payload Shapes
description: Which Lovable AI Gateway payload shapes return 200 for MP4 face detection vs which 400
type: feature
---

Empirisch verifiziert via `supabase/functions/qa-gemini-mp4-url-probe/index.ts`
gegen `google/gemini-2.5-flash`:

| Variante | Status | Result |
|---|---|---|
| `type=image_url` mit raw mp4-URL | **400** | "Unsupported image format" |
| `type=image_url` mit signed Supabase mp4-URL | **400** | "Unsupported image format" |
| `type=video_url` mit mp4-URL | **503** | upstream_error |
| **`type=input_video` mit mp4-URL** | **200** ✅ | Faces detektiert (~4.2s) |
| `type=file` + `file.file_data` mp4-URL | **400** | "expected application/pdf" |
| **`type=image_url` mit `data:video/mp4;base64,...`** | **200** ✅ | Faces detektiert (~3.4s, ≤18 MB) |

Production-Strategie in `_shared/plate-face-detect.ts` und
`validate-frame-face/index.ts`:
1. **Primary**: `type=input_video` (schnell, kein Download).
2. **Fallback**: base64 data URL via `type=image_url` wenn Primary <expectedCount
   Faces findet oder HTTP-Fehler wirft.

NIEMALS verwenden für mp4: `image_url`(raw/signed URL), `video_url`, `file_data`.
