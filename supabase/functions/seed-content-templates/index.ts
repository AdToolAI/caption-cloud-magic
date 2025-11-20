import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 5 Specialized Ad Templates
const AD_TEMPLATES = [
  {
    name: 'Instagram Product Launch',
    description: 'Dynamisches Produkt-Showcase mit Features und Call-to-Action',
    content_type: 'ad',
    category: 'product',
    platform: 'instagram',
    aspect_ratios: ['1:1', '4:5', '9:16'],
    platforms: ['instagram', 'facebook'],
    duration_min: 15,
    duration_max: 30,
    template_config: {
      animation_style: 'dynamic',
      color_scheme: 'vibrant',
      music_genre: 'upbeat',
      text_style: 'modern',
      transition: 'smooth'
    },
    customizable_fields: [
      { key: 'product_name', label: 'Produktname', type: 'text', required: true },
      { key: 'product_image', label: 'Produktbild', type: 'image', required: true },
      { key: 'feature_1', label: 'Feature 1', type: 'text', required: true },
      { key: 'feature_2', label: 'Feature 2', type: 'text', required: true },
      { key: 'feature_3', label: 'Feature 3', type: 'text', required: true },
      { key: 'cta_text', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Jetzt kaufen!' },
      { key: 'brand_color', label: 'Markenfarbe', type: 'color', required: true, default_value: '#FF6B6B' }
    ],
    ai_features: ['script_generation', 'voiceover', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Sale & Promo Video',
    description: 'Aufmerksamkeitsstarkes Angebots-Video mit Countdown und Rabatt',
    content_type: 'ad',
    category: 'promo',
    platform: 'instagram',
    aspect_ratios: ['1:1', '9:16'],
    platforms: ['instagram', 'tiktok', 'facebook'],
    duration_min: 10,
    duration_max: 20,
    template_config: {
      animation_style: 'energetic',
      color_scheme: 'high_contrast',
      music_genre: 'electronic',
      text_style: 'bold',
      countdown_enabled: true
    },
    customizable_fields: [
      { key: 'discount_percent', label: 'Rabatt in %', type: 'number', required: true, default_value: 30 },
      { key: 'product_name', label: 'Produktname', type: 'text', required: true },
      { key: 'product_image', label: 'Produktbild', type: 'image', required: true },
      { key: 'sale_end_date', label: 'Angebot endet am', type: 'text', required: true },
      { key: 'cta_text', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Jetzt sparen!' },
      { key: 'promo_code', label: 'Promo Code (optional)', type: 'text', required: false }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Service Explainer',
    description: 'Erkläre deine Dienstleistung in 30 Sekunden',
    content_type: 'ad',
    category: 'service',
    platform: 'instagram',
    aspect_ratios: ['16:9', '1:1', '9:16'],
    platforms: ['instagram', 'linkedin', 'youtube'],
    duration_min: 20,
    duration_max: 30,
    template_config: {
      animation_style: 'professional',
      color_scheme: 'corporate',
      music_genre: 'ambient',
      text_style: 'clean',
      icon_style: 'minimalist'
    },
    customizable_fields: [
      { key: 'service_name', label: 'Service Name', type: 'text', required: true },
      { key: 'service_icon', label: 'Service Icon/Logo', type: 'image', required: true },
      { key: 'problem', label: 'Problem (Kundenherausforderung)', type: 'textarea', required: true },
      { key: 'solution', label: 'Lösung (Dein Service)', type: 'textarea', required: true },
      { key: 'benefit_1', label: 'Vorteil 1', type: 'text', required: true },
      { key: 'benefit_2', label: 'Vorteil 2', type: 'text', required: true },
      { key: 'cta_text', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Mehr erfahren' }
    ],
    ai_features: ['script_generation', 'voiceover', 'auto_captions'],
    is_featured: false,
    is_public: true
  },
  {
    name: 'App Download Ad',
    description: 'Mobile App Features mit Download-CTA',
    content_type: 'ad',
    category: 'app',
    platform: 'instagram',
    aspect_ratios: ['9:16', '1:1'],
    platforms: ['instagram', 'tiktok', 'snapchat'],
    duration_min: 15,
    duration_max: 25,
    template_config: {
      animation_style: 'screen_mockup',
      color_scheme: 'gradient',
      music_genre: 'modern',
      text_style: 'tech',
      phone_mockup: true
    },
    customizable_fields: [
      { key: 'app_name', label: 'App Name', type: 'text', required: true },
      { key: 'app_icon', label: 'App Icon', type: 'image', required: true },
      { key: 'screenshot_1', label: 'Screenshot 1', type: 'image', required: true },
      { key: 'screenshot_2', label: 'Screenshot 2', type: 'image', required: true },
      { key: 'screenshot_3', label: 'Screenshot 3', type: 'image', required: true },
      { key: 'main_feature', label: 'Hauptfunktion', type: 'text', required: true },
      { key: 'cta_text', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Jetzt downloaden' },
      { key: 'store_badge', label: 'Store (iOS/Android)', type: 'select', required: true, options: ['iOS', 'Android', 'Both'] }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Restaurant & Food Ad',
    description: 'Appetitanregende Food-Videos für Restaurants und Cafés',
    content_type: 'ad',
    category: 'food',
    platform: 'instagram',
    aspect_ratios: ['1:1', '4:5', '9:16'],
    platforms: ['instagram', 'tiktok', 'facebook'],
    duration_min: 10,
    duration_max: 20,
    template_config: {
      animation_style: 'appetizing',
      color_scheme: 'warm',
      music_genre: 'acoustic',
      text_style: 'elegant',
      food_transitions: true
    },
    customizable_fields: [
      { key: 'restaurant_name', label: 'Restaurant Name', type: 'text', required: true },
      { key: 'dish_name', label: 'Gericht Name', type: 'text', required: true },
      { key: 'dish_image_1', label: 'Bild 1', type: 'image', required: true },
      { key: 'dish_image_2', label: 'Bild 2', type: 'image', required: true },
      { key: 'dish_image_3', label: 'Bild 3', type: 'image', required: true },
      { key: 'special_offer', label: 'Spezialangebot (optional)', type: 'text', required: false },
      { key: 'location', label: 'Standort/Adresse', type: 'text', required: true },
      { key: 'cta_text', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Jetzt bestellen!' }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: false,
    is_public: true
  }
];

// 5 Specialized Story Templates
const STORY_TEMPLATES = [
  {
    name: 'Behind the Scenes',
    description: 'Zeige authentische Einblicke hinter die Kulissen',
    content_type: 'story',
    category: 'behind_the_scenes',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'facebook'],
    duration_min: 8,
    duration_max: 15,
    template_config: {
      animation_style: 'casual',
      color_scheme: 'natural',
      music_genre: 'indie',
      text_style: 'handwritten',
      overlay_style: 'transparent'
    },
    customizable_fields: [
      { key: 'title', label: 'Story Titel', type: 'text', required: true, default_value: 'Behind the Scenes' },
      { key: 'main_image', label: 'Hauptbild', type: 'image', required: true },
      { key: 'caption_text', label: 'Caption Text', type: 'textarea', required: true },
      { key: 'brand_logo', label: 'Logo (optional)', type: 'image', required: false },
      { key: 'sticker_style', label: 'Sticker Style', type: 'select', required: true, options: ['Minimal', 'Playful', 'Professional'] }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Daily Update Story',
    description: 'Tägliche Updates und Neuigkeiten teilen',
    content_type: 'story',
    category: 'daily',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'facebook', 'snapchat'],
    duration_min: 5,
    duration_max: 10,
    template_config: {
      animation_style: 'quick',
      color_scheme: 'brand',
      music_genre: 'upbeat',
      text_style: 'modern',
      date_badge: true
    },
    customizable_fields: [
      { key: 'update_text', label: 'Update Text', type: 'textarea', required: true },
      { key: 'image', label: 'Bild/Video', type: 'image', required: true },
      { key: 'emoji', label: 'Emoji', type: 'text', required: false, default_value: '✨' },
      { key: 'brand_color', label: 'Markenfarbe', type: 'color', required: true, default_value: '#4A90E2' },
      { key: 'show_date', label: 'Datum anzeigen?', type: 'select', required: true, options: ['Ja', 'Nein'] }
    ],
    ai_features: ['script_generation'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Announcement Story',
    description: 'Wichtige Ankündigungen hervorheben',
    content_type: 'story',
    category: 'announcement',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'facebook'],
    duration_min: 10,
    duration_max: 15,
    template_config: {
      animation_style: 'attention_grabbing',
      color_scheme: 'bold',
      music_genre: 'fanfare',
      text_style: 'bold',
      confetti_effect: true
    },
    customizable_fields: [
      { key: 'announcement_title', label: 'Ankündigung Titel', type: 'text', required: true },
      { key: 'announcement_text', label: 'Ankündigung Text', type: 'textarea', required: true },
      { key: 'background_image', label: 'Hintergrundbild', type: 'image', required: true },
      { key: 'icon', label: 'Icon (optional)', type: 'image', required: false },
      { key: 'accent_color', label: 'Akzentfarbe', type: 'color', required: true, default_value: '#FF6B6B' },
      { key: 'swipe_up_text', label: 'Swipe-Up Text', type: 'text', required: false, default_value: 'Mehr erfahren' }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: false,
    is_public: true
  },
  {
    name: 'Poll & Question Story',
    description: 'Interaktive Story mit Umfragen und Fragen',
    content_type: 'story',
    category: 'interactive',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram'],
    duration_min: 8,
    duration_max: 12,
    template_config: {
      animation_style: 'playful',
      color_scheme: 'gradient',
      music_genre: 'none',
      text_style: 'fun',
      poll_style: 'modern'
    },
    customizable_fields: [
      { key: 'question_text', label: 'Frage', type: 'text', required: true },
      { key: 'option_a', label: 'Option A', type: 'text', required: true },
      { key: 'option_b', label: 'Option B', type: 'text', required: true },
      { key: 'background_color', label: 'Hintergrundfarbe', type: 'color', required: true, default_value: '#667EEA' },
      { key: 'background_image', label: 'Hintergrundbild (optional)', type: 'image', required: false }
    ],
    ai_features: ['script_generation'],
    is_featured: false,
    is_public: true
  },
  {
    name: 'Quote & Motivation Story',
    description: 'Inspirierende Zitate und motivierende Sprüche',
    content_type: 'story',
    category: 'quote',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'facebook'],
    duration_min: 6,
    duration_max: 10,
    template_config: {
      animation_style: 'subtle',
      color_scheme: 'elegant',
      music_genre: 'ambient',
      text_style: 'serif',
      typography_focus: true
    },
    customizable_fields: [
      { key: 'quote_text', label: 'Zitat', type: 'textarea', required: true },
      { key: 'author', label: 'Autor (optional)', type: 'text', required: false },
      { key: 'background_style', label: 'Hintergrund Style', type: 'select', required: true, options: ['Gradient', 'Image', 'Solid'] },
      { key: 'background_color', label: 'Hintergrundfarbe', type: 'color', required: true, default_value: '#2D3748' },
      { key: 'text_color', label: 'Textfarbe', type: 'color', required: true, default_value: '#FFFFFF' }
    ],
    ai_features: ['script_generation'],
    is_featured: true,
    is_public: true
  }
];

// 5 Specialized Reel Templates
const REEL_TEMPLATES = [
  {
    name: 'Quick Tutorial',
    description: 'Kurzes Tutorial oder How-To im Vertical Format',
    content_type: 'reel',
    category: 'tutorial',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'tiktok', 'youtube'],
    duration_min: 15,
    duration_max: 30,
    template_config: {
      animation_style: 'step_by_step',
      color_scheme: 'educational',
      music_genre: 'upbeat',
      text_style: 'clear',
      step_numbers: true
    },
    customizable_fields: [
      { key: 'tutorial_title', label: 'Tutorial Titel', type: 'text', required: true },
      { key: 'step_1', label: 'Schritt 1', type: 'text', required: true },
      { key: 'step_2', label: 'Schritt 2', type: 'text', required: true },
      { key: 'step_3', label: 'Schritt 3', type: 'text', required: true },
      { key: 'video_clip', label: 'Video Clip', type: 'video', required: true },
      { key: 'outro_text', label: 'Outro Text', type: 'text', required: true, default_value: 'Speicher für später!' }
    ],
    ai_features: ['script_generation', 'voiceover', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Before & After Transformation',
    description: 'Eindrucksvolle Vorher-Nachher-Vergleiche',
    content_type: 'reel',
    category: 'transformation',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'tiktok', 'youtube'],
    duration_min: 10,
    duration_max: 20,
    template_config: {
      animation_style: 'split_screen',
      color_scheme: 'contrast',
      music_genre: 'dramatic',
      text_style: 'impact',
      transition_effect: 'swipe'
    },
    customizable_fields: [
      { key: 'before_image', label: 'Vorher Bild', type: 'image', required: true },
      { key: 'after_image', label: 'Nachher Bild', type: 'image', required: true },
      { key: 'transformation_text', label: 'Transformation Text', type: 'text', required: true },
      { key: 'time_period', label: 'Zeitraum', type: 'text', required: true, default_value: '30 Tage' },
      { key: 'cta_text', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Starte heute!' }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Trending Audio Reel',
    description: 'Nutze virale Sounds für maximale Reichweite',
    content_type: 'reel',
    category: 'trending',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'tiktok'],
    duration_min: 7,
    duration_max: 15,
    template_config: {
      animation_style: 'trend_aligned',
      color_scheme: 'vibrant',
      music_genre: 'trending',
      text_style: 'viral',
      beat_sync: true
    },
    customizable_fields: [
      { key: 'hook_text', label: 'Hook (erste 3 Sekunden)', type: 'text', required: true },
      { key: 'main_content', label: 'Hauptinhalt', type: 'textarea', required: true },
      { key: 'video_clips', label: 'Video Clips', type: 'video', required: true },
      { key: 'trending_hashtag', label: 'Trending Hashtag', type: 'text', required: false },
      { key: 'outro_cta', label: 'Outro CTA', type: 'text', required: true, default_value: 'Folge für mehr!' }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: true,
    is_public: true
  },
  {
    name: 'Product Review Reel',
    description: 'Authentische Produktvorstellung und Review',
    content_type: 'reel',
    category: 'review',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'tiktok', 'youtube'],
    duration_min: 15,
    duration_max: 30,
    template_config: {
      animation_style: 'authentic',
      color_scheme: 'natural',
      music_genre: 'background',
      text_style: 'casual',
      rating_display: true
    },
    customizable_fields: [
      { key: 'product_name', label: 'Produktname', type: 'text', required: true },
      { key: 'product_image', label: 'Produktbild', type: 'image', required: true },
      { key: 'rating', label: 'Bewertung (1-5 Sterne)', type: 'number', required: true, validation: { min: 1, max: 5 } },
      { key: 'pro_1', label: 'Pro 1', type: 'text', required: true },
      { key: 'pro_2', label: 'Pro 2', type: 'text', required: true },
      { key: 'con_1', label: 'Con 1 (optional)', type: 'text', required: false },
      { key: 'verdict', label: 'Fazit', type: 'text', required: true }
    ],
    ai_features: ['script_generation', 'voiceover', 'auto_captions'],
    is_featured: false,
    is_public: true
  },
  {
    name: 'Viral Hook Reel',
    description: 'Aufmerksamkeitsstarker Hook für maximale Views',
    content_type: 'reel',
    category: 'viral',
    platform: 'instagram',
    aspect_ratios: ['9:16'],
    platforms: ['instagram', 'tiktok'],
    duration_min: 7,
    duration_max: 15,
    template_config: {
      animation_style: 'fast_paced',
      color_scheme: 'high_contrast',
      music_genre: 'energetic',
      text_style: 'bold',
      hook_optimization: true
    },
    customizable_fields: [
      { key: 'hook_line', label: 'Hook Line (erste 3 Sekunden)', type: 'text', required: true },
      { key: 'main_point', label: 'Hauptaussage', type: 'text', required: true },
      { key: 'visual_clip', label: 'Visuelles Video', type: 'video', required: true },
      { key: 'call_to_action', label: 'Call-to-Action', type: 'text', required: true, default_value: 'Speichern für später!' },
      { key: 'pattern_interrupt', label: 'Pattern Interrupt (optional)', type: 'text', required: false }
    ],
    ai_features: ['script_generation', 'auto_captions'],
    is_featured: true,
    is_public: true
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Combine all templates
    const allTemplates = [...AD_TEMPLATES, ...STORY_TEMPLATES, ...REEL_TEMPLATES];

    // Insert templates
    const { data, error } = await supabase
      .from('content_templates')
      .insert(allTemplates)
      .select();

    if (error) {
      throw new Error(`Failed to seed templates: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Successfully seeded ${allTemplates.length} templates`,
        breakdown: {
          ads: AD_TEMPLATES.length,
          stories: STORY_TEMPLATES.length,
          reels: REEL_TEMPLATES.length
        },
        templates: data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Seed templates error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
