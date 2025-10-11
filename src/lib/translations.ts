export type Language = 'en' | 'de' | 'es';

export interface Translation {
  [key: string]: string | Translation;
}

export interface Translations {
  [language: string]: Translation;
}

export const translations: Record<Language, any> = {
  en: {
    // Top level
    home: "Home",
    pricing: "Pricing",
    faq: "FAQ",
    backToHome: "Back to Home",
    
    // Categories
    category: {
      create: "Create",
      optimize: "Optimize",
      analyze: "Analyze & Goals"
    },
    
    // Navigation (kept for compatibility)
    nav: {
      home: "Home",
      generator: "Generator",
      wizard: "Prompt Wizard",
      advisor: "Post Time",
      hookGenerator: "Hook Generator",
      rewriter: "Rewriter",
      goals: "Goals",
      performance: "Performance",
      account: "Account",
      pricing: "Pricing",
      faq: "FAQ"
    },
    
    // Authentication
    auth: {
      login: "Sign In",
      signup: "Sign Up",
      logout: "Logout",
      account: "Account",
      loginTitle: "Sign in to your account",
      signupTitle: "Create your account",
      email: "Email",
      password: "Password"
    },
    
    // Common
    common: {
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      generating: "Generating...",
      uploading: "Uploading...",
      language: "Language",
      comingSoon: "Coming Soon",
      featureComingSoon: "This feature is coming soon!",
      upgradeRequired: "Upgrade Required",
      upgradeToPro: "Upgrade to Pro",
      locked: "Locked",
      requiresPro: "Requires Pro Plan"
    },
    
    // Hero section
    hero: {
      title: "Your AI-powered Social Media Management Platform",
      subtitle: "Create, optimize, and analyze your content — all in one place.",
      cta: "Get Started",
      login: "Sign In",
      tryFree: "Try Free"
    },
    
    // Performance tracker
    performance: {
      title: "Performance Tracker",
      subtitle: "Analyze your post performance across all platforms",
      tabs: {
        overview: "Overview",
        trends: "Engagement Trends",
        insights: "Caption Insights",
        connections: "Connections"
      },
      kpi: {
        avgEngagement: "Avg Engagement Rate",
        totalPosts: "Total Posts Analyzed",
        bestDay: "Best Day to Post",
        bestHour: "Best Hour to Post"
      },
      charts: {
        engagementOverTime: "Engagement Over Time",
        providerDistribution: "Platform Distribution",
        topPosts: "Top Posts by Engagement"
      },
      actions: {
        syncLatest: "Sync Latest Data"
      },
      connections: {
        title: "Social Media Connections",
        description: "Connect your social media accounts to automatically sync post performance data",
        connect: "Connect",
        reconnect: "Reconnect",
        disconnect: "Disconnect",
        lastSync: "Last Sync",
        comingSoon: "Coming Soon",
        oauthComingSoon: "OAuth integration coming soon"
      },
      csv: {
        title: "CSV Upload",
        description: "Upload your post metrics manually via CSV file",
        upload: "Upload CSV",
        uploadTitle: "Upload Post Metrics",
        uploadDescription: "Import post performance data from a CSV file",
        formatInfo: "CSV must include: post_id, platform, posted_at, and at least one metric",
        downloadTemplate: "Download Template",
        selectFile: "Select CSV File",
        selectedFile: "Selected file",
        invalidFile: "Please select a valid CSV file",
        noFile: "Please select a file first",
        noValidRows: "No valid rows found in CSV",
        uploadSuccess: "Successfully imported {count} posts"
      },
      trends: {
        dayOfWeek: "Engagement by Day of Week",
        mediaType: "Engagement by Media Type",
        topPosts: "Top 20 Posts"
      },
      table: {
        caption: "Caption",
        platform: "Platform",
        engagement: "Engagement",
        likes: "Likes",
        comments: "Comments",
        date: "Date",
        link: "Link"
      },
      insights: {
        title: "AI Insights",
        subtitle: "Get AI-powered recommendations to improve your content strategy",
        generate: "Generate New Insights",
        generated: "AI insights generated successfully",
        empty: "No insights yet. Generate your first AI analysis.",
        generateFirst: "Generate AI Insights",
        noPosts: "No Posts Found",
        noPostsDescription: "Upload posts before generating insights",
        summary: "Performance Summary",
        topStyles: "Best Performing Styles",
        bestTimes: "Optimal Posting Times",
        recommendations: "Actionable Recommendations"
      }
    },
    
    // Calendar
    calendar_title: "Smart Content Calendar",
    calendar_add_post: "Add Post",
    calendar_add_note: "Add Note",
    calendar_export: "Export to Google Calendar",
    calendar_platform: "Platform",
    calendar_caption: "Caption",
    calendar_schedule_date: "Schedule Date & Time",
    calendar_status: "Status",
    calendar_draft: "Draft",
    calendar_scheduled: "Scheduled",
    calendar_posted: "Posted",
    calendar_note_text: "Note",
    calendar_upgrade_required: "Upgrade to Pro to create and manage your content calendar",
    calendar_schedule_post: "Schedule Post",
    calendar_image_upload: "Upload Image (Optional)",
    calendar_tags: "Tags (Optional)",
    
    // Bio Optimizer
    bio_title: "AI Bio Optimizer",
    bio_input_audience: "Target Audience",
    bio_input_topic: "Focus / Niche",
    bio_input_tone: "Tone / Personality",
    bio_input_keywords: "Keywords (Optional)",
    bio_generate: "Generate Bio",
    bio_explanation: "Why this works",
    bio_copy: "Copy Bio",
    bio_preview: "Preview Profile",
    bio_regenerate: "Regenerate",
    bio_brand_voice: "Brand Voice",
    bio_save_brand_voice: "Save Brand Voice",
    bio_apply_brand_voice: "Apply Saved Brand Voice",
    bio_history_title: "Recent Bios",
    bio_limit_reached: "Daily limit reached. Upgrade to Pro for unlimited bio generation.",
    bio_tone_friendly: "Friendly",
    bio_tone_professional: "Professional",
    bio_tone_bold: "Bold",
    bio_tone_humorous: "Humorous",
    bio_tone_inspirational: "Inspirational"
  },
  de: {
    // Top level
    home: "Startseite",
    pricing: "Preise",
    faq: "FAQ",
    backToHome: "Zurück zur Startseite",
    
    // Categories
    category: {
      create: "Erstellen",
      optimize: "Optimieren",
      analyze: "Analysieren & Ziele"
    },
    
    // Navigation (kept for compatibility)
    nav: {
      home: "Startseite",
      generator: "Generator",
      wizard: "Prompt Wizard",
      advisor: "Post-Zeit",
      hookGenerator: "Hook Generator",
      rewriter: "Umschreiber",
      goals: "Ziele",
      performance: "Leistung",
      account: "Konto",
      pricing: "Preise",
      faq: "FAQ"
    },
    
    // Authentication
    auth: {
      login: "Anmelden",
      signup: "Registrieren",
      logout: "Abmelden",
      account: "Konto",
      loginTitle: "Melde dich in deinem Konto an",
      signupTitle: "Erstelle dein Konto",
      email: "E-Mail",
      password: "Passwort"
    },
    
    // Common
    common: {
      error: "Fehler",
      success: "Erfolg",
      cancel: "Abbrechen",
      generating: "Wird generiert...",
      uploading: "Wird hochgeladen...",
      language: "Sprache",
      comingSoon: "Demnächst",
      featureComingSoon: "Diese Funktion ist demnächst verfügbar!",
      upgradeRequired: "Upgrade erforderlich",
      upgradeToPro: "Auf Pro upgraden",
      locked: "Gesperrt",
      requiresPro: "Benötigt Pro-Plan"
    },
    
    // Hero section
    hero: {
      title: "Deine KI-gestützte Social Media Management Plattform",
      subtitle: "Erstelle, optimiere und analysiere deine Inhalte — alles an einem Ort.",
      cta: "Loslegen",
      login: "Anmelden",
      tryFree: "Kostenlos testen"
    },
    
    // Performance tracker
    performance: {
      title: "Leistungs-Tracker",
      subtitle: "Analysieren Sie die Leistung Ihrer Beiträge auf allen Plattformen",
      tabs: {
        overview: "Übersicht",
        trends: "Engagement-Trends",
        insights: "Caption-Einblicke",
        connections: "Verbindungen"
      },
      kpi: {
        avgEngagement: "Durchschn. Engagement-Rate",
        totalPosts: "Analysierte Beiträge",
        bestDay: "Bester Tag zum Posten",
        bestHour: "Beste Stunde zum Posten"
      },
      charts: {
        engagementOverTime: "Engagement im Zeitverlauf",
        providerDistribution: "Plattform-Verteilung",
        topPosts: "Top-Beiträge nach Engagement"
      },
      actions: {
        syncLatest: "Neueste Daten synchronisieren"
      },
      connections: {
        title: "Social-Media-Verbindungen",
        description: "Verbinden Sie Ihre Social-Media-Konten, um Leistungsdaten automatisch zu synchronisieren",
        connect: "Verbinden",
        reconnect: "Neu verbinden",
        disconnect: "Trennen",
        lastSync: "Letzte Synchronisierung",
        comingSoon: "Demnächst verfügbar",
        oauthComingSoon: "OAuth-Integration demnächst verfügbar"
      },
      csv: {
        title: "CSV-Upload",
        description: "Laden Sie Ihre Beitragsmetriken manuell per CSV-Datei hoch",
        upload: "CSV hochladen",
        uploadTitle: "Beitragsmetriken hochladen",
        uploadDescription: "Importieren Sie Leistungsdaten aus einer CSV-Datei",
        formatInfo: "CSV muss enthalten: post_id, platform, posted_at und mindestens eine Metrik",
        downloadTemplate: "Vorlage herunterladen",
        selectFile: "CSV-Datei auswählen",
        selectedFile: "Ausgewählte Datei",
        invalidFile: "Bitte wählen Sie eine gültige CSV-Datei",
        noFile: "Bitte wählen Sie zuerst eine Datei",
        noValidRows: "Keine gültigen Zeilen in CSV gefunden",
        uploadSuccess: "{count} Beiträge erfolgreich importiert"
      },
      trends: {
        dayOfWeek: "Engagement nach Wochentag",
        mediaType: "Engagement nach Medientyp",
        topPosts: "Top 20 Beiträge"
      },
      table: {
        caption: "Beschriftung",
        platform: "Plattform",
        engagement: "Engagement",
        likes: "Likes",
        comments: "Kommentare",
        date: "Datum",
        link: "Link"
      },
      insights: {
        title: "KI-Einblicke",
        subtitle: "Erhalten Sie KI-gestützte Empfehlungen zur Verbesserung Ihrer Content-Strategie",
        generate: "Neue Einblicke generieren",
        generated: "KI-Einblicke erfolgreich generiert",
        empty: "Noch keine Einblicke. Generieren Sie Ihre erste KI-Analyse.",
        generateFirst: "KI-Einblicke generieren",
        noPosts: "Keine Beiträge gefunden",
        noPostsDescription: "Laden Sie Beiträge hoch, bevor Sie Einblicke generieren",
        summary: "Leistungszusammenfassung",
        topStyles: "Beste Caption-Stile",
        bestTimes: "Optimale Posting-Zeiten",
        recommendations: "Umsetzbare Empfehlungen"
      }
    },
    
    // Calendar
    calendar_title: "Intelligenter Content-Kalender",
    calendar_add_post: "Beitrag hinzufügen",
    calendar_add_note: "Notiz hinzufügen",
    calendar_export: "In Google Kalender exportieren",
    calendar_platform: "Plattform",
    calendar_caption: "Beschriftung",
    calendar_schedule_date: "Datum & Zeit planen",
    calendar_status: "Status",
    calendar_draft: "Entwurf",
    calendar_scheduled: "Geplant",
    calendar_posted: "Veröffentlicht",
    calendar_note_text: "Notiz",
    calendar_upgrade_required: "Upgrade auf Pro, um Ihren Content-Kalender zu erstellen und zu verwalten",
    calendar_schedule_post: "Beitrag planen",
    calendar_image_upload: "Bild hochladen (Optional)",
    calendar_tags: "Tags (Optional)",
    
    // Bio Optimizer
    bio_title: "KI Bio-Optimierer",
    bio_input_audience: "Zielgruppe",
    bio_input_topic: "Thema / Nische",
    bio_input_tone: "Ton / Persönlichkeit",
    bio_input_keywords: "Keywords (Optional)",
    bio_generate: "Bio erstellen",
    bio_explanation: "Warum es funktioniert",
    bio_copy: "Bio kopieren",
    bio_preview: "Profil ansehen",
    bio_regenerate: "Neu generieren",
    bio_brand_voice: "Markenstimme",
    bio_save_brand_voice: "Markenstimme speichern",
    bio_apply_brand_voice: "Gespeicherte Markenstimme anwenden",
    bio_history_title: "Letzte Bios",
    bio_limit_reached: "Tageslimit erreicht. Upgrade auf Pro für unbegrenzte Bio-Generierung.",
    bio_tone_friendly: "Freundlich",
    bio_tone_professional: "Professionell",
    bio_tone_bold: "Mutig",
    bio_tone_humorous: "Humorvoll",
    bio_tone_inspirational: "Inspirierend"
  },
  es: {
    // Top level
    home: "Inicio",
    pricing: "Precios",
    faq: "FAQ",
    backToHome: "Volver al Inicio",
    
    // Categories
    category: {
      create: "Crear",
      optimize: "Optimizar",
      analyze: "Analizar y Objetivos"
    },
    
    // Navigation (kept for compatibility)
    nav: {
      home: "Inicio",
      generator: "Generador",
      wizard: "Prompt Wizard",
      advisor: "Hora de Post",
      hookGenerator: "Generador de Hooks",
      rewriter: "Reescritor",
      goals: "Objetivos",
      performance: "Rendimiento",
      account: "Cuenta",
      pricing: "Precios",
      faq: "FAQ"
    },
    
    // Authentication
    auth: {
      login: "Iniciar Sesión",
      signup: "Registrarse",
      logout: "Cerrar Sesión",
      account: "Cuenta",
      loginTitle: "Inicia sesión en tu cuenta",
      signupTitle: "Crea tu cuenta",
      email: "Correo electrónico",
      password: "Contraseña"
    },
    
    // Common
    common: {
      error: "Error",
      success: "Éxito",
      cancel: "Cancelar",
      generating: "Generando...",
      uploading: "Subiendo...",
      language: "Idioma",
      comingSoon: "Próximamente",
      featureComingSoon: "¡Esta función estará disponible pronto!",
      upgradeRequired: "Se Requiere Actualización",
      upgradeToPro: "Actualizar a Pro",
      locked: "Bloqueado",
      requiresPro: "Requiere Plan Pro"
    },
    
    // Hero section
    hero: {
      title: "Tu Plataforma de Gestión de Redes Sociales con IA",
      subtitle: "Crea, optimiza y analiza tu contenido — todo en un solo lugar.",
      cta: "Comenzar",
      login: "Iniciar Sesión",
      tryFree: "Prueba Gratis"
    },
    
    // Performance tracker
    performance: {
      title: "Rastreador de Rendimiento",
      subtitle: "Analiza el rendimiento de tus publicaciones en todas las plataformas",
      tabs: {
        overview: "Resumen",
        trends: "Tendencias de Engagement",
        insights: "Insights de Captions",
        connections: "Conexiones"
      },
      kpi: {
        avgEngagement: "Tasa Promedio de Engagement",
        totalPosts: "Publicaciones Analizadas",
        bestDay: "Mejor Día para Publicar",
        bestHour: "Mejor Hora para Publicar"
      },
      charts: {
        engagementOverTime: "Engagement a lo Largo del Tiempo",
        providerDistribution: "Distribución de Plataformas",
        topPosts: "Mejores Publicaciones por Engagement"
      },
      actions: {
        syncLatest: "Sincronizar Datos Recientes"
      },
      connections: {
        title: "Conexiones de Redes Sociales",
        description: "Conecta tus cuentas de redes sociales para sincronizar automáticamente los datos de rendimiento",
        connect: "Conectar",
        reconnect: "Reconectar",
        disconnect: "Desconectar",
        lastSync: "Última Sincronización",
        comingSoon: "Próximamente",
        oauthComingSoon: "Integración OAuth próximamente"
      },
      csv: {
        title: "Subida de CSV",
        description: "Sube tus métricas de publicaciones manualmente mediante archivo CSV",
        upload: "Subir CSV",
        uploadTitle: "Subir Métricas de Publicaciones",
        uploadDescription: "Importa datos de rendimiento desde un archivo CSV",
        formatInfo: "El CSV debe incluir: post_id, platform, posted_at y al menos una métrica",
        downloadTemplate: "Descargar Plantilla",
        selectFile: "Seleccionar Archivo CSV",
        selectedFile: "Archivo seleccionado",
        invalidFile: "Por favor selecciona un archivo CSV válido",
        noFile: "Por favor selecciona un archivo primero",
        noValidRows: "No se encontraron filas válidas en el CSV",
        uploadSuccess: "{count} publicaciones importadas exitosamente"
      },
      trends: {
        dayOfWeek: "Engagement por Día de la Semana",
        mediaType: "Engagement por Tipo de Medio",
        topPosts: "Top 20 Publicaciones"
      },
      table: {
        caption: "Caption",
        platform: "Plataforma",
        engagement: "Engagement",
        likes: "Me gusta",
        comments: "Comentarios",
        date: "Fecha",
        link: "Enlace"
      },
      insights: {
        title: "Insights de IA",
        subtitle: "Obtén recomendaciones impulsadas por IA para mejorar tu estrategia de contenido",
        generate: "Generar Nuevos Insights",
        generated: "Insights de IA generados exitosamente",
        empty: "Aún no hay insights. Genera tu primer análisis de IA.",
        generateFirst: "Generar Insights de IA",
        noPosts: "No se encontraron publicaciones",
        noPostsDescription: "Sube publicaciones antes de generar insights",
        summary: "Resumen de Rendimiento",
        topStyles: "Mejores Estilos de Caption",
        bestTimes: "Horarios Óptimos de Publicación",
        recommendations: "Recomendaciones Accionables"
      }
    },
    
    // Calendar
    calendar_title: "Calendario inteligente de contenido",
    calendar_add_post: "Añadir publicación",
    calendar_add_note: "Añadir nota",
    calendar_export: "Exportar a Google Calendar",
    calendar_platform: "Plataforma",
    calendar_caption: "Leyenda",
    calendar_schedule_date: "Fecha y hora programada",
    calendar_status: "Estado",
    calendar_draft: "Borrador",
    calendar_scheduled: "Programado",
    calendar_posted: "Publicado",
    calendar_note_text: "Nota",
    calendar_upgrade_required: "Actualiza a Pro para crear y gestionar tu calendario de contenido",
    calendar_schedule_post: "Programar publicación",
    calendar_image_upload: "Subir imagen (Opcional)",
    calendar_tags: "Etiquetas (Opcional)",
    
    // Bio Optimizer
    bio_title: "Optimizador de Bio con IA",
    bio_input_audience: "Audiencia objetivo",
    bio_input_topic: "Enfoque / Nicho",
    bio_input_tone: "Tono / Personalidad",
    bio_input_keywords: "Palabras clave (Opcional)",
    bio_generate: "Generar bio",
    bio_explanation: "Por qué funciona",
    bio_copy: "Copiar bio",
    bio_preview: "Vista previa del perfil",
    bio_regenerate: "Regenerar",
    bio_brand_voice: "Voz de marca",
    bio_save_brand_voice: "Guardar voz de marca",
    bio_apply_brand_voice: "Aplicar voz de marca guardada",
    bio_history_title: "Bios recientes",
    bio_limit_reached: "Límite diario alcanzado. Actualiza a Pro para generación ilimitada de bios.",
    bio_tone_friendly: "Amigable",
    bio_tone_professional: "Profesional",
    bio_tone_bold: "Audaz",
    bio_tone_humorous: "Humorístico",
    bio_tone_inspirational: "Inspirador"
  }
} as const;

export const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('de')) return 'de';
  if (browserLang.startsWith('es')) return 'es';
  return 'en';
};