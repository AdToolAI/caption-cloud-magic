// AdTool Win-Back Email Templates (DE/EN/ES x Day-14/Day-30)
// Branding: #0a0a0f BG, #F5C76A Gold, Inter

export type Stage = "day_14" | "day_30";
export type Lang = "de" | "en" | "es";

interface RenderInput {
  stage: Stage;
  lang: Lang;
  appUrl: string;
  couponCode: string;
  rewardUsd: number;
  userEmail: string;
  displayName?: string;
}

interface RenderOutput {
  subject: string;
  html: string;
  ctaUrl: string;
  pushTitle: string;
  pushBody: string;
}

interface Copy {
  subject: string;
  hello: string;
  heading: string;
  intro: string;
  highlight: string;
  cta: string;
  footnote: string;
  signoff: string;
  pushTitle: string;
  pushBody: string;
  couponLine?: string;
  expiryNote: string;
}

const day14Copy: Record<Lang, Copy> = {
  de: {
    subject: "Wir vermissen dich – $5 für deinen nächsten KI-Clip 🎬",
    hello: "Hi",
    heading: "Wir vermissen dich 💛",
    intro:
      "Du warst eine Weile nicht mehr in AdTool. Damit dein Comeback richtig knallt, haben wir dir <strong>$5 AI-Video-Credits</strong> aufs Konto gelegt – einsatzbereit für deinen nächsten Clip.",
    highlight: "$5 KI-Video-Credits geschenkt",
    cta: "Jetzt KI-Video erstellen",
    footnote: "Die Credits sind sofort in deinem Wallet verfügbar.",
    signoff: "Bis gleich,<br/>Dein AdTool-Team",
    pushTitle: "Wir vermissen dich 💛",
    pushBody: "$5 AI-Video-Credits warten auf dich.",
    expiryNote: "",
  },
  en: {
    subject: "We miss you – $5 for your next AI clip 🎬",
    hello: "Hi",
    heading: "We miss you 💛",
    intro:
      "It's been a while since you stopped by AdTool. To make your comeback memorable, we've credited <strong>$5 in AI video credits</strong> to your account – ready for your next clip.",
    highlight: "$5 AI video credits — on us",
    cta: "Create an AI video now",
    footnote: "Credits are already available in your wallet.",
    signoff: "See you soon,<br/>The AdTool Team",
    pushTitle: "We miss you 💛",
    pushBody: "$5 AI video credits are waiting.",
    expiryNote: "",
  },
  es: {
    subject: "Te extrañamos – $5 para tu próximo clip con IA 🎬",
    hello: "Hola",
    heading: "Te extrañamos 💛",
    intro:
      "Hace tiempo que no te vemos por AdTool. Para celebrar tu regreso, te hemos regalado <strong>$5 en créditos de video IA</strong> – listos para tu próximo clip.",
    highlight: "$5 en créditos de video IA gratis",
    cta: "Crear un video con IA",
    footnote: "Los créditos ya están disponibles en tu cartera.",
    signoff: "Hasta pronto,<br/>El equipo de AdTool",
    pushTitle: "Te extrañamos 💛",
    pushBody: "$5 en créditos de video IA te esperan.",
    expiryNote: "",
  },
};

const day30Copy: Record<Lang, Copy> = {
  de: {
    subject: "Letzte Chance: 20% Rabatt für 3 Monate 🎁",
    hello: "Hi",
    heading: "Letzte Chance 🎁",
    intro:
      "Du hast AdTool eine Weile nicht genutzt – und wir möchten dir den Wiedereinstieg leicht machen. Sichere dir jetzt <strong>20% Rabatt auf 3 Monate</strong> mit deinem persönlichen Code:",
    highlight: "20% Rabatt – 3 Monate lang",
    cta: "Rabatt einlösen",
    footnote:
      "Gib den Code an der Kasse ein oder klicke auf den Button – er wird automatisch angewendet.",
    signoff: "Wir freuen uns auf dich,<br/>Dein AdTool-Team",
    pushTitle: "Letzte Chance: 20% Rabatt 🎁",
    pushBody: "3 Monate lang sparen mit Code WINBACK20.",
    couponLine: "Dein Code:",
    expiryNote: "",
  },
  en: {
    subject: "Last chance: 20% off for 3 months 🎁",
    hello: "Hi",
    heading: "Last chance 🎁",
    intro:
      "You haven't used AdTool in a while – and we want to make your return easy. Lock in <strong>20% off for 3 months</strong> with your personal code:",
    highlight: "20% off — for 3 months",
    cta: "Redeem discount",
    footnote: "Enter the code at checkout or click the button – it'll be applied automatically.",
    signoff: "We'd love to have you back,<br/>The AdTool Team",
    pushTitle: "Last chance: 20% off 🎁",
    pushBody: "Save 3 months with code WINBACK20.",
    couponLine: "Your code:",
    expiryNote: "",
  },
  es: {
    subject: "Última oportunidad: 20% de descuento por 3 meses 🎁",
    hello: "Hola",
    heading: "Última oportunidad 🎁",
    intro:
      "Hace tiempo que no usas AdTool y queremos facilitarte el regreso. Asegura <strong>20% de descuento durante 3 meses</strong> con tu código personal:",
    highlight: "20% de descuento — 3 meses",
    cta: "Canjear descuento",
    footnote:
      "Introduce el código al pagar o haz clic en el botón – se aplicará automáticamente.",
    signoff: "Te esperamos,<br/>El equipo de AdTool",
    pushTitle: "Última oportunidad: 20% 🎁",
    pushBody: "Ahorra 3 meses con WINBACK20.",
    couponLine: "Tu código:",
    expiryNote: "",
  },
};

const wrapHtml = (opts: {
  preheader: string;
  heading: string;
  hello: string;
  displayName: string;
  intro: string;
  highlight: string;
  ctaUrl: string;
  ctaLabel: string;
  couponBlock: string;
  footnote: string;
  signoff: string;
  userEmail: string;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.heading}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${opts.preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width: 560px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #F5C76A 0%, #d4a853 100%); border-radius: 12px;">
                <span style="font-size: 24px; font-weight: bold; color: #0a0a0f;">AdTool</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1a1a2e; border-radius: 16px; padding: 40px 32px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <h1 style="color: #F5C76A; font-size: 28px; font-weight: bold; text-align: center; margin: 0 0 24px 0;">${opts.heading}</h1>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${opts.hello}${opts.displayName ? ` ${opts.displayName}` : ""},</p>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">${opts.intro}</p>

              <div style="background: linear-gradient(135deg, rgba(245, 199, 106, 0.15) 0%, rgba(212, 168, 83, 0.08) 100%); border: 1px solid rgba(245, 199, 106, 0.3); border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                <p style="color: #F5C76A; font-size: 18px; font-weight: bold; margin: 0;">${opts.highlight}</p>
              </div>

              ${opts.couponBlock}

              <div style="text-align: center; margin: 32px 0;">
                <a href="${opts.ctaUrl}" style="display: inline-block; background-color: #F5C76A; border-radius: 8px; color: #0a0a0f; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 32px;">
                  ${opts.ctaLabel}
                </a>
              </div>

              <p style="color: #888888; font-size: 13px; text-align: center; margin: 24px 0 8px 0;">${opts.footnote}</p>

              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;">
              <p style="color: #aaaaaa; font-size: 14px; line-height: 1.5; margin: 16px 0 0 0;">${opts.signoff}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 32px;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 8px 0;">© 2026 AdTool. Alle Rechte vorbehalten.</p>
              <p style="color: #666666; font-size: 12px; margin: 0 0 8px 0;">
                <a href="https://useadtool.ai" style="color: #888888; text-decoration: underline;">Website</a>
                &nbsp;•&nbsp;
                <a href="https://useadtool.ai/support" style="color: #888888; text-decoration: underline;">Support</a>
                &nbsp;•&nbsp;
                <a href="https://useadtool.ai/privacy" style="color: #888888; text-decoration: underline;">Datenschutz</a>
              </p>
              <p style="color: #555555; font-size: 11px; margin: 8px 0 0 0;">Gesendet an ${opts.userEmail}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export function renderEmail(input: RenderInput): RenderOutput {
  const { stage, lang, appUrl, couponCode, userEmail, displayName } = input;
  const copy = stage === "day_14" ? day14Copy[lang] : day30Copy[lang];

  const ctaUrl =
    stage === "day_14"
      ? `${appUrl}/ai-video-studio?utm_source=email&utm_medium=winback&utm_campaign=day_14`
      : `${appUrl}/pricing?coupon=${couponCode}&utm_source=email&utm_medium=winback&utm_campaign=day_30`;

  const couponBlock =
    stage === "day_30"
      ? `
        <div style="background-color: rgba(245, 199, 106, 0.08); border: 1px dashed rgba(245, 199, 106, 0.4); border-radius: 10px; padding: 18px; text-align: center; margin: 16px 0;">
          <p style="color: #999999; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 8px 0;">${copy.couponLine}</p>
          <p style="color: #F5C76A; font-size: 26px; font-weight: bold; letter-spacing: 3px; font-family: 'Courier New', monospace; margin: 0;">${couponCode}</p>
        </div>
      `
      : "";

  const html = wrapHtml({
    preheader: copy.subject,
    heading: copy.heading,
    hello: copy.hello,
    displayName: displayName || "",
    intro: copy.intro,
    highlight: copy.highlight,
    ctaUrl,
    ctaLabel: copy.cta,
    couponBlock,
    footnote: copy.footnote,
    signoff: copy.signoff,
    userEmail,
  });

  return {
    subject: copy.subject,
    html,
    ctaUrl,
    pushTitle: copy.pushTitle,
    pushBody: copy.pushBody,
  };
}
