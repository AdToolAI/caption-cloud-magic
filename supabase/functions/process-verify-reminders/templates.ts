export type Lang = "de" | "en" | "es";

interface ReminderArgs {
  lang: Lang;
  appUrl: string;
  verifyUrl: string;
  userEmail: string;
}

const subjects: Record<Lang, string> = {
  de: "Erinnerung: Bestätige deine E-Mail-Adresse ✉️",
  en: "Reminder: Confirm your email address ✉️",
  es: "Recordatorio: Confirma tu dirección de correo ✉️",
};

const t = {
  de: {
    headline: "Nur noch ein Klick fehlt",
    intro: "Vor ein paar Tagen hast du dich bei AdTool registriert — aber deine E-Mail wurde noch nicht bestätigt. Sobald du das erledigt hast, schalten wir deinen kostenlosen Trial frei (inkl. KI-Video-Credits).",
    cta: "E-Mail jetzt bestätigen",
    note: "Falls du dich umentschieden hast, kannst du diese Mail einfach ignorieren — wir senden keine weiteren Erinnerungen.",
    expires: "Der Link ist 24 Stunden gültig.",
    footer: "AdTool — KI-Werbevideos in 90 Sekunden",
  },
  en: {
    headline: "Just one click left",
    intro: "A few days ago you signed up for AdTool — but your email isn't confirmed yet. Once you do, we'll unlock your free trial (including AI video credits).",
    cta: "Confirm email now",
    note: "If you changed your mind, just ignore this email — we won't send further reminders.",
    expires: "The link is valid for 24 hours.",
    footer: "AdTool — AI ad videos in 90 seconds",
  },
  es: {
    headline: "Solo falta un clic",
    intro: "Hace unos días te registraste en AdTool, pero tu correo aún no está confirmado. Una vez confirmado, activamos tu prueba gratuita (incluye créditos de video IA).",
    cta: "Confirmar correo ahora",
    note: "Si cambiaste de opinión, simplemente ignora este correo — no enviaremos más recordatorios.",
    expires: "El enlace es válido durante 24 horas.",
    footer: "AdTool — Videos publicitarios con IA en 90 segundos",
  },
};

export function renderReminderEmail({ lang, verifyUrl }: ReminderArgs): { subject: string; html: string } {
  const c = t[lang];
  const subject = subjects[lang];

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <div style="background:linear-gradient(180deg,#14141c 0%,#0f0f17 100%);border:1px solid rgba(212,175,55,0.18);border-radius:20px;padding:40px 32px;box-shadow:0 24px 64px rgba(0,0,0,0.5);">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;font-size:11px;letter-spacing:3px;color:#d4af37;text-transform:uppercase;font-weight:600;">AdTool</div>
      </div>
      <h1 style="color:#fff;font-size:26px;font-weight:700;margin:0 0 16px;text-align:center;letter-spacing:-0.5px;">${c.headline}</h1>
      <p style="color:#b8b8c5;font-size:15px;line-height:1.65;margin:0 0 32px;text-align:center;">${c.intro}</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#d4af37 0%,#b8941e 100%);color:#0a0a0f;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 8px 24px rgba(212,175,55,0.35);">${c.cta}</a>
      </div>
      <p style="color:#7a7a85;font-size:12px;text-align:center;margin:24px 0 0;">${c.expires}</p>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0 24px;">
      <p style="color:#7a7a85;font-size:12px;line-height:1.5;text-align:center;margin:0;">${c.note}</p>
    </div>
    <p style="color:#5a5a65;font-size:11px;text-align:center;margin:24px 0 0;">${c.footer}</p>
  </div>
</body>
</html>`;

  return { subject, html };
}
