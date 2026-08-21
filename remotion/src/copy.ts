export type Lang = "en" | "de";

type SceneCopy = { kicker: string; headline: string; note: string };

export const COPY: Record<
  Lang,
  {
    titleKicker: string;
    titleLine1: string;
    titleLine2: string;
    titleSub: string;
    scenes: Record<
      "home" | "text" | "motion" | "video" | "library" | "calendar" | "analytics",
      SceneCopy
    >;
    subtitles: string[];
  }
> = {
  en: {
    titleKicker: "AdTool AI",
    titleLine1: "One creator.",
    titleLine2: "A whole studio.",
    titleSub: "Idea → script → video → publishing",
    scenes: {
      home: {
        kicker: "Six studios · one login",
        headline: "Every model. One workflow.",
        note: "Video, image, voice, music and cast — under one roof.",
      },
      text: {
        kicker: "AI Text Studio",
        headline: "Copy that sounds like you.",
        note: "Premium reasoning models in three quality tiers.",
      },
      motion: {
        kicker: "Motion Studio",
        headline: "Your director's cockpit.",
        note: "Cast → location → storyboard → render.",
      },
      video: {
        kicker: "AI Video Studio",
        headline: "Seedance, Veo, Kling — one prompt bar.",
        note: "Switch engines without leaving the canvas.",
      },
      library: {
        kicker: "Cast & World",
        headline: "Characters that stay consistent.",
        note: "Persistent identity across every scene.",
      },
      calendar: {
        kicker: "Command Center",
        headline: "Plan, schedule, publish.",
        note: "Every platform from a single calendar.",
      },
      analytics: {
        kicker: "Analytics",
        headline: "See what actually performs.",
        note: "Reach, engagement and top content in one view.",
      },
    },
    subtitles: [
      "One creator. A whole studio.",
      "AdTool AI brings every leading AI model into one continuous workflow.",
      "Write campaign copy with premium reasoning models.",
      "Direct cinematic video in Motion Studio — cast, location, storyboard, render.",
      "Build a consistent cast that stays recognizable in every scene.",
      "Schedule and publish across every platform from one command center.",
      "Then measure what actually performs.",
      "AdTool AI. Your whole studio, in one place.",
    ],
  },
  de: {
    titleKicker: "AdTool AI",
    titleLine1: "Ein Creator.",
    titleLine2: "Ein ganzes Studio.",
    titleSub: "Idee → Skript → Video → Publishing",
    scenes: {
      home: {
        kicker: "Sechs Studios · ein Login",
        headline: "Alle Modelle. Ein Workflow.",
        note: "Video, Bild, Stimme, Musik und Cast — unter einem Dach.",
      },
      text: {
        kicker: "AI Text Studio",
        headline: "Texte, die nach dir klingen.",
        note: "Premium-Reasoning-Modelle in drei Qualitätsstufen.",
      },
      motion: {
        kicker: "Motion Studio",
        headline: "Dein Regie-Cockpit.",
        note: "Cast → Location → Storyboard → Render.",
      },
      video: {
        kicker: "AI Video Studio",
        headline: "Seedance, Veo, Kling — eine Promptzeile.",
        note: "Engine wechseln, ohne das Canvas zu verlassen.",
      },
      library: {
        kicker: "Cast & World",
        headline: "Figuren, die konsistent bleiben.",
        note: "Feste Identität in jeder Szene.",
      },
      calendar: {
        kicker: "Command Center",
        headline: "Planen, timen, veröffentlichen.",
        note: "Alle Plattformen aus einem Kalender.",
      },
      analytics: {
        kicker: "Analytics",
        headline: "Sehen, was wirklich performt.",
        note: "Reichweite, Engagement und Top-Content auf einen Blick.",
      },
    },
    subtitles: [
      "Ein Creator. Ein ganzes Studio.",
      "AdTool AI bringt alle führenden KI-Modelle in einen durchgängigen Workflow.",
      "Schreibe Kampagnentexte mit Premium-Reasoning-Modellen.",
      "Inszeniere Video im Motion Studio — Cast, Location, Storyboard, Render.",
      "Baue einen Cast, der in jeder Szene wiedererkennbar bleibt.",
      "Plane und veröffentliche alle Plattformen aus einem Command Center.",
      "Und miss, was wirklich performt.",
      "AdTool AI. Dein ganzes Studio an einem Ort.",
    ],
  },
};
