
# Support Wizard — Fix Upload Visibility & Bond 2028 Polish

Zwei klare Probleme aus dem Screenshot:

1. **Upload nirgendwo in Schritt 1 zu sehen** — der AttachmentUploader sitzt aktuell nur in Schritt 3. Im ursprünglichen Plan war "Upload schon in Step 1 unter Subject" vorgesehen, das wurde nicht umgesetzt.
2. **Look passt nicht zum Rest** — Karten (Kategorie/Severity) und Banner sind sehr neutral (border-white/10), während die restliche Plattform Bond-2028-Stil hat (Gold-Glow, Glass, Cyan-Akzente, Playfair-Serif-Headlines mit Subline-Mono-Caps).

## Was sich ändert

### A) Inline-Upload in Step 1 (Drop-Zone direkt unter Subject)
- Neue kompakte "Quick Evidence"-Card direkt unter dem Subject-Feld in Step 1.
- Wiederverwendet `AttachmentUploader` mit neuer `variant="compact"` Prop:
  - Kleinere Drop-Zone (ein Row, ~80px hoch statt 6er-Padding)
  - "Choose files / Record / Paste"-Buttons inline rechts
  - 60%-Badge integriert (kein separater Bar)
- State (`attachments`) bleibt im Wizard, wird sowohl in Step 1 als auch Step 3 an dieselbe Instanz gebunden — beide Steps zeigen die gleichen Thumbnails.
- Bei `category` ∈ {bug, rendering, technical} + `severity` ∈ {high, blocking}: rote Variante des Banners ("ohne Visual nicht reproduzierbar").

### B) Bond 2028 Visual Pass
- **Category-Cards**: aktiv = Gold-Border + Gold-Glow + Gradient-Tint (statt nur `bg-primary/10`); idle = subtiler Cyan-Hover, Icon im Gold-Frame-Square statt nackt.
- **Severity-Pills**: aktiv erhält statt Bunt-Background ein konsistentes Gold-Outline + farbcodierter linker Akzent-Strich (low=emerald, normal=cyan, high=amber, blocking=red).
- **Step-Indikator**: aktive Bars als Gold-Gradient mit Schimmer-Animation.
- **Headlines**: Playfair-Serif behalten, aber Subline als Mono-Caps Kicker drüber (wie Hub-Pages: `▸ Schritt 1 · Triage`).
- **Evidence-Banner**: stärkerer Gold-Glow + Sparkle-Shimmer im Hero-Variant, "+60%"-Badge als Pill mit Border-Glow.
- **AttachmentUploader Drop-Zone**: Gold-Dashed-Border mit innerem Gradient-Fade, Hover-State = Cyan-Pulse statt grauer Hover.
- **Footer-Buttons**: "Weiter" als Gold-Gradient + Glow (passend zu anderen CTAs der Plattform), "Zurück" als Glass-Outline.

### C) Lokalisierung
- Neue DE/EN/ES-Strings für: `s1QuickEvidence`, `s1QuickEvidenceHint`, "Drop files here" → lokalisiert (AttachmentUploader hard-codet aktuell Englisch — Localization-Pass mitziehen).
- Kicker-Texts pro Step lokalisiert.

## Out-of-Scope (bewusst nicht)
- Keine Änderungen am Backend / `triage-support-ticket` / Storage-Bucket.
- Kein neues DB-Schema.

## Technische Details (Files)

- `src/components/support/AttachmentUploader.tsx`
  - Neue Prop `variant?: "compact" | "full"` (default "full")
  - Lokalisierungs-Strings (DE/EN/ES) via `useTranslation`
  - Compact-Variant: 1-row layout, kein separater Badge-Bar
- `src/components/support/SupportWizard.tsx`
  - In Step 1 unter Subject: `<AttachmentUploader variant="compact" .../>` mit gleichem Ref/State
  - Step 3: behält `variant="full"`
  - Neue Kicker-Lines pro Step
  - Restyle: Category-Cards, Severity-Pills, Step-Indikator, Footer-Buttons
  - Conditional urgent banner auch in Step 1 wenn high/blocking + technische Kategorie
- `src/components/support/EvidenceBoostBanner.tsx`
  - Hero-Variant: Sparkle-Shimmer-Layer + stärkerer Gold-Glow
  - Compact-Variant: Pill-Badge mit Border-Glow

Verifikation: Playwright-Screenshot von `/support` (Step 1 + Step 3) im DE-Locale nach den Änderungen, Vergleich gegen den User-Screenshot.
