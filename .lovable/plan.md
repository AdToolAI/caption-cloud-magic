
# 🎯 Markt-Status-Audit — Wo stehen wir nach Block O + P + Q?

## ✅ Was wir jetzt haben (Stand heute)

Mit Abschluss von **Block I–Q** ist Motion Studio in der **Top-Tier-Liga** angekommen. Hier die nüchterne Bestandsaufnahme:

| Bereich | Status | Marktvergleich |
|---|---|---|
| **Engine-Vielfalt** | Sora 2, Kling 3.0 Omni, Luma Ray-2, Hailuo 2.3, Wan 2.5, Seedance, Veo | **🥇 Führend** (mehr als Runway, HeyGen, Pika) |
| **1-Click Auto-Movie** | ✅ Block O — Gemini-Plan → Auto-Generation | ✅ **Parität** mit Pika 2.0 / Runway Gen-3 |
| **Multi-Format Export** | ✅ Block P — 16:9 + 9:16 + 1:1 simultan | ✅ **Parität** mit HeyGen / Submagic |
| **Talking-Head / Lip-Sync** | ✅ Block Q — Hedra Character-3 + ElevenLabs | ✅ **Parität** mit HeyGen / D-ID / Synthesia |
| **Hybrid Production** (Forward/Backward/Bridge/Style-Ref) | ✅ Block M | 🥇 **Alleinstellung** — kein Wettbewerber bietet alle 4 Modi |
| **NLE-Roundtrip** (FCPXML/EDL Import+Export) | ✅ | 🥇 **Alleinstellung** im AI-Video-Segment |
| **Director's Cut Editor** (CapCut-Style mit Filter, Speed-Ramping, Subtitle-AI) | ✅ | ✅ Stark, vergleichbar mit CapCut Pro |
| **Brand-Kit-System** | ✅ Basic (logo, colors, fonts) | ⚠️ Manueller Apply — Wettbewerb (Canva, HeyGen) wendet automatisch an |
| **Voice-Cloning Integration** | ⚠️ Backend ja, Composer-UI integriert über Talking-Head | ✅ OK, aber nicht in Standard-Voiceover-Tab sichtbar |

---

## 🔍 Verbleibende Lücken zur absoluten Marktspitze

Nach Audit gegen **Runway Gen-3, Pika 2.0, HeyGen, Synthesia, Canva Magic Studio, Submagic, Descript** sehe ich noch **4 sinnvolle Blöcke**:

### 🔥 Block R — Smart Reframe (AI Subject Tracking) — ~2.5h
**Lücke**: Multi-Format-Export macht aktuell **Center-Crop**. Wettbewerber (Submagic, Adobe Premiere Auto-Reframe) verfolgen das Hauptmotiv intelligent.

**Plan**:
- Neue Edge Function `analyze-scene-subject` → Gemini 2.5 Pro Vision analysiert Keyframes und liefert Bounding-Box pro Sekunde
- `render-multi-format-batch` erweitern: nutzt Subject-Track für dynamisches Crop-Center
- UI in `ExportPresetPanel.tsx`: Toggle "Smart Subject Track" (default ON für 9:16, OFF für 16:9→1:1)
- Caching: Subject-Tracks pro Szene in neuer Spalte `composer_scenes.subject_track` (JSONB)

**Impact**: Ein 16:9 Korporate-Video wird zu einem perfekt zentrierten 9:16 TikTok-Clip — der KILLER für Cross-Posting-Workflows.

---

### 💎 Block S — Brand Memory (Auto-Apply Brand Kit) — ~1.5h (EASY-WIN)
**Lücke**: User muss in jedem Projekt manuell Brand-Kit anwenden. Canva/HeyGen wenden automatisch an.

**Plan**:
- DB: `composer_projects.brand_kit_id` + Trigger, der bei Insert das Default-Brand-Kit des Users setzt
- Auto-Director-Wizard: zeigt aktive Brand → Logo, Farben, Font werden automatisch in Plan-Generation übergeben (Gemini Prompt erweitert)
- `BrandKitApplyPanel.tsx`: neuer Toggle "Als Standard für neue Projekte"
- Talking-Head & Multi-Format respektieren automatisch Brand-Subtitle-Style

**Impact**: User bauen einmal ihr Brand-Kit, danach ist jedes Video automatisch on-brand. Reduziert Setup-Zeit um ~80%.

---

### 📊 Block T — Performance-Loop (Top-Performing Templates) — ~3h
**Lücke**: Wir haben Analytics (`analyze-performance`), nutzen sie aber nicht für Content-Empfehlungen. HeyGen hat "Top performers" Library, Pika lernt aus User-Daten.

**Plan**:
- Aggregations-Job: Top 20 Composer-Projekte pro Plattform (TikTok/Reels/Shorts) nach Engagement-Rate identifizieren
- Tabelle `composer_template_suggestions` (auto-generated weekly via cron)
- Neuer Tab im Composer-Dashboard: **"🏆 Trending Templates"** — Click-to-Clone (kopiert Storyboard + Engine-Mix in neues Projekt)
- Auto-Director nutzt Top-Templates als "Stil-Inspiration" wenn User-Idee dazu passt

**Impact**: Datengetriebene Content-Strategie. Differenzierung gegenüber Tools, die nur generieren ohne zu lernen.

---

### 🤝 Block U — Realtime Collaboration (Presence + Comments) — ~5h
**Lücke**: Composer ist aktuell Single-User. HeyGen Teams, Frame.io, Runway Workspaces bieten Live-Collab.

**Plan**:
- Supabase Realtime Channels pro Projekt → Presence (wer ist online, welche Szene editiert wer)
- Neue Tabelle `composer_comments` mit Szenen-Anker + Resolved-Status
- UI: Avatar-Stack im Header, Kommentar-Pin auf SceneCard, Side-Panel mit Comment-Thread
- Optional: Live-Cursors über Storyboard
- Permissions: nutzt bestehendes `add-collaborator` System

**Impact**: Ermöglicht Agenturen + Marketing-Teams. **Voraussetzung für Enterprise-Verkauf >5 Sitze.**

---

## 📊 Empfohlene Reihenfolge

| Reihenfolge | Block | Aufwand | Begründung |
|---|---|---|---|
| **1.** | **S — Brand Memory** | 1.5h | Easy-Win, sofort spürbarer Mehrwert für ALLE User, blockiert nichts |
| **2.** | **R — Smart Reframe** | 2.5h | Macht Block P (Multi-Format) zum echten Killer-Feature |
| **3.** | **T — Performance Loop** | 3h | Strategischer Differenzierer, nutzt vorhandene Analytics |
| **4.** | **U — Realtime Collab** | 5h | Größte Investition, aber Enterprise-Türöffner |

---

## 💡 Mein Vorschlag

Wir starten mit dem **Doppelschlag S → R** in dieser Session:
- **S (Brand Memory)** liefert sofort UX-Boost mit minimalem Risiko
- **R (Smart Reframe)** veredelt direkt den letzten Block P

Beide zusammen ~4h — danach hat das Tool **funktionale Vollparität** mit allen Top-3 Wettbewerbern und behält die einzigartigen Stärken (Hybrid Production + NLE-Export + Engine-Vielfalt).

**Soll ich mit S + R starten, oder eine andere Reihenfolge?**
