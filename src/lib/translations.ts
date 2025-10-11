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
      analyze: "Analyze & Goals",
      design: "Design & Visuals"
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
    bio_tone_inspirational: "Inspirational",
    
    // Image Caption Pairing
    image_caption_title: "AI Image Caption Pairing",
    image_caption_subtitle: "Upload an image and get AI-generated captions",
    upload_image: "Upload Image",
    drag_drop_image: "Drag & drop your image here or click to browse",
    analyzing_image: "Analyzing image...",
    generate_captions: "Generate Captions",
    generating_captions: "Generating captions...",
    regenerate: "Regenerate",
    copy_caption: "Copy Caption",
    use_in_generator: "Use in Generator",
    caption_copied: "Caption copied to clipboard!",
    image_analysis: "Image Analysis",
    detected_objects: "Detected Objects",
    scene_type: "Scene Type",
    emotion: "Emotion",
    theme: "Theme",
    caption_style_emotional: "Emotional",
    caption_style_funny: "Funny",
    caption_style_minimal: "Minimal",
    caption_style_storytelling: "Storytelling",
    caption_style_engagement: "Engagement",
    upload_error: "Failed to upload image",
    analysis_error: "Failed to analyze image",
    select_platform: "Select Platform",
    history_title: "Recent Uploads",
    no_history: "No recent uploads yet",
    delete_item: "Delete",
    image_caption_limit_reached: "Daily limit reached. Upgrade to Pro for unlimited uploads.",
    max_file_size: "Maximum file size: 10 MB",
    supported_formats: "Supported: JPEG, PNG, WebP",
    
    // Brand Kit
    brand_kit_title: "Auto-Brand Kit",
    brand_kit_subtitle: "Upload your logo and define your brand identity",
    brand_kit_upload_logo: "Upload Logo",
    brand_kit_primary_color: "Primary Color",
    brand_kit_secondary_color: "Secondary Color (Optional)",
    brand_kit_description: "Brand Description",
    brand_kit_description_placeholder: "E.g., Playful fitness brand for women 25-35",
    brand_kit_tone: "Tone Preference",
    brand_kit_tone_modern: "Modern",
    brand_kit_tone_minimalist: "Minimalist",
    brand_kit_tone_playful: "Playful",
    brand_kit_tone_elegant: "Elegant",
    brand_kit_tone_bold: "Bold",
    brand_kit_generate: "Generate Brand Kit",
    brand_kit_regenerate: "Regenerate",
    brand_kit_generating: "Generating your brand kit...",
    brand_kit_color_palette: "Color Palette",
    brand_kit_font_pairing: "Font Pairing",
    brand_kit_headline_font: "Headline",
    brand_kit_body_font: "Body",
    brand_kit_mood: "Mood",
    brand_kit_keywords: "Keywords",
    brand_kit_usage: "Usage Tips",
    brand_kit_ai_insight: "Why This Fits Your Brand",
    brand_kit_copy_hex: "Copy HEX",
    brand_kit_copied: "Copied!",
    brand_kit_my_kits: "My Brand Kits",
    brand_kit_no_kits: "No brand kits yet",
    brand_kit_create_first: "Create your first brand kit to get started",
    brand_kit_delete_confirm: "Are you sure you want to delete this brand kit?",
    
    // Carousel Generator
    carousel_title: "Carousel Generator",
    carousel_subtitle: "Transform text into engaging slide decks",
    carousel_input_label: "Your Content",
    carousel_input_placeholder: "Paste your text or bullet points here (2-2,500 characters)...",
    carousel_slide_count: "Number of Slides",
    carousel_platform: "Platform",
    carousel_style: "Style Template",
    carousel_brand_kit: "Brand Kit",
    carousel_brand_kit_default: "Use default theme",
    carousel_cta_toggle: "Include CTA slide",
    carousel_generate: "Generate Slides",
    carousel_improve: "Improve Readability",
    carousel_regenerate: "Regenerate Outline",
    carousel_export_png: "Export PNG",
    carousel_export_pdf: "Export PDF",
    carousel_reorder: "Drag to reorder slides",
    carousel_add_slide: "Add Slide",
    carousel_remove_slide: "Remove Slide",
    carousel_edit_slide: "Click to edit",
    carousel_slide_title: "Headline",
    carousel_slide_bullets: "Bullet Points",
    carousel_no_projects: "No saved carousel projects yet",
    carousel_saved_projects: "Saved Projects",
    carousel_load_project: "Load",
    carousel_delete_project: "Delete",
    carousel_save_project: "Save Project",
    carousel_watermark_info: "Free plan includes watermark",
    carousel_upgrade_for_more: "Upgrade to Pro for 10 slides, PDF export, and no watermark",
    carousel_pdf_pro_only: "PDF export is a Pro feature"
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
      analyze: "Analysieren & Ziele",
      design: "Design & Visuals"
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
    bio_tone_inspirational: "Inspirierend",
    
    // Image Caption Pairing
    image_caption_title: "KI Bild-Caption Pairing",
    image_caption_subtitle: "Lade ein Bild hoch und erhalte KI-generierte Captions",
    upload_image: "Bild hochladen",
    drag_drop_image: "Ziehe dein Bild hierher oder klicke zum Durchsuchen",
    analyzing_image: "Bild wird analysiert...",
    generate_captions: "Captions generieren",
    generating_captions: "Captions werden generiert...",
    regenerate: "Neu generieren",
    copy_caption: "Caption kopieren",
    use_in_generator: "Im Generator verwenden",
    caption_copied: "Caption in Zwischenablage kopiert!",
    image_analysis: "Bildanalyse",
    detected_objects: "Erkannte Objekte",
    scene_type: "Szenentyp",
    emotion: "Emotion",
    theme: "Thema",
    caption_style_emotional: "Emotional",
    caption_style_funny: "Lustig",
    caption_style_minimal: "Minimal",
    caption_style_storytelling: "Storytelling",
    caption_style_engagement: "Engagement",
    upload_error: "Bild konnte nicht hochgeladen werden",
    analysis_error: "Bild konnte nicht analysiert werden",
    select_platform: "Plattform auswählen",
    history_title: "Letzte Uploads",
    no_history: "Noch keine Uploads vorhanden",
    delete_item: "Löschen",
    image_caption_limit_reached: "Tageslimit erreicht. Upgrade auf Pro für unbegrenzte Uploads.",
    max_file_size: "Maximale Dateigröße: 10 MB",
    supported_formats: "Unterstützt: JPEG, PNG, WebP",
    
    // Brand Kit
    brand_kit_title: "Automatisches Marken-Set",
    brand_kit_subtitle: "Laden Sie Ihr Logo hoch und definieren Sie Ihre Markenidentität",
    brand_kit_upload_logo: "Logo hochladen",
    brand_kit_primary_color: "Hauptfarbe",
    brand_kit_secondary_color: "Sekundärfarbe (Optional)",
    brand_kit_description: "Markenbeschreibung",
    brand_kit_description_placeholder: "Z.B., Spielerische Fitnessmarke für Frauen 25-35",
    brand_kit_tone: "Tonpräferenz",
    brand_kit_tone_modern: "Modern",
    brand_kit_tone_minimalist: "Minimalistisch",
    brand_kit_tone_playful: "Spielerisch",
    brand_kit_tone_elegant: "Elegant",
    brand_kit_tone_bold: "Mutig",
    brand_kit_generate: "Marken-Set erstellen",
    brand_kit_regenerate: "Neu generieren",
    brand_kit_generating: "Ihr Marken-Set wird erstellt...",
    brand_kit_color_palette: "Farbpalette",
    brand_kit_font_pairing: "Schriftpaarung",
    brand_kit_headline_font: "Überschrift",
    brand_kit_body_font: "Fließtext",
    brand_kit_mood: "Stimmung",
    brand_kit_keywords: "Schlüsselwörter",
    brand_kit_usage: "Verwendungstipps",
    brand_kit_ai_insight: "Warum das zu Ihrer Marke passt",
    brand_kit_copy_hex: "HEX kopieren",
    brand_kit_copied: "Kopiert!",
    brand_kit_my_kits: "Meine Marken-Sets",
    brand_kit_no_kits: "Noch keine Marken-Sets",
    brand_kit_create_first: "Erstellen Sie Ihr erstes Marken-Set",
    brand_kit_delete_confirm: "Möchten Sie dieses Marken-Set wirklich löschen?",
    
    // Carousel Generator
    carousel_title: "Karussell-Generator",
    carousel_subtitle: "Verwandle Text in ansprechende Präsentationen",
    carousel_input_label: "Dein Inhalt",
    carousel_input_placeholder: "Füge deinen Text oder Stichpunkte hier ein (2-2.500 Zeichen)...",
    carousel_slide_count: "Anzahl der Folien",
    carousel_platform: "Plattform",
    carousel_style: "Stil-Vorlage",
    carousel_brand_kit: "Marken-Set",
    carousel_brand_kit_default: "Standarddesign verwenden",
    carousel_cta_toggle: "CTA-Folie einschließen",
    carousel_generate: "Folien erstellen",
    carousel_improve: "Lesbarkeit verbessern",
    carousel_regenerate: "Gliederung neu erstellen",
    carousel_export_png: "PNG exportieren",
    carousel_export_pdf: "PDF exportieren",
    carousel_reorder: "Ziehen zum Neuordnen",
    carousel_add_slide: "Folie hinzufügen",
    carousel_remove_slide: "Folie entfernen",
    carousel_edit_slide: "Klicken zum Bearbeiten",
    carousel_slide_title: "Überschrift",
    carousel_slide_bullets: "Stichpunkte",
    carousel_no_projects: "Noch keine gespeicherten Karussell-Projekte",
    carousel_saved_projects: "Gespeicherte Projekte",
    carousel_load_project: "Laden",
    carousel_delete_project: "Löschen",
    carousel_save_project: "Projekt speichern",
    carousel_watermark_info: "Kostenloser Plan enthält Wasserzeichen",
    carousel_upgrade_for_more: "Upgrade auf Pro für 10 Folien, PDF-Export und kein Wasserzeichen",
    carousel_pdf_pro_only: "PDF-Export ist eine Pro-Funktion"
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
      analyze: "Analizar y Objetivos",
      design: "Diseño y Visuales"
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
    bio_tone_inspirational: "Inspirador",
    
    // Image Caption Pairing
    image_caption_title: "Emparejamiento de Subtítulos de Imagen con IA",
    image_caption_subtitle: "Sube una imagen y obtén subtítulos generados por IA",
    upload_image: "Subir imagen",
    drag_drop_image: "Arrastra y suelta tu imagen aquí o haz clic para buscar",
    analyzing_image: "Analizando imagen...",
    generate_captions: "Generar subtítulos",
    generating_captions: "Generando subtítulos...",
    regenerate: "Regenerar",
    copy_caption: "Copiar subtítulo",
    use_in_generator: "Usar en generador",
    caption_copied: "¡Subtítulo copiado al portapapeles!",
    image_analysis: "Análisis de imagen",
    detected_objects: "Objetos detectados",
    scene_type: "Tipo de escena",
    emotion: "Emoción",
    theme: "Tema",
    caption_style_emotional: "Emocional",
    caption_style_funny: "Gracioso",
    caption_style_minimal: "Minimal",
    caption_style_storytelling: "Narrativo",
    caption_style_engagement: "Engagement",
    upload_error: "Error al subir la imagen",
    analysis_error: "Error al analizar la imagen",
    select_platform: "Seleccionar plataforma",
    history_title: "Subidas recientes",
    no_history: "Aún no hay subidas recientes",
    delete_item: "Eliminar",
    image_caption_limit_reached: "Límite diario alcanzado. Actualiza a Pro para subidas ilimitadas.",
    max_file_size: "Tamaño máximo de archivo: 10 MB",
    supported_formats: "Soportado: JPEG, PNG, WebP",
    
    // Brand Kit
    brand_kit_title: "Kit de Marca Automático",
    brand_kit_subtitle: "Sube tu logotipo y define tu identidad de marca",
    brand_kit_upload_logo: "Subir logotipo",
    brand_kit_primary_color: "Color principal",
    brand_kit_secondary_color: "Color secundario (Opcional)",
    brand_kit_description: "Descripción de marca",
    brand_kit_description_placeholder: "Ej., Marca de fitness divertida para mujeres 25-35",
    brand_kit_tone: "Preferencia de tono",
    brand_kit_tone_modern: "Moderno",
    brand_kit_tone_minimalist: "Minimalista",
    brand_kit_tone_playful: "Divertido",
    brand_kit_tone_elegant: "Elegante",
    brand_kit_tone_bold: "Audaz",
    brand_kit_generate: "Generar Kit de Marca",
    brand_kit_regenerate: "Regenerar",
    brand_kit_generating: "Generando tu kit de marca...",
    brand_kit_color_palette: "Paleta de colores",
    brand_kit_font_pairing: "Combinación de fuentes",
    brand_kit_headline_font: "Título",
    brand_kit_body_font: "Cuerpo",
    brand_kit_mood: "Estado de ánimo",
    brand_kit_keywords: "Palabras clave",
    brand_kit_usage: "Consejos de uso",
    brand_kit_ai_insight: "Por qué encaja con tu marca",
    brand_kit_copy_hex: "Copiar HEX",
    brand_kit_copied: "¡Copiado!",
    brand_kit_my_kits: "Mis Kits de Marca",
    brand_kit_no_kits: "Aún no hay kits de marca",
    brand_kit_create_first: "Crea tu primer kit de marca para comenzar",
    brand_kit_delete_confirm: "¿Estás seguro de que quieres eliminar este kit de marca?",
    
    // Carousel Generator
    carousel_title: "Generador de Carrusel",
    carousel_subtitle: "Transforma texto en presentaciones atractivas",
    carousel_input_label: "Tu Contenido",
    carousel_input_placeholder: "Pega tu texto o viñetas aquí (2-2.500 caracteres)...",
    carousel_slide_count: "Número de Diapositivas",
    carousel_platform: "Plataforma",
    carousel_style: "Plantilla de Estilo",
    carousel_brand_kit: "Kit de Marca",
    carousel_brand_kit_default: "Usar tema predeterminado",
    carousel_cta_toggle: "Incluir diapositiva de CTA",
    carousel_generate: "Generar Diapositivas",
    carousel_improve: "Mejorar Legibilidad",
    carousel_regenerate: "Regenerar Esquema",
    carousel_export_png: "Exportar PNG",
    carousel_export_pdf: "Exportar PDF",
    carousel_reorder: "Arrastra para reordenar",
    carousel_add_slide: "Añadir Diapositiva",
    carousel_remove_slide: "Eliminar Diapositiva",
    carousel_edit_slide: "Clic para editar",
    carousel_slide_title: "Título",
    carousel_slide_bullets: "Viñetas",
    carousel_no_projects: "Aún no hay proyectos de carrusel guardados",
    carousel_saved_projects: "Proyectos Guardados",
    carousel_load_project: "Cargar",
    carousel_delete_project: "Eliminar",
    carousel_save_project: "Guardar Proyecto",
    carousel_watermark_info: "El plan gratuito incluye marca de agua",
    carousel_upgrade_for_more: "Mejora a Pro para 10 diapositivas, exportación PDF y sin marca de agua",
    carousel_pdf_pro_only: "La exportación PDF es una función Pro"
  }
} as const;

export const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('de')) return 'de';
  if (browserLang.startsWith('es')) return 'es';
  return 'en';
};