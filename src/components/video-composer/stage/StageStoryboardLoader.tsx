import { tx } from "@/lib/i18nText";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Radio } from "lucide-react";
import { useNewsRadar } from "@/hooks/useNewsRadar";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * StageStoryboardLoader — full Bond-2028 cinematic loading panel shown
 * on the Storyboard tab while the auto-director is generating scenes
 * (10-20s, sometimes more). Replaces the legacy small spinner card.
 *
 *  - Same look as StagePanel / StageWelcomeMoment (deep black, gold
 *    cinemascope frame, Playfair headings)
 *  - Rotating phase status line (~2.5s per beat)
 *  - Director's Notes carousel with reading content (~6s per note)
 *  - Live News-Radar marquee at the bottom
 *  - Reduced-motion-safe
 *  - Pure frontend, no new backend calls
 */

type Lang = "de" | "en" | "es";

const COPY: Record<Lang, {
  eyebrow: string;
  title: string;
  subtitle: string;
  phases: string[];
  notesTitle: string;
  notes: { title: string; body: string }[];
  newsLabel: string;
  footer: string;
  noNewsFallback: string;
}> = {
  de: {
    eyebrow: "DIRECTOR AT WORK",
    title: tx({ de: "Wir bauen dein Storyboard", en: "We build your storyboard", es: "Construimos tu storyboard" }),
    subtitle:
      tx({ de: "Skript, Cast und Szenen werden gerade komponiert — du musst nicht warten, wir benachrichtigen dich, sobald alles fertig ist.", en: "Script, cast, and scenes are currently being composed — you don't have to wait, we'll notify you as soon as everything is ready.", es: "El guion, el elenco y las escenas se están componiendo actualmente — no tienes que esperar, te notificaremos tan pronto como todo esté listo." }),
    phases: [
      tx({ de: "Briefing wird analysiert…", en: "Briefing is analyzed…", es: "Se analiza el briefing…" }),
      tx({ de: "Cast wird besetzt…", en: "Cast is being cast…", es: "El elenco está siendo elegido..." }),
      tx({ de: "Szenen-Bögen werden geplant…", en: "Scene arcs are being planned…", es: "Se están planificando los arcos de la escena…" }),
      tx({ de: "Skripte werden geschrieben…", en: "Scripts are written...", es: "Los guiones están escritos..." }),
      tx({ de: "Kamera & Look werden gesetzt…", en: "Camera & look are set…", es: "La cámara y el aspecto están configurados..." }),
      tx({ de: "Storyboard wird finalisiert…", en: "Storyboard is being finalized...", es: "El guión gráfico se está ultimando..." }),
    ],
    notesTitle: "Director's Notes",
    notes: [
      {
        title: "Cast Consistency Map",
        body:
          tx({ de: "Sobald das Storyboard steht, zeigt dir die Cast Consistency Map oben, in welcher Szene welcher Charakter auftaucht — und ob ein Reference-Image, ein Frame-Chain oder nur ein Prompt-Anker genutzt wird. Reference (grüner Punkt) gibt die stärkste visuelle Konsistenz über mehrere Shots.", en: "Once the storyboard is ready, the Cast Consistency Map above will show you which character appears in which scene — and whether a Reference-Image, a Frame-Chain, or just a Prompt-Anchor is used. Reference (green dot) provides the strongest visual consistency across multiple shots.", es: "Una vez que el storyboard esté listo, el Mapa de Consistencia del Elenco de arriba te mostrará qué personaje aparece en qué escena — y si se utiliza una Imagen de Referencia, una Cadena de Frames o solo un Ancla de Prompt. La Referencia (punto verde) proporciona la mayor consistencia visual en múltiples tomas." }),
      },
      {
        title: tx({ de: "Engine pro Szene", en: "engine per scene", es: "motor por escena" }),
        body:
          tx({ de: "Jede Szene kann ein eigenes KI-Modell nutzen — Hailuo für günstige Realfilm-Looks, Kling für komplexe Choreografien, Vidu Q2 wenn mehrere Charaktere im selben Frame sein sollen. Über „Engine für alle“ überschreibst du alle Szenen auf einen Schlag.", en: "Each scene can use its own AI model — Hailuo for affordable live-action looks, Kling for complex choreographies, Vidu Q2 if multiple characters are to be in the same frame. With “Engine for all” you overwrite all scenes at once.", es: "Cada escena puede usar su propio modelo de IA — Hailuo para looks de acción real asequibles, Kling para coreografías complejas, Vidu Q2 si varios personajes deben estar en el mismo encuadre. Con “Motor para todos” sobrescribes todas las escenas a la vez." }),
      },
      {
        title: "Frame-First Pipeline",
        body:
          tx({ de: "Statt dem KI-Modell das erste Bild blind zu überlassen, kannst du via „Frame-First“ ein Standbild der Szene mit Nano Banana 2 generieren und freigeben. Das gewählte Standbild wird als first frame in den Video-Render gegeben — deutlich konsistentere Ergebnisse.", en: "Instead of blindly leaving the first image to the AI model, you can generate and approve a still image of the scene via “Frame-First” with Nano Banana 2. The selected still image is given as the first frame in the video render — significantly more consistent results.", es: "En lugar de dejar ciegamente la primera imagen al modelo de IA, puedes generar y aprobar una imagen fija de la escena a través de “Frame-First” con Nano Banana 2. La imagen fija seleccionada se utiliza como el primer fotograma en la renderización del video — resultados significativamente más consistentes." }),
      },
      {
        title: "Talking-Head Modus",
        body:
          tx({ de: "Brauchst du einen sprechenden Charakter direkt in die Kamera? Talking-Head nutzt HeyGen Photo Avatar mit deinem Voice-Over und liefert in ~30s einen lippensynchronen Avatar-Take — perfekt für Hook und CTA.", en: "Do you need a talking character directly into the camera? Talking-Head uses HeyGen Photo Avatar with your voice-over and delivers a lip-synced avatar take in ~30s — perfect for hook and CTA.", es: "¿Necesitas un personaje que hable directamente a la cámara? Talking-Head utiliza HeyGen Photo Avatar con tu voz en off y entrega una toma de avatar sincronizada con los labios en ~30s — perfecto para el gancho y la CTA." }),
      },
      {
        title: "Director Score",
        body:
          tx({ de: "Jede Szene bekommt einen Director Score von 0–100. Werte ab 80 sind Render-ready, alles darunter zeigt dir konkret, was fehlt: zu langer Prompt, kein klares Outcome, fehlender Cast-Anker oder kollidierende Aktionen.", en: "Each scene gets a Director Score from 0–100. Values from 80 are render-ready, anything below shows you specifically what's missing: prompt too long, no clear outcome, missing cast anchor, or colliding actions.", es: "Cada escena obtiene una Puntuación de Director de 0 a 100. Los valores a partir de 80 están listos para renderizar, cualquier cosa por debajo te muestra específicamente lo que falta: prompt demasiado largo, sin resultado claro, ancla de elenco faltante o acciones en conflicto." }),
      },
      {
        title: "Cinematic-Sync Engine",
        body:
          tx({ de: "Bei sprechenden Szenen empfiehlt sich „Cinematic-Sync“ statt eines reinen Avatar-Busts: Hailuo rendert die echte Szene, Sync.so legt anschließend lippensynchron dein Voice-Over drauf. Kostet etwas mehr, sieht aber wie ein echter Shot aus.", en: "For talking scenes, “Cinematic-Sync” is recommended instead of a pure avatar bust: Hailuo renders the actual scene, then Sync.so overlays your voice-over lip-sync. Costs a bit more, but looks like a real shot.", es: "Para escenas habladas, se recomienda “Cinematic-Sync” en lugar de un busto de avatar puro: Hailuo renderiza la escena real, luego Sync.so superpone tu voz en off sincronizada con los labios. Cuesta un poco más, pero parece una toma real." }),
      },
      {
        title: "Continuity Guardian",
        body:
          tx({ de: "Zwischen zwei Szenen zeigt dir der Continuity Guardian, ob sich Outfit, Location oder Beleuchtung zu stark ändern. Ein Klick und du übernimmst den letzten Frame der vorherigen Szene als Start-Frame der nächsten — Cuts werden weicher.", en: "Between two scenes, the Continuity Guardian shows you if outfit, location, or lighting change too much. One click and you take the last frame of the previous scene as the start frame of the next — cuts become smoother.", es: "Entre dos escenas, el Continuity Guardian te muestra si el atuendo, la ubicación o la iluminación cambian demasiado. Un clic y tomas el último fotograma de la escena anterior como fotograma inicial de la siguiente, los cortes se vuelven más suaves." }),
      },
      {
        title: "Saved Outfit Looks",
        body:
          tx({ de: "Outfits, die du einmal komponiert hast, lassen sich pro Avatar speichern und über @-Mention in jeder beliebigen Szene wieder einsetzen. Das hält deine Brand-Charaktere visuell stabil über Wochen und Kampagnen hinweg.", en: "Outfits you've composed once can be saved per avatar and reused in any scene via @-mention. This keeps your brand characters visually stable across weeks and campaigns.", es: "Los atuendos que hayas compuesto una vez se pueden guardar por avatar y reutilizar en cualquier escena mediante una mención con @. Esto mantiene a tus personajes de marca visualmente estables durante semanas y campañas." }),
      },
    ],
    newsLabel: "AdTool News Radar · LIVE",
    footer: tx({ de: "Dauert in der Regel 10–20 Sekunden.", en: "Typically takes 10-20 seconds.", es: "Normalmente tarda entre 10 y 20 segundos." }),
    noNewsFallback: tx({ de: "News-Radar wird geladen…", en: "News radar is loading...", es: "El radar de noticias se está cargando..." }),
  },
  en: {
    eyebrow: "DIRECTOR AT WORK",
    title: "Building your storyboard",
    subtitle:
      "Script, cast and scenes are being composed — you don't have to wait, we'll notify you the moment it's ready.",
    phases: [
      "Analyzing briefing…",
      "Casting characters…",
      "Planning scene arcs…",
      "Writing scripts…",
      "Setting camera & look…",
      "Finalizing storyboard…",
    ],
    notesTitle: "Director's Notes",
    notes: [
      {
        title: "Cast Consistency Map",
        body:
          "Once the storyboard is ready, the Cast Consistency Map shows which character appears in which scene — and whether a reference image, frame-chain or prompt anchor is used. Reference (green dot) gives the strongest visual consistency across shots.",
      },
      {
        title: "Engine per scene",
        body:
          "Every scene can use its own AI model — Hailuo for affordable realistic looks, Kling for complex choreography, Vidu Q2 when multiple characters need to share a frame. Use „Engine for all“ to override every scene at once.",
      },
      {
        title: "Frame-First pipeline",
        body:
          "Instead of letting the AI model guess the first frame, generate a still with Nano Banana 2 and approve it. The chosen still becomes the first frame of the video render — far more consistent results.",
      },
      {
        title: "Talking-Head mode",
        body:
          "Need a character speaking directly to camera? Talking-Head uses HeyGen Photo Avatar with your voice-over and delivers a lip-synced avatar take in ~30s — perfect for hooks and CTAs.",
      },
      {
        title: "Director Score",
        body:
          "Each scene gets a Director Score from 0–100. Anything ≥80 is render-ready; below that you'll see exactly what's missing: prompt too long, no clear outcome, missing cast anchor or colliding actions.",
      },
      {
        title: "Cinematic-Sync engine",
        body:
          "For dialog scenes, prefer „Cinematic-Sync“ over a plain avatar bust: Hailuo renders the real scene, then Sync.so lip-syncs your voice-over on top. Costs a bit more, looks like a real shot.",
      },
      {
        title: "Continuity Guardian",
        body:
          "Between two scenes the Continuity Guardian warns when outfit, location or lighting drift too much. One click adopts the previous scene's last frame as the next scene's first frame — cuts get smoother.",
      },
      {
        title: "Saved outfit looks",
        body:
          "Outfits you composed once can be saved per avatar and reused via @-mention in any scene. Keeps your brand characters visually stable across weeks and campaigns.",
      },
    ],
    newsLabel: "AdTool News Radar · LIVE",
    footer: "Usually takes 10–20 seconds.",
    noNewsFallback: "Loading news radar…",
  },
  es: {
    eyebrow: "DIRECTOR EN ACCIÓN",
    title: "Construyendo tu storyboard",
    subtitle:
      "Guion, cast y escenas se están componiendo — no tienes que esperar, te avisaremos en cuanto esté listo.",
    phases: [
      "Analizando el briefing…",
      "Seleccionando el cast…",
      "Planificando los arcos de escena…",
      "Escribiendo los guiones…",
      "Definiendo cámara y look…",
      "Finalizando el storyboard…",
    ],
    notesTitle: "Notas del director",
    notes: [
      {
        title: "Cast Consistency Map",
        body:
          "Cuando el storyboard esté listo, el Cast Consistency Map muestra qué personaje aparece en qué escena — y si se usa imagen de referencia, frame-chain o solo un anclaje de prompt. Reference (punto verde) ofrece la mayor consistencia visual entre shots.",
      },
      {
        title: "Motor por escena",
        body:
          "Cada escena puede usar su propio modelo de IA — Hailuo para realismo asequible, Kling para coreografías complejas, Vidu Q2 cuando varios personajes deben compartir frame. Con „Motor para todos“ sobrescribes todas las escenas a la vez.",
      },
      {
        title: "Pipeline Frame-First",
        body:
          "En lugar de dejar que el modelo invente el primer frame, genera un still con Nano Banana 2 y apruébalo. El still elegido se usa como first frame del render — resultados mucho más consistentes.",
      },
      {
        title: "Modo Talking-Head",
        body:
          "¿Necesitas un personaje hablando a cámara? Talking-Head usa HeyGen Photo Avatar con tu locución y entrega un take con lip-sync en ~30s — ideal para hook y CTA.",
      },
      {
        title: "Director Score",
        body:
          "Cada escena recibe un Director Score de 0 a 100. Desde 80 está lista para renderizar; por debajo te indica qué falta: prompt muy largo, sin outcome claro, sin ancla de cast o acciones que chocan.",
      },
      {
        title: "Motor Cinematic-Sync",
        body:
          "Para escenas con diálogo, „Cinematic-Sync“ es mejor que un busto de avatar: Hailuo renderiza la escena real y Sync.so añade el lip-sync de tu voz encima. Cuesta un poco más, se ve como un shot real.",
      },
      {
        title: "Continuity Guardian",
        body:
          "Entre dos escenas, Continuity Guardian te avisa si vestuario, ubicación o iluminación cambian demasiado. Con un clic adoptas el último frame de la anterior como primer frame de la siguiente — cortes más suaves.",
      },
      {
        title: "Looks de vestuario guardados",
        body:
          "Los outfits que compones una vez se pueden guardar por avatar y reutilizar vía @-mention en cualquier escena. Mantiene tus brand characters visualmente estables durante semanas y campañas.",
      },
    ],
    newsLabel: "AdTool News Radar · LIVE",
    footer: "Suele tardar 10–20 segundos.",
    noNewsFallback: "Cargando news radar…",
  },
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

export default function StageStoryboardLoader() {
  const { language } = useTranslation();
  const lang: Lang = (["de", "en", "es"] as Lang[]).includes(language as Lang)
    ? (language as Lang)
    : "de";
  const copy = COPY[lang];

  const { news } = useNewsRadar();
  const reduced = usePrefersReducedMotion();

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [noteIdx, setNoteIdx] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => {
      setPhaseIdx((i) => (i + 1) % copy.phases.length);
    }, 2500);
    return () => window.clearInterval(t);
  }, [reduced, copy.phases.length]);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => {
      setNoteIdx((i) => (i + 1) % copy.notes.length);
    }, 6000);
    return () => window.clearInterval(t);
  }, [reduced, copy.notes.length]);

  const tickerItems = useMemo(() => {
    const items = (news ?? []).slice(0, 8);
    if (items.length === 0) {
      return [{ headline: copy.noNewsFallback, category: "", source: "AdTool AI" }];
    }
    return items;
  }, [news, copy.noNewsFallback]);

  // Duplicate items for seamless marquee loop
  const marqueeItems = useMemo(
    () => [...tickerItems, ...tickerItems],
    [tickerItems],
  );

  const note = copy.notes[noteIdx];

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{
        background:
          "radial-gradient(circle at 50% 0%, hsla(43,90%,68%,0.10) 0%, transparent 55%), linear-gradient(180deg, #0a0805 0%, #050816 100%)",
        boxShadow: `
          inset 0 1px 0 hsla(43,90%,82%,0.22),
          inset 0 0 0 1px hsla(43,90%,68%,0.18),
          0 0 0 1px hsla(43,90%,68%,0.26),
          0 32px 80px -28px hsla(43,90%,68%,0.35),
          0 12px 32px -14px hsla(0,0%,0%,0.7)
        `,
        minHeight: 560,
      }}
      aria-live="polite"
      aria-busy="true"
    >
      {/* Cinemascope top + bottom bars */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, hsla(0,0%,0%,0.9) 0%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(0deg, hsla(0,0%,0%,0.95) 0%, transparent 100%)",
        }}
      />

      {/* Faint film grain */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.7'/></svg>\")",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-6 gap-8">
        {/* Eyebrow */}
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "hsl(43,90%,68%)",
              boxShadow: "0 0 12px hsl(43 90% 68% / 0.9)",
              animation: reduced ? undefined : "pulse 1.6s ease-in-out infinite",
            }}
          />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.35em]"
            style={{ color: "hsl(43,90%,68%)" }}
          >
            {copy.eyebrow}
          </span>
        </div>

        {/* Title */}
        <h2
          className="font-display text-4xl md:text-5xl font-semibold leading-tight max-w-2xl"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "hsl(45 35% 92%)",
            textShadow: "0 0 24px hsla(43,90%,68%,0.25)",
          }}
        >
          {copy.title}
        </h2>

        <p
          className="text-sm md:text-[15px] leading-relaxed max-w-xl"
          style={{ color: "hsl(45 12% 70%)" }}
        >
          {copy.subtitle}
        </p>

        {/* Phase status */}
        <div className="w-full max-w-md flex flex-col items-center gap-3">
          <div
            key={phaseIdx}
            className="flex items-center gap-2.5 text-sm md:text-base font-medium"
            style={{
              color: "hsl(43 90% 78%)",
              animation: reduced ? undefined : "fade-in 0.5s ease-out",
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "hsl(43,90%,68%)" }} />
            <span>{copy.phases[phaseIdx]}</span>
          </div>

          {/* Indeterminate gold bar */}
          <div
            className="relative w-full h-[3px] overflow-hidden rounded-full"
            style={{ background: "hsla(43,90%,68%,0.12)" }}
          >
            <div
              className="absolute top-0 left-0 h-full"
              style={{
                width: "40%",
                background:
                  "linear-gradient(90deg, transparent, hsl(43,90%,68%), transparent)",
                animation: reduced
                  ? undefined
                  : "storyboardLoaderSweep 1.8s ease-in-out infinite",
              }}
            />
          </div>

          <p
            className="text-[11px] font-mono uppercase tracking-[0.25em]"
            style={{ color: "hsl(45 12% 55%)" }}
          >
            {copy.footer}
          </p>
        </div>

        {/* Director's Notes carousel */}
        <div
          className="w-full max-w-2xl rounded-xl px-6 py-5 text-left"
          style={{
            background:
              "linear-gradient(180deg, hsla(225,32%,12%,0.55) 0%, hsla(228,38%,6%,0.4) 100%)",
            border: "1px solid hsla(43,90%,68%,0.18)",
            boxShadow:
              "inset 0 1px 0 hsla(43,90%,82%,0.12), 0 12px 32px -16px hsla(0,0%,0%,0.6)",
            minHeight: 168,
          }}
        >
          <div
            className="flex items-center gap-2 mb-3 font-mono text-[10px] uppercase tracking-[0.35em]"
            style={{ color: "hsl(43,90%,68%)" }}
          >
            <span
              className="inline-block h-px w-6"
              style={{ background: "hsl(43,90%,68%)" }}
            />
            {copy.notesTitle}
          </div>
          <div
            key={noteIdx}
            style={{
              animation: reduced ? undefined : "fade-in 0.6s ease-out",
            }}
          >
            <h3
              className="font-display text-xl md:text-2xl font-semibold mb-2"
              style={{
                fontFamily: '"Playfair Display", serif',
                color: "hsl(45 35% 94%)",
              }}
            >
              {note.title}
            </h3>
            <p
              className="text-sm md:text-[15px] leading-relaxed"
              style={{ color: "hsl(45 12% 78%)" }}
            >
              {note.body}
            </p>
          </div>

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5 mt-4">
            {copy.notes.map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all"
                style={{
                  width: i === noteIdx ? 18 : 6,
                  background:
                    i === noteIdx
                      ? "hsl(43,90%,68%)"
                      : "hsla(43,90%,68%,0.25)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* News Radar marquee */}
      <div
        className="relative z-10 mt-2 border-t"
        style={{
          borderColor: "hsla(43,90%,68%,0.18)",
          background:
            "linear-gradient(180deg, hsla(228,38%,6%,0.5) 0%, hsla(0,0%,0%,0.7) 100%)",
        }}
      >
        <div className="flex items-stretch">
          <div
            className="flex items-center gap-2 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.3em] shrink-0 border-r"
            style={{
              color: "hsl(43,90%,68%)",
              borderColor: "hsla(43,90%,68%,0.18)",
              background: "hsla(0,0%,0%,0.5)",
            }}
          >
            <Radio
              className="h-3.5 w-3.5"
              style={{
                color: "hsl(43,90%,68%)",
                animation: reduced
                  ? undefined
                  : "pulse 1.6s ease-in-out infinite",
              }}
            />
            {copy.newsLabel}
          </div>
          <div className="relative flex-1 overflow-hidden">
            <div
              className="flex items-center gap-10 whitespace-nowrap py-3"
              style={{
                animation: reduced
                  ? undefined
                  : "storyboardLoaderMarquee 48s linear infinite",
                width: "max-content",
              }}
            >
              {marqueeItems.map((item, i) => (
                <span
                  key={i}
                  className="text-[12px] md:text-[13px] inline-flex items-center gap-2"
                  style={{ color: "hsl(45 18% 78%)" }}
                >
                  {item.category && (
                    <span
                      className="font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded"
                      style={{
                        color: "hsl(43,90%,68%)",
                        background: "hsla(43,90%,68%,0.12)",
                        border: "1px solid hsla(43,90%,68%,0.25)",
                      }}
                    >
                      {item.category}
                    </span>
                  )}
                  <span>{item.headline}</span>
                  <span style={{ color: "hsl(45 12% 50%)" }}>
                    — {item.source}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Local keyframes */}
      <style>{`
        @keyframes storyboardLoaderSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes storyboardLoaderMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
