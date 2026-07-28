import type { ComponentType } from "react";
import type { Language } from "@/lib/translations";
import {
  HeatmapBuildVisual,
  SlotAutoPickVisual,
  ChannelMatrixVisual,
  RecurrenceLoopVisual,
  MonthLockedVisual,
  SignalStreamVisual,
  CtrDeltaBarVisual,
  WatchtimeCurveVisual,
  ABDuelVisual,
  InsightCardsVisual,
  ChannelRingsFillVisual,
  AutoPublishRailVisual,
  CloneMultiplierVisual,
  QueueRocketVisual,
  GlobalReachMapVisual,
} from "./outcomeVisuals";

export type OutcomeKey = "planMonth" | "optimizePerformance" | "scaleCampaigns";

export type OutcomeSlide = {
  UIComponent: ComponentType;
  durationMs?: number;
  copy: Record<Language, { kicker: string; title: string; body: string }>;
};

const S = (
  kicker: [string, string, string],
  title: [string, string, string],
  body: [string, string, string],
) => ({
  de: { kicker: kicker[0], title: title[0], body: body[0] },
  en: { kicker: kicker[1], title: title[1], body: body[1] },
  es: { kicker: kicker[2], title: title[2], body: body[2] },
});

export type OutcomeMeta = {
  href: string;
  ctaLabel: Record<Language, string>;
  slides: OutcomeSlide[];
};

export const OUTCOMES: Record<OutcomeKey, OutcomeMeta> = {
  planMonth: {
    href: "/dashboard",
    ctaLabel: { de: "Planer öffnen", en: "Open planner", es: "Abrir planner" },
    slides: [
      {
        UIComponent: HeatmapBuildVisual,
        durationMs: 5000,
        copy: S(
          ["Schritt 01 · Heatmap", "Step 01 · Heatmap", "Paso 01 · Heatmap"],
          ["Der Monat baut sich als Heatmap.", "Your month builds itself as a heatmap.", "Tu mes se construye como heatmap."],
          [
            "Signale aus TikTok, Meta, YouTube und X fließen in eine Wochen-Heatmap. Du siehst sofort, wann deine Zielgruppe wirklich zuschaut — kein Bauchgefühl mehr.",
            "Signals from TikTok, Meta, YouTube and X flow into a weekly heatmap. You instantly see when your audience actually watches — no more gut feeling.",
            "Las señales de TikTok, Meta, YouTube y X fluyen a un heatmap semanal. Ves al instante cuándo mira tu audiencia — sin corazonadas.",
          ],
        ),
      },
      {
        UIComponent: SlotAutoPickVisual,
        durationMs: 4800,
        copy: S(
          ["Schritt 02 · Slot-Auto-Pick", "Step 02 · Slot Auto-Pick", "Paso 02 · Auto-Slot"],
          ["Die besten Slots werden vorgeschlagen.", "The strongest slots get pre-picked.", "Los mejores slots se preseleccionan."],
          [
            "AdTool AI rankt jeden Zeitslot nach Reach-Potenzial und pickt die stärksten automatisch — du bestätigst mit einem Klick.",
            "AdTool AI ranks every time-slot by reach potential and auto-picks the strongest — you confirm with one click.",
            "AdTool AI clasifica cada franja por potencial de alcance y elige las mejores — confirmas con un clic.",
          ],
        ),
      },
      {
        UIComponent: ChannelMatrixVisual,
        durationMs: 5000,
        copy: S(
          ["Schritt 03 · Kanal-Matrix", "Step 03 · Channel matrix", "Paso 03 · Matriz de canal"],
          ["Ein Post, alle Formate.", "One post, every format.", "Un post, todos los formatos."],
          [
            "9:16, 1:1, 16:9, Stories — die Matrix zeigt sofort, welches Format auf welchem Kanal live geht. Kein Copy-Paste-Chaos.",
            "9:16, 1:1, 16:9, Stories — the matrix shows exactly which format goes live on which channel. No copy-paste chaos.",
            "9:16, 1:1, 16:9, Stories — la matriz muestra qué formato va a cada canal. Sin caos de copy-paste.",
          ],
        ),
      },
      {
        UIComponent: RecurrenceLoopVisual,
        durationMs: 5200,
        copy: S(
          ["Schritt 04 · Wiederholung", "Step 04 · Recurrence", "Paso 04 · Recurrencia"],
          ["Serien laufen wie ein Uhrwerk.", "Series run like clockwork.", "Series como reloj suizo."],
          [
            "Wöchentlich, zweiwöchentlich, saisonal — Serien laufen automatisch weiter. Ein neues Skript reicht, der Slot ist schon reserviert.",
            "Weekly, bi-weekly, seasonal — series just keep running. Drop a new script, the slot is already booked.",
            "Semanal, quincenal, estacional — las series siguen solas. Nuevo guion, el slot ya está reservado.",
          ],
        ),
      },
      {
        UIComponent: MonthLockedVisual,
        durationMs: 4500,
        copy: S(
          ["Schritt 05 · Monat fixiert", "Step 05 · Month locked", "Paso 05 · Mes fijado"],
          ["28 Slots. Ein Klick. Fertig.", "28 slots. One click. Done.", "28 slots. Un clic. Listo."],
          [
            "Ein Klick — der Monat ist fixiert. Alle Formate, alle Kanäle, alle Wiederholungen sind eingeplant. Du kannst dich wieder auf Content konzentrieren.",
            "One click — the month is locked. Every format, every channel, every recurrence is scheduled. Back to creating.",
            "Un clic — el mes queda fijado. Todos los formatos, canales y recurrencias planificados. A crear.",
          ],
        ),
      },
    ],
  },
  optimizePerformance: {
    href: "/analytics",
    ctaLabel: { de: "Analytics öffnen", en: "Open analytics", es: "Abrir analytics" },
    slides: [
      {
        UIComponent: SignalStreamVisual,
        durationMs: 4800,
        copy: S(
          ["Schritt 01 · Live-Signal", "Step 01 · Live signal", "Paso 01 · Señal en vivo"],
          ["Alle Signale in einem Strom.", "Every signal in one stream.", "Todas las señales en un flujo."],
          [
            "Views, Watch-Time, CTR, Saves, Shares — alle Kanäle streamen live in ein einziges Cockpit. Kein Tab-Wechsel mehr.",
            "Views, watch-time, CTR, saves, shares — every channel streams into one cockpit. No more tab-hopping.",
            "Views, watch-time, CTR, saves, shares — todos los canales fluyen a un mismo cockpit.",
          ],
        ),
      },
      {
        UIComponent: CtrDeltaBarVisual,
        durationMs: 4500,
        copy: S(
          ["Schritt 02 · CTR Δ", "Step 02 · CTR Δ", "Paso 02 · CTR Δ"],
          ["Varianten kämpfen um jeden Klick.", "Variants fight for every click.", "Las variantes luchan por cada clic."],
          [
            "Jede Variante wird gegen die anderen gemessen. Du siehst sofort, welche Version das Momentum hat.",
            "Every variant is benchmarked against the others. You see instantly which one has momentum.",
            "Cada variante se compara con las otras. Ves al instante cuál tiene momentum.",
          ],
        ),
      },
      {
        UIComponent: WatchtimeCurveVisual,
        durationMs: 5000,
        copy: S(
          ["Schritt 03 · Watch-Time", "Step 03 · Watch-time", "Paso 03 · Watch-time"],
          ["Kurven verraten Hooks & Drop-offs.", "Curves reveal hooks & drop-offs.", "Las curvas revelan hooks y drop-offs."],
          [
            "Die Watch-Time-Kurve markiert genau, wo Zuschauer bleiben und wo sie abspringen — perfekt, um Hooks und Cuts zu tunen.",
            "The watch-time curve pinpoints exactly where viewers stay and drop — perfect for tuning hooks and cuts.",
            "La curva de watch-time marca dónde se quedan y dónde saltan — ideal para afinar hooks y cortes.",
          ],
        ),
      },
      {
        UIComponent: ABDuelVisual,
        durationMs: 4500,
        copy: S(
          ["Schritt 04 · A/B Duel", "Step 04 · A/B duel", "Paso 04 · Duelo A/B"],
          ["A gegen B — ohne Ratespiel.", "A vs. B — no guesswork.", "A contra B — sin adivinar."],
          [
            "Zwei Cuts starten parallel, das schwächere Video wird automatisch stumm geschaltet. Nur der Gewinner bekommt Budget.",
            "Two cuts launch in parallel, the weaker one is auto-muted. Only the winner gets more budget.",
            "Dos cuts se lanzan en paralelo, el más débil se silencia automáticamente. Solo el ganador recibe presupuesto.",
          ],
        ),
      },
      {
        UIComponent: InsightCardsVisual,
        durationMs: 5000,
        copy: S(
          ["Schritt 05 · Insight-Cards", "Step 05 · Insight cards", "Paso 05 · Insight cards"],
          ["Konkrete Anweisungen, keine Charts.", "Concrete actions, not just charts.", "Instrucciones concretas, no solo gráficos."],
          [
            "Statt Charts liefert AdTool AI klare Anweisungen: Hook @0,8s stärker, CTA @6,2s, Cut @12s. Umsetzen, veröffentlichen, weiter.",
            "Instead of charts, AdTool AI gives concrete calls: sharper hook @0.8s, CTA @6.2s, cut @12s. Apply, publish, move on.",
            "En vez de gráficos, AdTool AI da instrucciones claras: hook @0,8s más fuerte, CTA @6,2s, corte @12s. Aplicar, publicar, seguir.",
          ],
        ),
      },
    ],
  },
  scaleCampaigns: {
    href: "/dashboard",
    ctaLabel: { de: "Publish-Queue öffnen", en: "Open publish queue", es: "Abrir cola de publicación" },
    slides: [
      {
        UIComponent: ChannelRingsFillVisual,
        durationMs: 5000,
        copy: S(
          ["Schritt 01 · Channel-Rings", "Step 01 · Channel rings", "Paso 01 · Anillos de canal"],
          ["Vier Kanäle. Ein Blick.", "Four channels. One glance.", "Cuatro canales. Una mirada."],
          [
            "TikTok, Meta, YouTube und X — die Ringe zeigen live, wie voll deine Publish-Pipeline auf jedem Kanal ist.",
            "TikTok, Meta, YouTube and X — the rings show live how full your publish pipeline is on each channel.",
            "TikTok, Meta, YouTube y X — los anillos muestran en vivo la cola de publicación en cada canal.",
          ],
        ),
      },
      {
        UIComponent: AutoPublishRailVisual,
        durationMs: 4800,
        copy: S(
          ["Schritt 02 · Auto-Publish", "Step 02 · Auto-publish", "Paso 02 · Auto-publish"],
          ["Ein Video, alle Kanäle live.", "One video, all channels live.", "Un video, todos los canales en vivo."],
          [
            "Rendern, formatieren, watermarken, publishen — alles läuft automatisch. Du bestätigst nur einmal.",
            "Render, format, watermark, publish — all automated. You confirm once.",
            "Renderizar, formatear, watermark, publicar — todo automático. Confirmas una vez.",
          ],
        ),
      },
      {
        UIComponent: CloneMultiplierVisual,
        durationMs: 5000,
        copy: S(
          ["Schritt 03 · Clone × N", "Step 03 · Clone × N", "Paso 03 · Clonar × N"],
          ["Ein Master. Acht Varianten.", "One master. Eight variants.", "Un master. Ocho variantes."],
          [
            "Ein Master-Cut wird in Sekunden zu acht Varianten: andere Hooks, andere CTAs, andere Sprachen. Perfekt für Multi-Market-Rollouts.",
            "One master cut becomes eight variants in seconds: different hooks, CTAs, languages. Perfect for multi-market rollouts.",
            "Un master se convierte en ocho variantes en segundos: hooks, CTAs, idiomas distintos. Ideal para multi-mercado.",
          ],
        ),
      },
      {
        UIComponent: QueueRocketVisual,
        durationMs: 4800,
        copy: S(
          ["Schritt 04 · Queue → Live", "Step 04 · Queue → live", "Paso 04 · Cola → en vivo"],
          ["Von Draft bis Live in einer Bahn.", "Draft to live in one lane.", "De borrador a live en una vía."],
          [
            "Draft, Review, Live — jede Kampagne läuft eine transparente Bahn. Kein Ticket-Ping-Pong, keine verlorenen Cuts.",
            "Draft, review, live — every campaign runs one transparent lane. No ticket ping-pong, no lost cuts.",
            "Borrador, revisión, live — cada campaña sigue una vía transparente. Sin tickets perdidos.",
          ],
        ),
      },
      {
        UIComponent: GlobalReachMapVisual,
        durationMs: 5200,
        copy: S(
          ["Schritt 05 · Global Reach", "Step 05 · Global reach", "Paso 05 · Alcance global"],
          ["Deine Marke, überall gleichzeitig.", "Your brand, everywhere at once.", "Tu marca, en todas partes a la vez."],
          [
            "DE, EN, ES — dieselbe Kampagne, drei Sprachen, ein Klick. Deine Reichweite wächst, ohne dass dein Team wächst.",
            "DE, EN, ES — same campaign, three languages, one click. Your reach scales without your team scaling.",
            "DE, EN, ES — misma campaña, tres idiomas, un clic. Tu alcance escala sin que crezca el equipo.",
          ],
        ),
      },
    ],
  },
};
