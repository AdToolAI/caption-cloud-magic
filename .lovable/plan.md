
# Render-Polish-Tag — Die letzten 5% zum Render-Trust-Layer

Der Pre-Flight-Confirm-Dialog existiert bereits sauber. Wir ergänzen die fünf fehlenden Polish-Punkte in ~1 Tag.

---

## Was wir bauen

### 1. ETA-Zeile im Pre-Flight-Dialog (~30 min)

**Wo:** Bestehender Dialog (`SceneCard.tsx` → `RenderConfirmDialog` Komponente).

**Was:** Unter der Kosten-Tabelle eine neue Zeile:

```text
⏱  Geschätzte Renderzeit:    ~2-3 min
```

**Hook:** `src/hooks/useProviderEta.ts` existiert bereits — nur einbinden. ETA pro Provider + Dauer berechnen (Hailuo 6s ≈ 90s, Hailuo 10s ≈ 150s, +Lipsync ≈ 60-120s, +VO ≈ 5s).

---

### 2. Refund-Garantie-Badge (~20 min)

**Wo:** Unter der Gesamt-Summe im Pre-Flight-Dialog.

**Was:** Dezenter grüner Trust-Hinweis:

```text
🛡  Bei Render-Fehler werden alle Credits automatisch zurückerstattet.
```

**Hook:** Reine UI-Komponente, kein Backend nötig. Refund-Automation ist bereits aktiv (siehe `mem://architecture/failure-credit-refund-automation`).

---

### 3. Capability-Warnings (~1-2 h)

**Wo:** Im Pre-Flight-Dialog als gelbe Warning-Zeile, wenn relevant.

**Was — kontextuell auftauchende Hinweise:**

- Hailuo + 10s + 1080p ausgewählt → ⚠ "Bei 10s wird auf 768p downgraded (Hailuo-Limit)"
- HappyHorse + Multi-Speaker → ⚠ "Multi-Speaker auf HappyHorse ist Beta — Identity-Drift möglich"
- Lipsync + Audio länger als Szene → ⚠ "Audio wird auf {sceneDuration}s gekürzt"
- Pika ausgewählt → ⚠ "Pika ist im Wartungsmodus — wird auf Hailuo migriert"

**Hook:** Neue Funktion `getRenderWarnings(scene)` in `src/lib/video-composer/renderWarnings.ts`, die aus `providerCapabilities.ts` + Scene-State die passenden Warnings ableitet. Im Dialog gerendert.

---

### 4. Master-Render-Total vor Stitch (~2-3 h)

**Wo:** Neuer Dialog vor "Render All & Stitch" im `ClipsTab` / Master-Render-Button.

**Was:** Aggregierter Pre-Flight für die gesamte Produktion:

```text
Master-Render vorbereiten?

  Szene 1 (Hook)        46 Cr · €0.46
  Szene 2 (Dialog)     191 Cr · €1.91
  Szene 3 (Solution)    90 Cr · €0.90
  Szene 4 (CTA)         60 Cr · €0.60
  ─────────────────────────────────
  Stitch (Lambda)       12 Cr · €0.12

  Gesamt              399 Cr · €3.99
  ETA                  ~8-12 min

  🛡 Refund-garantiert pro Szene

  [Abbrechen]  [Master rendern für 399 Cr]
```

**Hook:** Neue Komponente `src/components/video-composer/MasterRenderConfirmDialog.tsx`, summiert über alle `composer_scenes` der `composer_projects` Row + Stitch-Cost aus `cost_table`.

---

### 5. Globale `/queue` Seite (~4-6 h)

**Wo:** Neue Seite + Sidebar-Eintrag im Hub.

**Was:** Live-Dashboard aller laufenden Renders des Users:

```text
┌────────────────────────────────────────────────────────┐
│  Render-Queue                                          │
│                                                        │
│  🟢 Szene 2 (Dialog)         Lipsync läuft  · 1:42    │
│      Hailuo + Sync.so · 191 Cr                [Cancel]│
│                                                        │
│  🟡 Szene 4 (CTA)            Wartet auf Slot · queued │
│      Hailuo · 60 Cr                          [Cancel]│
│                                                        │
│  🟢 Master-Stitch            Lambda läuft · 0:38      │
│      Remotion · 12 Cr                                 │
│                                                        │
│  ─── Letzte 24h ────                                  │
│  ✅ Szene 1                  Fertig                   │
│  ✅ Szene 3                  Fertig                   │
│  ❌ Pika-Test                Failed → 50 Cr refunded  │
└────────────────────────────────────────────────────────┘
```

**Hook:**
- Neue Seite: `src/pages/RenderQueue.tsx`
- Datenquellen aggregieren: `composer_scenes` (clip_status), `dialog_dispatch_locks`, `syncso_inflight_jobs`, `director_cut_renders`, `render_queue`, `autopilot_video_jobs`
- Realtime via Supabase Channel auf `composer_scenes` + `render_queue` (read-only Subscribe in useEffect, mit Cleanup)
- Cancel-Button: ruft bestehende Cancel-Edge-Functions
- Sidebar-Eintrag in `hubConfig.ts` mit Badge-Counter für aktive Jobs

---

## Files die wir anfassen

**Neu:**
- `src/lib/video-composer/renderWarnings.ts`
- `src/components/video-composer/MasterRenderConfirmDialog.tsx`
- `src/components/video-composer/RefundGuaranteeBadge.tsx`
- `src/pages/RenderQueue.tsx`
- `src/hooks/useRenderQueueLive.ts`

**Erweitern:**
- `src/components/video-composer/SceneCard.tsx` — ETA-Zeile + Warnings + Refund-Badge in existierenden Dialog
- `src/components/video-composer/ClipsTab.tsx` — Master-Confirm-Dialog vor Render-All
- `src/config/hubConfig.ts` — Sidebar-Eintrag `/queue`
- `src/App.tsx` (oder Routing-File) — Route `/queue`

**Nicht anfassen:**
- Bestehender Pre-Flight-Dialog-Inhalt (nur additiv erweitern)
- Edge Functions (alle Daten sind schon da)
- Cost-Berechnung (`useRenderCostEstimation` bleibt unverändert)

---

## Was diese Polish-Welle bewirkt

- **Trial-User vor "Master rendern"-Klick:** sieht klare Gesamtkosten + ETA + Refund-Garantie → klickt **mit Sicherheit** statt mit Anxiety.
- **Beim Generate eines einzelnen Clips:** sieht Capability-Warnings vorher → keine Überraschungen.
- **Während die Jobs laufen:** kann auf `/queue` schauen und sehen was passiert, statt blind zu warten.
- **Bei Fehlern:** sieht im Queue dass refundet wurde → Vertrauen statt Frust.

---

## Reihenfolge im Tag

```text
Morgen:        1. ETA-Zeile               (30 min)
               2. Refund-Badge            (20 min)
               3. Capability-Warnings     (1-2 h)
Mittag-Pause
Nachmittag:    4. Master-Render-Dialog    (2-3 h)
               5. /queue Seite            (4-6 h)
```

Falls /queue länger dauert, splitten wir Punkt 5 ab und schließen Punkte 1-4 sauber heute ab.

---

Sag Bescheid wenn ich starten soll — sonst nehme ich Punkt 1 als ersten Schritt direkt nach Approval.
