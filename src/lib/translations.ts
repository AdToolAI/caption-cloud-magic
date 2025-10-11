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

  // Post Time Advisor
  advisor_title: string;
  advisor_subtitle: string;
  advisor_platform: string;
  advisor_selectPlatform: string;
  advisor_timezone: string;
  advisor_niche: string;
  advisor_nichePlaceholder: string;
  advisor_goal: string;
  advisor_selectGoal: string;
  advisor_analyze: string;
  advisor_analyzing: string;
  advisor_fillFields: string;
  advisor_success: string;
  advisor_copied: string;
  advisor_bestTimes: string;
  advisor_whyWorks: string;
  advisor_proTip: string;
  advisor_infoTitle: string;
  advisor_infoDescription: string;
  advisor_limitMessage: string;

  // Hook Generator
  hooks_title: string;
  hooks_subtitle: string;
  hooks_inputTitle: string;
  hooks_inputDescription: string;
  hooks_topic: string;
  hooks_topicPlaceholder: string;
  hooks_platform: string;
  hooks_selectPlatform: string;
  hooks_tone: string;
  hooks_selectTone: string;
  hooks_audience: string;
  hooks_audiencePlaceholder: string;
  hooks_styles: string;
  hooks_styleCuriosity: string;
  hooks_styleHumor: string;
  hooks_styleProvocation: string;
  hooks_styleAuthority: string;
  hooks_styleRelatable: string;
  hooks_generate: string;
  hooks_generating: string;
  hooks_fillFields: string;
  hooks_selectStyle: string;
  hooks_success: string;
  hooks_regenerated: string;
  hooks_copied: string;
  hooks_copiedAll: string;
  hooks_results: string;
  hooks_copy: string;
  hooks_useInGenerator: string;
  hooks_copyAll: string;
  hooks_helperText: string;
  hooks_chars: string;
  hooks_usageCounter: string;
  hooks_limitTitle: string;
  hooks_limitMessage: string;
  
  // Rewriter
  rewriter_title: string;
  rewriter_subtitle: string;
  rewriter_original_caption: string;
  rewriter_placeholder: string;
  rewriter_goal_label: string;
  rewriter_goal_tooltip: string;
  rewriter_goal_viral: string;
  rewriter_goal_emotional: string;
  rewriter_goal_professional: string;
  rewriter_goal_simplify: string;
  rewriter_button: string;
  rewriter_empty_state: string;
  rewriter_result_title: string;
  rewriter_why_works: string;
  rewriter_suggestions: string;
  rewriter_use_in_generator: string;
  rewriter_success: string;
  rewriter_error_empty: string;
  rewriter_error_generic: string;
  rewriter_limit_title: string;
  rewriter_limit_message: string;
  rewriter_usage_counter: string;
  rewriter_pro_feature: string;
  
  // Common
  nav_home: string;
  nav_generator: string;
  nav_wizard: string;
  nav_advisor: string;
  nav_hooks: string;
  nav_rewriter: string;
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
  common_close: string;
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

    advisor_title: "AI Time-to-Post Advisor",
    advisor_subtitle: "Find your best posting times for maximum reach",
    advisor_platform: "Platform",
    advisor_selectPlatform: "Select platform",
    advisor_timezone: "Timezone",
    advisor_niche: "Industry / Niche (optional)",
    advisor_nichePlaceholder: "e.g., Coffee, Fitness, Tech, Fashion",
    advisor_goal: "Goal (optional)",
    advisor_selectGoal: "Select your goal",
    advisor_analyze: "Analyze Best Times",
    advisor_analyzing: "Analyzing...",
    advisor_fillFields: "Please select platform and timezone",
    advisor_success: "Analysis complete!",
    advisor_copied: "Times copied to clipboard!",
    advisor_bestTimes: "Your best posting times:",
    advisor_whyWorks: "Why this works:",
    advisor_proTip: "Pro Tip:",
    advisor_infoTitle: "Data-Driven Posting Schedule",
    advisor_infoDescription: "Data is AI-estimated based on general engagement behavior — adjust to your audience over time.",
    advisor_limitMessage: "You've reached today's limit (2 analyses/day). Upgrade to Pro for unlimited analyses.",

    hooks_title: "Hook Generator — Stop the scroll in 1 line",
    hooks_subtitle: "Get 5 scroll-stopping hooks tailored to your platform and audience",
    hooks_inputTitle: "Hook Inputs",
    hooks_inputDescription: "Tell us about your content to generate powerful hooks",
    hooks_topic: "Topic / Idea",
    hooks_topicPlaceholder: "e.g., Weekend coffee promotion, fitness transformation, tech startup launch...",
    hooks_platform: "Platform",
    hooks_selectPlatform: "Select platform",
    hooks_tone: "Tone",
    hooks_selectTone: "Select tone",
    hooks_audience: "Audience (optional)",
    hooks_audiencePlaceholder: "e.g., young professionals, coffee lovers, fitness enthusiasts",
    hooks_styles: "Hook styles to include",
    hooks_styleCuriosity: "Curiosity",
    hooks_styleHumor: "Humor",
    hooks_styleProvocation: "Provocation",
    hooks_styleAuthority: "Authority",
    hooks_styleRelatable: "Relatable",
    hooks_generate: "Generate Hooks",
    hooks_generating: "Generating...",
    hooks_fillFields: "Please fill in all required fields",
    hooks_selectStyle: "Please select at least one hook style",
    hooks_success: "Hooks generated successfully!",
    hooks_regenerated: "New hooks generated!",
    hooks_copied: "Hook copied to clipboard!",
    hooks_copiedAll: "All hooks copied to clipboard!",
    hooks_results: "Your Generated Hooks",
    hooks_copy: "Copy",
    hooks_useInGenerator: "Use in Generator",
    hooks_copyAll: "Copy all hooks",
    hooks_helperText: "Keep hooks under ~110 chars for mobile feed break.",
    hooks_chars: "chars",
    hooks_usageCounter: "{used} of {total} used today",
    hooks_limitTitle: "Daily Limit Reached",
    hooks_limitMessage: "You've hit today's free limit. Go Pro for unlimited hooks.",
    
    rewriter_title: "AI Caption Rewriter — Stop the scroll in 1 line",
    rewriter_subtitle: "Rewrite your captions to boost engagement",
    rewriter_original_caption: "Original Caption",
    rewriter_placeholder: "Paste your existing social media post here...",
    rewriter_goal_label: "Rewrite Goal",
    rewriter_goal_tooltip: "Choose how the AI should rewrite your caption",
    rewriter_goal_viral: "Make it viral",
    rewriter_goal_emotional: "Make it emotional",
    rewriter_goal_professional: "Professional",
    rewriter_goal_simplify: "Simplify",
    rewriter_button: "Rewrite Caption",
    rewriter_empty_state: "Your rewritten caption will appear here",
    rewriter_result_title: "Rewritten Caption",
    rewriter_why_works: "Why this works",
    rewriter_suggestions: "Extra Tips",
    rewriter_use_in_generator: "Use in Generator",
    rewriter_success: "Caption rewritten successfully!",
    rewriter_error_empty: "Please enter a caption to rewrite",
    rewriter_error_generic: "Failed to rewrite caption. Please try again.",
    rewriter_limit_title: "Daily Limit Reached",
    rewriter_limit_message: "You've hit today's free limit. Go Pro for unlimited rewrites.",
    rewriter_usage_counter: "{used} of {total} rewrites used today",
    rewriter_pro_feature: "Available in Pro Plan",
    
    nav_home: "Home",
    nav_generator: "Generator",
    nav_wizard: "Prompt Wizard",
    nav_advisor: "Post Time",
    nav_hooks: "Hook Generator",
    nav_rewriter: "Rewriter",
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
    common_close: "Close",
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

    advisor_title: "KI Post-Zeitpunkt-Berater",
    advisor_subtitle: "Finde die besten Posting-Zeiten für maximale Reichweite",
    advisor_platform: "Plattform",
    advisor_selectPlatform: "Plattform auswählen",
    advisor_timezone: "Zeitzone",
    advisor_niche: "Branche / Nische (optional)",
    advisor_nichePlaceholder: "z.B. Kaffee, Fitness, Tech, Mode",
    advisor_goal: "Ziel (optional)",
    advisor_selectGoal: "Ziel auswählen",
    advisor_analyze: "Beste Zeiten analysieren",
    advisor_analyzing: "Analysiere...",
    advisor_fillFields: "Bitte Plattform und Zeitzone auswählen",
    advisor_success: "Analyse abgeschlossen!",
    advisor_copied: "Zeiten in Zwischenablage kopiert!",
    advisor_bestTimes: "Deine besten Posting-Zeiten:",
    advisor_whyWorks: "Warum es funktioniert:",
    advisor_proTip: "Pro-Tipp:",
    advisor_infoTitle: "Datengesteuerte Posting-Zeiten",
    advisor_infoDescription: "Daten sind KI-geschätzt basierend auf allgemeinem Engagement-Verhalten — passe sie über Zeit an deine Zielgruppe an.",
    advisor_limitMessage: "Du hast dein heutiges Limit erreicht (2 Analysen/Tag). Upgrade auf Pro für unbegrenzte Analysen.",

    hooks_title: "Hook Generator — Stoppe den Scroll in 1 Zeile",
    hooks_subtitle: "Erhalte 5 scrollstoppende Hooks für deine Plattform und Zielgruppe",
    hooks_inputTitle: "Hook-Eingaben",
    hooks_inputDescription: "Erzähl uns von deinem Content, um kraftvolle Hooks zu generieren",
    hooks_topic: "Thema / Idee",
    hooks_topicPlaceholder: "z.B. Wochenend-Kaffee-Aktion, Fitness-Transformation, Tech-Startup-Launch...",
    hooks_platform: "Plattform",
    hooks_selectPlatform: "Plattform auswählen",
    hooks_tone: "Tonalität",
    hooks_selectTone: "Tonalität auswählen",
    hooks_audience: "Zielgruppe (optional)",
    hooks_audiencePlaceholder: "z.B. junge Berufstätige, Kaffeeliebhaber, Fitness-Enthusiasten",
    hooks_styles: "Hook-Stile einbeziehen",
    hooks_styleCuriosity: "Neugier",
    hooks_styleHumor: "Humor",
    hooks_styleProvocation: "Provokation",
    hooks_styleAuthority: "Autorität",
    hooks_styleRelatable: "Nahbar",
    hooks_generate: "Hooks generieren",
    hooks_generating: "Generiere...",
    hooks_fillFields: "Bitte fülle alle Pflichtfelder aus",
    hooks_selectStyle: "Bitte wähle mindestens einen Hook-Stil",
    hooks_success: "Hooks erfolgreich generiert!",
    hooks_regenerated: "Neue Hooks generiert!",
    hooks_copied: "Hook in Zwischenablage kopiert!",
    hooks_copiedAll: "Alle Hooks in Zwischenablage kopiert!",
    hooks_results: "Deine generierten Hooks",
    hooks_copy: "Kopieren",
    hooks_useInGenerator: "Im Generator verwenden",
    hooks_copyAll: "Alle Hooks kopieren",
    hooks_helperText: "Halte Hooks unter ~110 Zeichen für mobile Feed-Unterbrechung.",
    hooks_chars: "Zeichen",
    hooks_usageCounter: "{used} von {total} heute verwendet",
    hooks_limitTitle: "Tageslimit erreicht",
    hooks_limitMessage: "Du hast dein heutiges Gratis-Limit erreicht. Gehe zu Pro für unbegrenzte Hooks.",
    
    rewriter_title: "AI Caption Umschreiber — Stoppe das Scrollen in 1 Zeile",
    rewriter_subtitle: "Verbessere deine Beiträge für mehr Reichweite",
    rewriter_original_caption: "Original-Text",
    rewriter_placeholder: "Füge deinen bestehenden Social-Media-Post hier ein...",
    rewriter_goal_label: "Umschreib-Ziel",
    rewriter_goal_tooltip: "Wähle, wie die KI deinen Text umschreiben soll",
    rewriter_goal_viral: "Viraler machen",
    rewriter_goal_emotional: "Emotionaler machen",
    rewriter_goal_professional: "Professioneller",
    rewriter_goal_simplify: "Vereinfachen",
    rewriter_button: "Text umschreiben",
    rewriter_empty_state: "Dein umgeschriebener Text erscheint hier",
    rewriter_result_title: "Umgeschriebener Text",
    rewriter_why_works: "Warum es funktioniert",
    rewriter_suggestions: "Zusätzliche Tipps",
    rewriter_use_in_generator: "Im Generator verwenden",
    rewriter_success: "Text erfolgreich umgeschrieben!",
    rewriter_error_empty: "Bitte gib einen Text zum Umschreiben ein",
    rewriter_error_generic: "Fehler beim Umschreiben. Bitte versuche es erneut.",
    rewriter_limit_title: "Tageslimit erreicht",
    rewriter_limit_message: "Du hast das kostenlose Tageslimit erreicht. Upgrade zu Pro für unbegrenzte Umschreibungen.",
    rewriter_usage_counter: "{used} von {total} Umschreibungen heute genutzt",
    rewriter_pro_feature: "Verfügbar im Pro-Plan",
    
    nav_home: "Start",
    nav_generator: "Generator",
    nav_wizard: "Prompt Wizard",
    nav_advisor: "Post-Zeit",
    nav_hooks: "Hook Generator",
    nav_rewriter: "Umschreiber",
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
    common_close: "Schließen",
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

    advisor_title: "Asesor IA de Horarios de Publicación",
    advisor_subtitle: "Encuentra tus mejores horarios de publicación para máximo alcance",
    advisor_platform: "Plataforma",
    advisor_selectPlatform: "Seleccionar plataforma",
    advisor_timezone: "Zona Horaria",
    advisor_niche: "Industria / Nicho (opcional)",
    advisor_nichePlaceholder: "ej. Café, Fitness, Tech, Moda",
    advisor_goal: "Objetivo (opcional)",
    advisor_selectGoal: "Selecciona tu objetivo",
    advisor_analyze: "Analizar Mejores Horarios",
    advisor_analyzing: "Analizando...",
    advisor_fillFields: "Por favor selecciona plataforma y zona horaria",
    advisor_success: "¡Análisis completado!",
    advisor_copied: "¡Horarios copiados al portapapeles!",
    advisor_bestTimes: "Tus mejores horarios de publicación:",
    advisor_whyWorks: "Por qué funciona:",
    advisor_proTip: "Consejo Pro:",
    advisor_infoTitle: "Horario de Publicación Basado en Datos",
    advisor_infoDescription: "Los datos son estimados por IA basados en comportamiento general de engagement — ajusta a tu audiencia con el tiempo.",
    advisor_limitMessage: "Has alcanzado el límite de hoy (2 análisis/día). Actualiza a Pro para análisis ilimitados.",

    hooks_title: "Generador de Hooks — Detén el scroll en 1 línea",
    hooks_subtitle: "Obtén 5 hooks que detengan el scroll adaptados a tu plataforma y audiencia",
    hooks_inputTitle: "Entradas de Hook",
    hooks_inputDescription: "Cuéntanos sobre tu contenido para generar hooks poderosos",
    hooks_topic: "Tema / Idea",
    hooks_topicPlaceholder: "ej. Promoción de café de fin de semana, transformación fitness, lanzamiento startup tech...",
    hooks_platform: "Plataforma",
    hooks_selectPlatform: "Seleccionar plataforma",
    hooks_tone: "Tono",
    hooks_selectTone: "Seleccionar tono",
    hooks_audience: "Audiencia (opcional)",
    hooks_audiencePlaceholder: "ej. jóvenes profesionales, amantes del café, entusiastas del fitness",
    hooks_styles: "Estilos de hook a incluir",
    hooks_styleCuriosity: "Curiosidad",
    hooks_styleHumor: "Humor",
    hooks_styleProvocation: "Provocación",
    hooks_styleAuthority: "Autoridad",
    hooks_styleRelatable: "Relatable",
    hooks_generate: "Generar Hooks",
    hooks_generating: "Generando...",
    hooks_fillFields: "Por favor completa todos los campos requeridos",
    hooks_selectStyle: "Por favor selecciona al menos un estilo de hook",
    hooks_success: "¡Hooks generados exitosamente!",
    hooks_regenerated: "¡Nuevos hooks generados!",
    hooks_copied: "¡Hook copiado al portapapeles!",
    hooks_copiedAll: "¡Todos los hooks copiados al portapapeles!",
    hooks_results: "Tus Hooks Generados",
    hooks_copy: "Copiar",
    hooks_useInGenerator: "Usar en Generador",
    hooks_copyAll: "Copiar todos los hooks",
    hooks_helperText: "Mantén los hooks bajo ~110 caracteres para el corte del feed móvil.",
    hooks_chars: "caracteres",
    hooks_usageCounter: "{used} de {total} usados hoy",
    hooks_limitTitle: "Límite Diario Alcanzado",
    hooks_limitMessage: "Has alcanzado tu límite gratuito de hoy. Pasa a Pro para hooks ilimitados.",
    
    rewriter_title: "Reescribir Textos con IA — Detén el scroll en 1 línea",
    rewriter_subtitle: "Mejora tus publicaciones para aumentar el alcance",
    rewriter_original_caption: "Texto Original",
    rewriter_placeholder: "Pega tu publicación de redes sociales aquí...",
    rewriter_goal_label: "Objetivo de Reescritura",
    rewriter_goal_tooltip: "Elige cómo la IA debe reescribir tu texto",
    rewriter_goal_viral: "Hacerlo viral",
    rewriter_goal_emotional: "Hacerlo emocional",
    rewriter_goal_professional: "Profesional",
    rewriter_goal_simplify: "Simplificar",
    rewriter_button: "Reescribir Texto",
    rewriter_empty_state: "Tu texto reescrito aparecerá aquí",
    rewriter_result_title: "Texto Reescrito",
    rewriter_why_works: "Por qué funciona",
    rewriter_suggestions: "Consejos Extra",
    rewriter_use_in_generator: "Usar en Generador",
    rewriter_success: "¡Texto reescrito exitosamente!",
    rewriter_error_empty: "Por favor ingresa un texto para reescribir",
    rewriter_error_generic: "Error al reescribir. Por favor intenta de nuevo.",
    rewriter_limit_title: "Límite Diario Alcanzado",
    rewriter_limit_message: "Has alcanzado el límite gratuito de hoy. Actualiza a Pro para reescrituras ilimitadas.",
    rewriter_usage_counter: "{used} de {total} reescrituras usadas hoy",
    rewriter_pro_feature: "Disponible en Plan Pro",
    
    nav_home: "Inicio",
    nav_generator: "Generador",
    nav_wizard: "Prompt Wizard",
    nav_advisor: "Horario Post",
    nav_hooks: "Generador Hooks",
    nav_rewriter: "Reescribir",
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
    common_close: "Cerrar",
  },
};

export const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.split('-')[0];
  if (browserLang === 'de' || browserLang === 'es') {
    return browserLang as Language;
  }
  return 'en';
};
