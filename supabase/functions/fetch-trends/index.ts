import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive trending data across all niches
const generateDynamicTrends = () => {
  const trends: any[] = [];
  
  // ===== 1. SOCIAL MEDIA GROWTH =====
  const socialMediaTrends = [
    {
      platform: "instagram",
      trend_type: "content",
      name: "#MiniSuccessStories",
      description: "Short, authentic success stories showing progress in 30-90 days",
      popularity_index: 92,
      category: "social-media",
      data_json: {
        hook: "So habe ich in 30 Tagen 1000 neue Follower gewonnen – ohne Ads!",
        ai_tip: "Verwende Jump-Cuts mit Text-Overlays. Dauer: 15–20 Sekunden.",
        content_ideas: [
          { title: "Before/After Growth", description: "Show analytics screenshots with storytelling", format: "reel", estimated_virality: "high" },
          { title: "Top 3 Mistakes", description: "Share what didn't work and what changed everything", format: "carousel", estimated_virality: "high" }
        ],
        hashtags: ["#CreatorTips", "#SocialMediaGrowth", "#ContentStrategy", "#ReelsFormula"],
        audience_fit: "Content creators and social media managers",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "content",
      name: "#BehindTheAlgorithm",
      description: "Explaining how platform algorithms actually work",
      popularity_index: 89,
      category: "social-media",
      data_json: {
        hook: "Der Instagram-Algorithmus funktioniert so – und niemand sagt es dir.",
        ai_tip: "Nutze Diagramme und einfache Visualisierungen. Sprich direkt in die Kamera.",
        content_ideas: [
          { title: "Algorithm Breakdown", description: "Explain ranking factors with visual aids", format: "video", estimated_virality: "very high" },
          { title: "Hack Series", description: "Share 3 algorithm hacks that actually work", format: "reel", estimated_virality: "high" }
        ],
        hashtags: ["#AlgorithmHacks", "#TikTokGrowth", "#CreatorEducation"],
        audience_fit: "Aspiring creators wanting to grow",
        estimated_virality: "very high"
      }
    }
  ];

  // ===== 2. E-COMMERCE VIRAL PRODUCTS (10 subcategories) =====
  const ecommerceProducts = [
    // Tech Gadgets
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Magnetischer Ladekabel-Organizer",
      description: "Praktischer Kabelhalter mit Magneten für aufgeräumte Schreibtische",
      popularity_index: 91,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "15-25 €",
        virality_reason: "Trending auf TikTok #DeskSetup mit 45M+ Views",
        target_audience: "Tech-affine Millennials und Remote Worker",
        content_ideas: [
          { title: "Before/After Desk Setup", description: "Zeige chaotischen vs. cleanen Arbeitsplatz", format: "reel" },
          { title: "Problem-Solution Reel", description: "Zeige das Kabelwirrwarr-Problem und löse es", format: "reel" }
        ],
        hashtags: ["#TechTok", "#ProductivityHacks", "#DeskSetup", "#WFH"],
        estimated_virality: "very high",
        ai_tip: "Nutze 15-Sekunden-Format mit schnellen Schnitten und Magnet-Sound"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Mini-Thermokamera fürs Smartphone",
      description: "Wärmebild-Aufsatz zur Lecksuche und Energieberatung",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "80-120 €",
        virality_reason: "DIY-Trend auf YouTube, perfekt für Hausbesitzer",
        target_audience: "Heimwerker und Energiesparer",
        content_ideas: [
          { title: "Hidden Leak Detection", description: "Zeige wie man versteckte Probleme findet", format: "video" },
          { title: "Energy Saving Tips", description: "Wärmebrücken finden und Geld sparen", format: "tutorial" }
        ],
        hashtags: ["#HomeImprovement", "#TechGadgets", "#EnergySaving"],
        estimated_virality: "high"
      }
    },
    // Beauty & Skincare
    {
      platform: "instagram",
      trend_type: "product",
      name: "Eisroller mit LED-Lichttherapie",
      description: "Gesichtsroller mit Kühlung und Rotlicht gegen Falten",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "25-40 €",
        virality_reason: "Beauty-Influencer zeigen Before/After-Ergebnisse",
        target_audience: "Beauty-bewusste Frauen 25-45",
        content_ideas: [
          { title: "Morning Skincare Routine", description: "Ice roller als Teil der Morgenroutine", format: "reel" },
          { title: "7-Day Challenge", description: "Zeige Veränderung nach einer Woche", format: "series" }
        ],
        hashtags: ["#SkincareRoutine", "#BeautyTools", "#GlowUp", "#SelfCare"],
        estimated_virality: "very high"
      }
    },
    // Haushalts-Innovationen
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Automatischer Seifenspender mit Sensor",
      description: "Berührungsloser Spender für Küche und Bad",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "haushalt",
        price_range: "20-30 €",
        virality_reason: "#SmartHome Trend, hygienisch und modern",
        target_audience: "Familien und Design-Liebhaber",
        content_ideas: [
          { title: "Smart Home Upgrade", description: "Zeige moderne Haushalts-Upgrades", format: "carousel" },
          { title: "Hygiene Hack", description: "Berührungslose Lösungen für cleanes Zuhause", format: "reel" }
        ],
        hashtags: ["#SmartHome", "#HomeHacks", "#ModernLiving"],
        estimated_virality: "medium"
      }
    },
    // Haustier-Gadgets
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Interaktiver Katzen-Laserball",
      description: "Selbstrollender Ball mit Laserpointer zur Katzenbeschäftigung",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "25-35 €",
        virality_reason: "Katzenvideos gehen viral auf TikTok",
        target_audience: "Katzenbesitzer und Pet-Influencer",
        content_ideas: [
          { title: "Cat Reaction Video", description: "Filme die erste Reaktion deiner Katze", format: "reel" },
          { title: "Entertainment Solution", description: "Zeige wie Katze sich selbst beschäftigt", format: "video" }
        ],
        hashtags: ["#CatTok", "#PetGadgets", "#CatLovers", "#PetProducts"],
        estimated_virality: "very high"
      }
    },
    // Fitness & Wellness
    {
      platform: "instagram",
      trend_type: "product",
      name: "Smart Jump Rope mit App",
      description: "Intelligentes Springseil mit Kalorienzähler und App-Integration",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "35-50 €",
        virality_reason: "Fitness-Trend #JumpRopeChallenge",
        target_audience: "Fitness-Enthusiasten und Home-Workout-Fans",
        content_ideas: [
          { title: "30-Day Challenge", description: "Dokumentiere Fitness-Fortschritt", format: "series" },
          { title: "Calorie Burn Demo", description: "Zeige wie viele Kalorien in 10 Minuten", format: "reel" }
        ],
        hashtags: ["#FitnessGadgets", "#HomeWorkout", "#JumpRope", "#FitTech"],
        estimated_virality: "high"
      }
    }
  ];

  // ===== 3. LIFESTYLE & HEALTH =====
  const healthTrends = [
    {
      platform: "instagram",
      trend_type: "lifestyle",
      name: "Matcha-Trend 2025",
      description: "Grüner Tee-Extrakt mit Antioxidantien für Fokus und Energie",
      popularity_index: 88,
      category: "lifestyle",
      data_json: {
        food: "Matcha",
        benefits: "L-Theanin für Konzentration, hoher Antioxidantien-Gehalt, sanfter Energy-Boost",
        vitamins: ["C", "E", "K"],
        health_tips: [
          "Trinke Matcha morgens für sanften Energy-Boost ohne Crash",
          "Kombiniere mit Hafermilch für bessere Verträglichkeit",
          "Verwende zeremoniellen Matcha für höchste Qualität"
        ],
        content_ideas: [
          { title: "Matcha Latte Tutorial", description: "Zeige perfekte Zubereitung", format: "reel" },
          { title: "Benefits Breakdown", description: "Erkläre gesundheitliche Vorteile visuell", format: "carousel" }
        ],
        hashtags: ["#MatchaLatte", "#HealthyLiving", "#Wellness", "#CleanEating"],
        audience_fit: "Gesundheitsbewusste Menschen 25-45",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "lifestyle",
      name: "Kurkuma-Wasser Detox",
      description: "Entzündungshemmendes Morgenritual mit Kurkuma und Zitrone",
      popularity_index: 85,
      category: "lifestyle",
      data_json: {
        food: "Kurkuma",
        benefits: "Curcumin wirkt entzündungshemmend, unterstützt Immunsystem und Verdauung",
        vitamins: ["K", "E", "B6"],
        health_tips: [
          "Mische 1 TL Kurkuma mit warmem Wasser und Zitronensaft",
          "Füge schwarzen Pfeffer hinzu für bessere Absorption",
          "Trinke auf nüchternen Magen für Detox-Effekt"
        ],
        content_ideas: [
          { title: "Morning Detox Routine", description: "Zeige Zubereitung in Morgenroutine", format: "reel" },
          { title: "7-Day Challenge", description: "Dokumentiere Woche mit Kurkuma-Wasser", format: "series" }
        ],
        hashtags: ["#DetoxWater", "#Kurkuma", "#HealthyMorning", "#Immunity"],
        audience_fit: "Health-conscious individuals interested in natural remedies",
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "instagram",
      trend_type: "lifestyle",
      name: "Hafermilch Revolution",
      description: "Pflanzliche Milch-Alternative mit Ballaststoffen für Herzgesundheit",
      popularity_index: 83,
      category: "lifestyle",
      data_json: {
        food: "Hafermilch",
        benefits: "Ballaststoffe & Beta-Glucane für Herzgesundheit, klimafreundlich",
        vitamins: ["B1", "B6", "E"],
        health_tips: [
          "Wähle ungesüßte Varianten für beste Gesundheitsvorteile",
          "Perfekt für Kaffee durch cremige Konsistenz",
          "Reich an Ballaststoffen – gut für Verdauung"
        ],
        content_ideas: [
          { title: "Milk Alternative Comparison", description: "Vergleiche verschiedene Pflanzenmilch-Optionen", format: "carousel" },
          { title: "Homemade Oat Milk", description: "DIY-Tutorial für selbstgemachte Hafermilch", format: "video" }
        ],
        hashtags: ["#DairyFree", "#PlantBased", "#OatMilk", "#HealthyChoices"],
        audience_fit: "Plant-based and lactose-intolerant community",
        estimated_virality: "medium"
      }
    }
  ];

  // ===== 4. FINANCE & INVESTMENTS =====
  const financeTrends = [
    {
      platform: "linkedin",
      trend_type: "finance",
      name: "Top Aktien der Woche",
      description: "Übersicht der best-performenden Aktien mit Analyse",
      popularity_index: 90,
      category: "finance",
      data_json: {
        stocks: [
          { symbol: "NVDA", change: "+5.8%", reason: "KI-Chip-Nachfrage steigt weiter", price: "~145 USD", ai_tip: "Erstelle Erklärvideo zu KI-Hardware-Markt" },
          { symbol: "MSFT", change: "+3.2%", reason: "Cloud-Geschäft übertrifft Erwartungen", price: "~425 USD", ai_tip: "Post über Cloud-Computing Trends" },
          { symbol: "TSLA", change: "+4.1%", reason: "Neue Gigafactory-Pläne angekündigt", price: "~265 USD", ai_tip: "E-Mobility Zukunfts-Szenario erklären" }
        ],
        content_ideas: [
          { title: "Wochenanalyse", description: "Erkläre Marktbewegungen visuell mit Charts", format: "video" },
          { title: "Stock Pick Breakdown", description: "Warum diese 3 Aktien jetzt interessant sind", format: "carousel" }
        ],
        hashtags: ["#Investing", "#StockMarket", "#FinanzielleFreiheit", "#Aktien"],
        audience_fit: "Anleger und Finanz-interessierte 25-50",
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "twitter",
      trend_type: "finance",
      name: "Krypto-Markt Update",
      description: "Wöchentliche Übersicht der Top-Kryptowährungen",
      popularity_index: 89,
      category: "finance",
      data_json: {
        crypto: [
          { name: "Bitcoin", price: "64.200 €", change: "+1.8%", market_cap: "1.26T" },
          { name: "Ethereum", price: "3.050 €", change: "+0.9%", market_cap: "367B" },
          { name: "Solana", price: "139 €", change: "+3.2%", market_cap: "65B" },
          { name: "BNB", price: "525 €", change: "-0.4%", market_cap: "76B" },
          { name: "XRP", price: "0.61 €", change: "+0.5%", market_cap: "35B" }
        ],
        news: [
          "Bitcoin ETF verzeichnet Rekord-Zuflüsse von $1.2B diese Woche",
          "Ethereum bereitet größtes Netzwerk-Upgrade 'Pectra' vor",
          "Solana erreicht neues Allzeithoch bei Transaktionen"
        ],
        content_ideas: [
          { title: "Crypto Weekly Wrap", description: "5-Minuten-Update zu Marktbewegungen", format: "video" },
          { title: "Investment Strategy", description: "DCA vs. Timing – Was funktioniert besser?", format: "thread" }
        ],
        hashtags: ["#Crypto", "#Bitcoin", "#Blockchain", "#CryptoNews"],
        audience_fit: "Krypto-Investoren und Tech-Enthusiasten",
        estimated_virality: "high"
      }
    },
    {
      platform: "linkedin",
      trend_type: "finance",
      name: "ETF-Strategien 2025",
      description: "Passive Anlagestrategien mit ETFs für langfristigen Vermögensaufbau",
      popularity_index: 84,
      category: "finance",
      data_json: {
        investment_tips: [
          "MSCI World als Basis-Investment für globale Diversifikation",
          "Sparplan-Strategie: Monatlich 200-500€ für Cost-Average-Effekt",
          "Rebalancing einmal jährlich für optimale Risikoverteilung"
        ],
        content_ideas: [
          { title: "ETF für Anfänger", description: "3 ETFs die jeder kennen sollte", format: "carousel" },
          { title: "Portfolio-Aufbau", description: "Wie ich 100.000€ investieren würde", format: "article" }
        ],
        hashtags: ["#ETF", "#PassivIncome", "#Vermögensaufbau", "#Investing"],
        audience_fit: "Investoren und Sparer mit langfristiger Strategie",
        estimated_virality: "medium"
      }
    }
  ];

  // ===== 5. MOTIVATION & BUILDING =====
  const motivationTrends = [
    {
      platform: "instagram",
      trend_type: "motivation",
      name: "Wöchentlicher Wachstums-Impuls",
      description: "Motivierende Zitate und praktische Tipps für Content-Creator",
      popularity_index: 87,
      category: "motivation",
      data_json: {
        quotes: [
          "Erfolg entsteht nicht durch Glück – sondern durch tägliche, kleine Schritte.",
          "Wenn du müde bist, lerne zu ruhen – nicht aufzugeben.",
          "Die besten Ideen entstehen nicht im Komfort, sondern in der Konsequenz."
        ],
        growth_tips: [
          "Analysiere wöchentlich deine 3 erfolgreichsten Posts – wiederhole, was funktioniert.",
          "Baue eine Routine: 1 Tag Contentplanung, 3 Tage Produktion, 3 Tage Engagement.",
          "Setze dir Mikro-Ziele: +50 Follower diese Woche ist besser als +1000 im Monat.",
          "Kommentiere täglich 10 Posts in deiner Nische für Sichtbarkeit."
        ],
        mindset_prompt: "Schreibe heute einen Post über deinen größten Rückschlag – und was du daraus gelernt hast.",
        content_ideas: [
          { title: "Motivation Reel", description: "Kombiniere Zitat mit B-Roll deiner Journey", format: "reel" },
          { title: "Growth-Tipp Carousel", description: "Teile deine 5 besten Wachstums-Hacks", format: "carousel" }
        ],
        hashtags: ["#Motivation", "#CreatorLife", "#GrowthMindset", "#ContentCreator"],
        audience_fit: "Ambitionierte Creator und Unternehmer",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "motivation",
      name: "5AM Club Challenge",
      description: "Früh-Aufstehen-Bewegung für produktive Morgenroutinen",
      popularity_index: 85,
      category: "motivation",
      data_json: {
        quotes: [
          "Gewinne den Morgen, gewinne den Tag.",
          "Während andere schlafen, baust du dein Imperium."
        ],
        growth_tips: [
          "Starte mit 15 Minuten früher aufstehen, steigere graduell",
          "Bereite am Abend vor: Kleidung, Frühstück, Tagesplan",
          "Nutze die erste Stunde für wichtigste Aufgabe (No Social Media)"
        ],
        mindset_prompt: "Dokumentiere deine 5AM Routine für 7 Tage und teile Learnings.",
        content_ideas: [
          { title: "5AM Morning Routine", description: "Zeige deine produktive Morgenroutine", format: "reel" },
          { title: "Transformation Story", description: "Before/After: Wie Morgenroutine dein Leben verändert", format: "video" }
        ],
        hashtags: ["#5AMClub", "#MorningRoutine", "#ProductivityTips", "#SuccessMindset"],
        audience_fit: "Productivity-focused individuals and entrepreneurs",
        estimated_virality: "very high"
      }
    }
  ];

  // ===== 6. BUSINESS & AI TOOLS =====
  const businessTrends = [
    {
      platform: "linkedin",
      trend_type: "tools",
      name: "Top KI-Tools für Creator 2025",
      description: "Die besten KI-Werkzeuge für Content-Erstellung und Automatisierung",
      popularity_index: 88,
      category: "business",
      data_json: {
        tools: [
          { name: "ChatGPT-4", function: "Content-Ideen, Textgenerierung, Brainstorming", pricing: "Free / 20€/Monat", ai_tip: "Spare täglich 1h Content-Planung" },
          { name: "Midjourney", function: "KI-Bildgenerierung für Thumbnails & Grafiken", pricing: "10-60€/Monat", ai_tip: "Erstelle unique Visuals in Minuten" },
          { name: "Descript", function: "Video-Editing durch Text-Bearbeitung", pricing: "Free / 24€/Monat", ai_tip: "Schneide Videos 10x schneller" },
          { name: "Notion AI", function: "Notizen, Docs, Projektmanagement mit KI", pricing: "10€/Monat", ai_tip: "Organisiere Content-Pipeline automatisch" },
          { name: "Opus Clip", function: "Automatische Short-Video-Generierung", pricing: "19€/Monat", ai_tip: "Aus 1 langen Video → 10 Shorts" }
        ],
        content_ideas: [
          { title: "Tool-Vergleich", description: "Zeige 3 KI-Tools im direkten Vergleich", format: "video" },
          { title: "Workflow-Tutorial", description: "Demonstriere deinen kompletten KI-Workflow", format: "tutorial" },
          { title: "ROI-Analyse", description: "Wie viel Zeit & Geld du mit KI sparst", format: "carousel" }
        ],
        hashtags: ["#AITools", "#Productivity", "#CreatorTech", "#ContentCreation"],
        audience_fit: "Tech-affine Creator und Digital-Unternehmer",
        estimated_virality: "high"
      }
    }
  ];

  // Combine all trends
  return [
    ...socialMediaTrends,
    ...ecommerceProducts,
    ...healthTrends,
    ...financeTrends,
    ...motivationTrends,
    ...businessTrends
  ].map(trend => ({
    ...trend,
    language: "en",
    region: "global"
  }));
};

const FALLBACK_TRENDS = generateDynamicTrends();
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Input validation
    const requestSchema = z.object({
      language: z.string().regex(/^[a-z]{2}$/).optional().default('en'),
      platform: z.string().max(50).optional().nullable(),
      category: z.string().max(100).optional().nullable(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { language, platform, category } = validation.data;

    console.log('Fetching trends:', { language, platform, category });

    // Check if we have recent trends (last 24 hours)
    const { data: existingTrends, error: fetchError } = await supabase
      .from('trend_entries')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('popularity_index', { ascending: false });

    if (fetchError) {
      console.error('Error fetching trends:', fetchError);
    }

    // If we have recent trends, return them
    if (existingTrends && existingTrends.length > 0) {
      let filteredTrends = existingTrends;
      
      if (platform) {
        filteredTrends = filteredTrends.filter(t => t.platform === platform);
      }
      if (category) {
        filteredTrends = filteredTrends.filter(t => t.category === category);
      }
      if (language !== 'en') {
        filteredTrends = filteredTrends.filter(t => t.language === language);
      }

      console.log('Returning existing trends:', filteredTrends.length);
      return new Response(JSON.stringify({ trends: filteredTrends }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, insert fallback trends
    console.log('No recent trends found, inserting fallback data');
    const { data: insertedTrends, error: insertError } = await supabase
      .from('trend_entries')
      .insert(FALLBACK_TRENDS)
      .select();

    if (insertError) {
      console.error('Error inserting trends:', insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({ trends: insertedTrends || FALLBACK_TRENDS }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-trends:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch trends' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
