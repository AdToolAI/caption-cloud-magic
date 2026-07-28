
# Plan v290 — Startseiten-Eyecatcher: "Instant Avatar Try-On" (mit Turnaround-Rotation)

Ersetzt den aktuellen "Universal Directors Cut"-4-Karten-Block. Die 4 UDC-Karten wandern als schlankere Sub-Sektion darunter, damit die Feature-Story erhalten bleibt.

## User-Erlebnis

```text
┌─────────────────────────────────────────────────────────────┐
│  Badge: "Live-Demo · Kein Login nötig"                       │
│  Headline: "Werde in 10 Sekunden zum Cast-Mitglied."         │
│  Sub: Lade ein Foto hoch — sieh dich als AdTool-AI-Avatar,   │
│       drehbar in Bond-Gold-Cinematic-Look.                   │
├──────────────────────────┬──────────────────────────────────┤
│  LINKS: Drop-Zone        │  RECHTS: Avatar-Turntable        │
│  ─ Drag & Drop / Click   │  ─ Canvas mit 5 Winkeln          │
│  ─ Style-Chips:          │    (−60° · −30° · 0° · +30° · +60°) │
│    Executive · Creator   │  ─ Gold-Scrubber unten:          │
│    Sport · Cinematic     │    Drag / Pfeiltasten / Swipe    │
│  ─ Progress-Ring         │  ─ Download-Button:              │
│  ─ DSGVO-Hinweis         │    aktueller Winkel / ZIP alle 5 │
│  ─ Rate: 3/Stunde        │  ─ "Nochmal versuchen" (Reset)   │
│                          │  ─ "In Cast & World speichern" → │
│                          │    Signup mit vorbelegtem Avatar │
└──────────────────────────┴──────────────────────────────────┘
                    ▼ nach erstem Ergebnis ▼
   Proof-Strip: 3 vorbereitete Bond-Gold-Szenen (Office /
   Studio / Outdoor). Der aktuelle Winkel wird per Canvas
   in einen freigelassenen Slot compositet — reine Illusion,
   0 zusätzliche AI-Calls.
```

## Warum das gewinnt

- **Einzige Landing-Demo mit dem eigenen Gesicht** — schlägt jedes Case-Study-Video.
- **Zeigt Kernversprechen live**: Identity-Lock über 5 Winkel + Cinematic Style + Consistency.
- **Kein Login-Wall** → Wow zuerst, Conversion danach.
- **Turnaround verkauft "3D-Feeling"** ohne WebGL-Abhängigkeit oder 3D-Kosten.

## Technische Umsetzung

### Neue Frontend-Dateien
- `src/components/landing/InstantAvatarDemo.tsx` — Wrapper: Drop-Zone (react-dropzone), Style-Chip-Row, Progress-Ring, Reset, Download-Menü, DSGVO-Hinweis, i18n.
- `src/components/landing/AvatarTurntable.tsx` — Canvas + `requestAnimationFrame`-Interpolation zwischen den 2 nächstgelegenen Frames, Gold-Scrubber mit Ticks pro geladenem Winkel, Keyboard/Touch/Wheel-Support, `prefers-reduced-motion` → snappt auf feste Frames.
- `src/components/landing/AvatarProofStrip.tsx` — 3 statische Bond-Gold-Szenen-Frames als Assets, aktueller Turntable-Winkel wird per Canvas in freien Kopf-Slot compositet.
- Assets: `src/assets/proof-scene-office.jpg`, `src/assets/proof-scene-studio.jpg`, `src/assets/proof-scene-outdoor.jpg` (via `imagegen`, Bond-Gold-Cinematic-Style, Kopf-Slot bewusst leer/verschwommen).

### Backend
- Edge Function `supabase/functions/instant-avatar-demo/index.ts` (`verify_jwt = false`).
  - Zod-Validierung: `image` (data-URL, jpeg/png/webp, ≤ 8 MB), `style` (`executive|creator|sport|cinematic`).
  - Rate-Limit über neue Tabelle `public.instant_avatar_rate(ip_hash, created_at)` — 3 Turnarounds/h, 10/Tag pro SHA-256-IP-Hash. RLS an, GRANTs korrekt (`service_role` all, kein `anon`/`authenticated`).
  - 5 parallele Calls an Lovable AI Gateway `google/gemini-3.1-flash-image` (Nano Banana 2) via `Promise.all` mit Winkeln −60/−30/0/+30/+60. Prompt-Baustein (EN, wie im Core-Memo für Visual-Prompts): `"cinematic portrait, identity locked to the reference face, Bond-Gold rim-light on deep black background, editorial framing, camera yaw <angle>°, same lighting and wardrobe across the set, {style-suffix}"`.
  - Upload jedes PNGs in privaten Storage-Bucket `instant-avatar-demo` unter `ip_hash/session_id/angle.png`. Rückgabe: 5 Signed URLs (1h).
  - Auto-Delete via `pg_cron`-Job, der Objekte > 24 h aus dem Bucket räumt.
- Storage-Bucket `instant-avatar-demo` (privat) via `storage_create_bucket`, RLS: nur `service_role` schreibt/liest.

### Streaming-Verhalten
- Frontend zeigt Winkel 0° sofort nach First-Response (~4 s), triggert die restlichen 4 Anfragen parallel im Hintergrund, Ticks werden progressiv freigeschaltet.
- Fehlgeschlagene Winkel → Tick ausgegraut, Turntable rastet auf verfügbare Frames — kein Error-State im Wow-Flow.

### Download
- Toggle im Download-Button: **aktueller Winkel** (PNG) oder **alle 5** (ZIP via `jszip`).
- Watermark dezent unten rechts: `AdTool AI · Beta` (nur im Download, nicht im Preview) — organisches Sharing-Signal.

### Reset & Missbrauchsschutz
- Reset räumt State, revoked Object-URLs, setzt Scrubber auf 0°.
- Content-Type wird serverseitig verifiziert (nicht nur Extension).
- DSGVO-Hinweis: "Foto wird nur zur Generierung genutzt, nach 24 h automatisch gelöscht. Keine Weitergabe." + Link auf Privacy-Policy.

### i18n & A11y
- DE/EN/ES-Keys unter `instantAvatar.*` in `src/lib/translations.ts`.
- Drop-Zone mit Keyboard-Support, ARIA-Labels, Fokus-Ring in Gold, Reduced-Motion-Variante für Turntable.

### Design-Konsistenz
- Nur semantische Tokens (`bg-background`, `text-primary`, Gold über bestehende `--gold-*`-Vars des Bond-2028-Systems), Glass-Card mit `backdrop-blur`, Playfair für Headline, Inter für Body — keine hartkodierten Farben.

### Einbau
- `src/pages/Index.tsx` — bestehender UDC-4-Karten-Block wird durch `<InstantAvatarDemo />` ersetzt; die 4 Kern-Feature-Karten (Voice-Lock, Anchor-Refresh, CI-Preflight, Auto Cut-Down) laufen darunter als kompaktere `<UdcFeatureStrip />`.

## Out of Scope

- Kein Video-Render der Demo (Proof-Strip mit compositeten Frames erzielt denselben Effekt für 0 €).
- Kein echtes 3D/WebGL.
- Keine Speicherung des Nutzerfotos über die 24-h-Preview hinaus.
- Kein Login-Zwang.

## Validierung nach Build

- Lokal: eigenes Selfie hochladen, alle 4 Styles durchklicken, Turntable drehen, Download PNG + ZIP prüfen, Reset, Rate-Limit-Toast nach 4. Versuch, Fallback wenn 1 Winkel fehlschlägt.
- Edge-Function-Test via `curl_edge_functions` mit einem Test-Foto (Base64) und ungültigen Payloads (fehlender Style, > 8 MB, falscher MIME) → erwarte 400.
- AI-Gateway-Logs prüfen: 5 parallele Nano-Banana-2-Calls pro Session, keine 429/402-Häufung.
