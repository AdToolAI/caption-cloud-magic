// AdTool / Studio Activation Email Templates
// Branding: #0a0a0f BG, #F5C76A Gold, Inter
// Positioning: "Ein Creator. Ein ganzes Studio."

export type ActivationStage =
  | "day_0"
  | "day_2"
  | "day_5"
  | "day_5_series"
  | "day_9"
  | "day_13";
export type Lang = "de" | "en" | "es";

interface ActivationInput {
  stage: ActivationStage;
  lang: Lang;
  appUrl: string;
  userEmail: string;
  displayName?: string;
  trialDaysRemaining?: number;
  unsubscribeUrl?: string;
}

interface RenderOutput {
  subject: string;
  html: string;
}

interface ActivationCopy {
  subject: string;
  heading: string;
  intro: string;
  highlight: string;
  cta: string;
  ctaPath: string;
  footnote: string;
}

// Single destination for every activation CTA: the first production entry point.
const FIRST_PRODUCTION_PATH = "/autopilot?firstProduction=1";

const stageCopy: Record<ActivationStage, Record<Lang, ActivationCopy>> = {
  day_0: {
    de: {
      subject: "Dein Studio ist offen",
      heading: "Dein Studio ist offen",
      intro:
        "Ein Creator. Ein ganzes Studio. Ab jetzt übernimmst du Regie – Skript, Stimme, Charaktere und Schnitt laufen bei dir zusammen. Der schnellste Weg zum ersten Ergebnis: eine Produktion starten und zusehen.",
      highlight: "Erste Produktion in wenigen Minuten",
      cta: "Erste Produktion starten",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Diese Mail bekommst du einmalig zum Studio-Einzug.",
    },
    en: {
      subject: "Your studio is open",
      heading: "Your studio is open",
      intro:
        "One creator. A whole studio. From now on you direct – script, voice, characters and edit all come together in one place. The fastest path to a first result: start one production and watch it build.",
      highlight: "First production in minutes",
      cta: "Start your first production",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "You receive this email once, when your studio opens.",
    },
    es: {
      subject: "Tu estudio está abierto",
      heading: "Tu estudio está abierto",
      intro:
        "Un creador. Un estudio entero. A partir de ahora tú diriges: guion, voz, personajes y montaje en un solo lugar. El camino más rápido a tu primer resultado: iniciar una producción y verla construirse.",
      highlight: "Primera producción en minutos",
      cta: "Iniciar tu primera producción",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Recibes este correo una sola vez, al abrir tu estudio.",
    },
  },
  day_2: {
    de: {
      subject: "Eine Vorlage für deine Nische",
      heading: "Eine Vorlage, ein Ergebnis",
      intro:
        "Du hast noch keinen fertigen Clip. Das ist normal – der Einstieg ist leichter mit einer konkreten Vorlage. Wir haben eine passend zu deiner Nische vorbereitet: Briefing, Szenen und Sprecher sind gesetzt, du musst nur noch starten.",
      highlight: "Vorbereitetes Briefing für deine Nische",
      cta: "Vorlage im Studio öffnen",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Sobald dein erster Clip fertig ist, hört diese Strecke auf.",
    },
    en: {
      subject: "A template for your niche",
      heading: "One template, one result",
      intro:
        "You don't have a finished clip yet. That's normal – starting is easier with a concrete template. We prepared one for your niche: briefing, scenes and speakers are set, you only need to press start.",
      highlight: "Prepared briefing for your niche",
      cta: "Open the template in your studio",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Once your first clip is done, this sequence stops.",
    },
    es: {
      subject: "Una plantilla para tu nicho",
      heading: "Una plantilla, un resultado",
      intro:
        "Todavía no tienes un clip terminado. Es normal: empezar es más fácil con una plantilla concreta. Preparamos una para tu nicho: briefing, escenas y voces ya están listos, solo tienes que empezar.",
      highlight: "Briefing preparado para tu nicho",
      cta: "Abrir la plantilla en tu estudio",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "En cuanto tengas tu primer clip, esta secuencia se detiene.",
    },
  },
  day_5: {
    de: {
      subject: "Der Autopilot schreibt dein Skript",
      heading: "Zweiter Weg hinein",
      intro:
        "Wenn das leere Briefing der Grund ist, warum noch nichts fertig ist: Der Autopilot übernimmt Idee, Skript und Szenenaufbau. Du sagst nur, worum es geht – den Rest baut das Studio.",
      highlight: "Idee rein, fertiger Clip raus",
      cta: "Autopilot starten",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Kein Skript nötig – ein Satz reicht als Ausgangspunkt.",
    },
    en: {
      subject: "Autopilot writes your script",
      heading: "A second way in",
      intro:
        "If the blank briefing is what's holding you back: Autopilot takes over idea, script and scene structure. You say what it's about – the studio builds the rest.",
      highlight: "Idea in, finished clip out",
      cta: "Start Autopilot",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "No script needed – one sentence is enough to start.",
    },
    es: {
      subject: "El Autopilot escribe tu guion",
      heading: "Una segunda vía",
      intro:
        "Si el briefing en blanco es lo que te frena: el Autopilot se encarga de la idea, el guion y la estructura de escenas. Tú dices de qué va, el estudio construye lo demás.",
      highlight: "Una idea entra, un clip sale",
      cta: "Iniciar Autopilot",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "No hace falta guion: una frase basta para empezar.",
    },
  },
  day_5_series: {
    de: {
      subject: "Aus einem Clip wird eine Serie",
      heading: "Aus einem Clip wird eine Serie",
      intro:
        "Dein erster Clip steht – das ist der schwierige Teil. Der Rest ist Wiederholung: gleiche Charaktere, gleicher Look, neues Thema. Genau dafür sind Cast & World gedacht, damit dein Kanal wiedererkennbar bleibt.",
      highlight: "Gleicher Cast, neue Folge",
      cta: "Nächste Folge produzieren",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Das ist die letzte Mail dieser Strecke an dich.",
    },
    en: {
      subject: "Turn one clip into a series",
      heading: "Turn one clip into a series",
      intro:
        "Your first clip is done – that was the hard part. The rest is repetition: same characters, same look, new topic. That's exactly what Cast & World is for, so your channel stays recognisable.",
      highlight: "Same cast, next episode",
      cta: "Produce the next episode",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "This is the last email of this sequence for you.",
    },
    es: {
      subject: "Convierte un clip en una serie",
      heading: "Convierte un clip en una serie",
      intro:
        "Tu primer clip está listo: esa era la parte difícil. El resto es repetición: mismos personajes, mismo estilo, nuevo tema. Para eso está Cast & World, para que tu canal se reconozca al instante.",
      highlight: "Mismo reparto, siguiente episodio",
      cta: "Producir el siguiente episodio",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Este es el último correo de esta secuencia para ti.",
    },
  },
  day_9: {
    de: {
      subject: "Woran hakt es gerade?",
      heading: "Woran hakt es gerade?",
      intro:
        "Dein Studio steht bereit, aber es war eine Weile still. Falls etwas nicht funktioniert hat oder eine Frage offen ist: Antworte einfach auf diese Mail – ein Mensch liest mit. Wenn du direkt weitermachen willst, geht es hier weiter.",
      highlight: "Antworte einfach – wir helfen",
      cta: "Zurück ins Studio",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Kein Verkauf, nur ein Angebot zu helfen.",
    },
    en: {
      subject: "What's blocking you?",
      heading: "What's blocking you?",
      intro:
        "Your studio is ready, but it's been quiet for a while. If something didn't work or a question is open: just reply to this email – a human reads it. If you'd rather continue right away, pick up here.",
      highlight: "Just reply – we'll help",
      cta: "Back to your studio",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "No pitch, just an offer to help.",
    },
    es: {
      subject: "¿Qué te está frenando?",
      heading: "¿Qué te está frenando?",
      intro:
        "Tu estudio está listo, pero lleva un tiempo en silencio. Si algo no funcionó o tienes una duda: responde a este correo, lo lee una persona. Y si prefieres seguir ahora mismo, continúa aquí.",
      highlight: "Responde y te ayudamos",
      cta: "Volver a tu estudio",
      ctaPath: FIRST_PRODUCTION_PATH,
      footnote: "Sin venta, solo una oferta de ayuda.",
    },
  },
  day_13: {
    de: {
      subject: "Dein Test endet morgen",
      heading: "Dein Test endet morgen",
      intro:
        "Morgen endet dein Testzeitraum. Wenn du weiter produzieren willst, läuft dein Studio für <strong>14,99 € im Monat</strong> weiter – mit allem, was du bisher aufgebaut hast: Charaktere, Stimmen, Look und Projekte bleiben erhalten.",
      highlight: "Weiter für 14,99 € / Monat",
      cta: "Studio behalten",
      ctaPath: "/pricing",
      footnote: "Ohne Verlängerung bleiben deine Daten gespeichert, die Produktion pausiert.",
    },
    en: {
      subject: "Your trial ends tomorrow",
      heading: "Your trial ends tomorrow",
      intro:
        "Your trial ends tomorrow. If you want to keep producing, your studio continues for <strong>€14.99 per month</strong> – with everything you built so far: characters, voices, look and projects all stay.",
      highlight: "Continue for €14.99 / month",
      cta: "Keep your studio",
      ctaPath: "/pricing",
      footnote: "Without renewal your data stays stored, production pauses.",
    },
    es: {
      subject: "Tu prueba termina mañana",
      heading: "Tu prueba termina mañana",
      intro:
        "Tu prueba termina mañana. Si quieres seguir produciendo, tu estudio continúa por <strong>14,99 € al mes</strong>, con todo lo que has construido: personajes, voces, estilo y proyectos se mantienen.",
      highlight: "Continúa por 14,99 € / mes",
      cta: "Conservar tu estudio",
      ctaPath: "/pricing",
      footnote: "Sin renovación tus datos se conservan y la producción se pausa.",
    },
  },
};

const trialExpiredCopy: Record<Lang, { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: {
    subject: "Dein Testzeitraum ist beendet",
    heading: "Dein Testzeitraum ist beendet",
    intro:
      "Dein Testzeitraum ist heute abgelaufen. Damit du weiter produzieren kannst, wähle einen Plan – dein Studio läuft ab 14,99 € im Monat weiter.",
    cta: "Studio weiterführen",
    footnote: "Deine Daten und Assets bleiben gespeichert. Du verlierst nichts.",
  },
  en: {
    subject: "Your trial has ended",
    heading: "Your trial has ended",
    intro:
      "Your trial expired today. To keep producing, pick a plan – your studio continues from €14.99 per month.",
    cta: "Continue your studio",
    footnote: "Your data and assets stay safe. Nothing is lost.",
  },
  es: {
    subject: "Tu prueba ha terminado",
    heading: "Tu prueba ha terminado",
    intro:
      "Tu prueba expiró hoy. Para seguir produciendo, elige un plan: tu estudio continúa desde 14,99 € al mes.",
    cta: "Continuar tu estudio",
    footnote: "Tus datos y assets siguen seguros. No pierdes nada.",
  },
};

const unsubscribeLabel: Record<Lang, string> = {
  de: "Keine Studio-Impulse mehr erhalten",
  en: "Stop receiving studio nudges",
  es: "Dejar de recibir estos correos",
};

const baseStyles = `
  body { margin:0; padding:0; background:#0a0a0f; font-family: 'Inter', -apple-system, sans-serif; color:#e8e6e1; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 24px; }
  .card { background:linear-gradient(180deg,#15151f 0%,#0e0e16 100%); border:1px solid rgba(245,199,106,0.15); border-radius:16px; padding:36px 28px; }
  .logo { color:#F5C76A; font-weight:700; font-size:20px; letter-spacing:0.5px; margin-bottom:24px; }
  h1 { color:#fff; font-size:26px; font-weight:700; margin:0 0 16px; line-height:1.3; }
  p { color:#cfcdc7; font-size:15px; line-height:1.65; margin:0 0 18px; }
  .pill { display:inline-block; background:rgba(245,199,106,0.12); border:1px solid rgba(245,199,106,0.4); color:#F5C76A; padding:8px 14px; border-radius:999px; font-size:13px; font-weight:600; margin:8px 0 24px; }
  .cta { display:inline-block; background:linear-gradient(135deg,#F5C76A,#e0a847); color:#0a0a0f !important; text-decoration:none; padding:14px 28px; border-radius:12px; font-weight:700; font-size:15px; box-shadow:0 8px 24px rgba(245,199,106,0.25); }
  .foot { color:#7a7770; font-size:12px; margin-top:32px; text-align:center; }
  .foot a { color:#7a7770; }
`;

export function renderActivationEmail(input: ActivationInput): RenderOutput {
  const copy = stageCopy[input.stage][input.lang];
  const base = input.appUrl.replace(/\/$/, "");
  const ctaUrl = `${base}${copy.ctaPath}`;
  const unsubscribe = input.unsubscribeUrl
    ? `<div style="margin-top:8px;"><a href="${input.unsubscribeUrl}">${unsubscribeLabel[input.lang]}</a></div>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}</style></head><body>
    <div class="wrap"><div class="card">
      <div class="logo">AdTool AI</div>
      <h1>${copy.heading}</h1>
      <p>${copy.intro}</p>
      <div class="pill">${copy.highlight}</div>
      <p style="margin-bottom:28px;"><a class="cta" href="${ctaUrl}">${copy.cta}</a></p>
      <p style="color:#8a8780;font-size:13px;border-top:1px solid rgba(255,255,255,0.05);padding-top:20px;">${copy.footnote}</p>
    </div>
    <div class="foot">AdTool AI · ${input.userEmail}${unsubscribe}</div>
    </div></body></html>`;
  return { subject: copy.subject, html };
}

export function renderTrialExpiredEmail(input: { lang: Lang; appUrl: string; userEmail: string }): RenderOutput {
  const copy = trialExpiredCopy[input.lang];
  const ctaUrl = `${input.appUrl.replace(/\/$/, "")}/pricing?reactivate=1`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}</style></head><body>
    <div class="wrap"><div class="card">
      <div class="logo">AdTool AI</div>
      <h1>${copy.heading}</h1>
      <p>${copy.intro}</p>
      <p style="margin:28px 0;"><a class="cta" href="${ctaUrl}">${copy.cta}</a></p>
      <p style="color:#8a8780;font-size:13px;border-top:1px solid rgba(255,255,255,0.05);padding-top:20px;">${copy.footnote}</p>
    </div>
    <div class="foot">AdTool AI · ${input.userEmail}</div>
    </div></body></html>`;
  return { subject: copy.subject, html };
}
