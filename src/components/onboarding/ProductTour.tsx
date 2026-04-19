import { useMemo } from "react";
import { Joyride, EVENTS, STATUS, type Step, type EventData } from "react-joyride";
import { useProductTour } from "@/hooks/useProductTour";
import { useTranslation } from "@/hooks/useTranslation";

const tourCopy: Record<
  string,
  {
    skip: string;
    next: string;
    back: string;
    last: string;
    steps: { title: string; content: string }[];
  }
> = {
  en: {
    skip: "Skip Tour",
    next: "Next",
    back: "Back",
    last: "Got it",
    steps: [
      {
        title: "Welcome to your command center 🎬",
        content:
          "These hub icons are your shortcut to every tool — Studios, Social, Calendar, Analytics. Hover any icon to see what's inside.",
      },
      {
        title: "Live news & trends",
        content:
          "Your dashboard surfaces real-time industry news and trending hooks so you always know what to post next.",
      },
      {
        title: "Make your first video in 90 seconds",
        content:
          "Use one of the personalized prompts here to generate your very first AI video with Hailuo 2.3. We even pre-fill the brief for you.",
      },
      {
        title: "Track your progress",
        content:
          "This checklist shows the 5 milestones to unlock the platform's full power. Click any open step to jump to that tool.",
      },
      {
        title: "Plan & publish on autopilot",
        content:
          "When your post is ready, schedule it in the Calendar and let auto-publishing handle the rest. You're all set!",
      },
    ],
  },
  de: {
    skip: "Tour überspringen",
    next: "Weiter",
    back: "Zurück",
    last: "Verstanden",
    steps: [
      {
        title: "Willkommen in deinem Command-Center 🎬",
        content:
          "Diese Hub-Icons sind dein Shortcut zu allen Tools — Studios, Social, Kalender, Analytics. Hover über jedes Icon, um zu sehen, was dahintersteckt.",
      },
      {
        title: "Live News & Trends",
        content:
          "Dein Dashboard zeigt dir Echtzeit-Branchen-News und virale Hooks — du weißt immer, was als nächstes zu posten ist.",
      },
      {
        title: "Erstes Video in 90 Sekunden",
        content:
          "Nutze einen der personalisierten Prompts hier, um dein erstes KI-Video mit Hailuo 2.3 zu erstellen. Der Brief ist bereits vorausgefüllt.",
      },
      {
        title: "Verfolge deinen Fortschritt",
        content:
          "Diese Checkliste zeigt die 5 Meilensteine, um die Plattform voll auszuschöpfen. Klicke einen offenen Schritt, um direkt zum passenden Tool zu springen.",
      },
      {
        title: "Plane & poste auf Autopilot",
        content:
          "Sobald dein Post fertig ist, plane ihn im Kalender — Auto-Publishing übernimmt den Rest. Du bist startklar!",
      },
    ],
  },
  es: {
    skip: "Saltar tour",
    next: "Siguiente",
    back: "Atrás",
    last: "Entendido",
    steps: [
      {
        title: "Bienvenido a tu centro de control 🎬",
        content:
          "Estos iconos son tu acceso directo a todas las herramientas: Studios, Social, Calendario, Analytics. Pasa el ratón sobre cada uno para descubrir qué hay dentro.",
      },
      {
        title: "Noticias y tendencias en vivo",
        content:
          "Tu dashboard muestra noticias del sector en tiempo real y hooks virales para que siempre sepas qué publicar.",
      },
      {
        title: "Tu primer video en 90 segundos",
        content:
          "Usa uno de los prompts personalizados para generar tu primer video con IA usando Hailuo 2.3. Ya está prerellenado.",
      },
      {
        title: "Sigue tu progreso",
        content:
          "Esta checklist muestra los 5 hitos para desbloquear todo el poder de la plataforma. Haz clic en cualquier paso abierto para ir directo a la herramienta.",
      },
      {
        title: "Planifica y publica en piloto automático",
        content:
          "Cuando tu post esté listo, prográmalo en el Calendario y la auto-publicación hará el resto. ¡Listo!",
      },
    ],
  },
};

export const ProductTour = () => {
  const { run, markCompleted, skipTour } = useProductTour();
  const { language } = useTranslation();
  const copy = tourCopy[language] || tourCopy.en;

  const steps: Step[] = useMemo(
    () => [
      {
        target: '[data-tour="sidebar-hubs"]',
        title: copy.steps[0].title,
        content: copy.steps[0].content,
        placement: "right",
        disableBeacon: true,
      },
      {
        target: '[data-tour="news-radar"]',
        title: copy.steps[1].title,
        content: copy.steps[1].content,
        placement: "bottom",
      },
      {
        target: '[data-tour="first-video-hero"]',
        title: copy.steps[2].title,
        content: copy.steps[2].content,
        placement: "bottom",
      },
      {
        target: '[data-tour="getting-started-checklist"]',
        title: copy.steps[3].title,
        content: copy.steps[3].content,
        placement: "right",
      },
      {
        target: '[data-tour="header-actions"]',
        title: copy.steps[4].title,
        content: copy.steps[4].content,
        placement: "bottom",
      },
    ],
    [copy]
  );

  const handleEvent = (data: EventData) => {
    const { type, status } = data;
    // Joyride v3: skipped tours emit STATUS.SKIPPED, finished emit STATUS.FINISHED
    if (type === EVENTS.TOUR_END || status === STATUS.FINISHED) {
      markCompleted();
      return;
    }
    if (status === STATUS.SKIPPED) {
      skipTour();
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: copy.back,
        close: copy.last,
        last: copy.last,
        next: copy.next,
        skip: copy.skip,
      }}
      styles={{
        options: {
          arrowColor: "hsl(240 14% 6%)",
          backgroundColor: "hsl(240 14% 6%)",
          primaryColor: "hsl(43 90% 68%)",
          textColor: "hsl(0 0% 98%)",
          overlayColor: "rgba(5, 8, 22, 0.75)",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 16,
          padding: 20,
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.6), 0 0 40px hsla(43, 90%, 68%, 0.25)",
          border: "1px solid hsla(43, 90%, 68%, 0.25)",
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 8,
          color: "hsl(43 90% 68%)",
        },
        tooltipContent: {
          fontSize: 13,
          lineHeight: 1.55,
          padding: "4px 0",
        },
        buttonNext: {
          backgroundColor: "hsl(43 90% 68%)",
          color: "hsl(240 14% 6%)",
          borderRadius: 10,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 0 20px hsla(43, 90%, 68%, 0.4)",
        },
        buttonBack: {
          color: "hsl(0 0% 70%)",
          fontSize: 12,
          marginRight: 8,
        },
        buttonSkip: {
          color: "hsl(0 0% 70%)",
          fontSize: 12,
        },
        buttonClose: {
          display: "none",
        },
        spotlight: {
          borderRadius: 14,
          boxShadow: "0 0 0 4px hsla(43, 90%, 68%, 0.35)",
        },
      }}
    />
  );
};
