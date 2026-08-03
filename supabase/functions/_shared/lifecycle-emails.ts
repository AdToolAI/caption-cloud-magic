// Lifecycle emails around the purchase moment (v403 Kauffunnel)
// Branding: #0a0a0f BG, #F5C76A Gold, Inter — matches the activation cadence.

export type LifecycleLang = "de" | "en" | "es";

export function normalizeLifecycleLang(raw?: string | null): LifecycleLang {
  const v = (raw || "en").toLowerCase().slice(0, 2);
  if (v === "de") return "de";
  if (v === "es") return "es";
  return "en";
}

const styles = `
  body { margin:0; padding:0; background:#0a0a0f; font-family: 'Inter', -apple-system, sans-serif; color:#e8e6e1; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 24px; }
  .card { background:linear-gradient(180deg,#15151f 0%,#0e0e16 100%); border:1px solid rgba(245,199,106,0.15); border-radius:16px; padding:36px 28px; }
  .logo { color:#F5C76A; font-weight:700; font-size:20px; letter-spacing:0.5px; margin-bottom:24px; }
  h1 { color:#fff; font-size:26px; font-weight:700; margin:0 0 16px; line-height:1.3; }
  p { color:#cfcdc7; font-size:15px; line-height:1.65; margin:0 0 18px; }
  ul { color:#cfcdc7; font-size:15px; line-height:1.7; padding-left:20px; margin:0 0 24px; }
  .cta { display:inline-block; background:linear-gradient(135deg,#F5C76A,#e0a847); color:#0a0a0f !important; text-decoration:none; padding:14px 28px; border-radius:12px; font-weight:700; font-size:15px; }
  .foot { color:#7a7770; font-size:12px; margin-top:32px; text-align:center; }
`;

function shell(heading: string, body: string, ctaUrl: string, ctaLabel: string, footnote: string, userEmail: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>
    <div class="wrap"><div class="card">
      <div class="logo">AdTool AI</div>
      <h1>${heading}</h1>
      ${body}
      <p style="margin-bottom:28px;"><a class="cta" href="${ctaUrl}">${ctaLabel}</a></p>
      <p style="color:#8a8780;font-size:13px;border-top:1px solid rgba(255,255,255,0.05);padding-top:20px;">${footnote}</p>
    </div>
    <div class="foot">AdTool AI · ${userEmail}</div>
    </div></body></html>`;
}

const welcomeCopy: Record<LifecycleLang, {
  subject: string; heading: string; intro: string; items: string[]; cta: string; footnote: string;
}> = {
  de: {
    subject: "Dein Studio läuft — los geht's",
    heading: "Dein Studio läuft",
    intro:
      "Danke, dass du dabei bist. Ab jetzt gehört dir das ganze Studio: ein Creator, ein Ort, ein fertiger Clip.",
    items: [
      "Autopilot: von der Idee bis zum fertigen Clip",
      "Cast &amp; World: eigene Charaktere mit fester Identität",
      "Lip-Sync in Deutsch, Englisch und Spanisch",
      "Director's Cut: Schnitt, Untertitel, Musik, Export in 1080p",
    ],
    cta: "Ersten Clip bauen",
    footnote: "Deine Rechnung findest du jederzeit unter Abrechnung. Monatlich kündbar.",
  },
  en: {
    subject: "Your studio is live — let's go",
    heading: "Your studio is live",
    intro:
      "Thanks for joining. From now on the whole studio is yours: one creator, one place, one finished clip.",
    items: [
      "Autopilot: from idea to finished clip",
      "Cast &amp; World: your own characters with a locked identity",
      "Lip-sync in German, English and Spanish",
      "Director's Cut: edit, subtitles, music, 1080p export",
    ],
    cta: "Build your first clip",
    footnote: "Your invoice is always available under Billing. Cancel monthly.",
  },
  es: {
    subject: "Tu estudio está activo — empecemos",
    heading: "Tu estudio está activo",
    intro:
      "Gracias por unirte. A partir de ahora el estudio entero es tuyo: un creador, un lugar, un clip terminado.",
    items: [
      "Autopilot: de la idea al clip terminado",
      "Cast &amp; World: tus propios personajes con identidad fija",
      "Lip-sync en alemán, inglés y español",
      "Director's Cut: montaje, subtítulos, música, exportación en 1080p",
    ],
    cta: "Crear tu primer clip",
    footnote: "Tu factura está siempre disponible en Facturación. Cancelable cada mes.",
  },
};

export function renderPurchaseWelcomeEmail(input: {
  lang: LifecycleLang;
  appUrl: string;
  userEmail: string;
}): { subject: string; html: string } {
  const c = welcomeCopy[input.lang];
  const base = input.appUrl.replace(/\/$/, "");
  const body = `<p>${c.intro}</p><ul>${c.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  return {
    subject: c.subject,
    html: shell(c.heading, body, `${base}/autopilot?firstProduction=1`, c.cta, c.footnote, input.userEmail),
  };
}

const failedCopy: Record<LifecycleLang, {
  subject: string; heading: string; intro: string; cta: string; footnote: string;
}> = {
  de: {
    subject: "Deine Zahlung konnte nicht verarbeitet werden",
    heading: "Zahlung fehlgeschlagen",
    intro:
      "Die letzte Abbuchung für dein Studio hat nicht geklappt — meistens liegt es an einer abgelaufenen Karte oder einem Limit. Dein Zugang bleibt zunächst aktiv; aktualisiere einfach deine Zahlungsmethode.",
    cta: "Zahlungsmethode aktualisieren",
    footnote: "Deine Charaktere, Stimmen und Projekte bleiben in jedem Fall gespeichert.",
  },
  en: {
    subject: "We couldn't process your payment",
    heading: "Payment failed",
    intro:
      "The latest charge for your studio didn't go through — usually an expired card or a limit. Your access stays active for now; just update your payment method.",
    cta: "Update payment method",
    footnote: "Your characters, voices and projects stay stored either way.",
  },
  es: {
    subject: "No pudimos procesar tu pago",
    heading: "Pago fallido",
    intro:
      "El último cobro de tu estudio no se completó, normalmente por una tarjeta caducada o un límite. Tu acceso sigue activo por ahora; solo actualiza tu método de pago.",
    cta: "Actualizar método de pago",
    footnote: "Tus personajes, voces y proyectos se conservan en cualquier caso.",
  },
};

export function renderPaymentFailedEmail(input: {
  lang: LifecycleLang;
  appUrl: string;
  userEmail: string;
  hostedInvoiceUrl?: string | null;
}): { subject: string; html: string } {
  const c = failedCopy[input.lang];
  const base = input.appUrl.replace(/\/$/, "");
  const ctaUrl = input.hostedInvoiceUrl || `${base}/billing`;
  return {
    subject: c.subject,
    html: shell(c.heading, `<p>${c.intro}</p>`, ctaUrl, c.cta, c.footnote, input.userEmail),
  };
}
