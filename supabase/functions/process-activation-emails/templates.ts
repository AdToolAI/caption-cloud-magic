// AdTool Activation Drip Email Templates
// Branding: #0a0a0f BG, #F5C76A Gold, Inter

export type ActivationStage = "day_0" | "day_1" | "day_3" | "day_7";
export type Lang = "de" | "en" | "es";

interface ActivationInput {
  stage: ActivationStage;
  lang: Lang;
  appUrl: string;
  userEmail: string;
  displayName?: string;
  trialDaysRemaining?: number;
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

const stageCopy: Record<ActivationStage, Record<Lang, ActivationCopy>> = {
  day_0: {
    de: {
      subject: "Willkommen bei AdTool – dein 14-Tage Enterprise-Trial ist live 🚀",
      heading: "Willkommen an Bord 👋",
      intro:
        "Schön, dass du da bist! Du hast jetzt <strong>14 Tage Enterprise-Zugang</strong> – inkl. 5.000 Credits, KI-Video-Studio, Director's Cut und allen Premium-Features.",
      highlight: "14 Tage Enterprise – komplett gratis",
      cta: "Erstes KI-Video erstellen",
      ctaPath: "/ai-video-studio",
      footnote: "Tipp: Starte mit dem KI-Video-Studio für dein erstes Aha-Erlebnis.",
    },
    en: {
      subject: "Welcome to AdTool – your 14-day Enterprise trial is live 🚀",
      heading: "Welcome aboard 👋",
      intro:
        "Glad you're here! You now have <strong>14 days of Enterprise access</strong> – including 5,000 credits, AI Video Studio, Director's Cut, and all premium features.",
      highlight: "14 days Enterprise – completely free",
      cta: "Create your first AI video",
      ctaPath: "/ai-video-studio",
      footnote: "Tip: Start with AI Video Studio for your first aha moment.",
    },
    es: {
      subject: "Bienvenido a AdTool – tu prueba Enterprise de 14 días está activa 🚀",
      heading: "Bienvenido a bordo 👋",
      intro:
        "¡Nos alegra verte! Ahora tienes <strong>14 días de acceso Enterprise</strong> – con 5.000 créditos, AI Video Studio, Director's Cut y todas las funciones premium.",
      highlight: "14 días Enterprise – completamente gratis",
      cta: "Crear tu primer video IA",
      ctaPath: "/ai-video-studio",
      footnote: "Consejo: Empieza con el AI Video Studio para tu primer momento aha.",
    },
  },
  day_1: {
    de: {
      subject: "Brauchst du Hilfe beim Start? 🎬",
      heading: "Lass uns starten 🎬",
      intro:
        "Wir haben gesehen, dass du noch nichts erstellt hast. Kein Stress – in 3 Minuten hast du dein erstes KI-Video. Wir zeigen dir wie.",
      highlight: "3-Minuten Quickstart",
      cta: "Quickstart-Tour öffnen",
      ctaPath: "/home?tour=true",
      footnote: "Noch 13 Tage Enterprise-Trial verbleiben.",
    },
    en: {
      subject: "Need help getting started? 🎬",
      heading: "Let's get you rolling 🎬",
      intro:
        "We noticed you haven't created anything yet. No stress – your first AI video is just 3 minutes away. We'll show you how.",
      highlight: "3-minute quickstart",
      cta: "Open quickstart tour",
      ctaPath: "/home?tour=true",
      footnote: "13 days of Enterprise trial remaining.",
    },
    es: {
      subject: "¿Necesitas ayuda para empezar? 🎬",
      heading: "Empecemos 🎬",
      intro:
        "Vimos que aún no has creado nada. Sin estrés – tu primer video IA está a 3 minutos. Te mostramos cómo.",
      highlight: "Inicio rápido en 3 minutos",
      cta: "Abrir tour rápido",
      ctaPath: "/home?tour=true",
      footnote: "Quedan 13 días de prueba Enterprise.",
    },
  },
  day_3: {
    de: {
      subject: "Verbinde deine Social Accounts und automatisiere deine Posts 📲",
      heading: "Verbinde dein Social Setup 📲",
      intro:
        "Jetzt kommt der Game-Changer: Verbinde Instagram, TikTok oder LinkedIn und lass AdTool deine Posts automatisch zur besten Zeit veröffentlichen.",
      highlight: "Auto-Posting auf 5 Plattformen",
      cta: "Accounts verbinden",
      ctaPath: "/account?tab=integrations",
      footnote: "Noch 11 Tage Enterprise-Trial verbleiben.",
    },
    en: {
      subject: "Connect your socials and automate your posts 📲",
      heading: "Connect your social stack 📲",
      intro:
        "Here's the game-changer: connect Instagram, TikTok or LinkedIn and let AdTool auto-publish your posts at the best times.",
      highlight: "Auto-posting on 5 platforms",
      cta: "Connect accounts",
      ctaPath: "/account?tab=integrations",
      footnote: "11 days of Enterprise trial remaining.",
    },
    es: {
      subject: "Conecta tus redes y automatiza tus publicaciones 📲",
      heading: "Conecta tus redes 📲",
      intro:
        "Aquí viene el cambio de juego: conecta Instagram, TikTok o LinkedIn y deja que AdTool publique automáticamente en los mejores momentos.",
      highlight: "Auto-publicación en 5 plataformas",
      cta: "Conectar cuentas",
      ctaPath: "/account?tab=integrations",
      footnote: "Quedan 11 días de prueba Enterprise.",
    },
  },
  day_7: {
    de: {
      subject: "Halbzeit deines Enterprise-Trials – nutze deine Credits 🎯",
      heading: "Halbzeit erreicht 🎯",
      intro:
        "Du hast noch <strong>7 Tage</strong> Enterprise-Zugang. Falls du die Premium-Features noch nicht ausprobiert hast – jetzt ist die beste Zeit. Sora 2, Director's Cut und der KI-Video-Translator warten auf dich.",
      highlight: "7 Tage Premium – verbleibend",
      cta: "Premium-Features entdecken",
      ctaPath: "/home",
      footnote: "Nach Tag 14 wird dein Konto pausiert, falls du nicht abonnierst.",
    },
    en: {
      subject: "Halftime on your Enterprise trial – use your credits 🎯",
      heading: "Halftime reached 🎯",
      intro:
        "You have <strong>7 days</strong> of Enterprise access left. If you haven't tried the premium features yet – now is the perfect time. Sora 2, Director's Cut and the AI Video Translator are waiting.",
      highlight: "7 days premium – remaining",
      cta: "Explore premium features",
      ctaPath: "/home",
      footnote: "After day 14, your account will be paused unless you subscribe.",
    },
    es: {
      subject: "Mitad de tu prueba Enterprise – usa tus créditos 🎯",
      heading: "Mitad alcanzada 🎯",
      intro:
        "Te quedan <strong>7 días</strong> de acceso Enterprise. Si aún no has probado las funciones premium – ahora es el momento. Sora 2, Director's Cut y el AI Video Translator te esperan.",
      highlight: "7 días premium – restantes",
      cta: "Explorar funciones premium",
      ctaPath: "/home",
      footnote: "Después del día 14, tu cuenta se pausará si no te suscribes.",
    },
  },
};

const trialExpiredCopy: Record<Lang, { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: {
    subject: "Dein 14-Tage Enterprise-Trial ist abgelaufen 🔒",
    heading: "Dein Trial ist beendet",
    intro:
      "Dein 14-Tage Enterprise-Trial ist heute abgelaufen. Damit du wieder posten, generieren und veröffentlichen kannst, wähle jetzt einen Plan – schon ab €19/Monat.",
    cta: "Plan wählen & freischalten",
    footnote: "Deine Daten und Assets bleiben gespeichert. Du verlierst nichts.",
  },
  en: {
    subject: "Your 14-day Enterprise trial has ended 🔒",
    heading: "Your trial has ended",
    intro:
      "Your 14-day Enterprise trial expired today. To resume creating, generating and publishing, pick a plan – starting at €19/month.",
    cta: "Choose plan & unlock",
    footnote: "Your data and assets stay safe. Nothing is lost.",
  },
  es: {
    subject: "Tu prueba Enterprise de 14 días ha terminado 🔒",
    heading: "Tu prueba ha terminado",
    intro:
      "Tu prueba Enterprise de 14 días expiró hoy. Para seguir creando, generando y publicando, elige un plan – desde €19/mes.",
    cta: "Elegir plan y desbloquear",
    footnote: "Tus datos y assets siguen seguros. No pierdes nada.",
  },
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
`;

export function renderActivationEmail(input: ActivationInput): RenderOutput {
  const copy = stageCopy[input.stage][input.lang];
  const ctaUrl = `${input.appUrl.replace(/\/$/, "")}${copy.ctaPath}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}</style></head><body>
    <div class="wrap"><div class="card">
      <div class="logo">AdTool AI</div>
      <h1>${copy.heading}</h1>
      <p>${copy.intro}</p>
      <div class="pill">✨ ${copy.highlight}</div>
      <p style="margin-bottom:28px;"><a class="cta" href="${ctaUrl}">${copy.cta}</a></p>
      <p style="color:#8a8780;font-size:13px;border-top:1px solid rgba(255,255,255,0.05);padding-top:20px;">${copy.footnote}</p>
    </div>
    <div class="foot">AdTool AI · ${input.userEmail}</div>
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
