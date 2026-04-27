# Plan: Ad Director Vollausbau (A + B + C)

Drei aufeinander aufbauende Stages. Jede Stage ist eigenständig auslieferbar — wir können nach A oder B stoppen, wenn der Fokus woanders hin wandert.

---

## Stage A — Polish & Verifikation (klein, ~1 Loop)

Ziel: Die existierende Ad-Director-Pipeline rund machen, sodass Top-Marken-Werbung in einem Klick Multi-Format-Output liefert.

### A1. End-to-End Smoke-Test
- Echten Master-Render durchlaufen lassen (Brief → Skript → Clips → Lambda-Render)
- Verifizieren dass `spawnAdCampaignChildren` triggert und Children sauber im `composer_projects`-Table landen
- Campaign-Tab öffnen und prüfen dass alle Children mit Status-Badges erscheinen
- Falls Bugs auftauchen: fixen (typische Verdächtige: RLS auf neuen Spalten, missing brand_kit hydration, idempotency-Check)

### A2. VO-Re-Synth-Button im Cutdown-Child
- In `AdCampaignTree.tsx` für Children mit `cutdown_type !== null`: Button "🎙️ VO neu synthetisieren"
- Klick öffnet Mini-Dialog: nur Voice (vorausgewählt aus Master) und Skript-Text (auto-zusammengesetzt aus Cutdown-Szenen)
- Ruft `generate-voiceover` direkt auf, schreibt URL in `assembly_config.voiceover` des Childs
- Toast bei Erfolg, kein Wizard-Redirect nötig

### A3. Multi-Aspect-Render-Bundling
- **Existiert bereits**: `render-multi-format` und `render-multi-format-batch` Edge Functions sind da — wir nutzen die.
- Im `AdDirectorWizard.tsx` Scaling-Step neuen Toggle: "Multi-Aspect Bundle" mit Checkboxen für 9:16 / 1:1 / 4:5 (16:9 = Master default)
- Felder ins `ad_meta` JSONB: `aspectRatios: ('9:16' | '1:1' | '4:5')[]`
- In `spawnAdCampaignChildren.ts`: zusätzlich für jedes Aspect-Ratio ein Child spawnen mit `assembly_config.aspect_ratio` überschrieben
- Children re-rendern automatisch via existierender Render-Pipeline (kein neuer Code nötig, nur anderer Aspect-Param)
- `AdCampaignTree.tsx` zeigt Aspect-Badges (📱 9:16, ⬛ 1:1, 📐 4:5) neben Cutdowns/Variants

### A4. Memory-Update
- `mem://features/video-composer/ad-director-architecture.md` um Aspect-Ratio-Logik erweitern

---

## Stage B — Performance Layer (mittel)

Ziel: Welche Variante performt im Markt am besten? Daten-Loop schließen.

### B1. DB-Erweiterung: Campaign-Posts-Mapping
Neue Tabelle `ad_campaign_posts`:
- `id`, `composer_project_id` (FK auf Master oder Child), `social_post_id` (FK auf existierende `social_posts`), `platform`, `posted_at`
- Trigger: wenn ein Composer-Output via Social Publishing gepostet wird, automatisch hier eintragen

### B2. Performance-Insights-Tab im Campaign-Baum
- Neuer Tab "Performance" in `AdCampaignTree` (sichtbar wenn ≥1 Post existiert)
- Zeigt pro Variant/Cutdown/Aspect: Reach, Engagement-Rate, CTR, Cost-per-View
- Daten aus `social_posts` + `social_post_metrics` (existieren bereits via `sync-social-posts-v2`)
- Visualisierung: Sortierbare Tabelle + Top-Performer-Highlight (Krone-Icon auf bestem Asset)

### B3. AI-Insight-Generator
- Edge Function `analyze-ad-campaign-performance` (nutzt Lovable AI Gateway / Gemini 2.5 Flash)
- Input: alle Metriken der Kampagne, Skript-Texte, Tonality-Map
- Output: Plain-Text-Insight ("Emotional Hook hat 3.2x bessere CTR als Rational. Auf 9:16 läuft alles 40% besser.")
- Im Performance-Tab als "💡 AI Insights"-Card oben

### B4. A/B-Winner-to-Master-Loop
- Button "Diese Variante zum neuen Master machen" auf der Top-Performer-Variante
- Klont das Child als neues Master-Project, kann dann frische Cutdowns/Aspects spawnen
- Schließt den Optimierungs-Loop: Test → Measure → Double-down

---

## Stage C — Email Campaign Director (groß)

Ziel: Den bewährten Wizard-Pattern auf eine zweite Vertikale anwenden — Email Marketing.

### C1. Neue Route + Hub-Eintrag
- `/email-director` als Standalone-Page (analog zum Video Composer)
- Hub-Tile im Navigations-System mit Mail-Icon

### C2. Email Director Wizard (4 Steps)
- **Step 1 — Briefing**: Produkt/Service, Zielgruppe, Sprache, Brand-Kit
- **Step 2 — Goal**: Newsletter / Promotion / Re-Engagement / Onboarding-Sequenz
- **Step 3 — Tonality**: Friendly, Urgent, Sophisticated, Casual (mappt auf Schreibstil)
- **Step 4 — Variants**: A/B-Toggle für Subject Lines (3 Varianten generieren)

### C3. AI-Backend
- Edge Function `generate-email-campaign` (Lovable AI Gateway, Gemini 2.5 Pro)
- Liefert pro Variante: Subject (3 A/B), Preheader, Body (HTML + Plain-Text), CTA-Button-Text
- Body als simples Block-System: Hero-Bild, Headline, Paragraph, CTA, Footer

### C4. DB-Tabelle `email_campaigns`
- `id`, `user_id`, `title`, `goal`, `tonality`, `language`, `brand_kit_id`
- `subjects` (JSONB Array mit 3 Varianten), `selected_subject_id`, `body_blocks` (JSONB)
- `status` (`draft` | `scheduled` | `sent`), `parent_campaign_id` für A/B-Children

### C5. Editor + Preview
- Block-basierter Editor (re-use `react-quill` falls schon vorhanden, sonst minimaler Custom-Editor)
- Live-Preview rechts: rendert HTML mit Brand-Colors/Font auto-injiziert
- Test-Send via Resend-Connector (existiert bereits)

### C6. A/B-Spawn (analog zu Video)
- "Render All Variants" Button → spawnt für jede Subject-Variante ein eigenes `email_campaigns`-Row
- Preview-Cards für alle 3 Subjects nebeneinander

### C7. Send-Pipeline
- Connector-Auswahl: Resend (default) oder Gmail-Connector falls verbunden
- Send-Dialog: Recipient List (CSV-Upload oder manuelle Liste), Schedule (now / later)
- Edge Function `send-email-campaign` versendet via gewähltem Connector
- Tracking-Pixel + UTM-Tags für Performance-Loop (verbindet zu Stage B Insights)

### C8. Memory
- `mem://features/email-director/architecture` mit voller Pipeline-Doku

---

## Reihenfolge & Abhängigkeiten

```text
Stage A  ─── unabhängig, sofort umsetzbar
   │
   ▼
Stage B  ─── braucht social_posts-Mapping (neue Tabelle)
   │        Insights & Winner-Loop
   ▼
Stage C  ─── unabhängig von B, kann parallel laufen
            Verbindet sich später mit B's Performance-Layer
```

**Empfehlung**: Stage A in einem Loop, dann Pause für User-Test. Stage B + C können parallel oder seriell — wenn du Performance-Daten brauchst um Email-Templates zu validieren, B zuerst.

---

## Technische Eckpunkte

- **Keine neuen Connectors nötig** für A + B (alles existiert: ElevenLabs für VO, Resend für Email, Lovable AI Gateway, Social-Connectors)
- **Migrations**: 1 neue Tabelle in Stage B (`ad_campaign_posts`), 1 neue Tabelle in Stage C (`email_campaigns`), JSONB-Erweiterung in Stage A (`ad_meta.aspectRatios`)
- **Edge Functions neu**: `analyze-ad-campaign-performance` (B), `generate-email-campaign` + `send-email-campaign` (C)
- **Re-use**: `render-multi-format` (A), `sync-social-posts-v2` (B), `generate-voiceover` (A), Resend-Connector (C)

---

## Was nicht im Plan ist (bewusst weggelassen)

- Influencer Brief Generator — kann später als Stage D folgen, ist aber in der Wertschöpfung kleiner als Email Director
- Eigene Email-Template-Bibliothek (Marketplace) — Scope-Creep, erst nach echter Nutzung entscheiden
- Multi-Language A/B in Email — die Lokalisierungs-Pipeline (EN/DE/ES) ist bereits da, aber A/B-Tests pro Sprache wären eigene Stage E

Bereit umzusetzen, sobald du grünes Licht gibst. Gerne auch nur Stage A approven und nach dem Smoke-Test entscheiden, ob B/C noch dran kommen.
