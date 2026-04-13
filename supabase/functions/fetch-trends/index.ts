import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
        hook: "How I gained 1,000 new followers in 30 days — without ads!",
        ai_tip: "Use jump-cuts with text overlays. Duration: 15–20 seconds.",
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
        hook: "This is how the Instagram algorithm really works — and nobody tells you.",
        ai_tip: "Use diagrams and simple visuals. Speak directly into the camera.",
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
      description: "Produce 30 posts in one day for maximum efficiency",
      popularity_index: 88,
      category: "social-media",
      data_json: {
        hook: "How I create 30 posts in 4 hours — my complete system",
        ai_tip: "Show your workflow with time-lapse. Use screenshots of your tools.",
        content_ideas: [
          { title: "Batching Tutorial", description: "Step-by-step guide for content batching", format: "video", estimated_virality: "high" },
          { title: "Tools & Templates", description: "The tools I use for efficient batching", format: "carousel", estimated_virality: "medium" }
        ],
        hashtags: ["#ContentBatching", "#ProductivityHack", "#CreatorTips", "#TimeManagement"],
        audience_fit: "Busy creators and entrepreneurs",
        estimated_virality: "high"
      }
    },
    {
      platform: "youtube",
      trend_type: "content",
      name: "#StorytimeFormat",
      description: "Tell personal stories in 60-90 seconds",
      popularity_index: 86,
      category: "social-media",
      data_json: {
        hook: "The story of why I almost gave up...",
        ai_tip: "Start with an emotional hook. Use jump-cuts and text highlights.",
        content_ideas: [
          { title: "Failure Story", description: "Share your biggest setback authentically", format: "short", estimated_virality: "very high" },
          { title: "Breakthrough Moment", description: "The day that changed everything", format: "reel", estimated_virality: "high" }
        ],
        hashtags: ["#Storytime", "#RealTalk", "#CreatorJourney", "#Authenticity"],
        audience_fit: "Creator community",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "content",
      name: "#ViralHookFormulas",
      description: "Proven hook formulas for the first 3 seconds",
      popularity_index: 91,
      category: "social-media",
      data_json: {
        hook: "These 5 words stop every scroll — #3 works every time",
        ai_tip: "Show text overlays with examples. Fast cuts for dynamic feel.",
        content_ideas: [
          { title: "Hook Compilation", description: "Top 10 hooks that went viral with analysis", format: "video", estimated_virality: "very high" },
          { title: "A/B Test Results", description: "I tested 50 hooks — here are the winners", format: "carousel", estimated_virality: "high" }
        ],
        hashtags: ["#ViralContent", "#HookFormula", "#ContentStrategy", "#CreatorHacks"],
        audience_fit: "Creators who want to go viral",
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
      name: "Magnetic Cable Organizer",
      description: "Practical cable holder with magnets for tidy desks",
      popularity_index: 91,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "$15-25",
        virality_reason: "Trending on TikTok #DeskSetup with 45M+ views",
        target_audience: "Tech-savvy millennials and remote workers",
        content_ideas: [
          { title: "Before/After Desk Setup", description: "Show messy vs. clean workspace", format: "reel" },
          { title: "Problem-Solution Reel", description: "Show the cable mess problem and solve it", format: "reel" }
        ],
        hashtags: ["#TechTok", "#ProductivityHacks", "#DeskSetup", "#WFH"],
        estimated_virality: "very high",
        ai_tip: "Use 15-second format with quick cuts and magnet sound"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Smartphone Thermal Camera",
      description: "Thermal imaging attachment for leak detection and energy audits",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "$80-120",
        virality_reason: "DIY trend on YouTube, perfect for homeowners",
        target_audience: "DIY enthusiasts and energy savers",
        content_ideas: [
          { title: "Hidden Leak Detection", description: "Show how to find hidden problems", format: "video" },
          { title: "Energy Saving Tips", description: "Find thermal bridges and save money", format: "tutorial" }
        ],
        hashtags: ["#HomeImprovement", "#TechGadgets", "#EnergySaving"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "USB-C Hub with 7 Ports",
      description: "Compact hub for laptop with HDMI, SD card, USB 3.0",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "$30-45",
        virality_reason: "#WorkFromHome essentials for digital nomads",
        target_audience: "Remote workers and content creators",
        content_ideas: [
          { title: "Setup Essentials", description: "Must-have tech for a minimalist setup", format: "reel" },
          { title: "Tech Unboxing", description: "First impressions with all port types", format: "video" }
        ],
        hashtags: ["#TechEssentials", "#RemoteWork", "#DigitalNomad", "#ProductivityGear"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Wireless Charging Stand with Clock",
      description: "3-in-1 charging station for phone, watch & earbuds with LED clock",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "$40-60",
        virality_reason: "Aesthetic bedside setup trend on TikTok",
        target_audience: "Tech enthusiasts who love minimalist design",
        content_ideas: [
          { title: "Nightstand Glow-Up", description: "Before/after nightstand transformation", format: "reel" },
          { title: "Morning Routine", description: "Show how everything charges overnight", format: "video" }
        ],
        hashtags: ["#TechSetup", "#Aesthetic", "#NightstandGoals", "#WirelessCharging"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "60% Mechanical Mini Keyboard",
      description: "Compact gaming keyboard with RGB and custom switches",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "tech-gadgets",
        price_range: "$70-120",
        virality_reason: "Mechanical keyboard community growing exponentially",
        target_audience: "Gamers and programmers",
        content_ideas: [
          { title: "Sound Test", description: "ASMR typing sounds of different switches", format: "reel" },
          { title: "Custom Build", description: "How to build your dream keyboard", format: "tutorial" }
        ],
        hashtags: ["#MechanicalKeyboard", "#GamingSetup", "#TechASMR", "#CustomKeyboard"],
        estimated_virality: "high"
      }
    },

    // ===== BEAUTY (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Ice Roller with LED Light Therapy",
      description: "Facial roller with cooling and red light for anti-aging",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "$25-40",
        virality_reason: "Beauty influencers showing before/after results",
        target_audience: "Beauty-conscious women 25-45",
        content_ideas: [
          { title: "Morning Skincare Routine", description: "Ice roller as part of morning routine", format: "reel" },
          { title: "7-Day Challenge", description: "Show changes after one week", format: "series" }
        ],
        hashtags: ["#SkincareRoutine", "#BeautyTools", "#GlowUp", "#SelfCare"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Heatless Curling Rod Set",
      description: "Overnight satin curling rods — no heat damage",
      popularity_index: 92,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "$15-25",
        virality_reason: "#HeatlessCurls trend with 500M+ views on TikTok",
        target_audience: "Women who want to protect their hair",
        content_ideas: [
          { title: "Before Bed Routine", description: "Show application and morning results", format: "reel" },
          { title: "Curl Comparison", description: "Heatless vs. curling iron results", format: "video" }
        ],
        hashtags: ["#HeatlessCurls", "#HairCare", "#BeautyHack", "#NoDamage"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Rose Quartz Gua Sha Set",
      description: "Traditional massage tool for facial contouring",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "$20-35",
        virality_reason: "Clean beauty & wellness trend from Asia",
        target_audience: "Skincare enthusiasts and wellness community",
        content_ideas: [
          { title: "Gua Sha Tutorial", description: "Proper technique for lymphatic drainage", format: "tutorial" },
          { title: "Face Sculpting", description: "How I define my jawline", format: "reel" }
        ],
        hashtags: ["#GuaSha", "#FaceSculpting", "#CleanBeauty", "#SelfCareSunday"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "At-Home Lash Lift Kit",
      description: "Professional lash lift set for DIY application",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "$25-40",
        virality_reason: "Cost savings vs. salon + DIY beauty trend",
        target_audience: "Beauty lovers who want to save money",
        content_ideas: [
          { title: "DIY Lash Lift", description: "Step-by-step tutorial for beginners", format: "tutorial" },
          { title: "Before/After Reveal", description: "Dramatic before-and-after transformation", format: "reel" }
        ],
        hashtags: ["#LashLift", "#DIYBeauty", "#BeautyHack", "#LashGoals"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Silicone Face Cupping Set",
      description: "Facial cupping set for anti-aging and circulation",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "beauty",
        price_range: "$18-30",
        virality_reason: "Natural alternative to Botox and fillers",
        target_audience: "Women 30+ looking for natural anti-aging methods",
        content_ideas: [
          { title: "Face Cupping Routine", description: "My 5-minute anti-aging routine", format: "reel" },
          { title: "Science Behind It", description: "Why cupping works for your skin", format: "carousel" }
        ],
        hashtags: ["#FaceCupping", "#AntiAging", "#NaturalBeauty", "#Skincare"],
        estimated_virality: "medium"
      }
    },

    // ===== HOUSEHOLD (5) =====
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Automatic Soap Dispenser with Sensor",
      description: "Touchless dispenser for kitchen and bathroom",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "household",
        price_range: "$20-30",
        virality_reason: "#SmartHome trend — hygienic and modern",
        target_audience: "Families and design enthusiasts",
        content_ideas: [
          { title: "Smart Home Upgrade", description: "Show modern household upgrades", format: "carousel" },
          { title: "Hygiene Hack", description: "Touchless solutions for a clean home", format: "reel" }
        ],
        hashtags: ["#SmartHome", "#HomeHacks", "#ModernLiving"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Rotating Spice Rack Organizer",
      description: "360° rotating spice tower for space-saving storage",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "household",
        price_range: "$25-40",
        virality_reason: "#KitchenOrganization with 200M+ views",
        target_audience: "Home cooks and organization enthusiasts",
        content_ideas: [
          { title: "Kitchen Makeover", description: "Before/after spice organization", format: "reel" },
          { title: "Space Saving Hacks", description: "How I saved 50% of shelf space", format: "video" }
        ],
        hashtags: ["#KitchenOrganization", "#HomeHacks", "#SpaceSaving", "#CleanTok"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Self-Watering Plant Pots",
      description: "Smart plant pots with a 30-day water reservoir",
      popularity_index: 84,
      category: "ecommerce",
      data_json: {
        subcategory: "household",
        price_range: "$15-30",
        virality_reason: "#PlantParent community growing exponentially",
        target_audience: "Urban gardeners and plant lovers",
        content_ideas: [
          { title: "Plant Haul", description: "Show your plant collection with smart pots", format: "reel" },
          { title: "Before/After", description: "How my plants thrive since switching pots", format: "carousel" }
        ],
        hashtags: ["#PlantParent", "#UrbanJungle", "#PlantTok", "#IndoorPlants"],
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Electric Jar & Bottle Opener",
      description: "Automatic opener for bottles, cans & jars",
      popularity_index: 82,
      category: "ecommerce",
      data_json: {
        subcategory: "household",
        price_range: "$25-35",
        virality_reason: "Perfect for seniors & people with arthritis",
        target_audience: "Seniors and gift shoppers",
        content_ideas: [
          { title: "Problem Solver", description: "Never struggle with jar lids again", format: "reel" },
          { title: "Gift Idea", description: "The perfect gift for parents/grandparents", format: "video" }
        ],
        hashtags: ["#KitchenGadgets", "#GiftIdeas", "#LifeHacks", "#AccessibleLiving"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Magnetic Trash Bag Holder",
      description: "Door-mounted holder for a temporary trash bag while cooking",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "household",
        price_range: "$12-20",
        virality_reason: "Viral for its simplicity & value",
        target_audience: "Home cooks and clean-home enthusiasts",
        content_ideas: [
          { title: "Cooking Hack", description: "Never walk to the trash can again", format: "reel" },
          { title: "Kitchen Life Hack", description: "The $10 hack that changes your life", format: "video" }
        ],
        hashtags: ["#KitchenHacks", "#CookingTips", "#CleanHome", "#LifeHacks"],
        estimated_virality: "very high"
      }
    },

    // ===== PETS (5) =====
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Interactive Cat Laser Ball",
      description: "Self-rolling ball with laser pointer for cat entertainment",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "$25-35",
        virality_reason: "Cat videos go viral on TikTok",
        target_audience: "Cat owners and pet influencers",
        content_ideas: [
          { title: "Cat Reaction Video", description: "Film your cat's first reaction", format: "reel" },
          { title: "Entertainment Solution", description: "Show how your cat entertains itself", format: "video" }
        ],
        hashtags: ["#CatTok", "#PetGadgets", "#CatLovers", "#PetProducts"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Smart Pet Feeder with App",
      description: "Automatic pet feeder with timer and portion control",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "$60-90",
        virality_reason: "Perfect for working pet parents",
        target_audience: "Dog & cat owners with busy schedules",
        content_ideas: [
          { title: "Pet Tech Review", description: "My experience after 30 days", format: "video" },
          { title: "Peace of Mind", description: "Auto-feed your pet even on vacation", format: "reel" }
        ],
        hashtags: ["#PetTech", "#SmartFeeder", "#PetCare", "#DogMom"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "GPS Pet Tracker",
      description: "Small GPS collar attachment with live tracking",
      popularity_index: 91,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "$40-70",
        virality_reason: "Safety & peace of mind for pet parents",
        target_audience: "Dog and cat owners with outdoor pets",
        content_ideas: [
          { title: "Lost Pet Story", description: "How the GPS tracker saved my dog", format: "story" },
          { title: "Live Demo", description: "Show the app & real-time tracking", format: "video" }
        ],
        hashtags: ["#PetSafety", "#GPSTracker", "#DogTok", "#PetTech"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Orthopedic Memory Foam Dog Bed",
      description: "Joint-friendly bed for senior dogs and large breeds",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "$50-90",
        virality_reason: "Senior pet care trend is growing",
        target_audience: "Owners of older dogs",
        content_ideas: [
          { title: "Before/After", description: "How my senior dog sleeps better now", format: "reel" },
          { title: "Pet Care Tips", description: "5 ways to help your aging dog", format: "carousel" }
        ],
        hashtags: ["#SeniorDog", "#PetCare", "#DogHealth", "#OrthopedicBed"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Smart Dog Ball with Camera",
      description: "Ball with built-in camera for interactive play",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "pets",
        price_range: "$45-70",
        virality_reason: "Pet POV videos are viral on TikTok",
        target_audience: "Content creators with pets",
        content_ideas: [
          { title: "Dog POV", description: "See the world from your dog's perspective", format: "reel" },
          { title: "Interactive Play", description: "How I play with my dog remotely", format: "video" }
        ],
        hashtags: ["#DogPOV", "#PetCamera", "#DogTok", "#PetContent"],
        estimated_virality: "very high"
      }
    },

    // ===== FITNESS (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Smart Jump Rope with App",
      description: "Intelligent jump rope with calorie counter and app integration",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "$35-50",
        virality_reason: "Fitness trend #JumpRopeChallenge",
        target_audience: "Fitness enthusiasts and home workout fans",
        content_ideas: [
          { title: "30-Day Challenge", description: "Document your fitness progress", format: "series" },
          { title: "Calorie Burn Demo", description: "Show how many calories in 10 minutes", format: "reel" }
        ],
        hashtags: ["#FitnessGadgets", "#HomeWorkout", "#JumpRope", "#FitTech"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Resistance Bands Set (5 Levels)",
      description: "Latex resistance bands for full-body training",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "$20-35",
        virality_reason: "#HomeGym and space-saving workouts",
        target_audience: "Home workout community",
        content_ideas: [
          { title: "Full Body Workout", description: "30-min workout with bands only", format: "video" },
          { title: "Before/After", description: "My transformation with resistance bands", format: "reel" }
        ],
        hashtags: ["#ResistanceBands", "#HomeWorkout", "#FitnessJourney", "#GymAtHome"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Vibrating Foam Roller",
      description: "Electric massage roller for post-workout recovery",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "$60-90",
        virality_reason: "Recovery & self-care in the fitness space",
        target_audience: "Athletes and fitness enthusiasts",
        content_ideas: [
          { title: "Recovery Routine", description: "My post-workout recovery routine", format: "reel" },
          { title: "Foam Rolling Tutorial", description: "How to use the roller properly", format: "tutorial" }
        ],
        hashtags: ["#FoamRoller", "#Recovery", "#FitnessTips", "#SportsMassage"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Ab Roller Wheel Pro",
      description: "Ab roller with automatic rebound for core training",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "$25-40",
        virality_reason: "#AbWorkout challenges on TikTok",
        target_audience: "People who want six-pack abs",
        content_ideas: [
          { title: "Ab Challenge", description: "30-day ab roller challenge", format: "series" },
          { title: "Core Workout", description: "5-minute killer ab routine", format: "reel" }
        ],
        hashtags: ["#AbWorkout", "#CoreTraining", "#FitnessChallenge", "#Sixpack"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Foldable Yoga Mat with Alignment Lines",
      description: "Pro yoga mat with position markings for correct form",
      popularity_index: 84,
      category: "ecommerce",
      data_json: {
        subcategory: "fitness",
        price_range: "$40-60",
        virality_reason: "Yoga community growing, especially among young women",
        target_audience: "Yoga beginners and practitioners",
        content_ideas: [
          { title: "Morning Yoga Flow", description: "20-min morning yoga routine", format: "video" },
          { title: "Alignment Guide", description: "Why position lines help your yoga practice", format: "carousel" }
        ],
        hashtags: ["#YogaMat", "#YogaPractice", "#MindfulMovement", "#YogaLife"],
        estimated_virality: "medium"
      }
    },

    // ===== FASHION (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Oversized Neutral Blazer",
      description: "Timeless business-casual blazer for every occasion",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "$60-120",
        virality_reason: "#QuietLuxury and minimalist style trending",
        target_audience: "Fashion-conscious women 25-40",
        content_ideas: [
          { title: "5 Ways to Style", description: "One blazer, 5 different looks", format: "reel" },
          { title: "Capsule Wardrobe", description: "Essential pieces for timeless style", format: "carousel" }
        ],
        hashtags: ["#BlazerStyle", "#QuietLuxury", "#CapsuleWardrobe", "#TimelessFashion"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Chunky Gold Hoops",
      description: "Statement hoops in 18K gold-plated stainless steel",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "$25-45",
        virality_reason: "Bold jewelry trend on TikTok",
        target_audience: "Gen Z and Millennials",
        content_ideas: [
          { title: "Jewelry Haul", description: "Show different styling options", format: "reel" },
          { title: "Everyday Glam", description: "How accessories upgrade any outfit", format: "video" }
        ],
        hashtags: ["#GoldHoops", "#JewelryTrends", "#AccessoryGame", "#StatementEarrings"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "High-Waist Straight Jeans",
      description: "Vintage-look mom jeans made from sustainable cotton",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "$50-90",
        virality_reason: "90s fashion revival + sustainability trend",
        target_audience: "Sustainable fashion community",
        content_ideas: [
          { title: "Try-On Haul", description: "Perfect jeans for different body types", format: "reel" },
          { title: "Sustainable Fashion", description: "Why I only buy sustainable now", format: "video" }
        ],
        hashtags: ["#MomJeans", "#SustainableFashion", "#90sFashion", "#EcoFriendly"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Crossbody Mini Bag",
      description: "Small crossbody bag in Y2K style",
      popularity_index: 91,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "$30-55",
        virality_reason: "#Y2K fashion comeback on TikTok",
        target_audience: "Gen Z fashion lovers",
        content_ideas: [
          { title: "What's in my bag", description: "Show how much fits in the mini bag", format: "reel" },
          { title: "Y2K Outfit", description: "Complete 2000s look with styling tips", format: "video" }
        ],
        hashtags: ["#MiniBag", "#Y2KFashion", "#ThatGirl", "#OOTD"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "White Chunky Sneakers",
      description: "Platform sneakers in dad-shoe style",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "fashion",
        price_range: "$70-130",
        virality_reason: "Chunky sneakers remain a staple trend",
        target_audience: "Sneakerheads and streetwear fans",
        content_ideas: [
          { title: "Sneaker Styling", description: "10 outfits with white sneakers", format: "carousel" },
          { title: "Unboxing", description: "First impressions + on-feet look", format: "reel" }
        ],
        hashtags: ["#ChunkySneakers", "#Sneakerhead", "#WhiteSneakers", "#Streetwear"],
        estimated_virality: "high"
      }
    },

    // ===== KITCHEN (5) =====
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Electric Milk Frother (3 Modes)",
      description: "Home cappuccino maker with hot/cold function",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "$25-40",
        virality_reason: "#CoffeeTok and home barista trend",
        target_audience: "Coffee lovers",
        content_ideas: [
          { title: "Latte Art Tutorial", description: "Perfect milk foam for latte art", format: "tutorial" },
          { title: "Morning Coffee Routine", description: "Barista quality at home", format: "reel" }
        ],
        hashtags: ["#CoffeeTok", "#HomeCafe", "#LatteArt", "#CoffeeLover"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Airtight Glass Storage Container Set",
      description: "12-piece borosilicate glass set with bamboo lids",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "$40-60",
        virality_reason: "#PantryOrganization and zero waste lifestyle",
        target_audience: "Organization enthusiasts and eco-conscious shoppers",
        content_ideas: [
          { title: "Pantry Makeover", description: "Before/after of my organized pantry", format: "reel" },
          { title: "Zero Waste Kitchen", description: "How I eliminated plastic from my kitchen", format: "video" }
        ],
        hashtags: ["#PantryOrganization", "#ZeroWaste", "#KitchenGoals", "#Sustainable"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Multi-Blade Mandoline Slicer",
      description: "Adjustable mandoline for slicing, shredding, grating",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "$20-35",
        virality_reason: "#CookingHacks videos go viral",
        target_audience: "Home cooks",
        content_ideas: [
          { title: "Cooking Hack", description: "Save 50% time chopping vegetables", format: "reel" },
          { title: "Recipe Demo", description: "3 quick recipes using this tool", format: "video" }
        ],
        hashtags: ["#CookingHacks", "#KitchenGadgets", "#RecipeTok", "#TimeSaver"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Vacuum Food Storage System",
      description: "Electric vacuum pump with reusable containers",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "$50-80",
        virality_reason: "Food waste reduction + meal prep trend",
        target_audience: "Meal prep community and families",
        content_ideas: [
          { title: "Meal Prep Sunday", description: "How I keep food fresh 2x longer", format: "video" },
          { title: "Food Waste Hack", description: "Save money with vacuum sealing", format: "carousel" }
        ],
        hashtags: ["#MealPrep", "#FoodStorage", "#ZeroWaste", "#KitchenHacks"],
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Silicone Baking Mats with Measurements",
      description: "Reusable baking mats to replace parchment paper",
      popularity_index: 83,
      category: "ecommerce",
      data_json: {
        subcategory: "kitchen",
        price_range: "$15-25",
        virality_reason: "Sustainable baking + #BakingTok",
        target_audience: "Home bakers and eco-conscious shoppers",
        content_ideas: [
          { title: "Baking Hack", description: "Never buy parchment paper again", format: "reel" },
          { title: "Cookie Tutorial", description: "Perfect cookies with measurement marks", format: "video" }
        ],
        hashtags: ["#BakingTok", "#SustainableLiving", "#BakingHacks", "#EcoFriendly"],
        estimated_virality: "medium"
      }
    },

    // ===== OUTDOOR & TRAVEL (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Compact Camping Hammock",
      description: "Ultralight hammock with mosquito net for outdoor use",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "$40-70",
        virality_reason: "#VanLife and outdoor adventure trend",
        target_audience: "Outdoor enthusiasts and campers",
        content_ideas: [
          { title: "Camping Setup", description: "Perfect camping setup in 5 minutes", format: "reel" },
          { title: "Hidden Gem Spots", description: "My top 5 hammock spots", format: "video" }
        ],
        hashtags: ["#VanLife", "#Camping", "#OutdoorAdventure", "#Hammocking"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Solar Power Bank 20,000mAh",
      description: "Waterproof power bank with solar panel for outdoor use",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "$35-60",
        virality_reason: "Essential for digital nomads and campers",
        target_audience: "Travelers and outdoor lovers",
        content_ideas: [
          { title: "Festival Essential", description: "Never run out of battery at festivals", format: "reel" },
          { title: "Camping Gear", description: "Must-have for multi-day hikes", format: "video" }
        ],
        hashtags: ["#OutdoorGear", "#SolarPower", "#CampingEssentials", "#FestivalSeason"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Collapsible Silicone Water Bottle",
      description: "Foldable 600ml bottle for travel",
      popularity_index: 84,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "$18-28",
        virality_reason: "Space-saving for minimalists and travelers",
        target_audience: "Digital nomads and backpackers",
        content_ideas: [
          { title: "Travel Hack", description: "How I save 30% of backpack space", format: "reel" },
          { title: "Packing List", description: "My essentials for world travel", format: "carousel" }
        ],
        hashtags: ["#TravelGear", "#Minimalism", "#Backpacking", "#SustainableTravel"],
        estimated_virality: "medium"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Portable Electric Mini Grill",
      description: "Battery-powered grill for balcony, camping & picnics",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "$80-120",
        virality_reason: "#OutdoorCooking and summer BBQ season",
        target_audience: "Grill fans and outdoor cooks",
        content_ideas: [
          { title: "Camping Cooking", description: "Perfect steak in the middle of nature", format: "reel" },
          { title: "Balcony BBQ", description: "Grilling without charcoal — here's how", format: "video" }
        ],
        hashtags: ["#BBQTime", "#OutdoorCooking", "#CampingFood", "#GrillSeason"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Waterproof Phone Case for Diving",
      description: "Universal underwater case for smartphones up to 30m depth",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "outdoor",
        price_range: "$20-35",
        virality_reason: "Underwater content is booming on social media",
        target_audience: "Content creators and water sports fans",
        content_ideas: [
          { title: "Underwater POV", description: "How to create epic underwater videos", format: "tutorial" },
          { title: "Beach Content", description: "Content ideas for the beach", format: "reel" }
        ],
        hashtags: ["#UnderwaterPhotography", "#BeachContent", "#TravelCreator", "#WaterproofCase"],
        estimated_virality: "very high"
      }
    },

    // ===== PRODUCTIVITY (5) =====
    {
      platform: "instagram",
      trend_type: "product",
      name: "Ergonomic Aluminum Laptop Stand",
      description: "Adjustable stand for healthy work posture",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "productivity",
        price_range: "$30-50",
        virality_reason: "#WFH setup and ergonomics awareness",
        target_audience: "Remote workers and freelancers",
        content_ideas: [
          { title: "Desk Setup Tour", description: "Show your optimized home office", format: "video" },
          { title: "Posture Fix", description: "How I got rid of neck pain", format: "reel" }
        ],
        hashtags: ["#DeskSetup", "#WFH", "#Ergonomics", "#HomeOffice"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "LED Desk Lamp with Wireless Charging",
      description: "Desk lamp with 3 color temperatures & Qi charging pad",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "productivity",
        price_range: "$40-65",
        virality_reason: "Aesthetic workspace trend + functionality",
        target_audience: "Content creators and design lovers",
        content_ideas: [
          { title: "Desk Glow-Up", description: "Before/after with perfect lighting", format: "reel" },
          { title: "Productivity Setup", description: "How lighting boosts your productivity", format: "video" }
        ],
        hashtags: ["#DeskLamp", "#WorkspaceAesthetic", "#ProductivityTips", "#HomeOffice"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Cable Management System",
      description: "Self-adhesive cable channels for a clean desk",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "productivity",
        price_range: "$15-25",
        virality_reason: "#CableManagement is a massive trend",
        target_audience: "Perfectionists and clean-desk enthusiasts",
        content_ideas: [
          { title: "Cable Management Tutorial", description: "From chaos to clean in 10 minutes", format: "tutorial" },
          { title: "Satisfying Transformation", description: "Before/after cable transformation", format: "reel" }
        ],
        hashtags: ["#CableManagement", "#CleanDesk", "#Satisfying", "#DeskGoals"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Noise-Cancelling Headphones for Focus",
      description: "Over-ear headphones with active noise cancellation",
      popularity_index: 90,
      category: "ecommerce",
      data_json: {
        subcategory: "productivity",
        price_range: "$100-200",
        virality_reason: "Deep work & productivity trend",
        target_audience: "Knowledge workers and students",
        content_ideas: [
          { title: "Productivity Review", description: "How I doubled my focus time", format: "video" },
          { title: "Sound Test", description: "Noise cancelling tested in an open office", format: "reel" }
        ],
        hashtags: ["#NoiseCancelling", "#DeepWork", "#ProductivityHack", "#FocusMode"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Felt Desk Organizer Set",
      description: "Modular organizer set for pens, notes & gadgets",
      popularity_index: 83,
      category: "ecommerce",
      data_json: {
        subcategory: "productivity",
        price_range: "$25-40",
        virality_reason: "Minimalist design + organization",
        target_audience: "Home office workers who love aesthetics",
        content_ideas: [
          { title: "Desk Organization", description: "How I organize my workspace", format: "reel" },
          { title: "Minimalist Setup", description: "Less is more — my minimal desk", format: "carousel" }
        ],
        hashtags: ["#DeskOrganization", "#MinimalistDesk", "#WorkspaceGoals", "#CleanAesthetic"],
        estimated_virality: "medium"
      }
    },

    // ===== GIFTS & KIDS (5) =====
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Montessori Activity Board",
      description: "Wooden learning board with locks, switches & zippers",
      popularity_index: 88,
      category: "ecommerce",
      data_json: {
        subcategory: "gifts",
        price_range: "$40-70",
        virality_reason: "#MontessoriMom trend on TikTok",
        target_audience: "Parents of toddlers aged 1-4",
        content_ideas: [
          { title: "Toddler Activity", description: "How my 2-year-old stays busy for 30 minutes", format: "reel" },
          { title: "Educational Toys", description: "Top 5 Montessori toys", format: "video" }
        ],
        hashtags: ["#MontessoriToys", "#ToddlerActivities", "#EducationalToys", "#ParentingHacks"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Reusable Water Drawing Mat",
      description: "Magic drawing mat — draw with water, no stains",
      popularity_index: 89,
      category: "ecommerce",
      data_json: {
        subcategory: "gifts",
        price_range: "$20-35",
        virality_reason: "Mess-free activity for parents",
        target_audience: "Parents looking for clean activities",
        content_ideas: [
          { title: "Mess-Free Art", description: "How kids create art without the mess", format: "reel" },
          { title: "Travel Hack", description: "Perfect for long car rides", format: "video" }
        ],
        hashtags: ["#ToddlerActivities", "#MessFree", "#ParentingWin", "#KidsArt"],
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "LED Night Light with Color Change",
      description: "Silicone night light in animal shape, touch-controlled",
      popularity_index: 86,
      category: "ecommerce",
      data_json: {
        subcategory: "gifts",
        price_range: "$18-30",
        virality_reason: "Cute design + functional for bedtime routine",
        target_audience: "Parents of babies and toddlers",
        content_ideas: [
          { title: "Bedtime Routine", description: "Our relaxing bedtime routine", format: "reel" },
          { title: "Nursery Tour", description: "Nursery tour with all the gadgets", format: "video" }
        ],
        hashtags: ["#NurseryDecor", "#BedtimeRoutine", "#ParentingHacks", "#BabyEssentials"],
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "product",
      name: "Inflatable Travel Footrest for Kids",
      description: "Airplane footrest so kids can lie down during flights",
      popularity_index: 87,
      category: "ecommerce",
      data_json: {
        subcategory: "gifts",
        price_range: "$15-25",
        virality_reason: "Travel hack for families going viral",
        target_audience: "Traveling parents",
        content_ideas: [
          { title: "Travel Hack", description: "How kids sleep on airplanes", format: "reel" },
          { title: "Family Travel", description: "10 hacks for stress-free travel with kids", format: "carousel" }
        ],
        hashtags: ["#TravelWithKids", "#FamilyTravel", "#ParentingHacks", "#TravelEssentials"],
        estimated_virality: "very high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "product",
      name: "Kids Headphones with Volume Limit",
      description: "Safe over-ear headphones capped at 85dB for hearing protection",
      popularity_index: 85,
      category: "ecommerce",
      data_json: {
        subcategory: "gifts",
        price_range: "$25-45",
        virality_reason: "Screen time trend + health awareness",
        target_audience: "Health-conscious parents",
        content_ideas: [
          { title: "Screen Time Solution", description: "How kids watch videos safely", format: "reel" },
          { title: "Travel Essential", description: "Quiet flights thanks to headphones", format: "video" }
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
      name: "Matcha Trend 2025",
      description: "Green tea extract with antioxidants for focus and energy",
      popularity_index: 88,
      category: "lifestyle",
      data_json: {
        food: "Matcha",
        benefits: "L-theanine for concentration, high antioxidant content, gentle energy boost",
        vitamins: ["C", "E", "K"],
        health_tips: [
          "Drink matcha in the morning for a gentle energy boost without the crash",
          "Combine with oat milk for better digestibility",
          "Use ceremonial-grade matcha for highest quality"
        ],
        content_ideas: [
          { title: "Matcha Latte Tutorial", description: "Show perfect preparation technique", format: "reel" },
          { title: "Benefits Breakdown", description: "Explain health benefits visually", format: "carousel" }
        ],
        hashtags: ["#MatchaLatte", "#HealthyLiving", "#Wellness", "#CleanEating"],
        audience_fit: "Health-conscious people 25-45",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "lifestyle",
      name: "Turmeric Water Detox",
      description: "Anti-inflammatory morning ritual with turmeric and lemon",
      popularity_index: 85,
      category: "lifestyle",
      data_json: {
        food: "Turmeric",
        benefits: "Curcumin is anti-inflammatory, supports immune system and digestion",
        vitamins: ["K", "E", "B6"],
        health_tips: [
          "Mix 1 tsp turmeric with warm water and lemon juice",
          "Add black pepper for better absorption",
          "Drink on an empty stomach for detox effect"
        ],
        content_ideas: [
          { title: "Morning Detox Routine", description: "Show preparation in morning routine", format: "reel" },
          { title: "7-Day Challenge", description: "Document a week with turmeric water", format: "series" }
        ],
        hashtags: ["#DetoxWater", "#Turmeric", "#HealthyMorning", "#Immunity"],
        audience_fit: "Health-conscious individuals interested in natural remedies",
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "instagram",
      trend_type: "lifestyle",
      name: "Oat Milk Revolution",
      description: "Plant-based milk alternative with fiber for heart health",
      popularity_index: 83,
      category: "lifestyle",
      data_json: {
        food: "Oat Milk",
        benefits: "Fiber & beta-glucans for heart health, climate-friendly",
        vitamins: ["B1", "B6", "E"],
        health_tips: [
          "Choose unsweetened varieties for best health benefits",
          "Perfect for coffee due to creamy texture",
          "Rich in fiber — great for digestion"
        ],
        content_ideas: [
          { title: "Milk Alternative Comparison", description: "Compare different plant milk options", format: "carousel" },
          { title: "Homemade Oat Milk", description: "DIY tutorial for homemade oat milk", format: "video" }
        ],
        hashtags: ["#DairyFree", "#PlantBased", "#OatMilk", "#HealthyChoices"],
        audience_fit: "Plant-based and lactose-intolerant community",
        estimated_virality: "medium"
      }
    },
    {
      platform: "tiktok",
      trend_type: "lifestyle",
      name: "Ginger Shots for Immunity",
      description: "Concentrated ginger shots as a daily immune booster",
      popularity_index: 87,
      category: "lifestyle",
      data_json: {
        food: "Ginger",
        benefits: "Anti-inflammatory, immune system boost, aids digestion",
        vitamins: ["C", "B6", "Magnesium"],
        health_tips: [
          "Drink 1 shot daily on an empty stomach",
          "Combine with lemon and cayenne pepper for maximum effect",
          "Fresh ginger is more potent than powder"
        ],
        content_ideas: [
          { title: "DIY Ginger Shots", description: "Recipe for homemade ginger shots", format: "tutorial" },
          { title: "30-Day Challenge", description: "Document immune system improvement", format: "series" }
        ],
        hashtags: ["#GingerShot", "#ImmunityBoost", "#HealthyLiving", "#WellnessTips"],
        audience_fit: "Health-conscious individuals",
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "lifestyle",
      name: "Chia Seed Pudding",
      description: "Nutrient-rich pudding with omega-3 and protein",
      popularity_index: 84,
      category: "lifestyle",
      data_json: {
        food: "Chia Seeds",
        benefits: "High omega-3 content, protein-rich, long-lasting satiety",
        vitamins: ["Omega-3", "Calcium", "Phosphorus"],
        health_tips: [
          "Mix 3 tbsp chia seeds with 200ml plant milk",
          "Let it soak overnight in the refrigerator",
          "Top with fruits and nuts for extra nutrients"
        ],
        content_ideas: [
          { title: "Chia Pudding Variations", description: "5 different flavor combinations", format: "carousel" },
          { title: "Meal Prep Breakfast", description: "Prep 5 breakfasts for the week", format: "video" }
        ],
        hashtags: ["#ChiaPudding", "#HealthyBreakfast", "#MealPrep", "#PlantBased"],
        audience_fit: "Fitness and health enthusiasts",
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "lifestyle",
      name: "Fermented Foods Trend",
      description: "Probiotic-rich foods for gut health",
      popularity_index: 86,
      category: "lifestyle",
      data_json: {
        food: "Kimchi, Kombucha, Sauerkraut",
        benefits: "Improved gut flora, stronger immune system, better digestion",
        vitamins: ["K2", "B12", "Probiotics"],
        health_tips: [
          "Start with small portions to let your body adjust",
          "Incorporate fermented foods daily for best results",
          "DIY fermentation saves money and is easier than you think"
        ],
        content_ideas: [
          { title: "Fermentation 101", description: "Beginner's guide to homemade kimchi", format: "tutorial" },
          { title: "Gut Health Journey", description: "My 30-day transformation", format: "series" }
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
      name: "Top Stocks of the Week",
      description: "Overview of the best-performing stocks with analysis",
      popularity_index: 90,
      category: "finance",
      data_json: {
        stocks: [
          { symbol: "NVDA", change: "+5.8%", reason: "AI chip demand continues to rise", price: "~$145", ai_tip: "Create explainer video on AI hardware market" },
          { symbol: "MSFT", change: "+3.2%", reason: "Cloud business exceeds expectations", price: "~$425", ai_tip: "Post about cloud computing trends" },
          { symbol: "TSLA", change: "+4.1%", reason: "New Gigafactory plans announced", price: "~$265", ai_tip: "Explain e-mobility future scenarios" }
        ],
        content_ideas: [
          { title: "Weekly Analysis", description: "Explain market movements visually with charts", format: "video" },
          { title: "Stock Pick Breakdown", description: "Why these 3 stocks are interesting right now", format: "carousel" }
        ],
        hashtags: ["#Investing", "#StockMarket", "#FinancialFreedom", "#Stocks"],
        audience_fit: "Investors and finance-interested people 25-50",
        estimated_virality: "medium-high"
      }
    },
    {
      platform: "twitter",
      trend_type: "finance",
      name: "Crypto Market Update",
      description: "Weekly overview of top cryptocurrencies",
      popularity_index: 89,
      category: "finance",
      data_json: {
        crypto: [
          { name: "Bitcoin", price: "$68,200", change: "+1.8%", market_cap: "1.26T" },
          { name: "Ethereum", price: "$3,250", change: "+0.9%", market_cap: "367B" },
          { name: "Solana", price: "$148", change: "+3.2%", market_cap: "65B" },
          { name: "BNB", price: "$558", change: "-0.4%", market_cap: "76B" },
          { name: "XRP", price: "$0.65", change: "+0.5%", market_cap: "35B" }
        ],
        news: [
          "Bitcoin ETF records record inflows of $1.2B this week",
          "Ethereum prepares largest network upgrade 'Pectra'",
          "Solana hits new all-time high in transactions"
        ],
        content_ideas: [
          { title: "Crypto Weekly Wrap", description: "5-minute update on market movements", format: "video" },
          { title: "Investment Strategy", description: "DCA vs. timing — which works better?", format: "thread" }
        ],
        hashtags: ["#Crypto", "#Bitcoin", "#Blockchain", "#CryptoNews"],
        audience_fit: "Crypto investors and tech enthusiasts",
        estimated_virality: "high"
      }
    },
    {
      platform: "linkedin",
      trend_type: "finance",
      name: "ETF Strategies 2025",
      description: "Passive investment strategies with ETFs for long-term wealth building",
      popularity_index: 84,
      category: "finance",
      data_json: {
        investment_tips: [
          "MSCI World as a base investment for global diversification",
          "Dollar-cost averaging: $200-500/month for the averaging effect",
          "Rebalance once a year for optimal risk distribution"
        ],
        content_ideas: [
          { title: "ETF for Beginners", description: "3 ETFs everyone should know", format: "carousel" },
          { title: "Portfolio Building", description: "How I would invest $100,000", format: "article" }
        ],
        hashtags: ["#ETF", "#PassiveIncome", "#WealthBuilding", "#Investing"],
        audience_fit: "Investors and savers with a long-term strategy",
        estimated_virality: "medium"
      }
    },
    {
      platform: "twitter",
      trend_type: "finance",
      name: "Index Funds vs. Individual Stocks",
      description: "Comparison of investment strategies for beginners",
      popularity_index: 82,
      category: "finance",
      data_json: {
        investment_comparison: [
          { strategy: "S&P 500 ETF", risk: "medium", potential_return: "8-10% p.a.", effort: "minimal" },
          { strategy: "Individual Stocks", risk: "high", potential_return: "variable", effort: "high" },
          { strategy: "Dividend ETF", risk: "medium", potential_return: "6-8% p.a.", effort: "low" }
        ],
        content_ideas: [
          { title: "Investment Comparison", description: "Which strategy is right for you?", format: "thread" },
          { title: "Beginner Portfolio", description: "How I'd start today with $1,000", format: "video" }
        ],
        hashtags: ["#InvestingForBeginners", "#ETF", "#StockMarket", "#PassiveIncome"],
        audience_fit: "Investment beginners",
        estimated_virality: "high"
      }
    },
    {
      platform: "linkedin",
      trend_type: "finance",
      name: "Dividend Strategy 2025",
      description: "Building passive income through dividend stocks",
      popularity_index: 85,
      category: "finance",
      data_json: {
        dividend_picks: [
          { company: "Coca-Cola", yield: "3.1%", stability: "very high", streak: "62 years of dividend growth" },
          { company: "Johnson & Johnson", yield: "2.9%", stability: "very high", streak: "61 years of dividend growth" },
          { company: "Procter & Gamble", yield: "2.5%", stability: "very high", streak: "67 years of dividend growth" }
        ],
        content_ideas: [
          { title: "Dividend Portfolio", description: "How I generate $500 passive income", format: "article" },
          { title: "Dividend Aristocrats", description: "The best dividend payers", format: "carousel" }
        ],
        hashtags: ["#DividendInvesting", "#PassiveIncome", "#LongTermInvesting", "#FinancialFreedom"],
        audience_fit: "Long-term investors",
        estimated_virality: "medium"
      }
    }
  ];

  // ===== 5. MOTIVATION & BUILDING (5+) =====
  const motivationTrends = [
    {
      platform: "instagram",
      trend_type: "motivation",
      name: "Weekly Growth Pulse",
      description: "Motivational quotes and practical tips for content creators",
      popularity_index: 87,
      category: "motivation",
      data_json: {
        quotes: [
          "Success doesn't come from luck — it comes from small daily steps.",
          "When you're tired, learn to rest — not to quit.",
          "The best ideas don't come from comfort, but from consistency."
        ],
        growth_tips: [
          "Analyze your top 3 performing posts weekly — repeat what works.",
          "Build a routine: 1 day planning, 3 days production, 3 days engagement.",
          "Set micro-goals: +50 followers this week is better than +1000 this month.",
          "Comment on 10 posts in your niche daily for visibility."
        ],
        mindset_prompt: "Write a post today about your biggest setback — and what you learned from it.",
        content_ideas: [
          { title: "Motivation Reel", description: "Combine a quote with B-roll of your journey", format: "reel" },
          { title: "Growth Tips Carousel", description: "Share your 5 best growth hacks", format: "carousel" }
        ],
        hashtags: ["#Motivation", "#CreatorLife", "#GrowthMindset", "#ContentCreator"],
        audience_fit: "Ambitious creators and entrepreneurs",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "motivation",
      name: "5AM Club Challenge",
      description: "Early rising movement for productive morning routines",
      popularity_index: 85,
      category: "motivation",
      data_json: {
        quotes: [
          "Win the morning, win the day.",
          "While others sleep, you're building your empire."
        ],
        growth_tips: [
          "Start by waking up 15 minutes earlier, increase gradually",
          "Prepare the night before: clothes, breakfast, daily plan",
          "Use the first hour for your most important task (no social media)"
        ],
        mindset_prompt: "Document your 5AM routine for 7 days and share your learnings.",
        content_ideas: [
          { title: "5AM Morning Routine", description: "Show your productive morning routine", format: "reel" },
          { title: "Transformation Story", description: "Before/after: how morning routines changed my life", format: "video" }
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
      description: "Build small habits with big impact",
      popularity_index: 89,
      category: "motivation",
      data_json: {
        quotes: [
          "You are not your goals — you are the sum of your systems.",
          "1% better every day = 37x better after one year."
        ],
        growth_tips: [
          "Start with a mini-habit: 1 push-up, 1 page of reading",
          "Stack habits: attach new habits to existing ones",
          "Make it visible: place your habit tracker somewhere prominent",
          "Reward yourself immediately after completion for a dopamine hit"
        ],
        mindset_prompt: "Which one mini-habit would transform your life in 6 months?",
        content_ideas: [
          { title: "Habit Stacking", description: "How to build new routines effortlessly", format: "carousel" },
          { title: "90-Day Challenge", description: "Document your transformation", format: "series" }
        ],
        hashtags: ["#AtomicHabits", "#PersonalGrowth", "#HabitBuilding", "#SelfImprovement"],
        audience_fit: "Self-improvement and growth-oriented people",
        estimated_virality: "very high"
      }
    },
    {
      platform: "instagram",
      trend_type: "motivation",
      name: "Deep Work Sessions",
      description: "Focused work without distractions for maximum productivity",
      popularity_index: 88,
      category: "motivation",
      data_json: {
        quotes: [
          "Deep work is the superpower of the 21st century.",
          "Multitasking is the enemy of mastery."
        ],
        growth_tips: [
          "Block 2-4 hours for deep work without interruptions",
          "Put your phone in another room, turn off all notifications",
          "Use Pomodoro: 90 min focus, 15 min break",
          "Track your deep work hours weekly"
        ],
        mindset_prompt: "What project would you work on for 1,000 hours if money were no object?",
        content_ideas: [
          { title: "Deep Work Routine", description: "How I structure my most productive hours", format: "reel" },
          { title: "Distraction-Free Setup", description: "My focused workspace", format: "carousel" }
        ],
        hashtags: ["#DeepWork", "#Productivity", "#FocusMode", "#CreatorLife"],
        audience_fit: "Knowledge workers and creators",
        estimated_virality: "high"
      }
    },
    {
      platform: "tiktok",
      trend_type: "motivation",
      name: "Failure Resume Trend",
      description: "Share your failures as learning moments",
      popularity_index: 90,
      category: "motivation",
      data_json: {
        quotes: [
          "Failure is not the opposite of success — it's part of it.",
          "Every 'no' brings you closer to 'yes'."
        ],
        growth_tips: [
          "Document your failures publicly for accountability",
          "Extract 3 learnings from every setback",
          "Share failed projects — it frees you and inspires others",
          "Celebrate the courage to try, not just the outcome"
        ],
        mindset_prompt: "Which failure taught you the most? Share your story.",
        content_ideas: [
          { title: "My Failure Resume", description: "10 projects that flopped and what I learned", format: "video" },
          { title: "Behind the Scenes", description: "What nobody knows about my success", format: "reel" }
        ],
        hashtags: ["#FailureResume", "#RealTalk", "#Entrepreneurship", "#GrowthMindset"],
        audience_fit: "Entrepreneurs and creators who value authenticity",
        estimated_virality: "very high"
      }
    }
  ];

  // ===== 6. BUSINESS & AI TOOLS (5+) =====
  const businessTrends = [
    {
      platform: "linkedin",
      trend_type: "tools",
      name: "Top AI Tools for Creators 2025",
      description: "The best AI tools for content creation and automation",
      popularity_index: 88,
      category: "business",
      data_json: {
        tools: [
          { name: "ChatGPT-4", function: "Content ideas, text generation, brainstorming", pricing: "Free / $20/month", ai_tip: "Save 1 hour daily on content planning" },
          { name: "Midjourney", function: "AI image generation for thumbnails & graphics", pricing: "$10-60/month", ai_tip: "Create unique visuals in minutes" },
          { name: "Descript", function: "Video editing via text editing", pricing: "Free / $24/month", ai_tip: "Edit videos 10x faster" },
          { name: "Notion AI", function: "Notes, docs, project management with AI", pricing: "$10/month", ai_tip: "Organize your content pipeline automatically" },
          { name: "Opus Clip", function: "Automatic short video generation", pricing: "$19/month", ai_tip: "Turn 1 long video into 10 shorts" }
        ],
        content_ideas: [
          { title: "Tool Comparison", description: "Compare 3 AI tools side by side", format: "video" },
          { title: "Workflow Tutorial", description: "Demonstrate your complete AI workflow", format: "tutorial" },
          { title: "ROI Analysis", description: "How much time & money you save with AI", format: "carousel" }
        ],
        hashtags: ["#AITools", "#Productivity", "#CreatorTech", "#ContentCreation"],
        audience_fit: "Tech-savvy creators and digital entrepreneurs",
        estimated_virality: "high"
      }
    },
    {
      platform: "twitter",
      trend_type: "tools",
      name: "No-Code Revolution 2025",
      description: "Build SaaS products without writing code",
      popularity_index: 90,
      category: "business",
      data_json: {
        tools: [
          { name: "Bubble", function: "Build complete web apps without code", pricing: "Free / $29+/month", ai_tip: "Validate MVPs in weeks instead of months" },
          { name: "Webflow", function: "Design professional websites visually", pricing: "Free / $14+/month", ai_tip: "Designer quality without a developer" },
          { name: "Zapier", function: "Automate workflows between 5000+ apps", pricing: "Free / $20+/month", ai_tip: "Save 10+ hours per week with automation" },
          { name: "Airtable", function: "Flexible database with interface builder", pricing: "Free / $20+/month", ai_tip: "CRM, project management, content hub in one" },
          { name: "Make (Integromat)", function: "Build complex automations visually", pricing: "Free / $9+/month", ai_tip: "Alternative to Zapier with more power" }
        ],
        content_ideas: [
          { title: "MVP in 30 Days", description: "How I built my SaaS without code", format: "video" },
          { title: "No-Code Stack", description: "My complete tech stack without developers", format: "thread" }
        ],
        hashtags: ["#NoCode", "#Entrepreneurship", "#BuildInPublic", "#SaaS"],
        audience_fit: "Non-technical founders and solopreneurs",
        estimated_virality: "very high"
      }
    },
    {
      platform: "linkedin",
      trend_type: "tools",
      name: "Social Media Analytics Tools",
      description: "Data-driven decisions for content strategy",
      popularity_index: 86,
      category: "business",
      data_json: {
        tools: [
          { name: "Later", function: "Social media scheduling + analytics", pricing: "Free / $18+/month", ai_tip: "Optimal posting times based on data" },
          { name: "Metricool", function: "All-in-one analytics for all platforms", pricing: "Free / $12+/month", ai_tip: "Compare performance cross-platform" },
          { name: "Brandwatch", function: "Social listening & trend analysis", pricing: "Custom pricing", ai_tip: "Spot trends before they go mainstream" }
        ],
        content_ideas: [
          { title: "Analytics Deep-Dive", description: "These metrics actually matter", format: "article" },
          { title: "Data-Driven Growth", description: "How I doubled my reach through data", format: "carousel" }
        ],
        hashtags: ["#SocialMediaAnalytics", "#DataDriven", "#ContentStrategy", "#MarketingTools"],
        audience_fit: "Social media managers and marketing teams",
        estimated_virality: "high"
      }
    },
    {
      platform: "instagram",
      trend_type: "tools",
      name: "Creator Monetization Platforms",
      description: "Turn your audience into sustainable income",
      popularity_index: 91,
      category: "business",
      data_json: {
        tools: [
          { name: "Patreon", function: "Membership platform for recurring revenue", pricing: "5-12% fee", ai_tip: "Build a loyal community with exclusive content" },
          { name: "Gumroad", function: "Sell digital products directly", pricing: "10% fee", ai_tip: "Perfect for e-books, templates, courses" },
          { name: "Stan Store", function: "Mobile-optimized online store for creators", pricing: "$29/month", ai_tip: "One-link store for Instagram bio" },
          { name: "Ko-fi", function: "Tips + shop with low fees", pricing: "Free / $6/month", ai_tip: "0% fee on tips" }
        ],
        content_ideas: [
          { title: "Monetization Strategy", description: "How I built 5 income streams", format: "reel" },
          { title: "Platform Comparison", description: "Patreon vs. Ko-fi — which is worth it?", format: "carousel" }
        ],
        hashtags: ["#CreatorEconomy", "#Monetization", "#PassiveIncome", "#DigitalProducts"],
        audience_fit: "Creators who want to diversify their income",
        estimated_virality: "very high"
      }
    },
    {
      platform: "youtube",
      trend_type: "tools",
      name: "Video Editing Tools 2025",
      description: "Create professional videos faster",
      popularity_index: 87,
      category: "business",
      data_json: {
        tools: [
          { name: "CapCut", function: "Free editor with pro features", pricing: "Free / $8/month", ai_tip: "AI auto-captions and templates" },
          { name: "DaVinci Resolve", function: "Hollywood-grade editor for free", pricing: "Free / $295 one-time", ai_tip: "Professional color grading tools" },
          { name: "Riverside.fm", function: "Remote interviews in studio quality", pricing: "$15+/month", ai_tip: "Separate audio tracks for each speaker" },
          { name: "Pictory", function: "AI creates videos from text/articles", pricing: "$23+/month", ai_tip: "Turn blog posts into videos in minutes" }
        ],
        content_ideas: [
          { title: "Editing Workflow", description: "How I edit videos 3x faster", format: "tutorial" },
          { title: "Free vs. Paid", description: "Are expensive video tools worth it?", format: "video" }
        ],
        hashtags: ["#VideoEditing", "#ContentCreation", "#YouTubeTips", "#VideoProduction"],
        audience_fit: "Video creators and YouTubers",
        estimated_virality: "high"
      }
    }
  ];

  // Helper to generate deterministic UUID from trend name
  const generateId = (name: string): string => {
    // Simple hash-based UUID generation for consistent IDs
    let hash = 0;
    const str = name.toLowerCase().trim();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex.slice(0,8)}-${hex.slice(0,4)}-4${hex.slice(1,4)}-8${hex.slice(0,3)}-${hex.padEnd(12, '0').slice(0,12)}`;
  };

  // Combine all trends
  return [
    ...socialMediaTrends,
    ...ecommerceProducts,
    ...healthTrends,
    ...financeTrends,
    ...motivationTrends,
    ...businessTrends
  ].map(trend => ({
    id: generateId(trend.name), // Generate stable ID based on trend name
    ...trend,
    language: "en",
    region: "global"
  }));
};

const FALLBACK_TRENDS = generateDynamicTrends();

// Category fallback keywords for image search
const categoryFallbackKeywords: Record<string, string> = {
  'social-media': 'social media content creator smartphone',
  'ecommerce': 'online shopping product lifestyle',
  'lifestyle': 'lifestyle wellness healthy living',
  'business': 'business office technology startup',
  'finance': 'finance investment money trading',
  'motivation': 'success motivation inspiration',
};

// Split CamelCase/PascalCase into separate words
function splitCamelCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

// Build an optimal Pexels search query from trend data
function buildSearchQuery(trend: any): string {
  // 1. Try description first — it's the most descriptive
  const description = trend.description || trend.data_json?.description || '';
  if (description.length > 10) {
    // Take first 6 meaningful words from description
    const descWords = description
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length > 2) // skip short words
      .slice(0, 6)
      .join(' ')
      .trim();
    if (descWords.length > 5) {
      console.log(`  Query from description: "${descWords}"`);
      return descWords;
    }
  }

  // 2. Fallback: clean and split the trend name
  const name = (trend.name || '')
    .replace(/#/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  const splitName = splitCamelCase(name);
  console.log(`  Query from name: "${splitName}"`);
  return splitName;
}

async function searchPexelsImage(query: string, fallbackCategory?: string): Promise<{ url: string; photographer: string } | null> {
  try {
    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    if (!pexelsApiKey) {
      console.log('No PEXELS_API_KEY configured');
      return null;
    }

    const cleanQuery = query.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (!cleanQuery) return null;
    
    // Request 5 results and pick best one
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(cleanQuery)}&per_page=5&page=1`,
      { headers: { 'Authorization': pexelsApiKey } }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.photos?.length > 0) {
        // Pick the photo with highest resolution (landscape preferred)
        const best = data.photos.reduce((a: any, b: any) => {
          const aScore = a.width * a.height;
          const bScore = b.width * b.height;
          return bScore > aScore ? b : a;
        });
        return { url: best.src.medium, photographer: best.photographer };
      }
    }

    // Fallback to category keywords
    if (fallbackCategory && categoryFallbackKeywords[fallbackCategory]) {
      const fbResponse = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(categoryFallbackKeywords[fallbackCategory])}&per_page=3&page=1`,
        { headers: { 'Authorization': pexelsApiKey } }
      );
      if (fbResponse.ok) {
        const fbData = await fbResponse.json();
        if (fbData.photos?.length > 0) {
          return { url: fbData.photos[0].src.medium, photographer: fbData.photos[0].photographer };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Pexels search error:', error);
    return null;
  }
}

async function enrichTrendsWithImages(trends: any[]): Promise<any[]> {
  const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
  if (!pexelsApiKey) {
    console.log('No PEXELS_API_KEY, skipping image enrichment');
    return trends;
  }

  console.log(`Enriching ${trends.length} trends with Pexels images...`);
  
  const batchSize = 10;
  const enriched = [...trends];
  
  for (let i = 0; i < enriched.length; i += batchSize) {
    const batch = enriched.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(trend => {
        const searchQuery = buildSearchQuery(trend);
        return searchPexelsImage(searchQuery, trend.category);
      })
    );
    
    results.forEach((result, j) => {
      const idx = i + j;
      if (result.status === 'fulfilled' && result.value) {
        enriched[idx] = {
          ...enriched[idx],
          data_json: {
            ...enriched[idx].data_json,
            image_url: result.value.url,
            image_photographer: result.value.photographer,
          }
        };
      }
    });
    
    if (i + batchSize < enriched.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  const withImages = enriched.filter(t => t.data_json?.image_url).length;
  console.log(`Enriched ${withImages}/${enriched.length} trends with images`);
  
  return enriched;
}

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

    // Check if we have any of the OLD subcategories that need to be replaced
    const oldSubcategories = ['fashion', 'kitchen', 'office', 'outdoor', 'kids'];
    
    // Query ALL trends to check for old subcategories AND German content
    const { data: allExistingTrends } = await supabase
      .from('trend_entries')
      .select('data_json, description, name')
      .limit(50);

    const hasOldSubcategories = allExistingTrends?.some((t: any) => 
      oldSubcategories.includes(t.data_json?.subcategory)
    );

    // Detect old German content that needs refresh
    const hasGermanContent = allExistingTrends?.some((t: any) => {
      const text = [t.description, t.data_json?.ai_tip, t.data_json?.hook, t.name].filter(Boolean).join(' ');
      return /\b(für|und|mit|Verwandle|Über-Nacht|Magnetischer|Kleiner|Produziere|Verwende|gewonnen|Follower gewonnen|Effizienz)\b/i.test(text);
    });

    const needsRefresh = hasOldSubcategories || hasGermanContent;
    console.log('Checking for refresh:', { hasOldSubcategories, hasGermanContent, needsRefresh });

    // If we have old subcategories or German content, refresh ALL trends
    if (needsRefresh) {
      console.log('Found old subcategories, refreshing ALL trends...');
      console.log('Inserting', FALLBACK_TRENDS.length, 'fallback trends...');
      
      try {
        // Delete ALL trends to ensure clean slate
        console.log('Deleting ALL trends...');
        const { error: deleteError } = await supabase
          .from('trend_entries')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)
        
        if (deleteError) {
          console.error('Error deleting old trends:', deleteError);
        } else {
          console.log('All old trends deleted');
        }

        // Insert all fallback trends
        console.log('Inserting', FALLBACK_TRENDS.length, 'new trends...');
        const { data: insertedData, error: insertError } = await supabase
          .from('trend_entries')
          .insert(FALLBACK_TRENDS)
          .select();
        
        if (insertError) {
          console.error('Error inserting trends:', insertError);
        } else {
          console.log('Successfully inserted', insertedData?.length || 0, 'trends');
        }
      } catch (error) {
        console.error('Error refreshing trends:', error);
      }
    }

    // Fetch ALL trends from database (no time filter - trends remain valid)
    const { data: existingTrends, error: fetchError } = await supabase
      .from('trend_entries')
      .select('*')
      .order('popularity_index', { ascending: false });

    if (fetchError) {
      console.error('Error fetching trends:', fetchError);
    }

    // Apply filters
    let filteredTrends = existingTrends || [];
    
    if (platform && platform !== 'all') {
      filteredTrends = filteredTrends.filter(t => t.platform === platform);
    }
    if (category && category !== 'all') {
      filteredTrends = filteredTrends.filter(t => t.category === category);
    }
    if (language !== 'en') {
      filteredTrends = filteredTrends.filter(t => t.language === language);
    }

    console.log('Returning', filteredTrends.length, 'filtered trends');
    
    // If no trends found after filtering, insert fallback trends to DB then return them
    if (filteredTrends.length === 0) {
      let fallbackFiltered = FALLBACK_TRENDS;
    
      if (platform && platform !== 'all') {
        fallbackFiltered = fallbackFiltered.filter(t => t.platform === platform);
      }
      if (category && category !== 'all') {
        fallbackFiltered = fallbackFiltered.filter(t => t.category === category);
      }
      if (language !== 'en') {
        fallbackFiltered = fallbackFiltered.filter(t => t.language === language);
      }

      // Upsert fallback trends to database so their IDs are valid for bookmarking
      if (fallbackFiltered.length > 0) {
        const { error: upsertError } = await supabase
          .from('trend_entries')
          .upsert(fallbackFiltered.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            category: t.category,
            platform: t.platform,
            popularity_index: t.popularity_index,
            language: t.language || 'en',
            region: t.region || 'global'
          })), { onConflict: 'id' });
        
        if (upsertError) {
          console.error('Error upserting fallback trends:', upsertError);
        } else {
          console.log('Upserted', fallbackFiltered.length, 'fallback trends to database');
        }
      }

      console.log('Returning fallback:', fallbackFiltered.length, 'filtered trends');
      const enrichedFallback = await enrichTrendsWithImages(fallbackFiltered);
      return new Response(JSON.stringify({ trends: enrichedFallback }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enrich trends with Pexels images
    const enrichedTrends = await enrichTrendsWithImages(filteredTrends);

    // Return enriched trends
    return new Response(JSON.stringify({ trends: enrichedTrends }), {
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
