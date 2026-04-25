## Block B — Cost Comparison Widget (Remotion vs Shotstack)

**Ziel:** Nutzer sehen *vor* dem Render live, was ein Render in beiden Engines kostet, welche günstiger ist und können bewusst die Engine wählen. Backend ist bereits vollständig vorhanden — es fehlt nur die UI-Integration.

---

### Bestandsaufnahme (was bereits da ist)

| Komponente | Status |
|---|---|
| Edge Function `estimate-render-cost` | ✅ Live, funktioniert |
| Hook `useRenderCostEstimation` | ✅ Vorhanden |
| Component `CostComparison.tsx` | ✅ Gebaut, aber **nirgends importiert** |
| Hook `useRenderEngine` (localStorage) | ✅ Vorhanden |
| DB-Tabelle `render_cost_factors` | ✅ Mit Daten (Remotion: 5 + 0.10/s, Shotstack: 10 + 0.15/s) |

**Lücke:** Das Widget hängt in der Luft — nicht in den Composer-Workflow eingebunden.

---

### Umsetzung

#### 1. Neuer Wrapper-Component: `CostEstimationPanel.tsx`
Ein Composer-spezifischer Wrapper, der `CostComparison` mit Live-Daten füttert:

- **Inputs:** `scenes: ComposerScene[]`, `aspectRatio`, `currentEngine`, `onEngineChange`
- **Berechnet:**
  - `durationSec` = Summe aller `scene.durationSeconds`
  - `resolution` = '1080p' (Default — später aus AssemblyConfig)
  - `complexity` = abgeleitet aus Szenen-Anzahl + Effekten (`simple` <3 Szenen, `medium` 3-6, `complex` >6 oder mit Color Grading/Watermark)
- **Ruft** `estimateCost()` aus `useRenderCostEstimation` bei jeder relevanten Änderung (debounced, 500ms)
- **Zeigt:**
  - Bestehendes `<CostComparison>` Widget (Side-by-side Bars)
  - Wallet-Balance-Check via `useCredits` mit Warnung wenn Balance < empfohlener Engine
  - "Empfohlen"-Badge auf der günstigeren Engine
  - 2 Buttons "Use Remotion" / "Use Shotstack" → updaten `useRenderEngine`
  - Breakdown-Akkordion (Basis-, Dauer-, Auflösungs-, Komplexitäts-Kosten) via `getCostBreakdown`
  - Optional: `historicalAverage` wenn `templateId` vorhanden (Hint: "Ähnliche Renders kosteten im Schnitt X")

#### 2. Integration in `AssemblyTab.tsx`
- Import `CostEstimationPanel` und `useRenderEngine`
- Einbau **direkt über** dem "Video rendern"-Button als Card mit Header "💰 Kosten-Schätzung"
- Engine-Auswahl wird in `handleRender` ausgewertet → derzeit wird Render-Engine implizit gewählt; jetzt explizit aus `renderEngine` Hook übergeben (falls Render-Pipeline das unterstützt; sonst nur informativ + localStorage für künftige Renders)

#### 3. Edge-Function-Härtung (`estimate-render-cost/index.ts`)
- Aktuell wirft die Function bei fehlendem `Authorization`-Header — das blockiert den Live-Estimate-Workflow. Da Cost-Schätzung keine sensiblen Daten liefert, prüfen wir: Header weiterhin verlangt (User-bezogenes Logging), aber **Fehlerbehandlung im Hook** ergänzen, damit die UI bei Fehlern einen Fallback-Hinweis zeigt statt zu crashen.
- **Kein Schema-Change nötig** — Tabelle und Daten bestehen bereits.

#### 4. Lokalisierung (EN/DE/ES)
Neue Translation-Keys in den 3 Sprachdateien:
- `videoComposer.cost.title` — "Cost Estimation" / "Kosten-Schätzung" / "Estimación de coste"
- `videoComposer.cost.recommended` — "Recommended (cheaper)" / "Empfohlen (günstiger)" / "Recomendado (más barato)"
- `videoComposer.cost.useThis` — "Use this engine"
- `videoComposer.cost.lowBalanceWarning` — "Your balance ({{balance}} credits) is below the estimated cost"
- `videoComposer.cost.breakdown` — "Cost breakdown"
- `videoComposer.cost.historical` — "Similar renders averaged {{avg}} credits"

#### 5. UX-Details (James Bond 2028 Look)
- Card mit goldenem Border-Glow (analog zu `EnterpriseStatusDisplay`-Pattern)
- Aktive Engine bekommt goldenen Ring, inaktive ist abgedimmt
- Loading-Skeleton während `estimateCost` läuft
- Bei Fehlern: dezenter Toast + Fallback "Cost estimation unavailable" — kein blockierender Error

---

### Nicht im Scope (bewusst ausgeklammert)
- ❌ Änderung der `render_cost_factors`-Werte (DB ist befüllt)
- ❌ Neue Tabelle `render_cost_history` Logging (kommt mit dem nächsten Render-Webhook automatisch — separates Feature)
- ❌ Echte Engine-Switch in der Render-Pipeline (Composer rendert aktuell mit Remotion Lambda; Shotstack-Pipeline ist separates Thema). **Block B = nur Schätzung + Engine-Präferenz speichern + Transparenz.** Wenn Du willst, dass die Engine-Wahl tatsächlich den Render-Pfad ändert, mache ich das als eigenständigen Block.

---

### Geänderte / neue Dateien

**Neu:**
- `src/components/video-composer/CostEstimationPanel.tsx`

**Modifiziert:**
- `src/components/video-composer/AssemblyTab.tsx` — Widget einbauen, `useRenderEngine` integrieren
- `src/locales/en.json`, `src/locales/de.json`, `src/locales/es.json` — neue Keys

**Unverändert (bereits fertig):**
- `src/components/render/CostComparison.tsx`
- `src/hooks/useRenderCostEstimation.ts`
- `src/hooks/useRenderEngine.ts`
- `supabase/functions/estimate-render-cost/index.ts`

---

### Aufwand
**~1 Tag** — wie ursprünglich geschätzt. Der Großteil der Arbeit (Backend + Edge Function + DB) ist bereits erledigt; es ist primär UI-Glue + Lokalisierung.

Nach Freigabe setze ich das in einem Rutsch um.