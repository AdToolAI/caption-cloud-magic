-- Insert 5 standard campaign templates

-- Template 1: Product Launch
INSERT INTO public.calendar_campaign_templates (
  name,
  description,
  template_type,
  duration_days,
  events_json,
  is_public,
  workspace_id,
  created_by
) VALUES (
  'Product Launch',
  '7-tägige Produkt-Launch-Kampagne mit Teaser, Features und Launch-Announcement',
  'product_launch',
  7,
  '[
    {
      "day": 0,
      "title": "Teaser Post - Etwas Großes kommt",
      "brief": "Mysteriöser Teaser-Post um Spannung aufzubauen. Nutze visuelle Hinweise ohne zu viel zu verraten.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#ComingSoon", "#NewProduct", "#StayTuned"],
      "eta_minutes": 45
    },
    {
      "day": 1,
      "title": "Feature Highlight #1",
      "brief": "Stelle das erste Haupt-Feature des Produkts vor. Fokus auf den Customer-Benefit.",
      "channels": ["linkedin", "instagram"],
      "hashtags": ["#ProductFeature", "#Innovation"],
      "eta_minutes": 60
    },
    {
      "day": 2,
      "title": "Behind-the-Scenes",
      "brief": "Zeige die Entstehungsgeschichte des Produkts. Authentisch und nahbar.",
      "channels": ["tiktok", "instagram"],
      "hashtags": ["#BehindTheScenes", "#ProductDevelopment"],
      "eta_minutes": 50
    },
    {
      "day": 4,
      "title": "Customer Testimonial Preview",
      "brief": "Teile erste Reaktionen von Beta-Testern oder Early Adopters.",
      "channels": ["facebook", "linkedin"],
      "hashtags": ["#CustomerLove", "#Testimonial"],
      "eta_minutes": 40
    },
    {
      "day": 6,
      "title": "🚀 Launch Day Announcement",
      "brief": "Der große Moment! Verkünde den offiziellen Launch mit Link und allen wichtigen Infos.",
      "channels": ["instagram", "facebook", "linkedin", "tiktok"],
      "hashtags": ["#LaunchDay", "#NewProduct", "#Available"],
      "eta_minutes": 90
    }
  ]'::jsonb,
  true,
  NULL,
  NULL
);

-- Template 2: Sale Campaign
INSERT INTO public.calendar_campaign_templates (
  name,
  description,
  template_type,
  duration_days,
  events_json,
  is_public,
  workspace_id,
  created_by
) VALUES (
  'Sale Campaign',
  '14-tägige Sale-Kampagne mit Ankündigung, Highlights und Last-Chance Reminders',
  'social_sale',
  14,
  '[
    {
      "day": 0,
      "title": "🎉 Sale Ankündigung",
      "brief": "Kündige den kommenden Sale an. Teile das Start-Datum und erste Highlights.",
      "channels": ["instagram", "facebook", "linkedin"],
      "hashtags": ["#Sale", "#SpecialOffer", "#SaveTheDate"],
      "eta_minutes": 45
    },
    {
      "day": 2,
      "title": "Early-Bird Special",
      "brief": "Exklusives Angebot für die ersten Kunden. Schaffe Dringlichkeit.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#EarlyBird", "#LimitedOffer"],
      "eta_minutes": 50
    },
    {
      "day": 4,
      "title": "Produkt-Spotlight #1",
      "brief": "Stelle das erste Top-Angebot im Detail vor. Zeige den Rabatt deutlich.",
      "channels": ["instagram", "linkedin"],
      "hashtags": ["#DealOfTheDay", "#BestPrice"],
      "eta_minutes": 60
    },
    {
      "day": 6,
      "title": "⏰ Countdown - 7 Tage verbleibend",
      "brief": "Erinnere an die verbleibende Zeit. Nutze Countdown-Sticker in Stories.",
      "channels": ["instagram", "tiktok"],
      "hashtags": ["#Countdown", "#DontMissOut"],
      "eta_minutes": 35
    },
    {
      "day": 8,
      "title": "Produkt-Spotlight #2",
      "brief": "Zweites Top-Angebot in den Fokus rücken. Customer Reviews einbinden.",
      "channels": ["facebook", "linkedin"],
      "hashtags": ["#BestDeal", "#CustomerFavorite"],
      "eta_minutes": 55
    },
    {
      "day": 10,
      "title": "⚠️ Last Chance Reminder",
      "brief": "Nur noch wenige Tage! Schaffe Urgency ohne zu pushy zu wirken.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#LastChance", "#FinalDays"],
      "eta_minutes": 40
    },
    {
      "day": 12,
      "title": "🔥 Final Hours - Sale endet bald",
      "brief": "Letzte Stunden des Sales. Klare Call-to-Action mit Link.",
      "channels": ["instagram", "facebook", "linkedin"],
      "hashtags": ["#FinalHours", "#LastCall"],
      "eta_minutes": 50
    },
    {
      "day": 13,
      "title": "💙 Thank You Post",
      "brief": "Bedanke dich bei allen Teilnehmern. Teile Erfolgsmomente oder Statistiken.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#ThankYou", "#Grateful"],
      "eta_minutes": 35
    }
  ]'::jsonb,
  true,
  NULL,
  NULL
);

-- Template 3: Seasonal Campaign
INSERT INTO public.calendar_campaign_templates (
  name,
  description,
  template_type,
  duration_days,
  events_json,
  is_public,
  workspace_id,
  created_by
) VALUES (
  'Seasonal Campaign',
  '30-tägige Saison-Kampagne mit wöchentlichen Themen-Posts für Frühling, Sommer, Herbst oder Winter',
  'seasonal',
  30,
  '[
    {
      "day": 0,
      "title": "🌸 Saison-Start Ankündigung",
      "brief": "Begrüße die neue Saison. Teile deine saisonalen Highlights und Pläne.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#NewSeason", "#SeasonalVibes"],
      "eta_minutes": 50
    },
    {
      "day": 3,
      "title": "Saison-Tipp #1",
      "brief": "Teile praktische Tipps passend zur Jahreszeit.",
      "channels": ["instagram", "linkedin"],
      "hashtags": ["#SeasonalTips", "#LifeHacks"],
      "eta_minutes": 45
    },
    {
      "day": 6,
      "title": "Produkt-Feature: Saison-Special",
      "brief": "Stelle saisonale Produkte oder Services vor.",
      "channels": ["facebook", "instagram"],
      "hashtags": ["#SeasonalProducts", "#MustHave"],
      "eta_minutes": 60
    },
    {
      "day": 9,
      "title": "Community Post - Deine Saison-Momente",
      "brief": "Fordere Follower auf, ihre Saison-Erlebnisse zu teilen. User-Generated Content.",
      "channels": ["instagram", "tiktok"],
      "hashtags": ["#Community", "#ShareYourStory"],
      "eta_minutes": 40
    },
    {
      "day": 12,
      "title": "Saison-Rezept oder DIY",
      "brief": "Teile ein saisonales Rezept, DIY-Projekt oder Tutorial.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#DIY", "#Recipe", "#Tutorial"],
      "eta_minutes": 70
    },
    {
      "day": 15,
      "title": "Mid-Season Check-In",
      "brief": "Halbzeit! Teile Highlights der letzten 2 Wochen.",
      "channels": ["instagram", "linkedin"],
      "hashtags": ["#MidSeason", "#Recap"],
      "eta_minutes": 45
    },
    {
      "day": 18,
      "title": "Saison-Tipp #2",
      "brief": "Weiterer hilfreicher Tipp für die Jahreszeit.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#SeasonalAdvice", "#ProTip"],
      "eta_minutes": 45
    },
    {
      "day": 21,
      "title": "Behind-the-Scenes: Saison-Vorbereitung",
      "brief": "Zeige wie du/dein Team sich auf diese Saison vorbereitet hat.",
      "channels": ["instagram", "tiktok"],
      "hashtags": ["#BTS", "#Preparation"],
      "eta_minutes": 50
    },
    {
      "day": 24,
      "title": "Saison-Inspiration",
      "brief": "Inspirierender Content passend zur Jahreszeit. Zitate, Bilder, Geschichten.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#Inspiration", "#Motivation"],
      "eta_minutes": 40
    },
    {
      "day": 27,
      "title": "Countdown: Saison-Ende naht",
      "brief": "Erinnere daran, dass die Saison bald endet. Letzte Chancen nutzen.",
      "channels": ["instagram", "linkedin"],
      "hashtags": ["#LastDays", "#SeasonEnding"],
      "eta_minutes": 45
    },
    {
      "day": 29,
      "title": "🎊 Saison-Abschluss & Danke",
      "brief": "Verabschiede die Saison. Teile Highlights und bedanke dich bei der Community.",
      "channels": ["instagram", "facebook", "linkedin"],
      "hashtags": ["#ThankYou", "#SeasonRecap"],
      "eta_minutes": 55
    },
    {
      "day": 30,
      "title": "Vorschau: Was kommt als nächstes?",
      "brief": "Teaser für die kommende Saison oder nächste Kampagne.",
      "channels": ["instagram", "facebook"],
      "hashtags": ["#ComingSoon", "#NextSeason"],
      "eta_minutes": 40
    }
  ]'::jsonb,
  true,
  NULL,
  NULL
);

-- Template 4: Educational Series
INSERT INTO public.calendar_campaign_templates (
  name,
  description,
  template_type,
  duration_days,
  events_json,
  is_public,
  workspace_id,
  created_by
) VALUES (
  'Educational Series',
  '21-tägige Bildungs-Serie mit wöchentlichen Tipps, How-Tos und Expert-Insights',
  'educational',
  21,
  '[
    {
      "day": 0,
      "title": "📚 Serie-Start: Was du lernen wirst",
      "brief": "Kündige die Educational Series an. Überblick über kommende Themen.",
      "channels": ["linkedin", "instagram"],
      "hashtags": ["#Education", "#LearningJourney", "#NewSeries"],
      "eta_minutes": 50
    },
    {
      "day": 2,
      "title": "Tipp #1: Grundlagen",
      "brief": "Erkläre ein fundamentales Konzept. Einfach und verständlich.",
      "channels": ["instagram", "linkedin"],
      "hashtags": ["#Basics", "#LearnTheBasics"],
      "eta_minutes": 60
    },
    {
      "day": 5,
      "title": "How-To: Step-by-Step Guide",
      "brief": "Detaillierter Guide für ein spezifisches Problem. Actionable Steps.",
      "channels": ["linkedin", "facebook"],
      "hashtags": ["#HowTo", "#StepByStep", "#Tutorial"],
      "eta_minutes": 80
    },
    {
      "day": 7,
      "title": "💡 Pro-Tipp vom Experten",
      "brief": "Teile einen fortgeschrittenen Tipp oder Insider-Wissen.",
      "channels": ["linkedin", "instagram"],
      "hashtags": ["#ProTip", "#ExpertAdvice"],
      "eta_minutes": 55
    },
    {
      "day": 10,
      "title": "Häufige Fehler vermeiden",
      "brief": "Liste Common Mistakes auf und wie man sie verhindert.",
      "channels": ["linkedin", "facebook"],
      "hashtags": ["#CommonMistakes", "#LearnFromMistakes"],
      "eta_minutes": 65
    },
    {
      "day": 14,
      "title": "Q&A Session - Eure Fragen",
      "brief": "Beantworte häufig gestellte Fragen aus der Community.",
      "channels": ["instagram", "linkedin"],
      "hashtags": ["#QA", "#AskMeAnything"],
      "eta_minutes": 70
    },
    {
      "day": 17,
      "title": "Case Study: Real-World Example",
      "brief": "Zeige ein praktisches Beispiel oder Success Story.",
      "channels": ["linkedin", "facebook"],
      "hashtags": ["#CaseStudy", "#RealWorld", "#Success"],
      "eta_minutes": 75
    },
    {
      "day": 20,
      "title": "🎓 Zusammenfassung & Next Steps",
      "brief": "Fasse die wichtigsten Learnings zusammen. Gib weitere Ressourcen.",
      "channels": ["linkedin", "instagram", "facebook"],
      "hashtags": ["#Recap", "#KeyTakeaways", "#KeepLearning"],
      "eta_minutes": 60
    }
  ]'::jsonb,
  true,
  NULL,
  NULL
);

-- Template 5: Event Promotion
INSERT INTO public.calendar_campaign_templates (
  name,
  description,
  template_type,
  duration_days,
  events_json,
  is_public,
  workspace_id,
  created_by
) VALUES (
  'Event Promotion',
  '10-tägige Event-Promotion mit Save-the-Date, Speaker-Vorstellung und Live-Reminder',
  'event',
  10,
  '[
    {
      "day": 0,
      "title": "📅 Save the Date!",
      "brief": "Erste Ankündigung des Events. Datum, Ort (online/offline) und Hauptthema.",
      "channels": ["linkedin", "instagram", "facebook"],
      "hashtags": ["#SaveTheDate", "#Event", "#UpcomingEvent"],
      "eta_minutes": 50
    },
    {
      "day": 2,
      "title": "🎤 Speaker Spotlight #1",
      "brief": "Stelle den ersten Speaker oder Hauptgast vor. Bio und Expertise.",
      "channels": ["linkedin", "instagram"],
      "hashtags": ["#Speaker", "#Expert", "#GuestSpeaker"],
      "eta_minutes": 55
    },
    {
      "day": 4,
      "title": "📋 Event-Agenda Preview",
      "brief": "Teile einen ersten Blick auf die Agenda. Highlights der Sessions.",
      "channels": ["linkedin", "facebook"],
      "hashtags": ["#EventAgenda", "#Program", "#Schedule"],
      "eta_minutes": 60
    },
    {
      "day": 6,
      "title": "🎤 Speaker Spotlight #2",
      "brief": "Zweiter Speaker-Highlight. Zeige die Vielfalt der Experten.",
      "channels": ["linkedin", "instagram"],
      "hashtags": ["#Speaker", "#ExpertPanel"],
      "eta_minutes": 55
    },
    {
      "day": 8,
      "title": "⏰ Countdown: Noch 2 Tage!",
      "brief": "Countdown-Post mit letzten Infos. Registrierungs-Link prominent platzieren.",
      "channels": ["instagram", "linkedin", "facebook"],
      "hashtags": ["#Countdown", "#DontMiss", "#LastChance"],
      "eta_minutes": 45
    },
    {
      "day": 9,
      "title": "🚨 Tomorrow is the Day!",
      "brief": "24h Reminder. Alle wichtigen Links und Infos zum Ablauf.",
      "channels": ["instagram", "linkedin", "facebook"],
      "hashtags": ["#Tomorrow", "#GetReady", "#EventDay"],
      "eta_minutes": 40
    },
    {
      "day": 10,
      "title": "🔴 LIVE NOW / Starting Soon",
      "brief": "Go-Live Ankündigung. Direkt-Link zum Event oder Stream.",
      "channels": ["instagram", "linkedin", "facebook", "tiktok"],
      "hashtags": ["#LiveNow", "#JoinUs", "#EventDay"],
      "eta_minutes": 35
    },
    {
      "day": 10,
      "title": "🎉 Event-Recap & Thank You",
      "brief": "Post-Event Recap. Highlights, Danksagung, und Link zur Aufzeichnung falls vorhanden.",
      "channels": ["linkedin", "instagram", "facebook"],
      "hashtags": ["#EventRecap", "#ThankYou", "#Highlights"],
      "eta_minutes": 65
    }
  ]'::jsonb,
  true,
  NULL,
  NULL
);