
# Aufräum-Sprint T-12 (Launch 26.07.2026)

Vier zusammenhängende Aufräumarbeiten. Kein Risiko für die Kern-Pipelines (Motion Studio, AI Video Studio, Cast & World bleiben unverändert in ihrer Funktionsweise, nur UI/Guard-Layer wird bereinigt).

---

## 1. Credits-System vereinfachen — nur noch AI-Video/Bild-Wallet

**Ist-Zustand (aus Code-Scan):**
- Es existiert ein generisches Credit-System (`useCredits`, `CreditGuard`, `CreditLimitWarning`, `useCreditReservation`, `credit-preflight`/`credit-reserve`/`credit-commit`/`credit-refund` Edge Functions) mit Feature-Codes wie `caption_generate`, `bio_optimize`, `coach_chat`, `post_schedule`, `trend_fetch`, `comment_analyze` etc. — geerbt aus alter Social-Media-Tool-Phase.
- Parallel gibt es die eigentlich relevante **AI-Credits-Wallet** für Video-Provider (Seedance, Kling, Hailuo, Sora, Veo…) und Picture-Studio-Modelle mit €-basierter Abrechnung über `pricing-catalog`, `ai-video-purchase-credits`, `videoPricingCatalog.ts`.
- 40+ Komponenten referenzieren das generische Credit-System (siehe Scan-Ergebnis).

**Ziel:** Nur die AI-Video/Bild-Wallet bleibt. Alles andere (Caption, Hashtag, Bio, Coach, Trend, Comment, Post-Schedule) wird **kostenlos innerhalb des Beta-Basic-Abos** — kein Credit-Abzug, kein Guard, kein Preflight.

**Umsetzung:**
1. **`featureCosts.ts` schlank machen** — nur noch:
   - `STUDIO_IMAGE_GENERATE` (Picture Studio Premium-Modelle)
   - `COMPOSER_CLIP_AI` / `COMPOSER_RENDER` (Motion Studio)
   - `SORA_LONGFORM_STANDARD` / `SORA_LONGFORM_PRO`
   - `EXPLAINER_SCENE_ANIMATE` / `EXPLAINER_CHARACTER_ANIMATE`
   - Alle Social-Feature-Codes (`caption_generate`, `hashtag_analyze`, `bio_optimize`, `coach_chat`, `post_schedule`, `trend_fetch`, `comment_analyze`, `image_process`, `background_generate`) entfernen.
2. **`CreditGuard`-Wrapper aus allen 40 Nicht-Video-Komponenten entfernen** — Callback direkt aufrufen. Sweep-Liste:
   - `AIScriptGenerator`, `AIMusicSuggester`, `BatchVideoUpload`, `BatchEditDialog`, `RenderingOptionsSelector`, `VideoEditorDialog`, `VideoCreatorDialog`
   - `Rewriter`, `Generator`, `Campaigns`, `Home`, `Autopilot`, `TrendRadar`, `RenderQueue`, `MusicStudio`, `Pricing`, `FAQ`, `Support`
   - `AutopilotWeeklyReviewPanel`, `AutopilotStrategyEditor`, `AutopilotSlotDrawer`, `AutopilotBriefWizard`
   - `TrendDetailModal`, `PinnedChatWindow`, `AutoMatchPanel`, `MusicGeneratorPanel`, `SoundDesignPanel`, `StockMediaBrowser`, `SceneStillFrameStudio`
   - `WelcomeBonusModal`, `UsageRecommendationWatcher`, `CreditThresholdWatcher`, `TrialUpgradeWatcher`, `FeatureDiscoveryWatcher`, `StreakMilestoneUpsellWatcher`, `UpgradeMount`
   - `AISuperuserAdmin`, `VideoPerformanceDashboard`, `UserMenu` (Credit-Badge in Header)
3. **`/credits`-Route umbauen** — statt generischer Balance nur noch **"AI-Credits-Wallet"** (Video/Bild-Guthaben in €) mit den drei Paketen (14,99 € Extra / 29,99 € Business / 44,95 € Enterprise). Rest der Seite entfällt.
4. **Header/UserMenu-Credit-Badge** entfernen — verwirrt bei einheitlichem Abo.
5. **Edge Functions deaktivieren, aber nicht löschen** (Rollback-Sicherheit): `credit-preflight`, `credit-reserve`, `credit-commit`, `credit-refund` bleiben liegen, werden aber vom Frontend nicht mehr aufgerufen. AI-Video-Purchase-Flow (`ai-video-purchase-credits`) bleibt aktiv.
6. **`wallets`-Tabelle nicht anfassen** (RLS-Ketten, Ledger, Founders-Status hängen daran) — nur das UI-Konzept aus dem Nutzer-Flow entfernen.

**Textliche Änderung** (überall wo "Credits verbraucht"/"Nicht genug Credits" auftauchte): Wird ersatzlos entfernt. Wenn ein Feature echt kostenpflichtig ist (AI-Video/Bild), zeigen wir die **€-Kostenübersicht** direkt vor dem Generieren (siehe Punkt 2).

---

## 2. Kostenübersicht vor Generierung — AI Video Studio + Picture Studio

**Motion Studio hat das bereits** über `SceneRenderConfirmDialog` und `RenderPreFlightDialog` (verwendet `useVideoPricingCatalog` — Single-Source-of-Truth).

**Neu für AI Video Studio (`ToolkitGenerator.tsx`):**
- Vor jedem Generate-Klick ein Confirm-Dialog mit:
  - Modellname + Qualitäts-Tier
  - Länge (Sekunden) + Auflösung
  - **Preis pro Sekunde** (aus `useVideoPricingCatalog`, Fallback lokale Config)
  - **Gesamtpreis** in € (`sec × pricePerSecond`), Founders-Rabatt (-20 %) automatisch angezeigt wenn aktiv
  - Aktuelles AI-Wallet-Guthaben + Restsaldo nach Generierung
  - "Nicht mehr fragen für 24 h"-Checkbox (localStorage)
  - Buttons: "Abbrechen" / "Für X,XX € generieren"
- Dialog-Komponente: neue `AIVideoCostConfirmDialog.tsx` — analog zur bestehenden Motion-Studio-Variante.
- Wenn Guthaben nicht reicht → CTA "AI-Credits nachkaufen" (verlinkt zu `/credits`).

**Neu für Picture Studio (`PictureStudio.tsx` + `PictureStudioGenerator`):**
- Gleicher Dialog-Typ, aber nur für **Premium-Modelle** (nicht für die freien Basis-Modelle über Lovable AI Gateway).
- Zeigt: Modell (z. B. Flux Pro, Ideogram, Recraft), Kosten pro Bild, Anzahl Varianten, Gesamtpreis.
- Free-Tier-Modelle bekommen weiterhin **keinen** Dialog (deine Vorgabe: "im Picture Studio nicht notwendig" → gilt nur für kostenlose).

**Konsistenz:** Alle drei Studios (Motion, AI Video, Picture-Premium) verwenden denselben Preis-Katalog-Hook und dieselbe Dialog-Struktur → keine Preis-Divergenzen mehr möglich.

---

## 3. Video-Übersetzer komplett entfernen

**Zu entfernen:**
- `src/pages/VideoTranslator.tsx`
- `src/hooks/useVideoTranslation.ts`
- Route in `src/App.tsx` (`/video-translator`, Lazy-Import Zeile 150, Route Zeile 318)
- Alle Nav-/Hub-/Menü-Einträge in `src/config/hubConfig.ts`
- Marketing-Bezüge in Landing-Page/FAQ, falls vorhanden (Sweep über `grep -i "übersetz\|translat"`)

**Edge Functions:** `translate-to-english` **bleibt** — wird vom Composer-Auto-Translate-Hook (`useAutoTranslateEn`) für interne EN-Konvertierung von Dialogen/Prompts benutzt, hat nichts mit dem entfernten User-Feature zu tun. Nicht anfassen.

Andere Übersetzungs-Edge-Functions (Video-Track-Translation, Voice-Cloning-für-Übersetzung) werden identifiziert und ebenfalls deaktiviert (nicht gelöscht — Rollback-Reserve).

---

## 4. Email-Deliverability notify.useadtool.ai

**Aktueller Status (soeben geprüft):**

| Prüfung | Status |
|---|---|
| Domain `notify.useadtool.ai` DNS-verifiziert | ✅ |
| NS-Delegation an `ns3/ns4.lovable.cloud` | ✅ aktiv |
| SPF/DKIM/DMARC (managed durch NS-Delegation) | ✅ automatisch |
| Auth-Emails aktiviert | ✅ |
| Email-Queue Live-Instanz | ✅ Healthy |
| Emails gesendet (letzte 7 Tage) | 0 |

**Ergebnis:** DNS und Infrastruktur sind sauber. Kein Handlungsbedarf auf DNS-Ebene. Der Grund für die 0-Sends-Bilanz: Es gibt schlicht noch fast keine echten Registrierungen — nicht ein Deliverability-Problem.

**Zusätzlich empfohlen** (klein, aber wichtig für Launch):
1. **Live-Smoketest**: Ein Testkonto mit einer echten Gmail-, Outlook-, GMX- und Web.de-Adresse registrieren, prüfen ob die Verifizierungsmail ankommt und **nicht im Spam** landet. Ergebnis dokumentieren.
2. **Support-Postfach `info@useadtool.ai`**:
   - MX-Record prüfen (unabhängig von der Sender-Domain `notify.useadtool.ai`) — wo liegt das Postfach aktuell? Google Workspace / Microsoft 365 / eigener Server?
   - Autoresponder + Signature einrichten, falls noch nicht.
   - In `send-support-ticket` / `notify-ticket-resolved` sicherstellen, dass `SUPPORT_INBOX = info@useadtool.ai` gesetzt ist (aus einem früheren Turn als offen markiert).
3. **DMARC-Report-Adresse** für `useadtool.ai` (Root-Domain) einrichten, damit ihr sehen könnt, wenn jemand versucht euren Absender zu spoofen. Ziel-Postfach: `info@useadtool.ai`. Das ist ein einfacher zusätzlicher TXT-Record am Root — kein Konflikt mit der NS-Delegation der Sub-Domain.

**Nichts anpassen** am Lovable-managed SPF/DKIM — das würde die Delegation brechen.

---

## Reihenfolge & Abhängigkeiten

```text
Tag 1  → Punkt 1 (Credits vereinfachen)      [größter Sweep, alles andere baut darauf auf]
Tag 2  → Punkt 2 (Kosten-Dialoge)            [einmal die Dialog-Komponente, dann 2x einsetzen]
Tag 2  → Punkt 3 (Video-Übersetzer raus)     [parallel, unabhängig]
Tag 3  → Punkt 4 (Email-Smoketest + info@)   [manuell, kein Code]
```

Gesamt-Aufwand: ca. 1,5–2 Tage Umsetzung, danach ein voller Typecheck-/Test-Durchlauf.

## Rückfrage vor Umsetzung

- **AI-Wallet-Guthaben nach Abo-Reset**: Setzt sich der 800-Credit-Beta-Bonus jeden Monat auf 800 zurück (Reset) oder ist er ein **einmaliger** Startbonus und danach kauft man Extra-Pakete? Aktueller Code deutet auf Reset — willst du das so behalten oder umstellen auf "einmalig + Extra-Käufe"?
- **Übersetzer-Restfeatures**: Gibt es Nutzer, die den Video-Übersetzer schon aktiv genutzt haben und historische Daten (`video_translations`-Tabelle o. ä.) sehen sollen? Falls ja: Tabelle behalten, nur UI/Route entfernen. Falls nein: Migration zum Löschen der Tabelle mit einplanen.
