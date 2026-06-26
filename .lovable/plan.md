# Analyse: `DataInspectionFailed — Green net check failed for text (input)`

## Was passiert ist

Replicate hat den Render **vor** dem GPU-Spend abgewiesen — der Fehler kommt von Alibabas **"Green Net"** (绿网), dem Pflicht-Content-Filter, der jeden HappyHorse-Request gegen die chinesische CAC-Compliance-Liste prüft. Er greift bereits, **bevor** das Modell rechnet. Drei Eigenheiten sind relevant:

1. Er prüft den **Text-Input** (das Feld `prompt`), nicht das `image`.
2. Er ist sehr empfindlich gegen **nicht-englische Phrasen** (besonders Deutsch mit Sonderzeichen, Ellipsen `…`, Anführungszeichen `„"`), gegen **Tageszeit-Phrasen mit Bezug zur Nacht** ("3 Uhr nachts"), gegen Wörter, die er als "Selbstbild/Spiegel/Gerät-Screen" klassifiziert ("Reel", "Screen", "Phone"), und gegen **Selbstgespräch / monologische 1.-Person-Sätze** ("Und ich bearbeite…").
3. Der Filter ist **opak** — es gibt kein "welches Wort war's". Wir können nur sanitisieren oder den Provider wechseln.

## Was im aktuellen Code-Pfad fehlt

Geprüft: `generate-happyhorse-video/index.ts` reicht `finalPrompt` 1:1 an Replicate weiter. `compose-video-clips` hat zwar `stripDialogForAnchor` (entfernt Dialog vor dem **Anchor-Frame**) und `stripExtraHumansForAnchor`, aber **keinen** HappyHorse-spezifischen Green-Net-Sanitizer. Auch der bereits implementierte "Refund bei Filter-Reject + Auto-Fallback Hailuo" (aus dem vorherigen Loop) wird **nicht** ausgelöst, weil die Fehler-Klassifizierung den String `DataInspectionFailed` / `Green net` nirgends matcht.

## Plan (Lücken 1–4)

### 1. `_shared/happyhorse-green-net.ts` (neu)
Reine Pure-Funktion `sanitizeForHappyHorse(prompt: string): { clean: string; touched: string[] }`:
- Strippt Smart-Quotes / Ellipsen (`…` → `, `, `„" «»` → ``).
- Strippt 1.-Person-Selbstgespräch ("Und ich …", "Ich bearbeite …") — diese sind Dialog-Leaks, die im Visual-Prompt nichts verloren haben.
- Ersetzt Nacht-Tageszeit-Trigger: `3 Uhr nachts` → `late at night`, `schon wieder` → entfernen, `Reel` → `short video`.
- Ersetzt Screen-/Device-Trigger im Visual-Prompt: `Screen`, `Phone`, `Smartphone`, `Display` → `workspace` (Green-Net hält Device-Screens oft fälschlich für UI-mit-Personen).
- Force-Translate-Step: wenn nach Sanitisierung > 20 % Nicht-ASCII-Zeichen → markiert für "needs english pass" (Stage 2).

### 2. Pipeline-Integration (`generate-happyhorse-video/index.ts`)
- Sanitizer **direkt vor** `replicate.predictions.create` anwenden (Z. ~290).
- `meta.green_net_sanitization = { touched, originalLen, cleanLen }` in `ai_video_generations` schreiben.
- Wenn `clean.length < 3` nach Sanitisierung → 400 mit Code `prompt_emptied_by_filter` (kein Spend, kein Refund nötig).

### 3. Error-Klassifizierung + Auto-Refund + Fallback (`compose-clip-webhook` + `generate-happyhorse-video` Error-Branch)
- Neuen Error-Bucket `green_net_rejected` einführen (matcht `/DataInspectionFailed|Green ?net|inappropriate content/i`).
- Bei diesem Bucket:
  - Refund über bestehende `deduct_ai_video_credits`-Inverse (idempotent über `generation.id`).
  - Im Composer-Kontext: `clipSource` für **diese eine Szene** automatisch auf `ai-hailuo` umstellen und neu dispatchen (Lip-Sync bleibt aktiv, Hailuo ist im Allowlist-Whitelist).
  - Im Standalone-Toolkit: 422 mit `code: 'green_net_rejected'` + `suggested_fallback: 'ai-hailuo'`.

### 4. UI-Feedback (`SceneCard.tsx` Fehler-Banner)
- Wenn `error_class === 'green_net_rejected'`: roten Banner durch gelben ersetzen, Text: *"HappyHorse-Content-Filter hat den Prompt abgelehnt. Auto-Fallback auf Hailuo läuft — Credits wurden zurückerstattet."*
- "Neu rendern"-Button bekommt Provider-Wechsel-Hint.

## Was NICHT angefasst wird
- Lip-Sync Pipeline (`compose-dialog-segments`, Sync.so v129.x, Plate-Identity-Bbox).
- Dialog-Skript im UI (das ist korrekt Deutsch — TTS bleibt deutsch).
- Sanitizer für andere Provider (Hailuo / Kling haben keinen Green-Net).
- DB-Migration (alles über existierende `meta`-JSON-Felder).

## Verifikation nach Build
1. Aktuelle Szene "3 Uhr nachts… Reel" neu rendern → muss durch HappyHorse durchlaufen ODER sauber auf Hailuo fallen, mit gebuchtem Refund.
2. Probe-Briefing mit nur deutschem Visual-Prompt: `meta.green_net_sanitization.touched` zeigt geänderte Tokens.
3. Composer-Multi-Scene-Run: Lip-Sync-v169-Anchor unverändert (Regression-Check über `dialog_shots.preclip_crop`-Persistenz).
