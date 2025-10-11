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
  
  // Prompt Wizard
  wizard_title: string;
  wizard_subtitle: string;
  wizard_platform: string;
  wizard_selectPlatform: string;
  wizard_goal: string;
  wizard_selectGoal: string;
  wizard_moreReach: string;
  wizard_engagement: string;
  wizard_sales: string;
  wizard_awareness: string;
  wizard_growth: string;
  wizard_businessType: string;
  wizard_businessPlaceholder: string;
  wizard_tone: string;
  wizard_selectTone: string;
  wizard_keywords: string;
  wizard_keywordsPlaceholder: string;
  wizard_generate: string;
  wizard_generating: string;
  wizard_fillFields: string;
  wizard_success: string;
  wizard_copied: string;
  wizard_results: string;
  wizard_optimizedPrompt: string;
  wizard_whyItWorks: string;
  wizard_example: string;
  wizard_useInGenerator: string;
  wizard_copyPrompt: string;
  wizard_newIdea: string;
  wizard_infoTitle: string;
  wizard_infoDescription: string;
  
  // Common
  nav_home: string;
  nav_generator: string;
  nav_wizard: string;
  nav_pricing: string;
  nav_faq: string;
  footer_rights: string;
  common_friendly: string;
  common_professional: string;
  common_funny: string;
  common_inspirational: string;
  common_bold: string;
  common_language: string;
  common_error: string;
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
    
    wizard_title: "Prompt Wizard",
    wizard_subtitle: "Reach-Optimized Prompts for Creators",
    wizard_platform: "Social Platform",
    wizard_selectPlatform: "Select platform",
    wizard_goal: "Goal / Objective",
    wizard_selectGoal: "Select your goal",
    wizard_moreReach: "More Reach",
    wizard_engagement: "Engagement & Comments",
    wizard_sales: "Product Sales",
    wizard_awareness: "Brand Awareness",
    wizard_growth: "Follower Growth",
    wizard_businessType: "Business Type",
    wizard_businessPlaceholder: "e.g., Coffee Shop, Fitness Influencer, Tech Startup",
    wizard_tone: "Tone of Voice",
    wizard_selectTone: "Select tone",
    wizard_keywords: "Add Keywords (optional)",
    wizard_keywordsPlaceholder: "Enter keywords separated by commas",
    wizard_generate: "Generate AI Prompt",
    wizard_generating: "Generating...",
    wizard_fillFields: "Please fill in all required fields",
    wizard_success: "Optimized prompt generated successfully!",
    wizard_copied: "Prompt copied to clipboard!",
    wizard_results: "Your Optimized Prompt",
    wizard_optimizedPrompt: "Optimized Prompt:",
    wizard_whyItWorks: "Why it works:",
    wizard_example: "Example Result:",
    wizard_useInGenerator: "Use this Prompt in Generator",
    wizard_copyPrompt: "Copy Prompt",
    wizard_newIdea: "Generate New Idea",
    wizard_infoTitle: "AI-Powered Prompt Optimization",
    wizard_infoDescription: "This AI helps you write smarter prompts that outperform ChatGPT for social reach.",
    
    nav_home: "Home",
    nav_generator: "Generator",
    nav_wizard: "Prompt Wizard",
    nav_pricing: "Pricing",
    nav_faq: "FAQ",
    footer_rights: "All rights reserved.",
    common_friendly: "Friendly",
    common_professional: "Professional",
    common_funny: "Funny",
    common_inspirational: "Inspirational",
    common_bold: "Bold",
    common_language: "en",
    common_error: "Error",
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
    
    wizard_title: "Prompt Wizard",
    wizard_subtitle: "Reichweiten-Optimierte Prompts für Creator",
    wizard_platform: "Social Plattform",
    wizard_selectPlatform: "Plattform auswählen",
    wizard_goal: "Ziel / Objective",
    wizard_selectGoal: "Ziel auswählen",
    wizard_moreReach: "Mehr Reichweite",
    wizard_engagement: "Engagement & Kommentare",
    wizard_sales: "Produkt-Verkäufe",
    wizard_awareness: "Markenbekanntheit",
    wizard_growth: "Follower-Wachstum",
    wizard_businessType: "Business Typ",
    wizard_businessPlaceholder: "z.B. Coffee Shop, Fitness Influencer, Tech Startup",
    wizard_tone: "Tonalität",
    wizard_selectTone: "Tonalität auswählen",
    wizard_keywords: "Keywords hinzufügen (optional)",
    wizard_keywordsPlaceholder: "Keywords mit Komma getrennt eingeben",
    wizard_generate: "AI Prompt generieren",
    wizard_generating: "Generiere...",
    wizard_fillFields: "Bitte fülle alle Pflichtfelder aus",
    wizard_success: "Optimierter Prompt erfolgreich generiert!",
    wizard_copied: "Prompt in Zwischenablage kopiert!",
    wizard_results: "Dein Optimierter Prompt",
    wizard_optimizedPrompt: "Optimierter Prompt:",
    wizard_whyItWorks: "Warum es funktioniert:",
    wizard_example: "Beispiel-Ergebnis:",
    wizard_useInGenerator: "Prompt im Generator verwenden",
    wizard_copyPrompt: "Prompt kopieren",
    wizard_newIdea: "Neue Idee generieren",
    wizard_infoTitle: "KI-gestützte Prompt-Optimierung",
    wizard_infoDescription: "Diese KI hilft dir, smartere Prompts zu schreiben, die ChatGPT in puncto Social Reach übertreffen.",
    
    nav_home: "Start",
    nav_generator: "Generator",
    nav_wizard: "Prompt Wizard",
    nav_pricing: "Preise",
    nav_faq: "FAQ",
    footer_rights: "Alle Rechte vorbehalten.",
    common_friendly: "Freundlich",
    common_professional: "Professionell",
    common_funny: "Lustig",
    common_inspirational: "Inspirierend",
    common_bold: "Mutig",
    common_language: "de",
    common_error: "Fehler",
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
    
    wizard_title: "Prompt Wizard",
    wizard_subtitle: "Prompts Optimizados para Alcance",
    wizard_platform: "Plataforma Social",
    wizard_selectPlatform: "Seleccionar plataforma",
    wizard_goal: "Objetivo",
    wizard_selectGoal: "Selecciona tu objetivo",
    wizard_moreReach: "Más Alcance",
    wizard_engagement: "Engagement & Comentarios",
    wizard_sales: "Ventas de Productos",
    wizard_awareness: "Conocimiento de Marca",
    wizard_growth: "Crecimiento de Seguidores",
    wizard_businessType: "Tipo de Negocio",
    wizard_businessPlaceholder: "ej. Cafetería, Influencer de Fitness, Startup Tech",
    wizard_tone: "Tono de Voz",
    wizard_selectTone: "Seleccionar tono",
    wizard_keywords: "Agregar Palabras Clave (opcional)",
    wizard_keywordsPlaceholder: "Ingresa palabras clave separadas por comas",
    wizard_generate: "Generar Prompt IA",
    wizard_generating: "Generando...",
    wizard_fillFields: "Por favor completa todos los campos requeridos",
    wizard_success: "¡Prompt optimizado generado con éxito!",
    wizard_copied: "¡Prompt copiado al portapapeles!",
    wizard_results: "Tu Prompt Optimizado",
    wizard_optimizedPrompt: "Prompt Optimizado:",
    wizard_whyItWorks: "Por qué funciona:",
    wizard_example: "Ejemplo de Resultado:",
    wizard_useInGenerator: "Usar este Prompt en Generador",
    wizard_copyPrompt: "Copiar Prompt",
    wizard_newIdea: "Generar Nueva Idea",
    wizard_infoTitle: "Optimización de Prompts con IA",
    wizard_infoDescription: "Esta IA te ayuda a escribir prompts más inteligentes que superan a ChatGPT en alcance social.",
    
    nav_home: "Inicio",
    nav_generator: "Generador",
    nav_wizard: "Prompt Wizard",
    nav_pricing: "Precios",
    nav_faq: "FAQ",
    footer_rights: "Todos los derechos reservados.",
    common_friendly: "Amigable",
    common_professional: "Profesional",
    common_funny: "Divertido",
    common_inspirational: "Inspirador",
    common_bold: "Audaz",
    common_language: "es",
    common_error: "Error",
  },
};

export const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.split('-')[0];
  if (browserLang === 'de' || browserLang === 'es') {
    return browserLang as Language;
  }
  return 'en';
};
