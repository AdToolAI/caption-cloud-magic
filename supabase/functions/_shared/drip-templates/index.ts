// Drip email templates — inline HTML strings, localized DE/EN/ES
// James Bond 2028 visual style with white body for mail-client compatibility

type Lang = "de" | "en" | "es";

export interface DripTemplateData {
  firstName?: string;
  progressPercent: number;
  completedCount: number;
  totalCount: number;
  nextStepLabel: string;
  nextStepUrl: string;
  unsubscribeUrl: string;
  baseUrl: string;
}

const COPY: Record<
  1 | 3 | 7,
  Record<
    Lang,
    {
      subject: string;
      preheader: string;
      heading: string;
      intro: (d: DripTemplateData) => string;
      cta: string;
      footer: string;
      unsubscribe: string;
    }
  >
> = {
  1: {
    de: {
      subject: "Dein erstes Video wartet 🎬",
      preheader: "Starte jetzt mit deinem ersten KI-Video — in 2 Minuten erstellt.",
      heading: "Willkommen bei AdTool",
      intro: () =>
        "Schön, dass du da bist. Dein erstes KI-Video ist nur einen Klick entfernt — wir haben alles vorbereitet, du musst nur noch dein Thema eingeben.",
      cta: "Jetzt erstes Video erstellen",
      footer: "Wir freuen uns, dich auf deiner Content-Reise zu begleiten.",
      unsubscribe: "E-Mail-Erinnerungen abbestellen",
    },
    en: {
      subject: "Your first video is waiting 🎬",
      preheader: "Create your first AI-generated video in 2 minutes.",
      heading: "Welcome to AdTool",
      intro: () =>
        "Glad you're here. Your first AI-generated video is just one click away — we prepared everything, you only need to enter your topic.",
      cta: "Create your first video",
      footer: "We're excited to support you on your content journey.",
      unsubscribe: "Unsubscribe from email reminders",
    },
    es: {
      subject: "Tu primer video te espera 🎬",
      preheader: "Crea tu primer video con IA en 2 minutos.",
      heading: "Bienvenido a AdTool",
      intro: () =>
        "Nos alegra tenerte aquí. Tu primer video con IA está a un clic — preparamos todo, solo necesitas ingresar tu tema.",
      cta: "Crear mi primer video",
      footer: "Estamos emocionados de acompañarte en tu camino de contenido.",
      unsubscribe: "Darse de baja de los recordatorios",
    },
  },
  3: {
    de: {
      subject: "Du bist auf einem guten Weg",
      preheader: "Noch ein paar Schritte bis zu deinem Setup.",
      heading: "Dein Onboarding-Fortschritt",
      intro: (d) =>
        `Du hast bereits <strong>${d.completedCount} von ${d.totalCount} Schritten</strong> erledigt — stark! Mach jetzt den nächsten, um das volle Potenzial freizuschalten.`,
      cta: "Nächsten Schritt machen",
      footer: "Brauchst du Hilfe? Antworte einfach auf diese E-Mail.",
      unsubscribe: "E-Mail-Erinnerungen abbestellen",
    },
    en: {
      subject: "You're making great progress",
      preheader: "Just a few more steps to complete your setup.",
      heading: "Your onboarding progress",
      intro: (d) =>
        `You already completed <strong>${d.completedCount} of ${d.totalCount} steps</strong> — well done! Take the next one to unlock the full potential.`,
      cta: "Continue setup",
      footer: "Need help? Just reply to this email.",
      unsubscribe: "Unsubscribe from email reminders",
    },
    es: {
      subject: "Vas por buen camino",
      preheader: "Solo faltan unos pasos para completar tu configuración.",
      heading: "Tu progreso de incorporación",
      intro: (d) =>
        `Ya completaste <strong>${d.completedCount} de ${d.totalCount} pasos</strong> — ¡bien hecho! Da el siguiente para desbloquear todo el potencial.`,
      cta: "Continuar configuración",
      footer: "¿Necesitas ayuda? Responde a este correo.",
      unsubscribe: "Darse de baja de los recordatorios",
    },
  },
  7: {
    de: {
      subject: "Letzte Erinnerung — verpass nicht deinen Start",
      preheader: "Eine Woche ist um. Lass uns gemeinsam loslegen.",
      heading: "Bereit, durchzustarten?",
      intro: (d) =>
        `Du hast <strong>${d.completedCount} von ${d.totalCount} Schritten</strong> abgeschlossen. Schließe das Setup heute ab und nutze AdTool zu 100 %.`,
      cta: "Jetzt fertigstellen",
      footer: "Das ist die letzte Erinnerung dieser Art — versprochen.",
      unsubscribe: "E-Mail-Erinnerungen abbestellen",
    },
    en: {
      subject: "Last reminder — don't miss your start",
      preheader: "One week in. Let's get you going.",
      heading: "Ready to take off?",
      intro: (d) =>
        `You completed <strong>${d.completedCount} of ${d.totalCount} steps</strong>. Finish your setup today and unlock the full power of AdTool.`,
      cta: "Finish setup now",
      footer: "This is the final reminder of this kind — promise.",
      unsubscribe: "Unsubscribe from email reminders",
    },
    es: {
      subject: "Último recordatorio — no te pierdas tu inicio",
      preheader: "Ha pasado una semana. Pongámonos en marcha.",
      heading: "¿Listo para despegar?",
      intro: (d) =>
        `Completaste <strong>${d.completedCount} de ${d.totalCount} pasos</strong>. Termina tu configuración hoy y aprovecha todo AdTool.`,
      cta: "Terminar configuración",
      footer: "Este es el último recordatorio de este tipo — lo prometemos.",
      unsubscribe: "Darse de baja de los recordatorios",
    },
  },
};

const GOLD = "#F5C76A";
const DARK = "#050816";
const TEXT = "#1f2937";
const MUTED = "#6b7280";

function progressBar(percent: number): string {
  const pct = Math.max(0, Math.min(100, percent));
  return `
    <div style="background:#e5e7eb;border-radius:999px;height:10px;width:100%;overflow:hidden;margin:16px 0 24px;">
      <div style="background:linear-gradient(90deg,${GOLD},#e0a94f);height:10px;width:${pct}%;border-radius:999px;"></div>
    </div>
    <p style="color:${MUTED};font-size:13px;margin:0 0 24px;">${pct}% abgeschlossen</p>
  `;
}

export function renderDripEmail(
  step: 1 | 3 | 7,
  lang: Lang,
  data: DripTemplateData
): { subject: string; html: string; text: string } {
  const c = COPY[step][lang] ?? COPY[step].en;
  const greeting = data.firstName
    ? lang === "de"
      ? `Hallo ${data.firstName},`
      : lang === "es"
      ? `Hola ${data.firstName},`
      : `Hi ${data.firstName},`
    : lang === "de"
    ? "Hallo,"
    : lang === "es"
    ? "Hola,"
    : "Hi,";

  const showProgress = step !== 1;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT};">
<div style="display:none;max-height:0;overflow:hidden;">${c.preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(5,8,22,0.08);">
      <tr><td style="background:${DARK};padding:28px 32px;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:${GOLD};letter-spacing:0.5px;">AdTool</div>
      </td></tr>
      <tr><td style="padding:36px 32px 16px;">
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${DARK};font-family:Georgia,serif;">${c.heading}</h1>
        <p style="margin:0 0 24px;color:${MUTED};font-size:14px;">${greeting}</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${TEXT};">${c.intro(data)}</p>
        ${showProgress ? progressBar(data.progressPercent) : ""}
        <p style="margin:0 0 8px;font-size:14px;color:${MUTED};">${
    lang === "de" ? "Nächster Schritt:" : lang === "es" ? "Siguiente paso:" : "Next step:"
  }</p>
        <p style="margin:0 0 28px;font-size:16px;font-weight:600;color:${DARK};">${data.nextStepLabel}</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td style="border-radius:10px;background:${DARK};">
            <a href="${data.nextStepUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${GOLD};text-decoration:none;border-radius:10px;border:1px solid ${GOLD};">${c.cta} →</a>
          </td></tr>
        </table>
        <p style="margin:32px 0 0;font-size:14px;line-height:1.6;color:${MUTED};">${c.footer}</p>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0 0 8px;font-size:12px;color:${MUTED};">
          <a href="${data.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">${c.unsubscribe}</a>
        </p>
        <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} AdTool · <a href="${data.baseUrl}" style="color:#9ca3af;text-decoration:none;">useadtool.ai</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = `${c.heading}

${greeting}

${c.intro(data).replace(/<[^>]+>/g, "")}

${showProgress ? `${data.progressPercent}% complete (${data.completedCount}/${data.totalCount})\n\n` : ""}${
    lang === "de" ? "Nächster Schritt" : lang === "es" ? "Siguiente paso" : "Next step"
  }: ${data.nextStepLabel}
${data.nextStepUrl}

${c.footer}

—
${c.unsubscribe}: ${data.unsubscribeUrl}
`;

  return { subject: c.subject, html, text };
}

export function isSupportedLang(l: string | null | undefined): Lang {
  if (l === "de" || l === "es") return l;
  return "en";
}
