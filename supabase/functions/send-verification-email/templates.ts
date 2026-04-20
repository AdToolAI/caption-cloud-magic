// Multilingual email templates for verification emails (DE/EN/ES)

export type EmailLanguage = "de" | "en" | "es";

interface TemplateStrings {
  subject: string;
  title: string;
  greeting: string;
  intro: string;
  cta: string;
  copyHint: string;
  footerNote: (email: string) => string;
  rights: string;
  website: string;
  support: string;
  privacy: string;
}

const STRINGS: Record<EmailLanguage, TemplateStrings> = {
  de: {
    subject: "Bestätige deine E-Mail-Adresse | AdTool AI",
    title: "Willkommen bei AdTool AI! 🎉",
    greeting: "Hallo,",
    intro:
      "Vielen Dank für deine Registrierung bei AdTool AI! Um dein Konto zu aktivieren und alle Premium-Features nutzen zu können, bestätige bitte deine E-Mail-Adresse.",
    cta: "E-Mail bestätigen",
    copyHint: "Oder kopiere diesen Link in deinen Browser:",
    footerNote: (email) =>
      `Diese E-Mail wurde an <strong>${email}</strong> gesendet. Falls du dich nicht bei AdTool AI registriert hast, kannst du diese E-Mail ignorieren.`,
    rights: "© 2026 AdTool AI. Alle Rechte vorbehalten.",
    website: "Website",
    support: "Support",
    privacy: "Datenschutz",
  },
  en: {
    subject: "Confirm your email address | AdTool AI",
    title: "Welcome to AdTool AI! 🎉",
    greeting: "Hello,",
    intro:
      "Thanks for signing up to AdTool AI! To activate your account and unlock all premium features, please confirm your email address.",
    cta: "Confirm email",
    copyHint: "Or copy this link into your browser:",
    footerNote: (email) =>
      `This email was sent to <strong>${email}</strong>. If you didn't sign up for AdTool AI, you can safely ignore this message.`,
    rights: "© 2026 AdTool AI. All rights reserved.",
    website: "Website",
    support: "Support",
    privacy: "Privacy",
  },
  es: {
    subject: "Confirma tu dirección de correo | AdTool AI",
    title: "¡Bienvenido a AdTool AI! 🎉",
    greeting: "Hola,",
    intro:
      "¡Gracias por registrarte en AdTool AI! Para activar tu cuenta y desbloquear todas las funciones premium, confirma tu dirección de correo electrónico.",
    cta: "Confirmar correo",
    copyHint: "O copia este enlace en tu navegador:",
    footerNote: (email) =>
      `Este correo se envió a <strong>${email}</strong>. Si no te registraste en AdTool AI, puedes ignorar este mensaje.`,
    rights: "© 2026 AdTool AI. Todos los derechos reservados.",
    website: "Sitio web",
    support: "Soporte",
    privacy: "Privacidad",
  },
};

export function getSubject(lang: EmailLanguage): string {
  return (STRINGS[lang] ?? STRINGS.en).subject;
}

export function renderVerificationEmail(
  lang: EmailLanguage,
  verificationUrl: string,
  userEmail: string
): string {
  const t = STRINGS[lang] ?? STRINGS.en;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width: 560px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #F5C76A 0%, #d4a853 100%); border-radius: 12px;">
                <span style="font-size: 24px; font-weight: bold; color: #0a0a0f;">AdTool AI</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1a1a2e; border-radius: 16px; padding: 40px 32px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <h1 style="color: #F5C76A; font-size: 28px; font-weight: bold; text-align: center; margin: 0 0 24px 0;">${t.title}</h1>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${t.greeting}</p>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${t.intro}</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${verificationUrl}" style="display: inline-block; background-color: #F5C76A; border-radius: 8px; color: #0a0a0f; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 32px;">
                  ${t.cta}
                </a>
              </div>
              <p style="color: #888888; font-size: 14px; text-align: center; margin: 24px 0 8px 0;">${t.copyHint}</p>
              <p style="color: #22d3ee; font-size: 12px; word-break: break-all; text-align: center; margin: 0 0 16px 0;">${verificationUrl}</p>
              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;">
              <p style="color: #666666; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">${t.footerNote(userEmail)}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 32px;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 8px 0;">${t.rights}</p>
              <p style="color: #666666; font-size: 12px; margin: 0;">
                <a href="https://useadtool.ai" style="color: #888888; text-decoration: underline;">${t.website}</a>
                &nbsp;•&nbsp;
                <a href="https://useadtool.ai/support" style="color: #888888; text-decoration: underline;">${t.support}</a>
                &nbsp;•&nbsp;
                <a href="https://useadtool.ai/privacy" style="color: #888888; text-decoration: underline;">${t.privacy}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
