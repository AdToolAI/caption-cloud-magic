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
    },
    {
      platform: "instagram",
      trend_type: "content",
      name: "#ContentBatching",
      description: "Produziere 30 Posts an einem Tag für maximale Effizienz",
      popularity_index: 88,
      category: "social-media",
      data_json: {
        hook: "So erstelle ich 30 Posts in 4 Stunden – mein komplettes System",
        ai_tip: "Zeige deinen Workflow mit Time-Lapse. Nutze Screenshots deiner Tools.",
        content_ideas: [
          { title: "Batching Tutorial", description: "Step-by-step Anleitung für Content-Batching", format: "video", estimated_virality: "high" },
          { title: "Tools & Templates", description: "Welche Tools ich für effizientes Batching nutze", format: "carousel", estimated_virality: "medium" }
        ],
        hashtags: ["#ContentBatching", "#ProductivityHack", "#CreatorTips", "#TimeManagement"],
        audience_fit: "Busy creators und Unternehmer",
        estimated_virality: "high"
      }
    },
    {
      platform: "youtube",
      trend_type: "content",
      name: "#StorytimeFormat",
      description: "Persönliche Geschichten in 60-90 Sekunden erzählen",
      popularity_index: 86,
      category: "social-media",
      data_json: {
        hook: "Die Geschichte, warum ich fast aufgegeben hätte...",
        ai_tip: "Beginne mit emotionalem Hook. Nutze Jump-Cuts und Text-Highlights.",
        content_ideas: [
          { title: "Failure Story", description: "Teile deinen größten Rückschlag authentisch", format: "short", estimated_virality: "very high" },
          { title: "Breakthrough Moment", description: "Der Tag, der alles veränderte", format: "reel", estimated_virality: "high" }
        ],
        hashtags: ["#Storytime", "#RealTalk", "#CreatorJourney", "#Authenticity"],
        audience_fit: "Creator-Community",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "content",
      name: "#ViralHookFormulas",
      description: "Bewährte Hook-Formeln für die ersten 3 Sekunden",
      popularity_index: 91,
      category: "social-media",
      data_json: {
        hook: "Diese 5 Wörter stoppen jeden Scroll – Nr. 3 funktioniert immer",
        ai_tip: "Zeige Text-Overlays mit Beispielen. Schnelle Schnitte für Dynamik.",
        content_ideas: [
          { title: "Hook Compilation", description: "Top 10 Hooks die viral gingen mit Analysen", format: "video", estimated_virality: "very high" },
          { title: "A/B Test Results", description: "Ich habe 50 Hooks getestet – das sind die Gewinner", format: "carousel", estimated_virality: "high" }
        ],
        hashtags: ["#ViralContent", "#HookFormula", "#ContentStrategy", "#CreatorHacks"],
        audience_fit: "Creator die viral gehen wollen",
        estimated_virality: "very high"
      }
    }
  ];

  // ===== 2. E-COMMERCE VIRAL PRODUCTS (10 subcategories, 5 products each = 50 total) =====
  const ecommerceProducts = [
    // ===== TECH GADGETS (5) =====
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
    {
      platform: "instagram",
      trend_type: "product",
      name: "USB-C Hub mit 7 Anschlüssen",
      description: "Kompakter Hub für Laptop mit HDMI, SD-Card, USB 3.0",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "30-45 €",
        virality_reason: "#WorkFromHome Essentials für digitale Nomaden",
        target_audience: "Remote Worker und Content Creator",
        content_ideas: [
          { title: "Setup Essentials", description: "Must-have Tech für minimalistisches Setup", format: "reel" },
          { title: "Tech Unboxing", description: "First impressions mit allen Anschlüssen", format: "video" }
        ],
        hashtags: ["#TechEssentials", "#RemoteWork", "#DigitalNomad", "#ProductivityGear"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Wireless Charging Stand mit Uhr",
      description: "3-in-1 Ladestation für Phone, Watch & Earbuds mit LED-Uhr",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "40-60 €",
        virality_reason: "Aesthetic Bedside Setup Trend auf TikTok",
        target_audience: "Tech-Enthusiasten die minimalistisches Design lieben",
        content_ideas: [
          { title: "Nightstand Glow-Up", description: "Before/After Nachttisch-Transformation", format: "reel" },
          { title: "Morning Routine", description: "Zeige wie alles über Nacht lädt", format: "video" }
        ],
        hashtags: ["#TechSetup", "#Aesthetic", "#NighstandGoals", "#WirelessCharging"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Mechanische Mini-Tastatur (60%)",
      description: "Kompakte Gaming-Tastatur mit RGB und Custom Switches",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "70-120 €",
        virality_reason: "Mechanical Keyboard Community wächst exponentiell",
        target_audience: "Gamer und Programmierer",
        content_ideas: [
          { title: "Sound Test", description: "ASMR Typing Sound verschiedener Switches", format: "reel" },
          { title: "Custom Build", description: "So baust du deine Traumtastatur", format: "tutorial" }
        ],
        hashtags: ["#MechanicalKeyboard", "#GamingSetup", "#TechASMR", "#CustomKeyboard"],
        estimated_virality: "high"
      }
    },

    // ===== BEAUTY (5) =====
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
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Heatless Curling Rod Set",
      description: "Über-Nacht-Lockenwickler aus Satin ohne Hitze",
      popularity_index: 92,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "15-25 €",
        virality_reason: "#HeatlessCurls Trend mit 500M+ Views auf TikTok",
        target_audience: "Frauen die ihr Haar schützen wollen",
        content_ideas: [
          { title: "Before Bed Routine", description: "Zeige Anwendung und Morgenergebnis", format: "reel" },
          { title: "Curl Comparison", description: "Heatless vs. Curling Iron Ergebnis", format: "video" }
        ],
        hashtags: ["#HeatlessCurls", "#HairCare", "#BeautyHack", "#NoDamage"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Gua Sha Stein Set mit Rosenquarz",
      description: "Traditionelles Massage-Tool für Gesichtskonturierung",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "20-35 €",
        virality_reason: "Clean Beauty & Wellness-Trend aus Asien",
        target_audience: "Skincare-Enthusiasten und Wellness-Community",
        content_ideas: [
          { title: "Gua Sha Tutorial", description: "Richtige Anwendung für Lymphdrainage", format: "tutorial" },
          { title: "Face Sculpting", description: "Wie ich meine Jawline definiere", format: "reel" }
        ],
        hashtags: ["#GuaSha", "#FaceSculpting", "#CleanBeauty", "#SelfCareSunday"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Lash Lift Kit für Zuhause",
      description: "Professionelles Wimpernlifting-Set für DIY-Anwendung",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "25-40 €",
        virality_reason: "Kostenersparnis vs. Salon + DIY-Beauty-Trend",
        target_audience: "Beauty-Lover die Geld sparen wollen",
        content_ideas: [
          { title: "DIY Lash Lift", description: "Step-by-step Tutorial für Anfänger", format: "tutorial" },
          { title: "Before/After Reveal", description: "Dramatische Vorher-Nachher-Transformation", format: "reel" }
        ],
        hashtags: ["#LashLift", "#DIYBeauty", "#BeautyHack", "#LashGoals"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Silikon Face Cupping Set",
      description: "Gesichts-Schröpfset für Anti-Aging und Durchblutung",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "18-30 €",
        virality_reason: "Alternative zu Botox und Fillern",
        target_audience: "Frauen 30+ auf der Suche nach natürlichen Anti-Aging-Methoden",
        content_ideas: [
          { title: "Face Cupping Routine", description: "Meine 5-Minuten Anti-Aging Routine", format: "reel" },
          { title: "Science Behind It", description: "Warum Cupping funktioniert", format: "carousel" }
        ],
        hashtags: ["#FaceCupping", "#AntiAging", "#NaturalBeauty", "#Skincare"],
        estimated_virality: "medium"
      }
    },

    // ===== HAUSHALT (5) =====
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
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Dreh-Organizer für Gewürze",
      description: "360° drehbarer Gewürz-Turm für platzsparende Aufbewahrung",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "haushalt",
        price_range: "25-40 €",
        virality_reason: "#KitchenOrganization mit 200M+ Views",
        target_audience: "Hobby-Köche und Organisation-Enthusiasten",
        content_ideas: [
          { title: "Kitchen Makeover", description: "Vorher/Nachher Gewürz-Organisation", format: "reel" },
          { title: "Space Saving Hacks", description: "Wie ich 50% Platz spare", format: "video" }
        ],
        hashtags: ["#KitchenOrganization", "#HomeHacks", "#SpaceSaving", "#CleanTok"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Selbstbewässernde Pflanztöpfe",
      description: "Smart Plant Pots mit Wasserreservoir für 30 Tage",
      popularity_index: 84,
      category: "ecommerce",
      data_json: {
        subcategory: "haushalt",
        price_range: "15-30 €",
        virality_reason: "#PlantParent Community wächst exponentiell",
        target_audience: "Urban Gardeners und Pflanzenliebhaber",
        content_ideas: [
          { title: "Plant Haul", description: "Zeige deine Pflanzen-Kollektion mit Smart Pots", format: "reel" },
          { title: "Before/After", description: "Wie meine Pflanzen seit dem Topf-Wechsel gedeihen", format: "carousel" }
        ],
        hashtags: ["#PlantParent", "#UrbanJungle", "#PlantTok", "#IndoorPlants"],
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Elektrischer Flaschenöffner",
      description: "Automatischer Öffner für Flaschen, Dosen & Gläser",
      popularity_index: 82,
      category: "ecommerce",
      data_json: {
        subcategory: "haushalt",
        price_range: "25-35 €",
        virality_reason: "Perfekt für Senioren & Menschen mit Arthritis",
        target_audience: "Senioren-Community und Geschenk-Suchende",
        content_ideas: [
          { title: "Problem Solver", description: "Nie wieder Probleme beim Öffnen", format: "reel" },
          { title: "Gift Idea", description: "Das perfekte Geschenk für Eltern/Großeltern", format: "video" }
        ],
        hashtags: ["#KitchenGadgets", "#GiftIdeas", "#LifeHacks", "#AccessibleLiving"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Magnetische Müllsack-Halterung",
      description: "Tür-Montage für temporären Mülleimer beim Kochen",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "haushalt",
        price_range: "12-20 €",
        virality_reason: "Viral wegen Einfachheit & Preis-Leistung",
        target_audience: "Köche und Clean-Freaks",
        content_ideas: [
          { title: "Cooking Hack", description: "Nie wieder zum Mülleimer laufen", format: "reel" },
          { title: "Kitchen Life Hack", description: "Der 10€-Hack der dein Leben verändert", format: "video" }
        ],
        hashtags: ["#KitchenHacks", "#CookingTips", "#CleanHome", "#LifeHacks"],
        estimated_virality: "very high"
      }
    },

    // ===== PETS (5) =====
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
    {
      platform: "instagram",
      trend_type: "product",
      name: "Automatischer Futterspender mit App",
      description: "Smart Pet Feeder mit Timer und Portionskontrolle",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "60-90 €",
        virality_reason: "Perfekt für berufstätige Pet-Parents",
        target_audience: "Hunde- & Katzenbesitzer die viel arbeiten",
        content_ideas: [
          { title: "Pet Tech Review", description: "Meine Erfahrung nach 30 Tagen", format: "video" },
          { title: "Peace of Mind", description: "So fütterst du auch im Urlaub automatisch", format: "reel" }
        ],
        hashtags: ["#PetTech", "#SmartFeeder", "#PetCare", "#DogMom"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "GPS-Tracker für Haustiere",
      description: "Kleiner GPS-Anhänger fürs Halsband mit Live-Tracking",
      popularity_index: 91,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "40-70 €",
        virality_reason: "Sicherheit & Peace of Mind für Pet-Parents",
        target_audience: "Hunde- und Katzenbesitzer mit Freigang",
        content_ideas: [
          { title: "Lost Pet Story", description: "Wie der GPS-Tracker meinen Hund rettete", format: "story" },
          { title: "Live Demo", description: "Zeige die App & Tracking in Echtzeit", format: "video" }
        ],
        hashtags: ["#PetSafety", "#GPSTracker", "#DogTok", "#PetTech"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Orthopädisches Hundebett mit Memory Foam",
      description: "Gelenkschonendes Bett für ältere Hunde und große Rassen",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "50-90 €",
        virality_reason: "Senior-Pet-Care-Trend wächst",
        target_audience: "Besitzer älterer Hunde",
        content_ideas: [
          { title: "Before/After", description: "Wie mein Senior-Hund wieder besser schläft", format: "reel" },
          { title: "Pet Care Tips", description: "5 Wege deinem alten Hund zu helfen", format: "carousel" }
        ],
        hashtags: ["#SeniorDog", "#PetCare", "#DogHealth", "#OrthopedicBed"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Intelligenter Hundeball mit Kamera",
      description: "Ball mit integrierter Kamera für interaktives Spielen",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "45-70 €",
        virality_reason: "Pet-POV-Videos sind viral auf TikTok",
        target_audience: "Content Creator mit Haustieren",
        content_ideas: [
          { title: "Dog POV", description: "Zeige Welt aus Hunde-Perspektive", format: "reel" },
          { title: "Interactive Play", description: "So spiele ich mit meinem Hund aus der Ferne", format: "video" }
        ],
        hashtags: ["#DogPOV", "#PetCamera", "#DogTok", "#PetContent"],
        estimated_virality: "very high"
      }
    },

    // ===== FITNESS (5) =====
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
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Resistance Bands Set mit 5 Stärken",
      description: "Latex-Widerstandsbänder für Ganzkörper-Training",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "20-35 €",
        virality_reason: "#HomeGym und platzsparendes Training",
        target_audience: "Home-Workout-Community",
        content_ideas: [
          { title: "Full Body Workout", description: "30-Min Workout nur mit Bands", format: "video" },
          { title: "Before/After", description: "Meine Transformation mit Resistance Bands", format: "reel" }
        ],
        hashtags: ["#ResistanceBands", "#HomeWorkout", "#FitnessJourney", "#GymAtHome"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Foam Roller mit Vibration",
      description: "Elektrischer Massage-Roller für Regeneration nach dem Training",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "60-90 €",
        virality_reason: "Recovery & Self-Care im Fitness-Bereich",
        target_audience: "Sportler und Fitness-Enthusiasten",
        content_ideas: [
          { title: "Recovery Routine", description: "Meine Post-Workout-Regeneration", format: "reel" },
          { title: "Foam Rolling Tutorial", description: "So nutzt du den Roller richtig", format: "tutorial" }
        ],
        hashtags: ["#FoamRoller", "#Recovery", "#FitnessTips", "#SportsMassage"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Ab Roller Wheel Pro",
      description: "Bauchroller mit automatischem Rücklauf für Core-Training",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "25-40 €",
        virality_reason: "#AbWorkout Challenges auf TikTok",
        target_audience: "Menschen die Sixpack wollen",
        content_ideas: [
          { title: "Ab Challenge", description: "30 Tage Ab Roller Challenge", format: "series" },
          { title: "Core Workout", description: "5-Minuten Killer-Ab-Routine", format: "reel" }
        ],
        hashtags: ["#AbWorkout", "#CoreTraining", "#FitnessChallenge", "#Sixpack"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Faltbare Yoga-Matte mit Positions-Markierungen",
      description: "Profi-Yogamatte mit Alignment-Linien für korrekte Haltung",
      popularity_index: 84,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "40-60 €",
        virality_reason: "Yoga-Community wächst, besonders bei jungen Frauen",
        target_audience: "Yoga-Anfänger und -Praktizierende",
        content_ideas: [
          { title: "Morning Yoga Flow", description: "20-Min Morgen-Yoga-Routine", format: "video" },
          { title: "Alignment Guide", description: "Warum Position Lines beim Yoga helfen", format: "carousel" }
        ],
        hashtags: ["#YogaMat", "#YogaPractice", "#MindfulMovement", "#YogaLife"],
        estimated_virality: "medium"
      }
    },

    // ===== FASHION (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Oversized Blazer in Neutralfarben",
      description: "Zeitloser Business-Casual Blazer für jeden Anlass",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "60-120 €",
        virality_reason: "#QuietLuxury und minimalistischer Stil trending",
        target_audience: "Fashion-bewusste Frauen 25-40",
        content_ideas: [
          { title: "5 Ways to Style", description: "Ein Blazer, 5 verschiedene Looks", format: "reel" },
          { title: "Capsule Wardrobe", description: "Essential Pieces für zeitlosen Stil", format: "carousel" }
        ],
        hashtags: ["#BlazerStyle", "#QuietLuxury", "#CapsuleWardrobe", "#TimelessFashion"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Chunky Gold Hoops",
      description: "Statement Creolen aus 18K vergoldetem Edelstahl",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "25-45 €",
        virality_reason: "Bold Jewelry Trend auf TikTok",
        target_audience: "Gen Z und Millennials",
        content_ideas: [
          { title: "Jewelry Haul", description: "Zeige verschiedene Styling-Optionen", format: "reel" },
          { title: "Everyday Glam", description: "Wie Accessories jedes Outfit upgraden", format: "video" }
        ],
        hashtags: ["#GoldHoops", "#JewelryTrends", "#AccessoryGame", "#StatementEarrings"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "High-Waist Straight Jeans",
      description: "Mom Jeans im Vintage-Look aus nachhaltiger Baumwolle",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "50-90 €",
        virality_reason: "90s Fashion Revival + Nachhaltigkeits-Trend",
        target_audience: "Sustainable Fashion Community",
        content_ideas: [
          { title: "Try-On Haul", description: "Perfekte Jeans für verschiedene Körpertypen", format: "reel" },
          { title: "Sustainable Fashion", description: "Warum ich nur noch nachhaltig kaufe", format: "video" }
        ],
        hashtags: ["#MomJeans", "#SustainableFashion", "#90sFashion", "#EcoFriendly"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Crossbody Mini Bag",
      description: "Kleine Umhängetasche im Y2K-Stil",
      popularity_index: 91,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "30-55 €",
        virality_reason: "#Y2K Fashion Comeback auf TikTok",
        target_audience: "Gen Z Fashion-Lovers",
        content_ideas: [
          { title: "What's in my bag", description: "Zeige wie viel in die Mini-Bag passt", format: "reel" },
          { title: "Y2K Outfit", description: "Kompletter 2000er-Look mit Styling-Tipps", format: "video" }
        ],
        hashtags: ["#MiniBag", "#Y2KFashion", "#ThatGirl", "#OOTD"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Weiße Chunky Sneaker",
      description: "Platform-Sneaker im Dad-Shoe-Stil",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "70-130 €",
        virality_reason: "Chunky Sneaker bleiben Dauerbrenner",
        target_audience: "Sneakerheads und Streetwear-Fans",
        content_ideas: [
          { title: "Sneaker Styling", description: "10 Outfits mit weißen Sneakern", format: "carousel" },
          { title: "Unboxing", description: "First impressions + On-Feet-Look", format: "reel" }
        ],
        hashtags: ["#ChunkySneakers", "#Sneakerhead", "#WhiteSneakers", "#Streetwear"],
        estimated_virality: "high"
      }
    },

    // ===== KITCHEN (5) =====
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Elektrischer Milchaufschäumer mit 3 Modi",
      description: "Cappuccino-Maker für Zuhause mit Heiß/Kalt-Funktion",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "25-40 €",
        virality_reason: "#CoffeeTok und Home-Barista-Trend",
        target_audience: "Kaffee-Liebhaber",
        content_ideas: [
          { title: "Latte Art Tutorial", description: "Perfekten Milchschaum für Latte Art", format: "tutorial" },
          { title: "Morning Coffee Routine", description: "Barista-Qualität zu Hause", format: "reel" }
        ],
        hashtags: ["#CoffeeTok", "#HomeCafe", "#LatteArt", "#CoffeeLover"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Luftdichter Glas-Vorratsdosen Set",
      description: "12-teiliges Borosilikat-Glas Set mit Bambus-Deckeln",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "40-60 €",
        virality_reason: "#PantryOrganization und Zero Waste Lifestyle",
        target_audience: "Organisations-Enthusiasten und Umweltbewusste",
        content_ideas: [
          { title: "Pantry Makeover", description: "Vorher/Nachher meiner organisierten Vorratskammer", format: "reel" },
          { title: "Zero Waste Kitchen", description: "Wie ich Plastik aus der Küche verbannt habe", format: "video" }
        ],
        hashtags: ["#PantryOrganization", "#ZeroWaste", "#KitchenGoals", "#Sustainable"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Multi-Reibe mit 5 Klingen",
      description: "Verstellbare Mandoline zum Schneiden, Hobeln, Reiben",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "20-35 €",
        virality_reason: "#CookingHacks Videos gehen viral",
        target_audience: "Hobby-Köche",
        content_ideas: [
          { title: "Cooking Hack", description: "Spare 50% Zeit beim Gemüse schneiden", format: "reel" },
          { title: "Recipe Demo", description: "3 schnelle Rezepte mit dem Tool", format: "video" }
        ],
        hashtags: ["#CookingHacks", "#KitchenGadgets", "#RecipeTok", "#TimeSaver"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Vakuum-Frischhalte-System",
      description: "Elektrische Vakuumpumpe mit wiederverwertbaren Behältern",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "50-80 €",
        virality_reason: "Food Waste Reduction + Meal Prep Trend",
        target_audience: "Meal Prep Community und Familien",
        content_ideas: [
          { title: "Meal Prep Sunday", description: "Wie ich Essen 2x länger frisch halte", format: "video" },
          { title: "Food Waste Hack", description: "So sparst du Geld mit Vakuumieren", format: "carousel" }
        ],
        hashtags: ["#MealPrep", "#FoodStorage", "#ZeroWaste", "#KitchenHacks"],
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Silikon-Backmatten mit Messmarkierungen",
      description: "Wiederverwendbare Backmatten ersetzen Backpapier",
      popularity_index: 83,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "15-25 €",
        virality_reason: "Nachhaltig Backen + #BakingTok",
        target_audience: "Hobby-Bäcker und Umweltbewusste",
        content_ideas: [
          { title: "Baking Hack", description: "Nie wieder Backpapier kaufen", format: "reel" },
          { title: "Cookie Tutorial", description: "Perfekte Cookies mit Messmarkierungen", format: "video" }
        ],
        hashtags: ["#BakingTok", "#SustainableLiving", "#BakingHacks", "#EcoFriendly"],
        estimated_virality: "medium"
      }
    },

    // ===== OUTDOOR (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Kompakte Camping-Hängematte",
      description: "Ultraleichte Hängematte mit Moskitonetz für Outdoor",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "40-70 €",
        virality_reason: "#VanLife und Outdoor-Adventure-Trend",
        target_audience: "Outdoor-Enthusiasten und Camper",
        content_ideas: [
          { title: "Camping Setup", description: "Perfektes Camping-Setup in 5 Minuten", format: "reel" },
          { title: "Hidden Gem Spots", description: "Meine Top 5 Hängematten-Spots", format: "video" }
        ],
        hashtags: ["#VanLife", "#Camping", "#OutdoorAdventure", "#Hammocking"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Solar-Powerbank 20.000mAh",
      description: "Wasserdichte Powerbank mit Solar-Panel für Outdoor",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "35-60 €",
        virality_reason: "Essential für Digital Nomads und Camper",
        target_audience: "Reisende und Outdoor-Lover",
        content_ideas: [
          { title: "Festival Essential", description: "Nie wieder leerer Akku auf Festivals", format: "reel" },
          { title: "Camping Gear", description: "Must-have für mehrtägige Touren", format: "video" }
        ],
        hashtags: ["#OutdoorGear", "#SolarPower", "#CampingEssentials", "#FestivalSeason"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Faltbare Trinkflasche aus Silikon",
      description: "Zusammenklappbare 600ml Flasche für Reisen",
      popularity_index: 84,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "18-28 €",
        virality_reason: "Platzsparend für Minimalisten und Reisende",
        target_audience: "Digital Nomads und Backpacker",
        content_ideas: [
          { title: "Travel Hack", description: "Wie ich 30% Platz im Rucksack spare", format: "reel" },
          { title: "Packing List", description: "Meine Essentials für Weltreise", format: "carousel" }
        ],
        hashtags: ["#TravelGear", "#Minimalism", "#Backpacking", "#SustainableTravel"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Tragbarer Mini-Grill mit Akku",
      description: "Elektrischer Grill für Balkon, Camping & Picknick",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "80-120 €",
        virality_reason: "#OutdoorCooking und Sommer-BBQ-Saison",
        target_audience: "Grill-Fans und Outdoor-Köche",
        content_ideas: [
          { title: "Camping Cooking", description: "Perfektes Steak mitten in der Natur", format: "reel" },
          { title: "Balcony BBQ", description: "Grillen ohne Kohle – so geht's", format: "video" }
        ],
        hashtags: ["#BBQTime", "#OutdoorCooking", "#CampingFood", "#GrillSeason"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Wasserdichte Handy-Hülle für Tauchen",
      description: "Universal-Unterwasserhülle für Smartphones bis 30m Tiefe",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "20-35 €",
        virality_reason: "Unterwasser-Content boomt auf Social Media",
        target_audience: "Content Creator und Wassersport-Fans",
        content_ideas: [
          { title: "Underwater POV", description: "So erstellst du epische Unterwasser-Videos", format: "tutorial" },
          { title: "Beach Content", description: "Content-Ideen für den Strand", format: "reel" }
        ],
        hashtags: ["#UnderwaterPhotography", "#BeachContent", "#TravelCreator", "#WaterproofCase"],
        estimated_virality: "very high"
      }
    },

    // ===== OFFICE (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Ergonomischer Laptop-Ständer aus Aluminium",
      description: "Verstellbarer Stand für gesunde Arbeitshaltung",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "office",
        price_range: "30-50 €",
        virality_reason: "#WFH Setup und Ergonomie-Bewusstsein",
        target_audience: "Remote Worker und Freelancer",
        content_ideas: [
          { title: "Desk Setup Tour", description: "Zeige dein optimiertes Home Office", format: "video" },
          { title: "Posture Fix", description: "Wie ich Nackenschmerzen los wurde", format: "reel" }
        ],
        hashtags: ["#DeskSetup", "#WFH", "#Ergonomics", "#HomeOffice"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "LED Desk Lamp mit Wireless Charging",
      description: "Schreibtischlampe mit 3 Farbtemperaturen & Qi-Ladepad",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "office",
        price_range: "40-65 €",
        virality_reason: "Aesthetic Workspace Trend + Funktionalität",
        target_audience: "Content Creator und Design-Liebhaber",
        content_ideas: [
          { title: "Desk Glow-Up", description: "Vorher/Nachher mit perfekter Beleuchtung", format: "reel" },
          { title: "Productivity Setup", description: "Wie Licht deine Produktivität steigert", format: "video" }
        ],
        hashtags: ["#DeskLamp", "#WorkspaceAesthetic", "#ProductivityTips", "#HomeOffice"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Kabelkanal-Management-System",
      description: "Selbstklebende Kabelführung für sauberen Schreibtisch",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "office",
        price_range: "15-25 €",
        virality_reason: "#CableManagement ist massiver Trend",
        target_audience: "Perfektionisten und Clean-Desk-Enthusiasten",
        content_ideas: [
          { title: "Cable Management Tutorial", description: "Von Chaos zu Clean in 10 Minuten", format: "tutorial" },
          { title: "Satisfying Transformation", description: "Vorher/Nachher Kabel-Transformation", format: "reel" }
        ],
        hashtags: ["#CableManagement", "#CleanDesk", "#Satisfying", "#DeskGoals"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Noise-Cancelling Kopfhörer für Fokus",
      description: "Over-Ear Kopfhörer mit Active Noise Cancellation",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "office",
        price_range: "100-200 €",
        virality_reason: "Deep Work & Produktivitäts-Trend",
        target_audience: "Wissensarbeiter und Studenten",
        content_ideas: [
          { title: "Productivity Review", description: "Wie ich meine Fokus-Zeit verdoppelt habe", format: "video" },
          { title: "Sound Test", description: "Noise Cancelling im Großraumbüro getestet", format: "reel" }
        ],
        hashtags: ["#NoiseCancelling", "#DeepWork", "#ProductivityHack", "#FocusMode"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Schreibtisch-Organizer aus Filz",
      description: "Modulares Organizer-Set für Stifte, Notizen & Gadgets",
      popularity_index: 83,
      category: "ecommerce",
      data_json: {
        subcategory: "office",
        price_range: "25-40 €",
        virality_reason: "Minimalistisches Design + Organisation",
        target_audience: "Home Office Worker die Ästhetik lieben",
        content_ideas: [
          { title: "Desk Organization", description: "So organisiere ich meinen Arbeitsplatz", format: "reel" },
          { title: "Minimalist Setup", description: "Weniger ist mehr – mein minimaler Desk", format: "carousel" }
        ],
        hashtags: ["#DeskOrganization", "#MinimalistDesk", "#WorkspaceGoals", "#CleanAesthetic"],
        estimated_virality: "medium"
      }
    },

    // ===== KIDS (5) =====
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Montessori Activity Board",
      description: "Holz-Lerntafel mit Schlössern, Schaltern & Reißverschlüssen",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "kids",
        price_range: "40-70 €",
        virality_reason: "#MontessoriMom Trend auf TikTok",
        target_audience: "Eltern von Kleinkindern 1-4 Jahre",
        content_ideas: [
          { title: "Toddler Activity", description: "Wie mein 2-Jähriger sich 30 Min allein beschäftigt", format: "reel" },
          { title: "Educational Toys", description: "Top 5 Montessori-Spielzeuge", format: "video" }
        ],
        hashtags: ["#MontessoriToys", "#ToddlerActivities", "#EducationalToys", "#ParentingHacks"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Wiederverwendbare Wasser-Mal-Matte",
      description: "Magische Malmatte – zeichnen mit Wasser, keine Flecken",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "kids",
        price_range: "20-35 €",
        virality_reason: "Mess-free Activity für Eltern",
        target_audience: "Eltern die saubere Aktivitäten suchen",
        content_ideas: [
          { title: "Mess-Free Art", description: "So malen Kinder ohne Chaos", format: "reel" },
          { title: "Travel Hack", description: "Perfekt für lange Autofahrten", format: "video" }
        ],
        hashtags: ["#ToddlerActivities", "#MessFree", "#ParentingWin", "#KidsArt"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "LED-Nachtlicht mit Farbwechsel",
      description: "Silikon-Nachtlicht in Tierform, touch-steuerbar",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "kids",
        price_range: "18-30 €",
        virality_reason: "Niedliches Design + funktional für Einschlafroutine",
        target_audience: "Eltern von Babys und Kleinkindern",
        content_ideas: [
          { title: "Bedtime Routine", description: "Unsere entspannte Einschlafroutine", format: "reel" },
          { title: "Nursery Tour", description: "Kinderzimmer-Tour mit allen Gadgets", format: "video" }
        ],
        hashtags: ["#NurseryDecor", "#BedtimeRoutine", "#ParentingHacks", "#BabyEssentials"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Aufblasbarer Reise-Fußstütze für Kinder",
      description: "Fußbank fürs Flugzeug – Kinder können sich hinlegen",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "kids",
        price_range: "15-25 €",
        virality_reason: "Travel-Hack für Familien geht viral",
        target_audience: "Reisende Eltern",
        content_ideas: [
          { title: "Travel Hack", description: "So schlafen Kinder im Flugzeug", format: "reel" },
          { title: "Family Travel", description: "10 Hacks für entspanntes Reisen mit Kids", format: "carousel" }
        ],
        hashtags: ["#TravelWithKids", "#FamilyTravel", "#ParentingHacks", "#TravelEssentials"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Kinder-Kopfhörer mit Lautstärke-Begrenzung",
      description: "Sichere Over-Ear Kopfhörer max. 85dB für Gehörschutz",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "kids",
        price_range: "25-45 €",
        virality_reason: "Screen-Time-Trend + Gesundheitsbewusstsein",
        target_audience: "Gesundheitsbewusste Eltern",
        content_ideas: [
          { title: "Screen Time Solution", description: "Wie Kinder sicher Videos schauen", format: "reel" },
          { title: "Travel Essential", description: "Ruhige Flüge dank Kopfhörern", format: "video" }
        ],
        hashtags: ["#KidsHeadphones", "#ScreenTime", "#ParentingTips", "#ChildSafety"],
        estimated_virality: "medium-high"
      }
    }
  ];

  // ===== 3. LIFESTYLE & HEALTH (5+) =====
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
    },
    {
      platform: "tiktok",
      trend_type: "lifestyle",
      name: "Ingwer-Shots für Immunsystem",
      description: "Konzentrierte Ingwer-Shots als täglicher Immun-Booster",
      popularity_index: 87,
      category: "lifestyle",
      data_json: {
        food: "Ingwer",
        benefits: "Entzündungshemmend, Immunsystem-Boost, Verdauungsfördernd",
        vitamins: ["C", "B6", "Magnesium"],
        health_tips: [
          "Trinke 1 Shot täglich auf nüchternen Magen",
          "Kombiniere mit Zitrone und Cayenne-Pfeffer für maximale Wirkung",
          "Frischer Ingwer ist potenter als Pulver"
        ],
        content_ideas: [
          { title: "DIY Ginger Shots", description: "Rezept für selbstgemachte Ingwer-Shots", format: "tutorial" },
          { title: "30-Day Challenge", description: "Dokumentiere Immunsystem-Verbesserung", format: "series" }
        ],
        hashtags: ["#GingerShot", "#ImmunityBoost", "#HealthyLiving", "#WellnessTips"],
        audience_fit: "Health-conscious individuals",
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "lifestyle",
      name: "Chiasamen Pudding",
      description: "Nährstoffreicher Pudding mit Omega-3 und Proteinen",
      popularity_index: 84,
      category: "lifestyle",
      data_json: {
        food: "Chiasamen",
        benefits: "Hoher Omega-3-Gehalt, Protein-reich, langanhaltende Sättigung",
        vitamins: ["Omega-3", "Calcium", "Phosphor"],
        health_tips: [
          "Mische 3 EL Chiasamen mit 200ml Pflanzenmilch",
          "Lass es über Nacht im Kühlschrank quellen",
          "Toppe mit Früchten und Nüssen für zusätzliche Nährstoffe"
        ],
        content_ideas: [
          { title: "Chia Pudding Variations", description: "5 verschiedene Geschmacksrichtungen", format: "carousel" },
          { title: "Meal Prep Breakfast", description: "Bereite 5 Frühstücke für die Woche vor", format: "video" }
        ],
        hashtags: ["#ChiaPudding", "#HealthyBreakfast", "#MealPrep", "#PlantBased"],
        audience_fit: "Fitness and health enthusiasts",
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "lifestyle",
      name: "Fermentierte Foods Trend",
      description: "Probiotika-reiche Lebensmittel für Darmgesundheit",
      popularity_index: 86,
      category: "lifestyle",
      data_json: {
        food: "Kimchi, Kombucha, Sauerkraut",
        benefits: "Verbesserte Darmflora, stärkeres Immunsystem, bessere Verdauung",
        vitamins: ["K2", "B12", "Probiotika"],
        health_tips: [
          "Beginne mit kleinen Portionen zur Gewöhnung",
          "Integriere täglich fermentierte Foods für beste Ergebnisse",
          "DIY-Fermentation spart Geld und ist einfacher als gedacht"
        ],
        content_ideas: [
          { title: "Fermentation 101", description: "Anfänger-Guide für selbstgemachtes Kimchi", format: "tutorial" },
          { title: "Gut Health Journey", description: "Meine 30-Tage-Transformation", format: "series" }
        ],
        hashtags: ["#FermentedFoods", "#GutHealth", "#Probiotics", "#HealthyGut"],
        audience_fit: "Wellness community",
        estimated_virality: "high"
      }
    }
  ];

  // ===== 4. FINANCE & INVESTMENTS (5+) =====
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
    },
    {
      platform: "twitter",
      trend_type: "finance",
      name: "Index-Fonds vs. Einzelaktien",
      description: "Vergleich verschiedener Anlagestrategien für Anfänger",
      popularity_index: 82,
      category: "finance",
      data_json: {
        investment_comparison: [
          { strategy: "S&P 500 ETF", risk: "mittel", potential_return: "8-10% p.a.", effort: "minimal" },
          { strategy: "Einzelaktien", risk: "hoch", potential_return: "variabel", effort: "hoch" },
          { strategy: "Dividenden-ETF", risk: "mittel", potential_return: "6-8% p.a.", effort: "gering" }
        ],
        content_ideas: [
          { title: "Investment-Vergleich", description: "Welche Strategie passt zu dir?", format: "thread" },
          { title: "Anfänger-Portfolio", description: "So würde ich heute mit 1000€ starten", format: "video" }
        ],
        hashtags: ["#InvestingForBeginners", "#ETF", "#StockMarket", "#PassiveIncome"],
        audience_fit: "Investitions-Anfänger",
        estimated_virality: "high"
      }
    },
    {
      platform: "linkedin",
      trend_type: "finance",
      name: "Dividenden-Strategie 2025",
      description: "Aufbau passiven Einkommens durch Dividendenaktien",
      popularity_index: 85,
      category: "finance",
      data_json: {
        dividend_picks: [
          { company: "Coca-Cola", yield: "3.1%", stability: "sehr hoch", streak: "62 Jahre Dividendenwachstum" },
          { company: "Johnson & Johnson", yield: "2.9%", stability: "sehr hoch", streak: "61 Jahre Dividendenwachstum" },
          { company: "Procter & Gamble", yield: "2.5%", stability: "sehr hoch", streak: "67 Jahre Dividendenwachstum" }
        ],
        content_ideas: [
          { title: "Dividenden-Portfolio", description: "Wie ich 500€ passives Einkommen generiere", format: "article" },
          { title: "Dividend Aristocrats", description: "Die besten Dividendenzahler", format: "carousel" }
        ],
        hashtags: ["#DividendInvesting", "#PassiveIncome", "#LongTermInvesting", "#FinancialFreedom"],
        audience_fit: "Langfristige Investoren",
        estimated_virality: "medium"
      }
    }
  ];

  // ===== 5. MOTIVATION & BUILDING (5+) =====
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
    },
    {
      platform: "linkedin",
      trend_type: "motivation",
      name: "Atomic Habits Challenge",
      description: "Kleine Gewohnheiten mit großer Wirkung etablieren",
      popularity_index: 89,
      category: "motivation",
      data_json: {
        quotes: [
          "Du bist nicht deine Ziele – du bist die Summe deiner Systeme.",
          "1% besser jeden Tag = 37x besser nach einem Jahr."
        ],
        growth_tips: [
          "Starte mit einer Mini-Habit: 1 Liegestütze, 1 Seite lesen",
          "Stack Habits: Neue Gewohnheit an bestehende koppeln",
          "Mache es sichtbar: Habit-Tracker an sichtbarer Stelle",
          "Belohne dich sofort nach Erledigung für Dopamin-Kick"
        ],
        mindset_prompt: "Welche eine Mini-Habit würde dein Leben in 6 Monaten transformieren?",
        content_ideas: [
          { title: "Habit Stacking", description: "So etablierst du neue Routinen mühelos", format: "carousel" },
          { title: "90-Day Challenge", description: "Dokumentiere deine Transformation", format: "series" }
        ],
        hashtags: ["#AtomicHabits", "#PersonalGrowth", "#HabitBuilding", "#SelfImprovement"],
        audience_fit: "Selbstoptimierer und Wachstums-orientierte Menschen",
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "motivation",
      name: "Deep Work Sessions",
      description: "Fokussierte Arbeit ohne Ablenkung für maximale Produktivität",
      popularity_index: 88,
      category: "motivation",
      data_json: {
        quotes: [
          "Tiefe Arbeit ist die Superkraft des 21. Jahrhunderts.",
          "Multitasking ist der Feind von Meisterschaft."
        ],
        growth_tips: [
          "Blockiere 2-4h für Deep Work ohne Unterbrechungen",
          "Handy in anderen Raum, alle Notifications aus",
          "Nutze Pomodoro: 90 Min Fokus, 15 Min Pause",
          "Tracke deine Deep Work Stunden wöchentlich"
        ],
        mindset_prompt: "An welchem Projekt würdest du 1000 Stunden arbeiten, wenn Geld keine Rolle spielt?",
        content_ideas: [
          { title: "Deep Work Routine", description: "So strukturiere ich meine produktivsten Stunden", format: "reel" },
          { title: "Distraction-Free Setup", description: "Mein fokussierter Workspace", format: "carousel" }
        ],
        hashtags: ["#DeepWork", "#Productivity", "#FocusMode", "#CreatorLife"],
        audience_fit: "Knowledge Worker und Creator",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "motivation",
      name: "Failure Resume Trend",
      description: "Teile deine Misserfolge als Lernmomente",
      popularity_index: 90,
      category: "motivation",
      data_json: {
        quotes: [
          "Misserfolg ist nicht das Gegenteil von Erfolg – er ist Teil davon.",
          "Jedes 'Nein' bringt dich näher ans 'Ja'."
        ],
        growth_tips: [
          "Dokumentiere deine Fails öffentlich für Accountability",
          "Extrahiere 3 Learnings aus jedem Rückschlag",
          "Teile gescheiterte Projekte – es befreit und inspiriert andere",
          "Feiere den Mut zu versuchen, nicht nur das Ergebnis"
        ],
        mindset_prompt: "Welcher Misserfolg hat dich am meisten gelehrt? Teile deine Story.",
        content_ideas: [
          { title: "My Failure Resume", description: "10 Projekte die flopped sind und was ich lernte", format: "video" },
          { title: "Behind the Scenes", description: "Was niemand über meinen Erfolg weiß", format: "reel" }
        ],
        hashtags: ["#FailureResume", "#RealTalk", "#Entrepreneurship", "#GrowthMindset"],
        audience_fit: "Unternehmer und Creator die Authentizität schätzen",
        estimated_virality: "very high"
      }
    }
  ];

  // ===== 6. BUSINESS & AI TOOLS (5+) =====
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
    },
    {
      platform: "twitter",
      trend_type: "tools",
      name: "No-Code Revolution 2025",
      description: "Baue SaaS-Produkte ohne zu programmieren",
      popularity_index: 90,
      category: "business",
      data_json: {
        tools: [
          { name: "Bubble", function: "Komplette Web-Apps ohne Code bauen", pricing: "Free / 29€+/Monat", ai_tip: "Validiere MVPs in Wochen statt Monaten" },
          { name: "Webflow", function: "Professionelle Websites visuell designen", pricing: "Free / 14€+/Monat", ai_tip: "Designer-Qualität ohne Developer" },
          { name: "Zapier", function: "Automatisiere Workflows zwischen 5000+ Apps", pricing: "Free / 20€+/Monat", ai_tip: "Spare 10h+ pro Woche durch Automation" },
          { name: "Airtable", function: "Flexible Datenbank mit Interface-Builder", pricing: "Free / 20€+/Monat", ai_tip: "CRM, Projektmanagement, Content-Hub in einem" },
          { name: "Make (Integromat)", function: "Komplexe Automationen visuell bauen", pricing: "Free / 9€+/Monat", ai_tip: "Alternative zu Zapier mit mehr Power" }
        ],
        content_ideas: [
          { title: "MVP in 30 Days", description: "Wie ich mein SaaS ohne Code gebaut habe", format: "video" },
          { title: "No-Code Stack", description: "Mein kompletter Tech-Stack ohne Programmierer", format: "thread" }
        ],
        hashtags: ["#NoCode", "#Entrepreneurship", "#BuildInPublic", "#SaaS"],
        audience_fit: "Non-technical Gründer und Solopreneure",
        estimated_virality: "very high"
      }
    },
    {
      platform: "linkedin",
      trend_type: "tools",
      name: "Social Media Analytics Tools",
      description: "Datengetriebene Entscheidungen für Content-Strategie",
      popularity_index: 86,
      category: "business",
      data_json: {
        tools: [
          { name: "Later", function: "Social Media Scheduling + Analytics", pricing: "Free / 18€+/Monat", ai_tip: "Optimale Posting-Zeiten basierend auf Daten" },
          { name: "Metricool", function: "All-in-One Analytics für alle Plattformen", pricing: "Free / 12€+/Monat", ai_tip: "Vergleiche Performance cross-platform" },
          { name: "Brandwatch", function: "Social Listening & Trend-Analyse", pricing: "Custom Pricing", ai_tip: "Erkenne Trends bevor sie mainstream sind" }
        ],
        content_ideas: [
          { title: "Analytics Deep-Dive", description: "Diese Metriken sind wirklich wichtig", format: "article" },
          { title: "Data-Driven Growth", description: "Wie ich meine Reichweite durch Daten verdoppelt habe", format: "carousel" }
        ],
        hashtags: ["#SocialMediaAnalytics", "#DataDriven", "#ContentStrategy", "#MarketingTools"],
        audience_fit: "Social Media Manager und Marketing-Teams",
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "tools",
      name: "Monetarisierungs-Plattformen für Creator",
      description: "Verwandle deine Audience in nachhaltiges Einkommen",
      popularity_index: 91,
      category: "business",
      data_json: {
        tools: [
          { name: "Patreon", function: "Membership-Plattform für wiederkehrende Einnahmen", pricing: "5-12% Fee", ai_tip: "Baue loyale Community mit exklusivem Content" },
          { name: "Gumroad", function: "Verkaufe digitale Produkte direkt", pricing: "10% Fee", ai_tip: "Perfekt für E-Books, Templates, Kurse" },
          { name: "Stan Store", function: "Mobile-optimierter Online-Shop für Creator", pricing: "29€/Monat", ai_tip: "One-Link-Store für Instagram Bio" },
          { name: "Ko-fi", function: "Spenden + Shop mit niedrigen Gebühren", pricing: "Free / 6€/Monat", ai_tip: "0% Fee auf Spenden" }
        ],
        content_ideas: [
          { title: "Monetization Strategy", description: "Wie ich 5 Einkommensströme aufgebaut habe", format: "reel" },
          { title: "Platform Comparison", description: "Patreon vs. Ko-fi – Was lohnt sich?", format: "carousel" }
        ],
        hashtags: ["#CreatorEconomy", "#Monetization", "#PassiveIncome", "#DigitalProducts"],
        audience_fit: "Creator die ihr Einkommen diversifizieren wollen",
        estimated_virality: "very high"
      }
    },
    {
      platform: "youtube",
      trend_type: "tools",
      name: "Video-Editing Tools 2025",
      description: "Professionelle Videos schneller erstellen",
      popularity_index: 87,
      category: "business",
      data_json: {
        tools: [
          { name: "CapCut", function: "Kostenloser Editor mit Pro-Features", pricing: "Free / 8€/Monat", ai_tip: "AI Auto-Captions und Templates" },
          { name: "DaVinci Resolve", function: "Hollywood-Grade Editor kostenlos", pricing: "Free / 295€ einmalig", ai_tip: "Professionelle Color-Grading Tools" },
          { name: "Riverside.fm", function: "Remote-Interviews in Studio-Qualität", pricing: "15€+/Monat", ai_tip: "Separate Audio-Tracks für jeden Sprecher" },
          { name: "Pictory", function: "KI erstellt Videos aus Text/Artikel", pricing: "23€+/Monat", ai_tip: "Blog-Posts zu Videos in Minuten" }
        ],
        content_ideas: [
          { title: "Editing Workflow", description: "So schneide ich Videos 3x schneller", format: "tutorial" },
          { title: "Free vs. Paid", description: "Lohnen sich teure Video-Tools wirklich?", format: "video" }
        ],
        hashtags: ["#VideoEditing", "#ContentCreation", "#YouTubeTips", "#VideoProduction"],
        audience_fit: "Video-Creator und YouTuber",
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

    // Check if we have recent trends (last 6 hours for fresh content rotation)
    const { data: existingTrends, error: fetchError } = await supabase
      .from('trend_entries')
      .select('*')
      .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('popularity_index', { ascending: false });

    if (fetchError) {
      console.error('Error fetching trends:', fetchError);
    }

    // If we have recent trends, try to filter and return them
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

      // Only return if we have filtered results, otherwise fallback
      if (filteredTrends.length > 0) {
        console.log('Returning existing trends:', filteredTrends.length);
        return new Response(JSON.stringify({ trends: filteredTrends }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('No matching trends after filtering, using fallback');
    }

    // Use fallback trends and filter them
    console.log('Using fallback data');
    let fallbackFiltered = FALLBACK_TRENDS;
    
    if (platform) {
      fallbackFiltered = fallbackFiltered.filter(t => t.platform === platform);
    }
    if (category) {
      fallbackFiltered = fallbackFiltered.filter(t => t.category === category);
    }
    if (language !== 'en') {
      fallbackFiltered = fallbackFiltered.filter(t => t.language === language);
    }

    // Insert fallback trends into database for future use (don't wait)
    supabase
      .from('trend_entries')
      .insert(FALLBACK_TRENDS)
      .then(({ error }) => {
        if (error) console.error('Error inserting fallback trends:', error);
      });

    return new Response(JSON.stringify({ trends: fallbackFiltered }), {
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
