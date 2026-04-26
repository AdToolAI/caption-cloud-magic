## Kontext

Bei der Codebase-Analyse zeigt sich: **Die Asset-Library-Partnerschaft mit Pexels, Pixabay und Mixkit ist bereits zu ~95% implementiert.**

**Bestehende Infrastruktur (alles produktiv):**
| Asset-Typ | Provider | Edge Function | UI-Component |
|---|---|---|---|
| Stock-Videos | Pexels + Pixabay | `search-stock-videos` | `StockMediaBrowser.tsx` |
| Stock-Bilder | Pexels + Pixabay | `search-stock-images` | `StockMediaBrowser.tsx` |
| Stock-Musik | Pixabay | `search-stock-music` | `MusicLibraryBrowser.tsx` |
| Stock-SFX | Pixabay + Mixkit-Fallback | `search-stock-sfx` | `MusicLibraryBrowser.tsx` |

Dazu: 8 Quick-Kategorien, Aspect-Ratio-Filter, Favoriten-Bibliothek (`user_media_library`-Tabelle), Source-Attribution für Lizenzkonformität.

**Was wirklich noch fehlt:** Sichtbarkeit. User sehen im Provider-Picker der `SceneCard` nicht prominent, dass Stock **0 Credits** kostet — gerade jetzt nach der Veo-3.1-Integration (0,20–1,40 €/s) wäre dieser Kontrast ein starker Conversion-/Retention-Hebel und positioniert uns klar gegen Artlist (die nur kostenpflichtige AI-Generation anbieten).

---

## Geplante Änderungen (UX-Polish, keine neue Backend-Arbeit)

### 1. Provider-Picker in `SceneCard.tsx` — Stock als „🎁 KOSTENLOS"-Hero-Button
- Stock-Button visuell hervorheben mit grünem `🎁 Free`-Badge und „0 Credits"-Hint
- Position direkt links neben den AI-Providern (Veo/Sora/Kling), damit der Preisvergleich sofort sichtbar ist
- Tooltip: „2M+ Stock-Videos & Bilder von Pexels & Pixabay — royalty-free, ohne Credit-Verbrauch"

### 2. `StockMediaBrowser.tsx` — Header-Branding als „Free Stock Library"
- Dialog-Header: prominent „🎁 Free Stock Library — Pexels × Pixabay × Mixkit"
- Sub-Hint: „Über 2 Millionen royalty-free Assets — kein Credit-Verbrauch"
- Bereits vorhandene Source-Badges (`pixabay` / `pexels`) farblich differenzieren (Pexels-Türkis, Pixabay-Grün)

### 3. `MusicLibraryBrowser.tsx` — gleicher „Free"-Header für Audio/SFX
- „🎁 Free Audio Library — Pixabay × Mixkit" mit gleicher Optik wie StockMediaBrowser
- Hinweis dass auch SFX/Music kostenlos sind (Pixabay-Audio-API + Mixkit-Fallback)

### 4. `CostEstimationPanel.tsx` — „You're Saving" Counter
- Bei Szenen vom Typ `stock` (nicht `ai-veo` / `ai-sora` / etc.): nicht in Cost summieren
- Neue Zeile: „💚 Stock-Szenen: X · ~€Y gespart" (Vergleich gegen Veo Lite 720p Default-Preis)
- Macht den Stock-First-Workflow als ROI-Treiber sichtbar

### 5. `BriefingTab.tsx` (Auto-Director) — neue Toggle-Option „Stock-First Generierung"
- Neue Checkbox: „💰 Kosten sparen: Stock-Footage bevorzugen wo möglich" (default OFF, opt-in)
- Wenn aktiv: in `compose-video-storyboard` Edge Function einen Hint mitsenden, dass Szenen mit generischen Subjects (B-Roll, Establishing Shots, Lifestyle) als `source: 'stock'` markiert werden statt `ai-*`
- _Hinweis_: Edge-Function-Anpassung minimal — nur Persona-Prompt-Erweiterung, kein neues Branching

### 6. Localization-Strings (DE/EN/ES)
- Neue Keys unter `videoComposer.stock.free.*` für Badges, Tooltips, Cost-Saving-Hint
- Beibehaltung der bestehenden `videoComposer.stock.*` Keys

---

## Was NICHT geändert wird

- ✅ Edge Functions `search-stock-videos`, `search-stock-images`, `search-stock-music`, `search-stock-sfx` bleiben unverändert (funktionieren produktiv)
- ✅ `user_media_library`-Tabelle bleibt unverändert (Favoriten-System läuft)
- ✅ `StockMediaItem`-Datenmodell bleibt unverändert
- ✅ Keine neuen API-Keys/Provider — Pexels & Pixabay reichen, Mixkit hat keine offene API (nur Embed/Fallback bleibt)

---

## Erwartetes Ergebnis

- User sehen **sofort beim Szene-Picken**, dass Stock 0 Credits kostet → höhere Adoption der Free-Tier
- **Cost-Saving-Counter** macht den ROI sichtbar → stärkeres Argument vs. Artlist (die nur paid AI bieten)
- Optional **Stock-First-Generierung** im Auto-Director → noch günstigere Default-Renders
- **Klare Wettbewerbs-Positionierung**: 7 AI-Modelle (Premium) + 2M+ Free-Stock = einzigartige Kombination am Markt

---

## Geschätzter Umfang

- **6 Dateien** angefasst (alle Frontend, ~250 Zeilen Diff)
- **0 neue Edge Functions**
- **0 DB-Migrationen**
- **0 neue Secrets/Connectors**
- Optional Phase 2: leichte Persona-Hint-Erweiterung in `compose-video-storyboard` für Stock-First Auto-Director (~30 Zeilen)
