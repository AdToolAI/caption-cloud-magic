export type Language = 'en' | 'de' | 'es';

export interface Translations {
  // Hero Section
  hero_title: string;
  hero_subtitle: string;
  cta_try: string;
  cta_login: string;
  
  // Generator
  generator_title: string;
  input_topic: string;
  input_topic_placeholder: string;
  input_tone: string;
  input_platform: string;
  btn_generate: string;
  btn_copy: string;
  btn_new: string;
  usage_counter: string;
  limit_reached_title: string;
  limit_reached_message: string;
  btn_upgrade: string;
  
  // Tones
  tone_friendly: string;
  tone_professional: string;
  tone_funny: string;
  tone_emotional: string;
  
  // Pricing
  pricing_title: string;
  pricing_subtitle: string;
  plan_free: string;
  plan_pro: string;
  price_free: string;
  price_pro: string;
  price_period: string;
  feature_captions_free: string;
  feature_captions_pro: string;
  feature_platforms: string;
  feature_tones: string;
  feature_support: string;
  feature_cancel: string;
  btn_get_started: string;
  btn_upgrade_now: string;
  
  // FAQ
  faq_title: string;
  faq_q1: string;
  faq_a1: string;
  faq_q2: string;
  faq_a2: string;
  faq_q3: string;
  faq_a3: string;
  faq_q4: string;
  faq_a4: string;
  
  // Auth
  auth_login_title: string;
  auth_signup_title: string;
  auth_email: string;
  auth_password: string;
  auth_password_confirm: string;
  btn_login: string;
  btn_signup: string;
  auth_have_account: string;
  auth_no_account: string;
  
  // Common
  nav_home: string;
  nav_generator: string;
  nav_pricing: string;
  nav_faq: string;
  footer_rights: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    hero_title: "Create perfect social captions in seconds",
    hero_subtitle: "CaptionGenie helps you write engaging posts for Instagram, TikTok, LinkedIn, and more — powered by AI.",
    cta_try: "Try it free",
    cta_login: "Login",
    
    generator_title: "AI Caption Generator",
    input_topic: "Topic or Idea",
    input_topic_placeholder: "e.g., New product launch, weekend vibes, motivational quote...",
    input_tone: "Tone",
    input_platform: "Platform",
    btn_generate: "Generate Caption",
    btn_copy: "Copy to Clipboard",
    btn_new: "Generate New",
    usage_counter: "{used} of {total} used today",
    limit_reached_title: "Daily Limit Reached",
    limit_reached_message: "You've reached today's limit. Upgrade to Pro for unlimited captions — €39.99/year, cancel monthly anytime.",
    btn_upgrade: "Upgrade to Pro",
    
    tone_friendly: "Friendly",
    tone_professional: "Professional",
    tone_funny: "Funny",
    tone_emotional: "Emotional",
    
    pricing_title: "Simple, Transparent Pricing",
    pricing_subtitle: "Choose the plan that works for you",
    plan_free: "Free",
    plan_pro: "Pro",
    price_free: "€0",
    price_pro: "€39.99",
    price_period: "per year",
    feature_captions_free: "3 captions per day",
    feature_captions_pro: "Unlimited captions",
    feature_platforms: "All platforms",
    feature_tones: "All tone styles",
    feature_support: "Email support",
    feature_cancel: "Cancel monthly anytime",
    btn_get_started: "Get Started",
    btn_upgrade_now: "Upgrade Now",
    
    faq_title: "Frequently Asked Questions",
    faq_q1: "How does the free trial work?",
    faq_a1: "You can generate up to 3 captions per day completely free. No credit card required.",
    faq_q2: "Can I cancel my subscription?",
    faq_a2: "Yes! While billed annually, you can cancel your subscription at any time through the customer portal. No questions asked.",
    faq_q3: "What platforms are supported?",
    faq_a3: "We support Instagram, TikTok, LinkedIn, Facebook, and X (Twitter). More platforms coming soon!",
    faq_q4: "How does the AI generate captions?",
    faq_a4: "Our AI analyzes your topic, chosen tone, and platform to create engaging, relevant captions with hashtags tailored to your needs.",
    
    auth_login_title: "Welcome Back",
    auth_signup_title: "Create Your Account",
    auth_email: "Email",
    auth_password: "Password",
    auth_password_confirm: "Confirm Password",
    btn_login: "Login",
    btn_signup: "Sign Up",
    auth_have_account: "Already have an account?",
    auth_no_account: "Don't have an account?",
    
    nav_home: "Home",
    nav_generator: "Generator",
    nav_pricing: "Pricing",
    nav_faq: "FAQ",
    footer_rights: "All rights reserved.",
  },
  de: {
    hero_title: "Perfekte Social-Media-Captions in Sekunden erstellen",
    hero_subtitle: "CaptionGenie hilft dir, ansprechende Posts für Instagram, TikTok, LinkedIn und mehr zu schreiben — powered by AI.",
    cta_try: "Kostenlos testen",
    cta_login: "Anmelden",
    
    generator_title: "KI Caption Generator",
    input_topic: "Thema oder Idee",
    input_topic_placeholder: "z.B. Neue Produkteinführung, Wochenend-Vibes, Motivationszitat...",
    input_tone: "Ton",
    input_platform: "Plattform",
    btn_generate: "Caption generieren",
    btn_copy: "In Zwischenablage kopieren",
    btn_new: "Neu generieren",
    usage_counter: "{used} von {total} heute verwendet",
    limit_reached_title: "Tageslimit erreicht",
    limit_reached_message: "Du hast dein heutiges Limit erreicht. Upgrade auf Pro für unbegrenzte Captions — 39,99€/Jahr, monatlich kündbar.",
    btn_upgrade: "Auf Pro upgraden",
    
    tone_friendly: "Freundlich",
    tone_professional: "Professionell",
    tone_funny: "Lustig",
    tone_emotional: "Emotional",
    
    pricing_title: "Einfache, transparente Preise",
    pricing_subtitle: "Wähle den Plan, der zu dir passt",
    plan_free: "Kostenlos",
    plan_pro: "Pro",
    price_free: "0€",
    price_pro: "39,99€",
    price_period: "pro Jahr",
    feature_captions_free: "3 Captions pro Tag",
    feature_captions_pro: "Unbegrenzte Captions",
    feature_platforms: "Alle Plattformen",
    feature_tones: "Alle Tonstile",
    feature_support: "E-Mail Support",
    feature_cancel: "Monatlich kündbar",
    btn_get_started: "Jetzt starten",
    btn_upgrade_now: "Jetzt upgraden",
    
    faq_title: "Häufig gestellte Fragen",
    faq_q1: "Wie funktioniert die kostenlose Testversion?",
    faq_a1: "Du kannst bis zu 3 Captions pro Tag völlig kostenlos generieren. Keine Kreditkarte erforderlich.",
    faq_q2: "Kann ich mein Abonnement kündigen?",
    faq_a2: "Ja! Obwohl jährlich abgerechnet, kannst du dein Abonnement jederzeit über das Kundenportal kündigen. Keine Fragen.",
    faq_q3: "Welche Plattformen werden unterstützt?",
    faq_a3: "Wir unterstützen Instagram, TikTok, LinkedIn, Facebook und X (Twitter). Weitere Plattformen folgen!",
    faq_q4: "Wie generiert die KI Captions?",
    faq_a4: "Unsere KI analysiert dein Thema, den gewählten Ton und die Plattform, um ansprechende, relevante Captions mit passenden Hashtags zu erstellen.",
    
    auth_login_title: "Willkommen zurück",
    auth_signup_title: "Konto erstellen",
    auth_email: "E-Mail",
    auth_password: "Passwort",
    auth_password_confirm: "Passwort bestätigen",
    btn_login: "Anmelden",
    btn_signup: "Registrieren",
    auth_have_account: "Bereits ein Konto?",
    auth_no_account: "Noch kein Konto?",
    
    nav_home: "Start",
    nav_generator: "Generator",
    nav_pricing: "Preise",
    nav_faq: "FAQ",
    footer_rights: "Alle Rechte vorbehalten.",
  },
  es: {
    hero_title: "Crea subtítulos perfectos en segundos",
    hero_subtitle: "CaptionGenie te ayuda a escribir publicaciones atractivas para Instagram, TikTok, LinkedIn y más — impulsado por IA.",
    cta_try: "Prueba gratis",
    cta_login: "Iniciar sesión",
    
    generator_title: "Generador de Subtítulos IA",
    input_topic: "Tema o Idea",
    input_topic_placeholder: "ej. Lanzamiento de producto, vibras de fin de semana, cita motivacional...",
    input_tone: "Tono",
    input_platform: "Plataforma",
    btn_generate: "Generar Subtítulo",
    btn_copy: "Copiar al portapapeles",
    btn_new: "Generar Nuevo",
    usage_counter: "{used} de {total} usados hoy",
    limit_reached_title: "Límite Diario Alcanzado",
    limit_reached_message: "Has alcanzado el límite de hoy. Actualiza a Pro para subtítulos ilimitados — €39.99/año, cancela mensualmente cuando quieras.",
    btn_upgrade: "Actualizar a Pro",
    
    tone_friendly: "Amigable",
    tone_professional: "Profesional",
    tone_funny: "Divertido",
    tone_emotional: "Emocional",
    
    pricing_title: "Precios Simples y Transparentes",
    pricing_subtitle: "Elige el plan que funcione para ti",
    plan_free: "Gratis",
    plan_pro: "Pro",
    price_free: "€0",
    price_pro: "€39.99",
    price_period: "por año",
    feature_captions_free: "3 subtítulos por día",
    feature_captions_pro: "Subtítulos ilimitados",
    feature_platforms: "Todas las plataformas",
    feature_tones: "Todos los estilos de tono",
    feature_support: "Soporte por email",
    feature_cancel: "Cancela mensualmente",
    btn_get_started: "Comenzar",
    btn_upgrade_now: "Actualizar Ahora",
    
    faq_title: "Preguntas Frecuentes",
    faq_q1: "¿Cómo funciona la prueba gratuita?",
    faq_a1: "Puedes generar hasta 3 subtítulos por día completamente gratis. No se requiere tarjeta de crédito.",
    faq_q2: "¿Puedo cancelar mi suscripción?",
    faq_a2: "¡Sí! Aunque se factura anualmente, puedes cancelar tu suscripción en cualquier momento a través del portal del cliente. Sin preguntas.",
    faq_q3: "¿Qué plataformas son compatibles?",
    faq_a3: "Soportamos Instagram, TikTok, LinkedIn, Facebook y X (Twitter). ¡Más plataformas próximamente!",
    faq_q4: "¿Cómo genera subtítulos la IA?",
    faq_a4: "Nuestra IA analiza tu tema, el tono elegido y la plataforma para crear subtítulos atractivos y relevantes con hashtags adaptados a tus necesidades.",
    
    auth_login_title: "Bienvenido de Nuevo",
    auth_signup_title: "Crea Tu Cuenta",
    auth_email: "Correo Electrónico",
    auth_password: "Contraseña",
    auth_password_confirm: "Confirmar Contraseña",
    btn_login: "Iniciar Sesión",
    btn_signup: "Registrarse",
    auth_have_account: "¿Ya tienes una cuenta?",
    auth_no_account: "¿No tienes una cuenta?",
    
    nav_home: "Inicio",
    nav_generator: "Generador",
    nav_pricing: "Precios",
    nav_faq: "FAQ",
    footer_rights: "Todos los derechos reservados.",
  },
};

export const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.split('-')[0];
  if (browserLang === 'de' || browserLang === 'es') {
    return browserLang as Language;
  }
  return 'en';
};
