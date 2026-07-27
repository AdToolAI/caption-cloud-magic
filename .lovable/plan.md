## Plan v271 — Multi-Anchor: Seedream ➜ Gemini 3 Pro Image + Lip-Sync-Diagnose

### Warum
- **Seedream 4** freistellt/isoliert Personen bei 3+ Refs auf neutralem Grund und ignoriert die Location — genau der Bug im Screenshot (steifes Line-up ohne Büro).
- **Flux Kontext Max** wäre eine Option, ist aber teurer und braucht neues Payload-Shape.
- **Gemini 3 Pro Image** (`google/gemini-3-pro-image`) läuft schon über den Lovable AI Gateway (kein neuer Provider-Key), respektiert Multi-Image-Refs + Scene-Prompt gleichzeitig und hält Identität deutlich besser als Nano Banana 2 (der Grund, weshalb wir überhaupt weg wollten).
- Der **kein-Lip-Sync-Effekt** ist eine separate Baustelle: durch das mit-generierte Baby (5. „Kopf") schlägt der Face-Match fehl → Sync.so Soft-Degrade → Master-Video ohne Sync. Wird sich mit korrektem Anchor (kein Baby, korrekter Count) automatisch bessern; wir verifizieren aber an der konkreten Szene.

### Änderungen (Server, klein)

**1. `supabase/functions/compose-scene-anchor/index.ts` — Router-Switch**
   - Neuer Flag-Wert: `ANCHOR_MODEL_MULTI = "gemini3pro"` als Default (statt `seedream4`).
   - Erlaubte Werte: `gemini3pro` (neu, Default) | `nano_banana_2` (Fallback) | `seedream4` (nur bei explizitem Opt-in).
   - Neue `callGemini3ProImage()`-Funktion: gleicher Prompt-Body wie Nano Banana 2 (chat-completions image shape, `modalities: ["image","text"]`), aber `model: "google/gemini-3-pro-image"`. Alle Refs (portraits + identity + locations + props) werden als `image_url`-Parts angehängt.
   - Fallback-Kette bei Multi: `gemini3pro → nano_banana_2` (Seedream nur wenn Flag explizit).

**2. Prompt-Fix (schmal): environment-first bei Multi-Speaker**
   - Aktuell: „Place ${peopleNoun} into the following scene…". Neu für N≥2: das `Scene:`-Segment kommt **vor** „Place people". Verhindert isolate-Kompositionen.
   - Kein Kind/Baby erzeugen: harte Negativ-Klausel `NEVER add extra subjects (no children, pets, or bystanders) — headcount MUST match the ${N} named speakers exactly`. Ergänzt bestehenden `EXACT_COUNT_SUFFIX`.

**3. Seedream-Prompt-Härtung (defensiv, falls jemand später zurückschaltet)**
   - Selber environment-first + no-extra-subjects Suffix.

### Lip-Sync-Diagnose (kein Code, nur DB-Read im Build-Turn)
- Aus Screenshot Scene ableiten (`/video-composer`, Szene 1 von 1). Ich lese im Build-Turn:
  - `composer_scenes` Zeile: `audio_plan`, `dialog_turns`, `lip_sync_status`, `clip_error`, `lipsync_provider_result`.
- Erwartetes Ergebnis: entweder `audio_plan.twoshot.url = null` (Audio-Prep hing noch, siehe v264) oder `face_gate_failed` (5-Kopf-Problem). Entsprechend: entweder Auto-Trigger erneut anstoßen oder Szene mit neuem Gemini-3-Pro-Anchor neu rendern (Baby verschwindet → Face-Match trifft).
- Kein separater Codefix hier — die Diagnose zeigt ob v264 (Transient-Retry) oder v268 (Webhook-ready) greifen mussten.

### Nicht Teil dieses Plans
- Kein Flux-Kontext-Max-Integration (bewusst zurückgestellt: erst Gemini-3-Pro-Ergebnis abwarten, dann entscheiden).
- Keine Änderungen an Sync.so / compose-dialog-segments / compose-video-clips.
- Keine Änderung an Credit-/Refund-Logik (Anchor selbst bucht keine Video-Credits).

### Rollback
- Env `ANCHOR_MODEL_MULTI=nano_banana_2` → sofort zurück auf alten Pfad ohne Deploy.
- Env `ANCHOR_MODEL_MULTI=seedream4` → aktueller Pfad bleibt erreichbar für A/B-Tests.

### Erfolgskriterium
- Neue Test-Szene: 4 Sprecher im echten Büro-Hintergrund, kein zusätzliches Kind/Objekt, Identitäten treffen, Lip-Sync läuft auf allen 4.
