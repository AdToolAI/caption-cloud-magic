import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ═══════════════════════════════════════════════════════════════
// MULTILINGUAL SUPPORT (DE, EN, ES)
// ═══════════════════════════════════════════════════════════════

type Lang = 'de' | 'en' | 'es';

const CATEGORY_PHASES_BLOCK1: Record<Lang, Record<string, string[]>> = {
  de: {
    'advertisement': [
      'Welches PRODUKT oder welche DIENSTLEISTUNG möchtest du bewerben? (Name, Branche, kurze Beschreibung)',
      'Wer ist deine ZIELGRUPPE? (Alter, Beruf, Branche, Interessen, Schmerzpunkte)',
      'Was ist dein USP — was unterscheidet dich von der Konkurrenz?',
      'Welches ZIEL hat die Werbung? (Mehr Verkäufe, Leads, Brand Awareness, App-Downloads)',
    ],
    'storytelling': [
      'Möchtest du, dass die KI eine Geschichte für dich ERFINDET, oder hast du bereits eine WAHRE GESCHICHTE die wir filmisch aufbereiten sollen?',
      'PLACEHOLDER_STORYTELLING_P2',
      'PLACEHOLDER_STORYTELLING_P3',
      'PLACEHOLDER_STORYTELLING_P4',
    ],
    'tutorial': [
      'Was genau möchtest du deinen Zuschauern BEIBRINGEN? (Konkretes Thema oder Fähigkeit)',
      'Für wen ist das Tutorial? (Anfänger, Fortgeschrittene, Experten — beschreibe dein Publikum)',
      'Was können Zuschauer NACH dem Tutorial, was sie vorher nicht konnten?',
      'Welche TOOLS oder MATERIALIEN werden benötigt, um mitzumachen?',
    ],
    'product-video': [
      'Welches PRODUKT stellst du vor? (Name, Kategorie, kurze Beschreibung)',
      'Welches PROBLEM löst dein Produkt für den Kunden?',
      'Was sind die Top 3 FEATURES oder Vorteile deines Produkts?',
      'Wer kauft dein Produkt? (Zielgruppe, Alter, Kaufmotivation)',
    ],
    'corporate': [
      'Was ist der HAUPTZWECK des Unternehmensfilms? (Recruiting, Imagefilm, Investoren-Pitch, Employer Branding)',
      'Erzähl mir von deinem UNTERNEHMEN — Name, Branche, Gründungsjahr, was ihr macht',
      'Was ist eure MISSION und VISION? Warum existiert euer Unternehmen?',
      'Was macht eure UNTERNEHMENSKULTUR besonders? Was sollen Zuschauer über euch erfahren?',
    ],
    'social-content': [
      'Für welche PLATTFORM ist der Content? (TikTok, Instagram Reels, YouTube Shorts, mehrere)',
      'Welche ART von Content willst du erstellen? (Trend, Educational, Entertainment, Behind-the-Scenes)',
      'Wer ist deine COMMUNITY? Beschreibe deine Follower und deren Interessen',
      'Was soll der SCROLL-STOPPER sein? Was fesselt in den ersten 2 Sekunden?',
    ],
    'testimonial': [
      'WER gibt das Testimonial? (Name, Position, Unternehmen, Beziehung zu dir)',
      'Welches PROBLEM hatte die Person BEVOR sie dein Produkt/Service genutzt hat?',
      'Was ist das KONKRETE ERGEBNIS nach der Nutzung? (Zahlen, Zeitersparnis, Transformation)',
      'Welche EMOTIONALE Veränderung hat die Person erlebt?',
    ],
    'explainer': [
      'Was genau soll ERKLÄRT werden? (Produkt, Prozess, Konzept, Service)',
      'Wie KOMPLEX ist das Thema für deine Zielgruppe? (Einfach, mittel, sehr komplex)',
      'Welches PROBLEM löst deine Erklärung? Was verstehen die Leute aktuell nicht?',
      'Wer ist die ZIELGRUPPE des Erklärvideos? (Kunden, Mitarbeiter, Partner, Investoren)',
    ],
    'event': [
      'Was für ein EVENT ist es? (Konferenz, Launch, Feier, Messe, Workshop)',
      'Was ist der ZWECK des Videos? (Recap, Teaser fürs nächste Mal, Dokumentation, Promotion)',
      'Was sind die HIGHLIGHTS die unbedingt gezeigt werden müssen?',
      'Welche ATMOSPHÄRE soll das Video transportieren? (Energie, Professionalität, Party, Inspiration)',
    ],
    'promo': [
      'Was wird BEWORBEN? (Produkt-Launch, Sale, Event, neues Feature, Ankündigung)',
      'Was ist das EINE Hauptversprechen in einem Satz?',
      'Gibt es eine DEADLINE oder ein LAUNCH-DATUM?',
      'Welche EMOTION soll geweckt werden? (FOMO, Vorfreude, Neugier, Aufregung)',
    ],
    'presentation': [
      'Was ist das THEMA und der TITEL deiner Präsentation?',
      'Wer ist das PUBLIKUM? (Investoren, Kunden, Konferenz, internes Team)',
      'Was ist deine KERNTHESE — die eine Hauptaussage die ankommen muss?',
      'Was soll das Publikum nach der Präsentation TUN? (Investieren, kaufen, verstehen, handeln)',
    ],
    'custom': [
      'Beschreibe deine VIDEO-IDEE in 2-3 Sätzen — was schwebt dir vor?',
      'Welches ZIEL soll das Video erreichen? Was ist der gewünschte Effekt?',
      'Wer ist die ZIELGRUPPE für dieses Video?',
      'Gibt es REFERENZEN oder Inspirationen? Welcher Stil gefällt dir?',
    ],
  },
  en: {
    'advertisement': [
      'What PRODUCT or SERVICE do you want to advertise? (Name, industry, brief description)',
      'Who is your TARGET AUDIENCE? (Age, profession, industry, interests, pain points)',
      'What is your USP — what sets you apart from competitors?',
      'What is the GOAL of the ad? (More sales, leads, brand awareness, app downloads)',
    ],
    'storytelling': [
      'Do you want the AI to INVENT a story for you, or do you already have a TRUE STORY that we should develop for film?',
      'PLACEHOLDER_STORYTELLING_P2',
      'PLACEHOLDER_STORYTELLING_P3',
      'PLACEHOLDER_STORYTELLING_P4',
    ],
    'tutorial': [
      'What exactly do you want to TEACH your viewers? (Specific topic or skill)',
      'Who is the tutorial for? (Beginners, intermediate, experts — describe your audience)',
      'What can viewers DO after the tutorial that they couldn\'t before?',
      'What TOOLS or MATERIALS are needed to follow along?',
    ],
    'product-video': [
      'Which PRODUCT are you presenting? (Name, category, brief description)',
      'What PROBLEM does your product solve for the customer?',
      'What are the top 3 FEATURES or benefits of your product?',
      'Who buys your product? (Target audience, age, buying motivation)',
    ],
    'corporate': [
      'What is the MAIN PURPOSE of the corporate film? (Recruiting, image film, investor pitch, employer branding)',
      'Tell me about your COMPANY — name, industry, founding year, what you do',
      'What is your MISSION and VISION? Why does your company exist?',
      'What makes your COMPANY CULTURE special? What should viewers learn about you?',
    ],
    'social-content': [
      'Which PLATFORM is the content for? (TikTok, Instagram Reels, YouTube Shorts, multiple)',
      'What TYPE of content do you want to create? (Trend, Educational, Entertainment, Behind-the-Scenes)',
      'Who is your COMMUNITY? Describe your followers and their interests',
      'What should the SCROLL STOPPER be? What grabs attention in the first 2 seconds?',
    ],
    'testimonial': [
      'WHO gives the testimonial? (Name, position, company, relationship to you)',
      'What PROBLEM did the person have BEFORE using your product/service?',
      'What is the CONCRETE RESULT after using it? (Numbers, time savings, transformation)',
      'What EMOTIONAL change did the person experience?',
    ],
    'explainer': [
      'What exactly should be EXPLAINED? (Product, process, concept, service)',
      'How COMPLEX is the topic for your target audience? (Simple, medium, very complex)',
      'What PROBLEM does your explanation solve? What don\'t people currently understand?',
      'Who is the TARGET AUDIENCE for the explainer video? (Customers, employees, partners, investors)',
    ],
    'event': [
      'What type of EVENT is it? (Conference, launch, celebration, trade show, workshop)',
      'What is the PURPOSE of the video? (Recap, teaser for next time, documentation, promotion)',
      'What are the HIGHLIGHTS that absolutely must be shown?',
      'What ATMOSPHERE should the video convey? (Energy, professionalism, party, inspiration)',
    ],
    'promo': [
      'What is being PROMOTED? (Product launch, sale, event, new feature, announcement)',
      'What is the ONE main promise in one sentence?',
      'Is there a DEADLINE or LAUNCH DATE?',
      'What EMOTION should be evoked? (FOMO, anticipation, curiosity, excitement)',
    ],
    'presentation': [
      'What is the TOPIC and TITLE of your presentation?',
      'Who is the AUDIENCE? (Investors, clients, conference, internal team)',
      'What is your CORE THESIS — the one main message that must land?',
      'What should the audience DO after the presentation? (Invest, buy, understand, act)',
    ],
    'custom': [
      'Describe your VIDEO IDEA in 2-3 sentences — what do you have in mind?',
      'What GOAL should the video achieve? What is the desired effect?',
      'Who is the TARGET AUDIENCE for this video?',
      'Are there REFERENCES or inspirations? What style do you like?',
    ],
  },
  es: {
    'advertisement': [
      '¿Qué PRODUCTO o SERVICIO quieres anunciar? (Nombre, industria, breve descripción)',
      '¿Quién es tu PÚBLICO OBJETIVO? (Edad, profesión, industria, intereses, puntos de dolor)',
      '¿Cuál es tu USP — qué te diferencia de la competencia?',
      '¿Cuál es el OBJETIVO del anuncio? (Más ventas, leads, brand awareness, descargas)',
    ],
    'storytelling': [
      '¿Quieres que la IA INVENTE una historia para ti, o ya tienes una HISTORIA REAL que debamos desarrollar para video?',
      'PLACEHOLDER_STORYTELLING_P2',
      'PLACEHOLDER_STORYTELLING_P3',
      'PLACEHOLDER_STORYTELLING_P4',
    ],
    'tutorial': [
      '¿Qué exactamente quieres ENSEÑAR a tus espectadores? (Tema o habilidad concreta)',
      '¿Para quién es el tutorial? (Principiantes, intermedios, expertos — describe tu audiencia)',
      '¿Qué podrán HACER los espectadores después del tutorial que no podían antes?',
      '¿Qué HERRAMIENTAS o MATERIALES se necesitan para seguirlo?',
    ],
    'product-video': [
      '¿Qué PRODUCTO presentas? (Nombre, categoría, breve descripción)',
      '¿Qué PROBLEMA resuelve tu producto para el cliente?',
      '¿Cuáles son los 3 principales FEATURES o beneficios de tu producto?',
      '¿Quién compra tu producto? (Público objetivo, edad, motivación de compra)',
    ],
    'corporate': [
      '¿Cuál es el PROPÓSITO PRINCIPAL del video corporativo? (Reclutamiento, imagen, pitch para inversores, employer branding)',
      'Cuéntame sobre tu EMPRESA — nombre, industria, año de fundación, qué hacen',
      '¿Cuál es su MISIÓN y VISIÓN? ¿Por qué existe su empresa?',
      '¿Qué hace especial su CULTURA EMPRESARIAL? ¿Qué deben aprender los espectadores sobre ustedes?',
    ],
    'social-content': [
      '¿Para qué PLATAFORMA es el contenido? (TikTok, Instagram Reels, YouTube Shorts, varias)',
      '¿Qué TIPO de contenido quieres crear? (Tendencia, Educativo, Entretenimiento, Behind-the-Scenes)',
      '¿Quién es tu COMUNIDAD? Describe a tus seguidores y sus intereses',
      '¿Qué debe ser el SCROLL STOPPER? ¿Qué captura atención en los primeros 2 segundos?',
    ],
    'testimonial': [
      '¿QUIÉN da el testimonio? (Nombre, cargo, empresa, relación contigo)',
      '¿Qué PROBLEMA tenía la persona ANTES de usar tu producto/servicio?',
      '¿Cuál es el RESULTADO CONCRETO después de usarlo? (Números, ahorro de tiempo, transformación)',
      '¿Qué cambio EMOCIONAL experimentó la persona?',
    ],
    'explainer': [
      '¿Qué exactamente debe EXPLICARSE? (Producto, proceso, concepto, servicio)',
      '¿Qué tan COMPLEJO es el tema para tu público? (Simple, medio, muy complejo)',
      '¿Qué PROBLEMA resuelve tu explicación? ¿Qué no entiende la gente actualmente?',
      '¿Quién es el PÚBLICO OBJETIVO del video explicativo? (Clientes, empleados, socios, inversores)',
    ],
    'event': [
      '¿Qué tipo de EVENTO es? (Conferencia, lanzamiento, celebración, feria, taller)',
      '¿Cuál es el PROPÓSITO del video? (Recap, teaser para la próxima vez, documentación, promoción)',
      '¿Cuáles son los HIGHLIGHTS que absolutamente deben mostrarse?',
      '¿Qué ATMÓSFERA debe transmitir el video? (Energía, profesionalismo, fiesta, inspiración)',
    ],
    'promo': [
      '¿Qué se PROMOCIONA? (Lanzamiento de producto, sale, evento, nueva función, anuncio)',
      '¿Cuál es la UNA promesa principal en una frase?',
      '¿Hay una FECHA LÍMITE o de LANZAMIENTO?',
      '¿Qué EMOCIÓN debe evocarse? (FOMO, anticipación, curiosidad, emoción)',
    ],
    'presentation': [
      '¿Cuál es el TEMA y TÍTULO de tu presentación?',
      '¿Quién es el PÚBLICO? (Inversores, clientes, conferencia, equipo interno)',
      '¿Cuál es tu TESIS CENTRAL — el mensaje principal que debe llegar?',
      '¿Qué debe HACER el público después de la presentación? (Invertir, comprar, entender, actuar)',
    ],
    'custom': [
      'Describe tu IDEA DE VIDEO en 2-3 frases — ¿qué tienes en mente?',
      '¿Qué OBJETIVO debe lograr el video? ¿Cuál es el efecto deseado?',
      '¿Quién es el PÚBLICO OBJETIVO de este video?',
      '¿Hay REFERENCIAS o inspiraciones? ¿Qué estilo te gusta?',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// STORYTELLING SUB-MODE DETECTION & DYNAMIC PHASES
// ═══════════════════════════════════════════════════════════════

type StorytellingSubMode = 'invented' | 'true_story' | 'unknown';

function detectStorytellingSubMode(messages: any[]): StorytellingSubMode {
  const allText = messages.map((m: any) => (m.content || '').toLowerCase()).join(' ');
  
  const inventKeywords = ['erfind', 'invent', 'inventa', 'ki erfindet', 'ai invents', 'ia inventa', 'fiktiv', 'fiction', 'ficti', 'ausdenken', 'kreiere', 'fantasie', 'fantasy'];
  const trueKeywords = ['wahr', 'true story', 'real', 'historia real', 'verdadera', 'echt', 'tatsächlich', 'wirklich passiert', 'erlebt', 'experienced', 'happened', 'autobio', 'persönlich', 'personal'];
  
  const hasInvent = inventKeywords.some(k => allText.includes(k));
  const hasTrue = trueKeywords.some(k => allText.includes(k));
  
  if (hasInvent && !hasTrue) return 'invented';
  if (hasTrue && !hasInvent) return 'true_story';
  if (hasInvent && hasTrue) {
    // Check last user message for most recent choice
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUser) {
      const lastText = lastUser.content.toLowerCase();
      if (inventKeywords.some(k => lastText.includes(k))) return 'invented';
      if (trueKeywords.some(k => lastText.includes(k))) return 'true_story';
    }
  }
  return 'unknown';
}

const STORYTELLING_INVENTED_BLOCK1: Record<Lang, string[]> = {
  de: [
    'Möchtest du, dass die KI eine Geschichte für dich ERFINDET, oder hast du bereits eine WAHRE GESCHICHTE die wir filmisch aufbereiten sollen?',
    'Welches GENRE soll die fiktive Story haben? (Sci-Fi, Drama, Comedy, Thriller, Abenteuer, Romantik, Fantasy)',
    'Welche ZIELGRUPPE soll die Geschichte ansprechen? (Alter, Interessen, Branche)',
    'Welche GRUNDSTIMMUNG und EMOTION soll die Story transportieren? (Hoffnung, Spannung, Nostalgie, Humor, Gänsehaut)',
  ],
  en: [
    'Do you want the AI to INVENT a story for you, or do you already have a TRUE STORY that we should develop for film?',
    'What GENRE should the fictional story have? (Sci-Fi, Drama, Comedy, Thriller, Adventure, Romance, Fantasy)',
    'What TARGET AUDIENCE should the story appeal to? (Age, interests, industry)',
    'What MOOD and EMOTION should the story convey? (Hope, suspense, nostalgia, humor, goosebumps)',
  ],
  es: [
    '¿Quieres que la IA INVENTE una historia para ti, o ya tienes una HISTORIA REAL que debamos desarrollar para video?',
    '¿Qué GÉNERO debe tener la historia ficticia? (Sci-Fi, Drama, Comedia, Thriller, Aventura, Romance, Fantasía)',
    '¿A qué PÚBLICO OBJETIVO debe atraer la historia? (Edad, intereses, industria)',
    '¿Qué AMBIENTE y EMOCIÓN debe transmitir la historia? (Esperanza, suspense, nostalgia, humor, escalofríos)',
  ],
};

const STORYTELLING_TRUE_BLOCK1: Record<Lang, string[]> = {
  de: [
    'Möchtest du, dass die KI eine Geschichte für dich ERFINDET, oder hast du bereits eine WAHRE GESCHICHTE die wir filmisch aufbereiten sollen?',
    'Erzähl mir KURZ: Was ist passiert? Was ist der Kern deiner wahren Geschichte?',
    'WER sind die HAUPTPERSONEN in deiner Geschichte? (Name, Rolle, Beziehung)',
    'Was war der WENDEPUNKT oder der emotionalste Moment in der Geschichte?',
  ],
  en: [
    'Do you want the AI to INVENT a story for you, or do you already have a TRUE STORY that we should develop for film?',
    'Tell me BRIEFLY: What happened? What is the core of your true story?',
    'WHO are the MAIN CHARACTERS in your story? (Name, role, relationship)',
    'What was the TURNING POINT or most emotional moment in the story?',
  ],
  es: [
    '¿Quieres que la IA INVENTE una historia para ti, o ya tienes una HISTORIA REAL que debamos desarrollar para video?',
    'Cuéntame BREVEMENTE: ¿Qué pasó? ¿Cuál es la esencia de tu historia real?',
    '¿QUIÉNES son los PERSONAJES PRINCIPALES de tu historia? (Nombre, rol, relación)',
    '¿Cuál fue el PUNTO DE INFLEXIÓN o el momento más emocional de la historia?',
  ],
};

const STORYTELLING_INVENTED_BLOCK2: Record<Lang, string[]> = {
  de: [
    'In welcher WELT / welchem SETTING spielt die Geschichte? (Modern, historisch, futuristisch, Fantasie-Welt)',
    'Wer ist der PROTAGONIST? Beschreibe die Figur (Name, Alter, Charakter, Motivation)',
    'Wer oder was ist der ANTAGONIST oder das Hindernis? (Person, innerer Konflikt, System, Naturgewalt)',
    'WIE BEGINNT die Geschichte? Was ist der Aufhänger in den ersten Sekunden?',
    'Welche ÜBERRASCHENDE WENDUNG oder welchen PLOT-TWIST soll die Story haben?',
    'Wie soll die VISUELLE ÄSTHETIK aussehen? (Cinematic, Anime-Style, Dokumentarisch, Surreal)',
    'Aus welcher ERZÄHLPERSPEKTIVE? (Ich-Erzähler, allwissend, Beobachter, Protagonist spricht direkt)',
    'Soll die Story DIALOG enthalten oder nur Voice-Over / Narration?',
    'Welche SYMBOLE oder WIEDERKEHRENDE MOTIVE sollen die Story verstärken?',
    'Wie LANG soll die Geschichte sein? (30s Kurzfilm, 60s, 2-3 Min, episch)',
    'Gibt es eine MORAL oder BOTSCHAFT die der Zuschauer mitnehmen soll?',
    'Wie endet die Geschichte? (Happy End, offen, Cliffhanger, überraschender Twist, bitter-süß)',
  ],
  en: [
    'In what WORLD / SETTING does the story take place? (Modern, historical, futuristic, fantasy world)',
    'Who is the PROTAGONIST? Describe the character (name, age, personality, motivation)',
    'Who or what is the ANTAGONIST or obstacle? (Person, inner conflict, system, force of nature)',
    'HOW DOES the story BEGIN? What hooks the viewer in the first seconds?',
    'What SURPRISING TWIST or PLOT TWIST should the story have?',
    'What should the VISUAL AESTHETIC look like? (Cinematic, anime-style, documentary, surreal)',
    'From what NARRATIVE PERSPECTIVE? (First person, omniscient, observer, protagonist speaks directly)',
    'Should the story contain DIALOGUE or only voice-over / narration?',
    'What SYMBOLS or RECURRING MOTIFS should reinforce the story?',
    'How LONG should the story be? (30s short film, 60s, 2-3 min, epic)',
    'Is there a MORAL or MESSAGE the viewer should take away?',
    'How does the story end? (Happy ending, open, cliffhanger, surprising twist, bittersweet)',
  ],
  es: [
    '¿En qué MUNDO / ESCENARIO se desarrolla la historia? (Moderno, histórico, futurista, mundo de fantasía)',
    '¿Quién es el PROTAGONISTA? Describe al personaje (nombre, edad, personalidad, motivación)',
    '¿Quién o qué es el ANTAGONISTA u obstáculo? (Persona, conflicto interno, sistema, fuerza natural)',
    '¿CÓMO EMPIEZA la historia? ¿Qué engancha al espectador en los primeros segundos?',
    '¿Qué GIRO SORPRENDENTE o PLOT TWIST debe tener la historia?',
    '¿Cómo debe verse la ESTÉTICA VISUAL? (Cinemático, estilo anime, documental, surrealista)',
    '¿Desde qué PERSPECTIVA NARRATIVA? (Primera persona, omnisciente, observador, protagonista habla directo)',
    '¿La historia debe contener DIÁLOGOS o solo voz en off / narración?',
    '¿Qué SÍMBOLOS o MOTIVOS RECURRENTES deben reforzar la historia?',
    '¿Qué tan LARGA debe ser la historia? (30s cortometraje, 60s, 2-3 min, épica)',
    '¿Hay una MORAL o MENSAJE que el espectador debe llevarse?',
    '¿Cómo termina la historia? (Final feliz, abierto, cliffhanger, giro sorprendente, agridulce)',
  ],
};

const STORYTELLING_TRUE_BLOCK2: Record<Lang, string[]> = {
  de: [
    'CHRONOLOGIE: Wann hat die Geschichte stattgefunden? In welchem Zeitraum?',
    'WO hat die Geschichte stattgefunden? Beschreibe den Ort / die Orte',
    'Was war die AUSGANGSSITUATION bevor alles begann? Der "normale" Alltag?',
    'Was war der AUSLÖSER? Was hat die Geschichte ins Rollen gebracht?',
    'Was war der SCHWIERIGSTE MOMENT? Der Tiefpunkt?',
    'Welche DETAILS machen die Geschichte authentisch? (Zitate, Geräusche, Gerüche, Bilder)',
    'Wie haben sich die BETEILIGTEN PERSONEN verändert?',
    'Was ist die LEKTION oder ERKENNTNIS aus der Geschichte?',
    'Wie NAH an der Realität soll das Video bleiben? (100% dokumentarisch vs. dramatisiert)',
    'Gibt es FOTOS, VIDEOS oder DOKUMENTE die wir einbauen können?',
    'Wie soll die ERZÄHLSTIMME klingen? (Persönlich/intim, professionell, emotional, nüchtern)',
    'Wie endet die Geschichte HEUTE? Was ist der aktuelle Stand?',
  ],
  en: [
    'CHRONOLOGY: When did the story take place? Over what time period?',
    'WHERE did the story happen? Describe the location(s)',
    'What was the STARTING SITUATION before everything began? The "normal" everyday life?',
    'What was the TRIGGER? What set the story in motion?',
    'What was the HARDEST MOMENT? The low point?',
    'What DETAILS make the story authentic? (Quotes, sounds, smells, images)',
    'How did the PEOPLE INVOLVED change?',
    'What is the LESSON or INSIGHT from the story?',
    'How CLOSE to reality should the video stay? (100% documentary vs. dramatized)',
    'Are there PHOTOS, VIDEOS or DOCUMENTS we can include?',
    'How should the NARRATOR VOICE sound? (Personal/intimate, professional, emotional, matter-of-fact)',
    'How does the story end TODAY? What is the current state?',
  ],
  es: [
    'CRONOLOGÍA: ¿Cuándo ocurrió la historia? ¿En qué período de tiempo?',
    '¿DÓNDE ocurrió la historia? Describe el lugar o lugares',
    '¿Cuál era la SITUACIÓN INICIAL antes de que todo comenzara? ¿El día a día "normal"?',
    '¿Cuál fue el DETONANTE? ¿Qué puso la historia en marcha?',
    '¿Cuál fue el MOMENTO MÁS DIFÍCIL? ¿El punto más bajo?',
    '¿Qué DETALLES hacen la historia auténtica? (Citas, sonidos, olores, imágenes)',
    '¿Cómo cambiaron las PERSONAS INVOLUCRADAS?',
    '¿Cuál es la LECCIÓN o APRENDIZAJE de la historia?',
    '¿Qué tan CERCA de la realidad debe quedarse el video? (100% documental vs. dramatizado)',
    '¿Hay FOTOS, VIDEOS o DOCUMENTOS que podamos incluir?',
    '¿Cómo debe sonar la VOZ NARRADORA? (Personal/íntima, profesional, emocional, sobria)',
    '¿Cómo termina la historia HOY? ¿Cuál es el estado actual?',
  ],
};

function getBlock1Phases(category: string, lang: Lang, messages?: any[]): string[] {
  if (category === 'storytelling' && messages && messages.length > 0) {
    const subMode = detectStorytellingSubMode(messages);
    if (subMode === 'invented') return STORYTELLING_INVENTED_BLOCK1[lang];
    if (subMode === 'true_story') return STORYTELLING_TRUE_BLOCK1[lang];
  }
  return CATEGORY_PHASES_BLOCK1[lang][category] || CATEGORY_PHASES_BLOCK1[lang]['custom'];
}

function getBlock2Phases(category: string, lang: Lang, messages?: any[]): string[] {
  if (category === 'storytelling' && messages) {
    const subMode = detectStorytellingSubMode(messages);
    if (subMode === 'invented') return STORYTELLING_INVENTED_BLOCK2[lang];
    if (subMode === 'true_story') return STORYTELLING_TRUE_BLOCK2[lang];
  }
  return CATEGORY_SPECIFIC_PHASES[lang][category] || CATEGORY_SPECIFIC_PHASES[lang]['custom'];
}

const UNIVERSAL_PHASES_BLOCK3: Record<Lang, string[]> = {
  de: [
    'MARKENFARBEN: Hex-Codes oder Farbbeschreibung deiner Brand Identity',
    'VOICE-OVER: Sprache (DE/EN), Geschlecht (männlich/weiblich), Tonalität des Sprechers',
    'MUSIK: Welcher Stil passt zum Video? (Corporate, Upbeat, Emotional, Cinematic, Ambient)',
    'FORMAT & PLATTFORM: 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram)?',
    'VIDEOLÄNGE: Wie lang soll das Video sein? (30s, 60s, 90s, 2min+)',
    'ZUSAMMENFASSUNG: Hier ist was ich gesammelt habe — passt alles so? Sollen wir starten?',
  ],
  en: [
    'BRAND COLORS: Hex codes or color description of your brand identity',
    'VOICE-OVER: Language (EN/DE), gender (male/female), speaker tonality',
    'MUSIC: What style fits the video? (Corporate, Upbeat, Emotional, Cinematic, Ambient)',
    'FORMAT & PLATFORM: 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram)?',
    'VIDEO LENGTH: How long should the video be? (30s, 60s, 90s, 2min+)',
    'SUMMARY: Here is what I gathered — does everything look good? Shall we start?',
  ],
  es: [
    'COLORES DE MARCA: Códigos hex o descripción de colores de tu identidad de marca',
    'VOZ EN OFF: Idioma (ES/EN), género (masculino/femenino), tonalidad del narrador',
    'MÚSICA: ¿Qué estilo encaja con el video? (Corporativo, Upbeat, Emocional, Cinemático, Ambient)',
    'FORMATO Y PLATAFORMA: 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram)?',
    'DURACIÓN DEL VIDEO: ¿Cuánto debe durar el video? (30s, 60s, 90s, 2min+)',
    'RESUMEN: Esto es lo que he recopilado — ¿todo correcto? ¿Empezamos?',
  ],
};

const CATEGORY_SPECIFIC_PHASES: Record<Lang, Record<string, string[]>> = {
  de: {
    'advertisement': [
      'Das EINE Hauptproblem das dein Produkt löst — beschreibe es emotional!',
      'Wie fühlt sich der Kunde VOR der Lösung? (Frustration, Zeitverlust, Unsicherheit...)',
      'Wie fühlt sich der Kunde NACH der Lösung? (Die Transformation beschreiben)',
      'Top 3 Features oder Vorteile deines Angebots',
      'Social Proof: Hast du konkrete Zahlen, Testimonials oder Awards? (z.B. "500+ Kunden")',
      'Konkurrenz: Was machen andere falsch, was du besser machst?',
      'Der HOOK: Was passiert in den ersten 3 Sekunden um den Scroll zu stoppen?',
      'Einwände: Welche Bedenken hat die Zielgruppe? Wie entkräftest du sie?',
      'Angebot: Gibt es ein Sonderangebot, Rabatt oder Bonus?',
      'Dringlichkeit: Zeitlimit, begrenzte Stückzahl, Early-Bird?',
      'Testimonial-Zitat: Ein Satz eines zufriedenen Kunden (echt oder beispielhaft)',
      'Exakter CTA-Text und URL: Was sollen Zuschauer am Ende tun?',
    ],
    'storytelling': [
      'PLACEHOLDER_STORYTELLING_B2_1',
      'PLACEHOLDER_STORYTELLING_B2_2',
      'PLACEHOLDER_STORYTELLING_B2_3',
      'PLACEHOLDER_STORYTELLING_B2_4',
      'PLACEHOLDER_STORYTELLING_B2_5',
      'PLACEHOLDER_STORYTELLING_B2_6',
      'PLACEHOLDER_STORYTELLING_B2_7',
      'PLACEHOLDER_STORYTELLING_B2_8',
      'PLACEHOLDER_STORYTELLING_B2_9',
      'PLACEHOLDER_STORYTELLING_B2_10',
      'PLACEHOLDER_STORYTELLING_B2_11',
      'PLACEHOLDER_STORYTELLING_B2_12',
    ],
    'tutorial': [
      'Was genau soll ERKLÄRT oder GEZEIGT werden? (Konkretes Thema)',
      'SCHWIERIGKEITSGRAD: Anfänger, Fortgeschrittene oder Experten?',
      'VORWISSEN: Was müssen Zuschauer bereits können oder wissen?',
      'LERNZIEL: Was können Zuschauer NACH dem Video, was sie vorher nicht konnten?',
      'SCHRITTE: Wie ist das Tutorial strukturiert? Welche Kapitel/Abschnitte?',
      'HÄUFIGE FEHLER: Welche typischen Fehler sollten Zuschauer vermeiden?',
      'PRO-TIPPS: Welche Shortcuts oder Insider-Tipps gibt es für Fortgeschrittene?',
      'TOOLS & MATERIALIEN: Was wird benötigt um mitzumachen?',
      'DARSTELLUNG: Screen-Recording, Animation, Zeichnung oder Mix?',
      'TEXT-OVERLAYS: Beschriftungen, Bullet Points, Nummerierungen?',
      'INTERAKTIVE ELEMENTE: Pausen zum Mitmachen, Quiz, Übungen?',
      'OUTRO: Nächste Schritte, weiterführende Ressourcen, CTA?',
    ],
    'product-video': [
      'PRODUKTNAME und KATEGORIE: Was genau wird vorgestellt?',
      'Das EINE Hauptproblem das dieses Produkt löst',
      'Top 3 FEATURES: Was kann das Produkt? (konkret und messbar)',
      'PREISPOSITIONIERUNG: Premium, Mittelklasse oder Budget?',
      'ANWENDUNGSSZENARIEN: Wann und wie wird das Produkt genutzt? (Alltags-Situationen)',
      'VORHER-NACHHER: Welche Transformation erlebt der Nutzer?',
      'SOCIAL PROOF: Bewertungen, Sterne, Awards, bekannte Kunden?',
      'VERGLEICH: Was macht dein Produkt besser als Alternativen?',
      'PACKSHOT / DEMO: 360°-Ansicht, Details, Produkt in Aktion zeigen?',
      'LIFESTYLE-SZENEN: Produkt im echten Leben zeigen? Welche Situationen?',
      'HOOK: Wie wird in den ersten 3 Sekunden Interesse geweckt?',
      'CTA: Kaufen, Testen, Mehr erfahren? Exakter Text und URL',
    ],
    'corporate': [
      'HAUPTZWECK: Recruiting, Imagefilm, Investoren-Pitch oder Employer Branding?',
      'UNTERNEHMENSGESCHICHTE: Gründungsjahr, wie ist die Firma entstanden?',
      'MISSION & VISION: Warum existiert das Unternehmen? Wo wollt ihr hin?',
      'Top 3 UNTERNEHMENSWERTE die gelebt werden',
      'MEILENSTEINE & ERRUNGENSCHAFTEN: Was macht ihr besonders stolz?',
      'TEAM: Wer soll gezeigt werden? Führungskräfte, Team, einzelne Personen?',
      'UNTERNEHMENSKULTUR: Wie ist die Arbeitsatmosphäre? Was macht euch aus?',
      'STANDORTE: Welche Locations sollen gezeigt werden?',
      'KUNDENSTIMMEN: Sollen Kunden oder Partner zu Wort kommen?',
      'NACHHALTIGKEIT & SOZIALES: Gibt es CSR-Initiativen?',
      'STILRICHTUNG: Seriös, modern, nahbar, inspirierend?',
      'CTA: Bewerben, Kontaktieren, Kennenlernen, Folgen?',
    ],
    'social-content': [
      'ZIELPLATTFORM: TikTok, Instagram Reels, YouTube Shorts oder mehrere?',
      'CONTENT-ART: Trend, Educational, Entertainment, Behind-the-Scenes, Meme?',
      'SCROLL-STOPPER: Was passiert in Sekunde 1-3 um Aufmerksamkeit zu gewinnen?',
      'STORYTELLING trotz Kürze: Welcher Mini-Bogen? (Frage→Antwort, Problem→Lösung)',
      'TEXT-OVERLAYS: Welcher Stil? (Bold, handschriftlich, minimal, animiert)',
      'TRENDING: Gibt es einen aktuellen Trend oder Sound den wir nutzen sollen?',
      'HASHTAG-STRATEGIE: Welche Hashtags sind relevant?',
      'INTERAKTION: Was sollen Zuschauer tun? (Kommentieren, Teilen, Duetten)',
      'SERIE oder EINZEL? Ist das ein wiederkehrendes Format?',
      'SCHNITTGESCHWINDIGKEIT: Schnell (TikTok-Style), Medium oder langsam?',
      'UNTERTITEL: Animiert, statisch oder keine?',
      'CTA: Follow, Link in Bio, Kommentar, Teilen?',
    ],
    'testimonial': [
      'WER gibt das Testimonial? (Name, Position, Unternehmen)',
      'BEZIEHUNG: Kunde, Partner, Mitarbeiter? Wie lange schon?',
      'PROBLEM VOR der Nutzung: Was war die Ausgangslage?',
      'ENTSCHEIDUNGSMOMENT: Warum wurde genau dieses Produkt/Service gewählt?',
      'ERFAHRUNG: Wie war der Prozess der Nutzung?',
      'KONKRETE ERGEBNISSE: Zahlen, Zeitersparnis, ROI, messbarer Erfolg?',
      'EMOTIONALE TRANSFORMATION: Wie fühlt sich der Kunde jetzt?',
      'ÜBERRASCHENDE BENEFITS: Was war unerwartet positiv?',
      'KERNZITAT: Der eine Satz der alles zusammenfasst',
      'WEITEREMPFEHLUNG: Würde der Kunde weiterempfehlen? Warum?',
      'SETTING: Büro, Zuhause, neutral? Wie soll das Testimonial wirken?',
      'CTA: Was sollen Zuschauer nach dem Video tun?',
    ],
    'explainer': [
      'Was genau soll ERKLÄRT werden? (Produkt, Prozess, Konzept)',
      'KOMPLEXITÄT: Wie schwer ist das Thema für die Zielgruppe?',
      'Das EINE Hauptproblem das angesprochen wird',
      'Die LÖSUNG: Wie löst dein Produkt/Service das Problem? (Schritt für Schritt)',
      'Top 3 VORTEILE der Lösung (für den Kunden)',
      'METAPHERN & ANALOGIEN: Welche Vergleiche vereinfachen das Thema?',
      'ANIMATIONSSTIL: Flat Design, Isometric, Whiteboard, 3D, Cartoon?',
      'CHARAKTERE: Soll eine animierte Figur durch das Video führen?',
      'ICON-STIL: Welche visuelle Sprache passt? (Technisch, verspielt, Business)',
      'TEXT-ELEMENTE: Bullet Points, Keywords, Zahlen die eingeblendet werden?',
      'SOUND DESIGN: Whooshes, Pops, Transitions-Sounds?',
      'CTA: Was ist die gewünschte Handlung am Ende?',
    ],
    'event': [
      'ART des Events: Konferenz, Launch, Feier, Messe, Workshop?',
      'NAME und DATUM des Events',
      'ZWECK des Videos: Recap, Teaser für nächstes Jahr, Dokumentation, Promotion?',
      'HIGHLIGHTS: Was muss unbedingt gezeigt werden?',
      'SPEAKER / PERFORMERS: Wer soll vorgestellt werden?',
      'INTERVIEWS: Teilnehmer-Stimmen einbauen?',
      'BEHIND-THE-SCENES: Aufbau, Vorbereitung, Backstage zeigen?',
      'ATMOSPHÄRE: Welche Momente fangen die Stimmung ein?',
      'BRANDING: Event-Farben, Logo, Motto, Sponsoren?',
      'DROHNE / SPECIAL SHOTS: Besondere Perspektiven gewünscht?',
      'EMOTIONALER HÖHEPUNKT: Was war der beste Moment?',
      'CTA: Tickets fürs nächste Jahr, Follow, Newsletter, Kontakt?',
    ],
    'promo': [
      'Was wird BEWORBEN? Produkt-Launch, Sale, Event, Feature, Ankündigung?',
      'LAUNCH-DATUM oder DEADLINE: Gibt es einen Stichtag?',
      'TEASER-STIL: Mystery/Andeutung oder direkte Ankündigung?',
      'Das EINE Hauptversprechen in einem Satz',
      'SPANNUNG: Wie wird Neugier aufgebaut? (Countdown, Teaser, Reveal)',
      'EXKLUSIVITÄT: Limited Edition, Early Access, Sonderpreis?',
      'EMOTIONEN: Aufregung, Neugier, FOMO, Vorfreude?',
      'KEY VISUAL: Welches Bild/Moment soll im Gedächtnis bleiben?',
      'SCHNITT-STIL: Schnelle Cuts, Build-up, Cinematic?',
      'SOUND: Dramatisch, Electronic, Upbeat?',
      'DAS REVEAL: Wann und wie wird das Geheimnis gelüftet?',
      'CTA: Save the Date, Pre-Order, Link, Reminder setzen?',
    ],
    'presentation': [
      'THEMA und TITEL der Präsentation',
      'ZIELGRUPPE: Investoren, Kunden, Intern, Konferenz?',
      'HAUPTZIEL: Überzeugen, Informieren, Pitchen, Schulen?',
      'KERNTHESE in einem Satz: Was ist die Hauptaussage?',
      'Top 3 ARGUMENTE / KERNPUNKTE die überzeugen sollen',
      'DATEN & BELEGE: Statistiken, Charts, Zahlen die visualisiert werden?',
      'CASE STUDIES: Gibt es konkrete Beispiele oder Erfolgsgeschichten?',
      'STORYTELLING: Soll ein narrativer Bogen eingebaut werden?',
      'VISUALISIERUNG: Charts, Infografiken, Diagramme, Illustrationen?',
      'SPRECHER: Sichtbar (Picture-in-Picture) oder nur Voice-Over?',
      'SLIDE-DESIGN: Minimalistisch, datenreich, visuell, Corporate?',
      'CTA: Kontakt, Follow-up Meeting, Entscheidung, nächste Schritte?',
    ],
    'custom': [
      'Beschreibe deine VIDEO-IDEE in 2-3 Sätzen',
      'Welches ZIEL soll das Video erreichen?',
      'Gibt es REFERENZEN oder Inspirationen? (Links, Beschreibungen)',
      'VISUELLER STIL: Welche Ästhetik schwebt dir vor?',
      'REAL-FOOTAGE, Animation oder Mix?',
      'CHARAKTERE oder SPRECHER: Sollen Personen/Figuren vorkommen?',
      'STORYTELLING-STRUKTUR: Linear, Non-linear, Episodisch?',
      'EMOTIONALE WIRKUNG: Was sollen Zuschauer fühlen?',
      'BESONDERE EFFEKTE: Gibt es spezielle visuelle Anforderungen?',
      'TEXT & TYPOGRAFIE: Welche Texteinblendungen sind nötig?',
      'SOUND DESIGN: Besondere Audio-Anforderungen?',
      'CTA und gewünschte Handlung am Ende',
    ],
  },
  en: {
    'advertisement': [
      'The ONE main problem your product solves — describe it emotionally!',
      'How does the customer feel BEFORE the solution? (Frustration, time loss, uncertainty...)',
      'How does the customer feel AFTER the solution? (Describe the transformation)',
      'Top 3 features or benefits of your offering',
      'Social Proof: Do you have concrete numbers, testimonials or awards? (e.g. "500+ customers")',
      'Competition: What do others do wrong that you do better?',
      'The HOOK: What happens in the first 3 seconds to stop the scroll?',
      'Objections: What concerns does the target audience have? How do you address them?',
      'Offer: Is there a special offer, discount or bonus?',
      'Urgency: Time limit, limited quantity, early-bird?',
      'Testimonial quote: One sentence from a satisfied customer (real or example)',
      'Exact CTA text and URL: What should viewers do at the end?',
    ],
    'storytelling': [
      'PLACEHOLDER_STORYTELLING_B2_1',
      'PLACEHOLDER_STORYTELLING_B2_2',
      'PLACEHOLDER_STORYTELLING_B2_3',
      'PLACEHOLDER_STORYTELLING_B2_4',
      'PLACEHOLDER_STORYTELLING_B2_5',
      'PLACEHOLDER_STORYTELLING_B2_6',
      'PLACEHOLDER_STORYTELLING_B2_7',
      'PLACEHOLDER_STORYTELLING_B2_8',
      'PLACEHOLDER_STORYTELLING_B2_9',
      'PLACEHOLDER_STORYTELLING_B2_10',
      'PLACEHOLDER_STORYTELLING_B2_11',
      'PLACEHOLDER_STORYTELLING_B2_12',
    ],
    'tutorial': [
      'What exactly should be EXPLAINED or SHOWN? (Specific topic)',
      'DIFFICULTY LEVEL: Beginners, intermediate or experts?',
      'PREREQUISITES: What do viewers need to know or be able to do?',
      'LEARNING GOAL: What can viewers do AFTER the video that they couldn\'t before?',
      'STEPS: How is the tutorial structured? Which chapters/sections?',
      'COMMON MISTAKES: What typical errors should viewers avoid?',
      'PRO TIPS: What shortcuts or insider tips are there for advanced users?',
      'TOOLS & MATERIALS: What is needed to follow along?',
      'PRESENTATION: Screen recording, animation, drawing or mix?',
      'TEXT OVERLAYS: Labels, bullet points, numbering?',
      'INTERACTIVE ELEMENTS: Pauses for participation, quizzes, exercises?',
      'OUTRO: Next steps, additional resources, CTA?',
    ],
    'product-video': [
      'PRODUCT NAME and CATEGORY: What exactly is being presented?',
      'The ONE main problem this product solves',
      'Top 3 FEATURES: What can the product do? (concrete and measurable)',
      'PRICE POSITIONING: Premium, mid-range or budget?',
      'USE CASES: When and how is the product used? (Everyday situations)',
      'BEFORE-AFTER: What transformation does the user experience?',
      'SOCIAL PROOF: Reviews, stars, awards, well-known customers?',
      'COMPARISON: What makes your product better than alternatives?',
      'PACKSHOT / DEMO: 360° view, details, product in action?',
      'LIFESTYLE SCENES: Show the product in real life? Which situations?',
      'HOOK: How is interest generated in the first 3 seconds?',
      'CTA: Buy, try, learn more? Exact text and URL',
    ],
    'corporate': [
      'MAIN PURPOSE: Recruiting, image film, investor pitch or employer branding?',
      'COMPANY HISTORY: Year founded, how did the company start?',
      'MISSION & VISION: Why does the company exist? Where are you heading?',
      'Top 3 COMPANY VALUES that are actively lived',
      'MILESTONES & ACHIEVEMENTS: What are you most proud of?',
      'TEAM: Who should be shown? Executives, team, specific individuals?',
      'COMPANY CULTURE: What is the work atmosphere like? What makes you special?',
      'LOCATIONS: Which locations should be shown?',
      'CUSTOMER VOICES: Should customers or partners be featured?',
      'SUSTAINABILITY & SOCIAL: Are there CSR initiatives?',
      'STYLE DIRECTION: Serious, modern, approachable, inspiring?',
      'CTA: Apply, contact, get to know, follow?',
    ],
    'social-content': [
      'TARGET PLATFORM: TikTok, Instagram Reels, YouTube Shorts or multiple?',
      'CONTENT TYPE: Trend, Educational, Entertainment, Behind-the-Scenes, Meme?',
      'SCROLL STOPPER: What happens in second 1-3 to grab attention?',
      'STORYTELLING despite brevity: What mini-arc? (Question→Answer, Problem→Solution)',
      'TEXT OVERLAYS: What style? (Bold, handwritten, minimal, animated)',
      'TRENDING: Is there a current trend or sound we should use?',
      'HASHTAG STRATEGY: Which hashtags are relevant?',
      'INTERACTION: What should viewers do? (Comment, share, duet)',
      'SERIES or SINGLE? Is this a recurring format?',
      'CUT SPEED: Fast (TikTok style), medium or slow?',
      'SUBTITLES: Animated, static or none?',
      'CTA: Follow, link in bio, comment, share?',
    ],
    'testimonial': [
      'WHO gives the testimonial? (Name, position, company)',
      'RELATIONSHIP: Customer, partner, employee? For how long?',
      'PROBLEM BEFORE usage: What was the starting situation?',
      'DECISION MOMENT: Why was exactly this product/service chosen?',
      'EXPERIENCE: How was the usage process?',
      'CONCRETE RESULTS: Numbers, time savings, ROI, measurable success?',
      'EMOTIONAL TRANSFORMATION: How does the customer feel now?',
      'SURPRISING BENEFITS: What was unexpectedly positive?',
      'KEY QUOTE: The one sentence that sums it all up',
      'RECOMMENDATION: Would the customer recommend? Why?',
      'SETTING: Office, home, neutral? How should the testimonial feel?',
      'CTA: What should viewers do after the video?',
    ],
    'explainer': [
      'What exactly should be EXPLAINED? (Product, process, concept)',
      'COMPLEXITY: How difficult is the topic for the target audience?',
      'The ONE main problem being addressed',
      'The SOLUTION: How does your product/service solve the problem? (Step by step)',
      'Top 3 BENEFITS of the solution (for the customer)',
      'METAPHORS & ANALOGIES: What comparisons simplify the topic?',
      'ANIMATION STYLE: Flat Design, Isometric, Whiteboard, 3D, Cartoon?',
      'CHARACTERS: Should an animated character guide through the video?',
      'ICON STYLE: What visual language fits? (Technical, playful, business)',
      'TEXT ELEMENTS: Bullet points, keywords, numbers to be displayed?',
      'SOUND DESIGN: Whooshes, pops, transition sounds?',
      'CTA: What is the desired action at the end?',
    ],
    'event': [
      'TYPE of event: Conference, launch, celebration, trade show, workshop?',
      'NAME and DATE of the event',
      'PURPOSE of the video: Recap, teaser for next year, documentation, promotion?',
      'HIGHLIGHTS: What absolutely must be shown?',
      'SPEAKERS / PERFORMERS: Who should be featured?',
      'INTERVIEWS: Include participant voices?',
      'BEHIND-THE-SCENES: Show setup, preparation, backstage?',
      'ATMOSPHERE: Which moments capture the mood?',
      'BRANDING: Event colors, logo, motto, sponsors?',
      'DRONE / SPECIAL SHOTS: Special perspectives desired?',
      'EMOTIONAL HIGHLIGHT: What was the best moment?',
      'CTA: Tickets for next year, follow, newsletter, contact?',
    ],
    'promo': [
      'What is being PROMOTED? Product launch, sale, event, feature, announcement?',
      'LAUNCH DATE or DEADLINE: Is there a specific date?',
      'TEASER STYLE: Mystery/hint or direct announcement?',
      'The ONE main promise in one sentence',
      'SUSPENSE: How is curiosity built? (Countdown, teaser, reveal)',
      'EXCLUSIVITY: Limited edition, early access, special price?',
      'EMOTIONS: Excitement, curiosity, FOMO, anticipation?',
      'KEY VISUAL: What image/moment should stick in memory?',
      'EDITING STYLE: Quick cuts, build-up, cinematic?',
      'SOUND: Dramatic, electronic, upbeat?',
      'THE REVEAL: When and how is the secret unveiled?',
      'CTA: Save the date, pre-order, link, set reminder?',
    ],
    'presentation': [
      'TOPIC and TITLE of the presentation',
      'TARGET AUDIENCE: Investors, clients, internal, conference?',
      'MAIN GOAL: Convince, inform, pitch, train?',
      'CORE THESIS in one sentence: What is the main message?',
      'Top 3 ARGUMENTS / KEY POINTS that should convince',
      'DATA & EVIDENCE: Statistics, charts, numbers to be visualized?',
      'CASE STUDIES: Are there concrete examples or success stories?',
      'STORYTELLING: Should a narrative arc be included?',
      'VISUALIZATION: Charts, infographics, diagrams, illustrations?',
      'SPEAKER: Visible (picture-in-picture) or voice-over only?',
      'SLIDE DESIGN: Minimalist, data-rich, visual, corporate?',
      'CTA: Contact, follow-up meeting, decision, next steps?',
    ],
    'custom': [
      'Describe your VIDEO IDEA in 2-3 sentences',
      'What GOAL should the video achieve?',
      'Are there REFERENCES or inspirations? (Links, descriptions)',
      'VISUAL STYLE: What aesthetic do you have in mind?',
      'REAL FOOTAGE, animation or mix?',
      'CHARACTERS or SPEAKERS: Should people/figures appear?',
      'STORYTELLING STRUCTURE: Linear, non-linear, episodic?',
      'EMOTIONAL IMPACT: What should viewers feel?',
      'SPECIAL EFFECTS: Are there specific visual requirements?',
      'TEXT & TYPOGRAPHY: What text overlays are needed?',
      'SOUND DESIGN: Special audio requirements?',
      'CTA and desired action at the end',
    ],
  },
  es: {
    'advertisement': [
      'El PROBLEMA principal que tu producto resuelve — ¡descríbelo emocionalmente!',
      '¿Cómo se siente el cliente ANTES de la solución? (Frustración, pérdida de tiempo, incertidumbre...)',
      '¿Cómo se siente el cliente DESPUÉS de la solución? (Describe la transformación)',
      'Top 3 características o beneficios de tu oferta',
      'Prueba social: ¿Tienes números concretos, testimonios o premios? (ej. "500+ clientes")',
      'Competencia: ¿Qué hacen otros mal que tú haces mejor?',
      'El HOOK: ¿Qué pasa en los primeros 3 segundos para detener el scroll?',
      'Objeciones: ¿Qué preocupaciones tiene tu público objetivo? ¿Cómo las resuelves?',
      'Oferta: ¿Hay una oferta especial, descuento o bonus?',
      'Urgencia: ¿Límite de tiempo, cantidad limitada, precio especial?',
      'Cita testimonial: Una frase de un cliente satisfecho (real o ejemplo)',
      'Texto CTA exacto y URL: ¿Qué deben hacer los espectadores al final?',
    ],
    'storytelling': [
      'PLACEHOLDER_STORYTELLING_B2_1',
      'PLACEHOLDER_STORYTELLING_B2_2',
      'PLACEHOLDER_STORYTELLING_B2_3',
      'PLACEHOLDER_STORYTELLING_B2_4',
      'PLACEHOLDER_STORYTELLING_B2_5',
      'PLACEHOLDER_STORYTELLING_B2_6',
      'PLACEHOLDER_STORYTELLING_B2_7',
      'PLACEHOLDER_STORYTELLING_B2_8',
      'PLACEHOLDER_STORYTELLING_B2_9',
      'PLACEHOLDER_STORYTELLING_B2_10',
      'PLACEHOLDER_STORYTELLING_B2_11',
      'PLACEHOLDER_STORYTELLING_B2_12',
    ],
    'tutorial': [
      '¿Qué exactamente se debe EXPLICAR o MOSTRAR? (Tema concreto)',
      'NIVEL DE DIFICULTAD: ¿Principiantes, intermedios o expertos?',
      'REQUISITOS PREVIOS: ¿Qué necesitan saber los espectadores?',
      'OBJETIVO DE APRENDIZAJE: ¿Qué podrán hacer los espectadores DESPUÉS del video?',
      'PASOS: ¿Cómo está estructurado el tutorial? ¿Qué capítulos/secciones?',
      'ERRORES COMUNES: ¿Qué errores típicos deben evitar los espectadores?',
      'TIPS PRO: ¿Qué atajos o tips de expertos hay?',
      'HERRAMIENTAS Y MATERIALES: ¿Qué se necesita para seguir el tutorial?',
      'PRESENTACIÓN: ¿Grabación de pantalla, animación, dibujo o mix?',
      'TEXTOS SUPERPUESTOS: ¿Etiquetas, viñetas, numeración?',
      'ELEMENTOS INTERACTIVOS: ¿Pausas para participar, quiz, ejercicios?',
      'OUTRO: ¿Próximos pasos, recursos adicionales, CTA?',
    ],
    'product-video': [
      'NOMBRE DEL PRODUCTO y CATEGORÍA: ¿Qué exactamente se presenta?',
      'El PROBLEMA principal que este producto resuelve',
      'Top 3 CARACTERÍSTICAS: ¿Qué puede hacer el producto? (concreto y medible)',
      'POSICIONAMIENTO DE PRECIO: ¿Premium, gama media o económico?',
      'ESCENARIOS DE USO: ¿Cuándo y cómo se usa el producto? (Situaciones cotidianas)',
      'ANTES-DESPUÉS: ¿Qué transformación experimenta el usuario?',
      'PRUEBA SOCIAL: ¿Reseñas, estrellas, premios, clientes conocidos?',
      'COMPARACIÓN: ¿Qué hace tu producto mejor que las alternativas?',
      'PACKSHOT / DEMO: ¿Vista 360°, detalles, producto en acción?',
      'ESCENAS LIFESTYLE: ¿Mostrar el producto en la vida real? ¿Qué situaciones?',
      'HOOK: ¿Cómo se genera interés en los primeros 3 segundos?',
      'CTA: ¿Comprar, probar, más información? Texto exacto y URL',
    ],
    'corporate': [
      'PROPÓSITO PRINCIPAL: ¿Reclutamiento, video institucional, pitch para inversores o employer branding?',
      'HISTORIA DE LA EMPRESA: Año de fundación, ¿cómo surgió la empresa?',
      'MISIÓN Y VISIÓN: ¿Por qué existe la empresa? ¿Hacia dónde se dirigen?',
      'Top 3 VALORES EMPRESARIALES que se viven activamente',
      'HITOS Y LOGROS: ¿De qué están más orgullosos?',
      'EQUIPO: ¿Quién debe aparecer? ¿Directivos, equipo, personas específicas?',
      'CULTURA EMPRESARIAL: ¿Cómo es el ambiente laboral? ¿Qué los hace especiales?',
      'UBICACIONES: ¿Qué locaciones deben mostrarse?',
      'VOCES DE CLIENTES: ¿Deben participar clientes o socios?',
      'SOSTENIBILIDAD Y SOCIAL: ¿Hay iniciativas de RSC?',
      'DIRECCIÓN DE ESTILO: ¿Serio, moderno, cercano, inspirador?',
      'CTA: ¿Postularse, contactar, conocer, seguir?',
    ],
    'social-content': [
      'PLATAFORMA OBJETIVO: ¿TikTok, Instagram Reels, YouTube Shorts o varias?',
      'TIPO DE CONTENIDO: ¿Tendencia, Educativo, Entretenimiento, Behind-the-Scenes, Meme?',
      'SCROLL STOPPER: ¿Qué pasa en el segundo 1-3 para captar atención?',
      'STORYTELLING breve: ¿Qué mini-arco? (Pregunta→Respuesta, Problema→Solución)',
      'TEXTOS SUPERPUESTOS: ¿Qué estilo? (Bold, manuscrito, mínimo, animado)',
      'TENDENCIAS: ¿Hay una tendencia o sonido actual que debamos usar?',
      'ESTRATEGIA DE HASHTAGS: ¿Qué hashtags son relevantes?',
      'INTERACCIÓN: ¿Qué deben hacer los espectadores? (Comentar, compartir, dueto)',
      '¿SERIE o INDIVIDUAL? ¿Es un formato recurrente?',
      'VELOCIDAD DE CORTE: ¿Rápido (estilo TikTok), medio o lento?',
      'SUBTÍTULOS: ¿Animados, estáticos o ninguno?',
      'CTA: ¿Seguir, link en bio, comentar, compartir?',
    ],
    'testimonial': [
      '¿QUIÉN da el testimonio? (Nombre, cargo, empresa)',
      'RELACIÓN: ¿Cliente, socio, empleado? ¿Desde cuándo?',
      'PROBLEMA ANTES del uso: ¿Cuál era la situación inicial?',
      'MOMENTO DE DECISIÓN: ¿Por qué se eligió exactamente este producto/servicio?',
      'EXPERIENCIA: ¿Cómo fue el proceso de uso?',
      'RESULTADOS CONCRETOS: ¿Números, ahorro de tiempo, ROI, éxito medible?',
      'TRANSFORMACIÓN EMOCIONAL: ¿Cómo se siente el cliente ahora?',
      'BENEFICIOS SORPRENDENTES: ¿Qué fue inesperadamente positivo?',
      'CITA CLAVE: La frase que lo resume todo',
      'RECOMENDACIÓN: ¿Recomendaría el cliente? ¿Por qué?',
      'ESCENARIO: ¿Oficina, hogar, neutro? ¿Cómo debe verse el testimonio?',
      'CTA: ¿Qué deben hacer los espectadores después del video?',
    ],
    'explainer': [
      '¿Qué exactamente se debe EXPLICAR? (Producto, proceso, concepto)',
      'COMPLEJIDAD: ¿Qué tan difícil es el tema para el público objetivo?',
      'El PROBLEMA principal que se aborda',
      'La SOLUCIÓN: ¿Cómo resuelve tu producto/servicio el problema? (Paso a paso)',
      'Top 3 BENEFICIOS de la solución (para el cliente)',
      'METÁFORAS Y ANALOGÍAS: ¿Qué comparaciones simplifican el tema?',
      'ESTILO DE ANIMACIÓN: ¿Flat Design, Isométrico, Pizarra, 3D, Cartoon?',
      'PERSONAJES: ¿Debe un personaje animado guiar el video?',
      'ESTILO DE ICONOS: ¿Qué lenguaje visual encaja? (Técnico, divertido, empresarial)',
      'ELEMENTOS DE TEXTO: ¿Viñetas, palabras clave, números que se muestren?',
      'DISEÑO DE SONIDO: ¿Whooshes, pops, sonidos de transición?',
      'CTA: ¿Cuál es la acción deseada al final?',
    ],
    'event': [
      'TIPO de evento: ¿Conferencia, lanzamiento, celebración, feria, taller?',
      'NOMBRE y FECHA del evento',
      'PROPÓSITO del video: ¿Resumen, teaser para el próximo año, documentación, promoción?',
      'HIGHLIGHTS: ¿Qué debe mostrarse obligatoriamente?',
      'PONENTES / ARTISTAS: ¿Quién debe ser presentado?',
      'ENTREVISTAS: ¿Incluir voces de participantes?',
      'BEHIND-THE-SCENES: ¿Mostrar montaje, preparación, backstage?',
      'ATMÓSFERA: ¿Qué momentos capturan el ambiente?',
      'BRANDING: ¿Colores del evento, logo, lema, patrocinadores?',
      'DRONE / TOMAS ESPECIALES: ¿Se desean perspectivas especiales?',
      'MOMENTO EMOCIONAL CUMBRE: ¿Cuál fue el mejor momento?',
      'CTA: ¿Entradas para el próximo año, seguir, newsletter, contacto?',
    ],
    'promo': [
      '¿Qué se PROMOCIONA? ¿Lanzamiento de producto, oferta, evento, función, anuncio?',
      'FECHA DE LANZAMIENTO o FECHA LÍMITE: ¿Hay una fecha específica?',
      'ESTILO TEASER: ¿Misterio/insinuación o anuncio directo?',
      'La PROMESA principal en una frase',
      'SUSPENSE: ¿Cómo se construye la curiosidad? (Cuenta regresiva, teaser, reveal)',
      'EXCLUSIVIDAD: ¿Edición limitada, acceso anticipado, precio especial?',
      'EMOCIONES: ¿Emoción, curiosidad, FOMO, anticipación?',
      'VISUAL CLAVE: ¿Qué imagen/momento debe quedarse en la memoria?',
      'ESTILO DE EDICIÓN: ¿Cortes rápidos, build-up, cinemático?',
      'SONIDO: ¿Dramático, electrónico, upbeat?',
      'EL REVEAL: ¿Cuándo y cómo se revela el secreto?',
      'CTA: ¿Save the date, pre-order, link, activar recordatorio?',
    ],
    'presentation': [
      'TEMA y TÍTULO de la presentación',
      'PÚBLICO OBJETIVO: ¿Inversores, clientes, interno, conferencia?',
      'OBJETIVO PRINCIPAL: ¿Convencer, informar, presentar, capacitar?',
      'TESIS CENTRAL en una frase: ¿Cuál es el mensaje principal?',
      'Top 3 ARGUMENTOS / PUNTOS CLAVE que deben convencer',
      'DATOS Y EVIDENCIA: ¿Estadísticas, gráficos, números para visualizar?',
      'CASOS DE ESTUDIO: ¿Hay ejemplos concretos o historias de éxito?',
      'STORYTELLING: ¿Se debe incluir un arco narrativo?',
      'VISUALIZACIÓN: ¿Gráficos, infografías, diagramas, ilustraciones?',
      'PRESENTADOR: ¿Visible (picture-in-picture) o solo voz en off?',
      'DISEÑO DE SLIDES: ¿Minimalista, rico en datos, visual, corporativo?',
      'CTA: ¿Contacto, reunión de seguimiento, decisión, próximos pasos?',
    ],
    'custom': [
      'Describe tu IDEA DE VIDEO en 2-3 frases',
      '¿Qué OBJETIVO debe lograr el video?',
      '¿Hay REFERENCIAS o inspiraciones? (Links, descripciones)',
      'ESTILO VISUAL: ¿Qué estética tienes en mente?',
      '¿FOOTAGE REAL, animación o mix?',
      'PERSONAJES o NARRADORES: ¿Deben aparecer personas/figuras?',
      'ESTRUCTURA NARRATIVA: ¿Lineal, no lineal, episódica?',
      'IMPACTO EMOCIONAL: ¿Qué deben sentir los espectadores?',
      'EFECTOS ESPECIALES: ¿Hay requisitos visuales específicos?',
      'TEXTO Y TIPOGRAFÍA: ¿Qué textos superpuestos se necesitan?',
      'DISEÑO DE SONIDO: ¿Requisitos de audio especiales?',
      'CTA y acción deseada al final',
    ],
  },
};

// Quick replies per language
const CATEGORY_QUICK_REPLIES_BLOCK1: Record<Lang, Record<string, Record<number, string[]>>> = {
  de: {
    'advertisement': {
      1: ['Software / SaaS', 'Physisches Produkt', 'Dienstleistung / Agentur', 'Lass mich beschreiben...'],
      2: ['B2B Entscheider 30-55', 'Endkonsumenten 25-45', 'Junge Zielgruppe 18-30', 'Lass mich beschreiben...'],
      3: ['Einzigartige Technologie', 'Bester Service / Support', 'Bestes Preis-Leistungs-Verhältnis', 'Lass mich erklären...'],
      4: ['Mehr Verkäufe erzielen', 'Leads generieren', 'Brand Awareness steigern', 'Lass mich erklären...'],
    },
    'storytelling': {
      1: ['KI erfindet eine Story ✨', 'Ich habe eine wahre Geschichte 📖'],
      2: ['Lass mich erzählen...'],
      3: ['Lass mich erzählen...'],
      4: ['Lass mich beschreiben...'],
    },
    'tutorial': {
      1: ['Ein Software-Feature erklären', 'Handwerkliche Anleitung', 'Konzept / Theorie', 'Lass mich beschreiben...'],
      2: ['Anfänger (keine Vorkenntnisse)', 'Fortgeschrittene', 'Experten', 'Gemischtes Publikum'],
      3: ['Konkrete Fähigkeit beherrschen', 'Prozess selbst ausführen', 'Konzept vollständig verstehen', 'Lass mich erklären...'],
      4: ['Software / App', 'Werkzeuge / Material', 'Nur Wissen nötig', 'Lass mich auflisten...'],
    },
    'product-video': {
      1: ['Physisches Produkt', 'Software / App', 'Hardware / Gerät', 'Lass mich beschreiben...'],
      2: ['Zeitersparnis', 'Kostenreduktion', 'Qualitätsverbesserung', 'Lass mich erklären...'],
      3: ['3 starke Features', 'Ein Killer-Feature', 'Technische Specs', 'Lass mich auflisten...'],
      4: ['B2B Entscheider', 'Endkonsumenten', 'Tech-Enthusiasten', 'Lass mich beschreiben...'],
    },
    'corporate': {
      1: ['Recruiting / Employer Branding', 'Imagefilm', 'Investoren-Pitch', 'Allgemeine Vorstellung'],
      2: ['Lange Tradition (10+ Jahre)', 'Startup / jung & dynamisch', 'Familienbetrieb', 'Lass mich erzählen...'],
      3: ['Welt verbessern', 'Branche revolutionieren', 'Kunden glücklich machen', 'Lass mich erklären...'],
      4: ['Familiäre Atmosphäre', 'Innovation & Fortschritt', 'Qualität & Zuverlässigkeit', 'Lass mich beschreiben...'],
    },
    'social-content': {
      1: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Mehrere Plattformen'],
      2: ['Trend / Viral', 'Educational / Tipps', 'Entertainment / Spaß', 'Behind-the-Scenes'],
      3: ['Junge Kreative 18-30', 'Business-Audience', 'Breites Publikum', 'Lass mich beschreiben...'],
      4: ['Provokante Frage', 'Unerwarteter Fakt', 'Visueller Wow-Effekt', 'Ich hab eine Idee...'],
    },
    'testimonial': {
      1: ['Langjähriger Kunde', 'Neuer Kunde mit Wow-Erlebnis', 'Business-Partner', 'Lass mich beschreiben...'],
      2: ['Frustriert mit alten Lösungen', 'Auf der Suche nach Besserem', 'Skeptisch gegenüber Neuem', 'Lass mich erzählen...'],
      3: ['50%+ Zeitersparnis', 'Deutliche Kostensenkung', 'Qualitativ bessere Ergebnisse', 'Lass mich Zahlen nennen...'],
      4: ['Erleichtert & glücklich', 'Begeistert & stolz', 'Sicher & entspannt', 'Lass mich beschreiben...'],
    },
    'explainer': {
      1: ['Ein Produkt / eine App', 'Einen Prozess / Workflow', 'Ein Konzept / eine Idee', 'Lass mich beschreiben...'],
      2: ['Sehr komplex', 'Mittelschwer', 'Eigentlich einfach', 'Lass mich einschätzen...'],
      3: ['Fehlendes Verständnis', 'Komplizierter Prozess', 'Zeitverlust / Ineffizienz', 'Lass mich erklären...'],
      4: ['Kunden', 'Mitarbeiter', 'Investoren / Partner', 'Lass mich beschreiben...'],
    },
    'event': {
      1: ['Konferenz / Summit', 'Produkt-Launch', 'Firmenfeier / Gala', 'Messe / Expo'],
      2: ['Recap / Zusammenfassung', 'Teaser für nächstes Jahr', 'Dokumentation', 'Promotion / Werbung'],
      3: ['Keynote / Speaker', 'Networking-Momente', 'Produkt-Enthüllung', 'Lass mich beschreiben...'],
      4: ['Begeisterung & Energie', 'Professionalität', 'Party & Spaß', 'Inspiration'],
    },
    'promo': {
      1: ['Produkt-Launch', 'Sale / Rabatt-Aktion', 'Event-Ankündigung', 'Feature-Release'],
      2: ['Revolutionär neu', 'Bestes Angebot ever', 'Exklusiver Zugang', 'Lass mich formulieren...'],
      3: ['In den nächsten Tagen', 'In 2-4 Wochen', 'Kein festes Datum', 'Lass mich beschreiben...'],
      4: ['FOMO erzeugen', 'Vorfreude aufbauen', 'Neugier wecken', 'Aufregung entfachen'],
    },
    'presentation': {
      1: ['Business-Pitch', 'Konferenz-Talk', 'Schulung / Workshop', 'Lass mich beschreiben...'],
      2: ['Investoren', 'Kunden', 'Internes Team', 'Konferenz-Publikum'],
      3: ['Eine klare Hauptaussage', 'Lass mich formulieren...', 'Noch unsicher', 'Mehrere Kernpunkte'],
      4: ['Investieren / Kaufen', 'Verstehen / Lernen', 'Handeln / Umsetzen', 'Lass mich erklären...'],
    },
    'custom': {
      1: ['Lass mich beschreiben...', 'Ähnlich wie eine Werbung', 'Eher dokumentarisch', 'Komplett frei & kreativ'],
      2: ['Verkaufen / Konvertieren', 'Informieren / Erklären', 'Unterhalten / Begeistern', 'Lass mich erklären...'],
      3: ['B2B Unternehmen', 'Endkonsumenten', 'Breites Publikum', 'Lass mich beschreiben...'],
      4: ['Ja, ich habe Referenzen', 'Nein, komplett neu', 'Ähnlich wie Apple/Nike', 'Lass mich beschreiben...'],
    },
  },
  en: {
    'advertisement': {
      1: ['Software / SaaS', 'Physical product', 'Service / Agency', 'Let me describe...'],
      2: ['B2B decision makers 30-55', 'Consumers 25-45', 'Young audience 18-30', 'Let me describe...'],
      3: ['Unique technology', 'Best service / support', 'Best value for money', 'Let me explain...'],
      4: ['Increase sales', 'Generate leads', 'Build brand awareness', 'Let me explain...'],
    },
    'storytelling': {
      1: ['AI invents a story ✨', 'I have a true story 📖'],
      2: ['Let me tell...'],
      3: ['Let me tell...'],
      4: ['Let me describe...'],
    },
    'tutorial': {
      1: ['Explain a software feature', 'Hands-on guide', 'Concept / theory', 'Let me describe...'],
      2: ['Beginners (no experience)', 'Intermediate', 'Experts', 'Mixed audience'],
      3: ['Master a specific skill', 'Execute process independently', 'Fully understand concept', 'Let me explain...'],
      4: ['Software / App', 'Tools / Materials', 'Knowledge only', 'Let me list...'],
    },
    'product-video': {
      1: ['Physical product', 'Software / App', 'Hardware / Device', 'Let me describe...'],
      2: ['Time savings', 'Cost reduction', 'Quality improvement', 'Let me explain...'],
      3: ['3 strong features', 'One killer feature', 'Technical specs', 'Let me list...'],
      4: ['B2B decision makers', 'Consumers', 'Tech enthusiasts', 'Let me describe...'],
    },
    'corporate': {
      1: ['Recruiting / Employer branding', 'Image film', 'Investor pitch', 'General introduction'],
      2: ['Long tradition (10+ years)', 'Startup / young & dynamic', 'Family business', 'Let me tell...'],
      3: ['Improve the world', 'Revolutionize industry', 'Make customers happy', 'Let me explain...'],
      4: ['Family atmosphere', 'Innovation & progress', 'Quality & reliability', 'Let me describe...'],
    },
    'social-content': {
      1: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Multiple platforms'],
      2: ['Trend / Viral', 'Educational / Tips', 'Entertainment / Fun', 'Behind-the-Scenes'],
      3: ['Young creatives 18-30', 'Business audience', 'Broad audience', 'Let me describe...'],
      4: ['Provocative question', 'Unexpected fact', 'Visual wow effect', 'I have an idea...'],
    },
    'testimonial': {
      1: ['Long-term customer', 'New customer with wow experience', 'Business partner', 'Let me describe...'],
      2: ['Frustrated with old solutions', 'Looking for better', 'Skeptical about new things', 'Let me tell...'],
      3: ['50%+ time savings', 'Significant cost reduction', 'Better quality results', 'Let me share numbers...'],
      4: ['Relieved & happy', 'Excited & proud', 'Secure & relaxed', 'Let me describe...'],
    },
    'explainer': {
      1: ['A product / an app', 'A process / workflow', 'A concept / idea', 'Let me describe...'],
      2: ['Very complex', 'Medium difficulty', 'Actually simple', 'Let me assess...'],
      3: ['Lack of understanding', 'Complicated process', 'Time loss / inefficiency', 'Let me explain...'],
      4: ['Customers', 'Employees', 'Investors / Partners', 'Let me describe...'],
    },
    'event': {
      1: ['Conference / Summit', 'Product launch', 'Company party / Gala', 'Trade show / Expo'],
      2: ['Recap / Summary', 'Teaser for next year', 'Documentation', 'Promotion / Advertising'],
      3: ['Keynote / Speaker', 'Networking moments', 'Product reveal', 'Let me describe...'],
      4: ['Excitement & energy', 'Professionalism', 'Party & fun', 'Inspiration'],
    },
    'promo': {
      1: ['Product launch', 'Sale / Discount', 'Event announcement', 'Feature release'],
      2: ['Revolutionary new', 'Best deal ever', 'Exclusive access', 'Let me formulate...'],
      3: ['In the next few days', 'In 2-4 weeks', 'No fixed date', 'Let me describe...'],
      4: ['Create FOMO', 'Build anticipation', 'Spark curiosity', 'Ignite excitement'],
    },
    'presentation': {
      1: ['Business pitch', 'Conference talk', 'Training / Workshop', 'Let me describe...'],
      2: ['Investors', 'Clients', 'Internal team', 'Conference audience'],
      3: ['One clear main point', 'Let me formulate...', 'Not sure yet', 'Multiple key messages'],
      4: ['Invest / Buy', 'Understand / Learn', 'Act / Implement', 'Let me explain...'],
    },
    'custom': {
      1: ['Let me describe...', 'Similar to an ad', 'Rather documentary', 'Completely free & creative'],
      2: ['Sell / Convert', 'Inform / Explain', 'Entertain / Excite', 'Let me explain...'],
      3: ['B2B companies', 'Consumers', 'Broad audience', 'Let me describe...'],
      4: ['Yes, I have references', 'No, completely new', 'Similar to Apple/Nike', 'Let me describe...'],
    },
  },
  es: {
    'advertisement': {
      1: ['Software / SaaS', 'Producto físico', 'Servicio / Agencia', 'Déjame describir...'],
      2: ['Decisores B2B 30-55', 'Consumidores 25-45', 'Audiencia joven 18-30', 'Déjame describir...'],
      3: ['Tecnología única', 'Mejor servicio', 'Mejor relación calidad-precio', 'Déjame explicar...'],
      4: ['Aumentar ventas', 'Generar leads', 'Aumentar brand awareness', 'Déjame explicar...'],
    },
    'storytelling': {
      1: ['La IA inventa una historia ✨', 'Tengo una historia real 📖'],
      2: ['Déjame contar...'],
      3: ['Déjame contar...'],
      4: ['Déjame describir...'],
    },
    'tutorial': {
      1: ['Explicar una función de software', 'Guía práctica', 'Concepto / teoría', 'Déjame describir...'],
      2: ['Principiantes', 'Intermedios', 'Expertos', 'Audiencia mixta'],
      3: ['Dominar habilidad específica', 'Ejecutar proceso', 'Entender concepto', 'Déjame explicar...'],
      4: ['Software / App', 'Herramientas / Material', 'Solo conocimiento', 'Déjame listar...'],
    },
    'product-video': {
      1: ['Producto físico', 'Software / App', 'Hardware / Dispositivo', 'Déjame describir...'],
      2: ['Ahorro de tiempo', 'Reducción de costos', 'Mejora de calidad', 'Déjame explicar...'],
      3: ['3 características fuertes', 'Una característica estrella', 'Specs técnicos', 'Déjame listar...'],
      4: ['Decisores B2B', 'Consumidores', 'Entusiastas tech', 'Déjame describir...'],
    },
    'corporate': {
      1: ['Reclutamiento / Employer branding', 'Video institucional', 'Pitch para inversores', 'Presentación general'],
      2: ['Larga tradición (10+ años)', 'Startup / joven y dinámico', 'Empresa familiar', 'Déjame contar...'],
      3: ['Mejorar el mundo', 'Revolucionar la industria', 'Hacer felices a los clientes', 'Déjame explicar...'],
      4: ['Atmósfera familiar', 'Innovación y progreso', 'Calidad y confianza', 'Déjame describir...'],
    },
    'social-content': {
      1: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Varias plataformas'],
      2: ['Tendencia / Viral', 'Educativo / Tips', 'Entretenimiento', 'Behind-the-Scenes'],
      3: ['Jóvenes creativos 18-30', 'Audiencia business', 'Público amplio', 'Déjame describir...'],
      4: ['Pregunta provocadora', 'Hecho inesperado', 'Efecto visual wow', 'Tengo una idea...'],
    },
    'testimonial': {
      1: ['Cliente de largo plazo', 'Nuevo cliente con wow', 'Socio comercial', 'Déjame describir...'],
      2: ['Frustrado con soluciones viejas', 'Buscando algo mejor', 'Escéptico', 'Déjame contar...'],
      3: ['50%+ ahorro de tiempo', 'Reducción de costos', 'Mejores resultados', 'Déjame dar números...'],
      4: ['Aliviado y feliz', 'Emocionado y orgulloso', 'Seguro y relajado', 'Déjame describir...'],
    },
    'explainer': {
      1: ['Un producto / una app', 'Un proceso / workflow', 'Un concepto / idea', 'Déjame describir...'],
      2: ['Muy complejo', 'Dificultad media', 'En realidad simple', 'Déjame evaluar...'],
      3: ['Falta de comprensión', 'Proceso complicado', 'Pérdida de tiempo', 'Déjame explicar...'],
      4: ['Clientes', 'Empleados', 'Inversores / Socios', 'Déjame describir...'],
    },
    'event': {
      1: ['Conferencia / Summit', 'Lanzamiento de producto', 'Fiesta / Gala', 'Feria / Expo'],
      2: ['Recap / Resumen', 'Teaser para próxima vez', 'Documentación', 'Promoción'],
      3: ['Keynote / Speaker', 'Momentos networking', 'Revelación de producto', 'Déjame describir...'],
      4: ['Emoción y energía', 'Profesionalismo', 'Fiesta y diversión', 'Inspiración'],
    },
    'promo': {
      1: ['Lanzamiento de producto', 'Sale / Descuento', 'Anuncio de evento', 'Release de función'],
      2: ['Revolucionariamente nuevo', 'Mejor oferta ever', 'Acceso exclusivo', 'Déjame formular...'],
      3: ['En los próximos días', 'En 2-4 semanas', 'Sin fecha fija', 'Déjame describir...'],
      4: ['Crear FOMO', 'Construir anticipación', 'Despertar curiosidad', 'Encender emoción'],
    },
    'presentation': {
      1: ['Pitch de negocio', 'Charla de conferencia', 'Capacitación / Taller', 'Déjame describir...'],
      2: ['Inversores', 'Clientes', 'Equipo interno', 'Público de conferencia'],
      3: ['Un punto principal claro', 'Déjame formular...', 'Aún no seguro', 'Varios mensajes clave'],
      4: ['Invertir / Comprar', 'Entender / Aprender', 'Actuar / Implementar', 'Déjame explicar...'],
    },
    'custom': {
      1: ['Déjame describir...', 'Similar a un anuncio', 'Más documental', 'Completamente libre'],
      2: ['Vender / Convertir', 'Informar / Explicar', 'Entretener / Emocionar', 'Déjame explicar...'],
      3: ['Empresas B2B', 'Consumidores', 'Público amplio', 'Déjame describir...'],
      4: ['Sí, tengo referencias', 'No, completamente nuevo', 'Similar a Apple/Nike', 'Déjame describir...'],
    },
  },
};

const UNIVERSAL_QUICK_REPLIES_BLOCK3: Record<Lang, Record<number, string[]>> = {
  de: {
    17: ['Blau & Weiß', 'Schwarz & Gold (#F5C76A)', 'Grün & Naturtöne', 'Ich schicke die Hex-Codes'],
    18: ['Männliche Stimme, professionell', 'Weibliche Stimme, freundlich', 'Keine Stimme, nur Musik', 'Deutsch UND Englisch'],
    19: ['Corporate & Business', 'Upbeat & energetisch', 'Emotional & cinematic', 'Minimal & subtil'],
    20: ['16:9 für YouTube/Website', '9:16 für TikTok/Reels', '1:1 für Instagram', 'Alle drei Formate'],
    21: ['30 Sekunden', '60 Sekunden', '90 Sekunden', '2 Minuten'],
    22: ['Ja, alles passt — Video erstellen!', 'Kleine Änderung...', 'Nochmal zusammenfassen', 'Einen Punkt anpassen'],
  },
  en: {
    17: ['Blue & White', 'Black & Gold (#F5C76A)', 'Green & Natural tones', 'I\'ll send the hex codes'],
    18: ['Male voice, professional', 'Female voice, friendly', 'No voice, music only', 'English AND German'],
    19: ['Corporate & Business', 'Upbeat & energetic', 'Emotional & cinematic', 'Minimal & subtle'],
    20: ['16:9 for YouTube/Website', '9:16 for TikTok/Reels', '1:1 for Instagram', 'All three formats'],
    21: ['30 seconds', '60 seconds', '90 seconds', '2 minutes'],
    22: ['Yes, everything looks good — create video!', 'Small change...', 'Summarize again', 'Adjust one point'],
  },
  es: {
    17: ['Azul y Blanco', 'Negro y Dorado (#F5C76A)', 'Verde y Tonos naturales', 'Envío los códigos hex'],
    18: ['Voz masculina, profesional', 'Voz femenina, amigable', 'Sin voz, solo música', 'Español E Inglés'],
    19: ['Corporativo y Business', 'Upbeat y enérgico', 'Emocional y cinemático', 'Mínimo y sutil'],
    20: ['16:9 para YouTube/Web', '9:16 para TikTok/Reels', '1:1 para Instagram', 'Los tres formatos'],
    21: ['30 segundos', '60 segundos', '90 segundos', '2 minutos'],
    22: ['Sí, todo está bien — ¡crear video!', 'Pequeño cambio...', 'Resumir de nuevo', 'Ajustar un punto'],
  },
};

// Category quick replies — only DE has full set, EN/ES use translated versions
const CATEGORY_QUICK_REPLIES: Record<Lang, Record<string, Record<number, string[]>>> = {
  de: {
    'advertisement': {
      5: ['Zeitverlust & Ineffizienz', 'Hohe Kosten', 'Schlechte Qualität', 'Lass mich erklären...'],
      6: ['Frustration & Stress', 'Unsicherheit & Zweifel', 'Überforderung', 'Lass mich beschreiben...'],
      7: ['Erleichterung & Zeitgewinn', 'Sicherheit & Vertrauen', 'Begeisterung & Stolz', 'Lass mich beschreiben...'],
      8: ['Einfache Bedienung', 'Zeitersparnis', 'Beste Qualität', 'Alle drei...'],
      9: ['500+ zufriedene Kunden', '4.9 Sterne Bewertung', 'Bekannter Award', 'Keine konkreten Zahlen'],
      10: ['Komplizierte Tools', 'Zu teuer', 'Schlechter Support', 'Lass mich erklären...'],
      11: ['Provokante Frage stellen', 'Schockierendes Statement', 'Problem visuell zeigen', 'Ich hab eine Idee...'],
      12: ['Zu teuer → ROI zeigen', 'Zu kompliziert → Demo', 'Kein Vertrauen → Social Proof', 'Andere Einwände...'],
      13: ['Ja, Rabatt/Sonderangebot', 'Kostenlose Testphase', 'Bonus-Material inklusive', 'Kein spezielles Angebot'],
      14: ['Nur noch X Plätze', 'Angebot endet am...', 'Early-Bird Preis', 'Keine Dringlichkeit'],
      15: ['Ja, ich hab ein Zitat', 'Bitte eines formulieren', 'Mehrere Kundenstimmen', 'Kein Testimonial nötig'],
      16: ['Jetzt kaufen + Shop-Link', 'Kostenlos testen + Demo', 'Mehr erfahren + Website', 'Termin buchen'],
    },
    'storytelling': {
      5: ['Horror / Thriller', 'Romantik / Drama', 'Abenteuer / Action', 'Dokumentarisch / Real'],
      6: ['Der Gründer selbst', 'Ein Kunde / Nutzer', 'Das Team als Ganzes', 'Eine fiktive Figur'],
      7: ['Normaler Alltag, alles gut', 'Bereits problematisch', 'Nostalgisch, frühere Zeiten', 'Lass mich beschreiben...'],
      8: ['Existenzielle Krise', 'Technisches Problem', 'Emotionaler Konflikt', 'Lass mich erzählen...'],
      9: ['Fast aufgegeben', 'Alles auf dem Spiel', 'Emotionaler Zusammenbruch', 'Kein Tiefpunkt nötig'],
      10: ['Eine Erkenntnis / Aha-Moment', 'Hilfe von außen', 'Mut & Entscheidung', 'Lass mich erzählen...'],
      11: ['Komplett neues Leben', 'Schrittweise Verbesserung', 'Emotionale Heilung', 'Lass mich beschreiben...'],
      12: ['Hoffnung & Inspiration', 'Angst & Spannung', 'Freude & Nostalgie', 'Staunen & Ehrfurcht'],
      13: ['Natur-Metaphern', 'Reise / Weg-Metapher', 'Licht & Dunkelheit', 'Lass mich beschreiben...'],
      14: ['Langsamer Aufbau → Klimax', 'Sofort Action, dann ruhig', 'Gleichmäßig emotional', 'Wechselnd (schnell/langsam)'],
      15: ['Echte Zahlen & Fakten', 'Persönliche Details', 'Originalzitate', 'Lass mich erzählen...'],
      16: ['Happy End mit CTA', 'Open End (zum Nachdenken)', 'Cliffhanger (Serie)', 'Überraschender Twist'],
    },
    'tutorial': {
      5: ['Ein Software-Feature erklären', 'Handwerkliche Anleitung', 'Konzept / Theorie', 'Lass mich beschreiben...'],
      6: ['Anfänger (keine Vorkenntnisse)', 'Fortgeschrittene', 'Experten', 'Gemischtes Publikum'],
      7: ['Grundlagen des Themas', 'Bestimmte Tools installiert', 'Branchenwissen', 'Keine Vorkenntnisse nötig'],
      8: ['Konkrete Fähigkeit beherrschen', 'Prozess selbst ausführen', 'Konzept verstehen', 'Lass mich erklären...'],
      9: ['3-5 klare Schritte', '5-10 Schritte mit Kapiteln', 'Freie Erklärung', 'Lass mich strukturieren...'],
      10: ['Die 3 häufigsten Anfänger-Fehler', 'Ein kritischer Fehler', 'Mehrere Stolperfallen', 'Keine typischen Fehler'],
      11: ['Zeitspar-Shortcuts', 'Versteckte Features', 'Best Practices', 'Keine Pro-Tipps nötig'],
      12: ['Software/App', 'Werkzeuge/Material', 'Nur Wissen', 'Lass mich auflisten...'],
      13: ['Screen-Recording', 'Animation & Grafiken', 'Whiteboard-Stil', 'Mix aus allem'],
      14: ['Nummerierte Schritte', 'Keywords hervorheben', 'Pfeile & Markierungen', 'Minimale Texteinblendungen'],
      15: ['Ja, Pausen zum Mitmachen', 'Nein, durchgehend', 'Quiz am Ende', 'Übungsaufgabe'],
      16: ['Nächstes Tutorial empfehlen', 'Ressourcen-Links', 'Community beitreten', 'Produkt testen'],
    },
    'product-video': {
      5: ['Physisches Produkt', 'Software / App', 'Hardware / Gerät', 'Lass mich beschreiben...'],
      6: ['Zeitersparnis', 'Kostenreduktion', 'Qualitätsverbesserung', 'Lass mich erklären...'],
      7: ['3 starke Features', 'Ein Killer-Feature', 'Technische Specs', 'Lass mich auflisten...'],
      8: ['Premium-Segment', 'Mittelklasse', 'Budget-freundlich', 'Bestes Preis-Leistungs-Verhältnis'],
      9: ['Im Büro / bei der Arbeit', 'Zuhause / privat', 'Unterwegs / mobil', 'Mehrere Szenarien...'],
      10: ['Dramatische Verbesserung', 'Schrittweise Optimierung', 'Komplett neuer Workflow', 'Lass mich beschreiben...'],
      11: ['4.9 Sterne, 500+ Reviews', 'Bekannte Marken als Kunden', 'Award-Gewinner', 'Keine Bewertungen noch'],
      12: ['Deutlich besser als X', 'Einzigartiges Feature', 'Besserer Preis', 'Lass mich vergleichen...'],
      13: ['360° Produktansicht', 'Close-up Details', 'Produkt in Aktion', 'Unboxing-Stil'],
      14: ['Im echten Alltag zeigen', 'Stylische Umgebung', 'Minimalistisch, nur Produkt', 'Lass mich beschreiben...'],
      15: ['Provokante Frage', 'Problem visuell zeigen', 'Wow-Effekt des Produkts', 'Ich hab eine Idee...'],
      16: ['Jetzt kaufen', 'Kostenlos testen', 'Mehr erfahren', 'Demo anfordern'],
    },
    'corporate': {
      5: ['Recruiting / Employer Branding', 'Imagefilm', 'Investoren-Pitch', 'Allgemeine Vorstellung'],
      6: ['Lange Tradition (10+ Jahre)', 'Startup / jung & dynamisch', 'Familienbetrieb', 'Lass mich erzählen...'],
      7: ['Welt verbessern', 'Branche revolutionieren', 'Kunden glücklich machen', 'Lass mich erklären...'],
      8: ['Innovation & Fortschritt', 'Qualität & Zuverlässigkeit', 'Teamgeist & Zusammenhalt', 'Lass mich auflisten...'],
      9: ['Marktführerschaft', 'Schnelles Wachstum', 'Innovative Produkte', 'Lass mich erzählen...'],
      10: ['Geschäftsführung', 'Verschiedene Team-Mitglieder', 'Niemand konkret', 'Das ganze Team'],
      11: ['Familiäre Atmosphäre', 'High-Performance Culture', 'Kreativ & locker', 'Lass mich beschreiben...'],
      12: ['Hauptstandort zeigen', 'Mehrere Standorte', 'Remote / Digital', 'Lass mich beschreiben...'],
      13: ['Ja, Kundenstimmen einbauen', 'Partner-Statements', 'Nein, intern fokussiert', 'Vielleicht dezent'],
      14: ['Ja, Nachhaltigkeit ist wichtig', 'Soziale Projekte', 'Nicht relevant', 'Lass mich erklären...'],
      15: ['Seriös & vertrauenswürdig', 'Modern & innovativ', 'Nahbar & authentisch', 'Inspirierend & visionär'],
      16: ['Jetzt bewerben', 'Kontakt aufnehmen', 'Website besuchen', 'Folgen auf Social Media'],
    },
    'social-content': {
      5: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Mehrere Plattformen'],
      6: ['Trend / Viral', 'Educational / Tipps', 'Entertainment / Spaß', 'Behind-the-Scenes'],
      7: ['Provokante Frage', 'Unerwarteter Fakt', 'Visueller Wow-Effekt', 'Ich hab eine Idee...'],
      8: ['Problem → Lösung', 'Frage → Antwort', 'Erwartung → Realität', 'Vorher → Nachher'],
      9: ['Bold & groß', 'Handschriftlich', 'Minimal / keine Texte', 'Animiert & dynamisch'],
      10: ['Ja, aktuellen Trend nutzen', 'Eigene Musik/Sound', 'Trending Audio', 'Kein bestimmter Trend'],
      11: ['3-5 relevante Hashtags', 'Ich kenne meine Hashtags', 'Bitte vorschlagen', 'Keine Hashtags'],
      12: ['Kommentieren (Frage stellen)', 'Teilen (Freunde taggen)', 'Folgen für mehr', 'Link klicken'],
      13: ['Ja, wiederkehrendes Format', 'Nein, Einzelvideo', 'Vielleicht als Serie', 'Noch unsicher'],
      14: ['Sehr schnell (1s Cuts)', 'Medium (2-3s Cuts)', 'Eher ruhig', 'Wechselnd'],
      15: ['Animierte Untertitel', 'Statische Untertitel', 'Keine Untertitel', 'Was empfiehlst du?'],
      16: ['Follow für mehr', 'Link in Bio', 'Kommentar hinterlassen', 'Video teilen'],
    },
    'testimonial': {
      5: ['Kunde / Nutzer', 'Business-Partner', 'Mitarbeiter', 'Lass mich beschreiben...'],
      6: ['Langjähriger Kunde (2+ Jahre)', 'Neuer Kunde mit Wow-Erlebnis', 'Partner/Mitarbeiter', 'Lass mich beschreiben...'],
      7: ['Frustriert mit alten Lösungen', 'Auf der Suche nach Besserem', 'Skeptisch gegenüber Neuem', 'Lass mich erzählen...'],
      8: ['Empfehlung von Freunden', 'Online-Recherche', 'Konkurrenz war schlecht', 'Lass mich erklären...'],
      9: ['Reibungslos & einfach', 'Überraschend gut', 'Mit Lernkurve aber positiv', 'Lass mich beschreiben...'],
      10: ['50%+ Zeitersparnis', 'Deutliche Kostensenkung', 'Qualitativ bessere Ergebnisse', 'Lass mich Zahlen nennen...'],
      11: ['Erleichtert & glücklich', 'Begeistert & stolz', 'Sicher & entspannt', 'Lass mich beschreiben...'],
      12: ['Unerwartete Zeitersparnis', 'Toller Support', 'Community-Feeling', 'Lass mich erzählen...'],
      13: ['Ja, ich hab ein echtes Zitat', 'Bitte eines formulieren', 'Mehrere Zitate verfügbar', 'Lass mich überlegen...'],
      14: ['Absolut, an jeden!', 'An bestimmte Zielgruppe', 'Ja, mit Einschränkungen', 'Lass mich erklären...'],
      15: ['Professionell im Büro', 'Casual / Authentisch', 'Neutral / Studio', 'Lass mich beschreiben...'],
      16: ['Produkt selbst testen', 'Termin buchen', 'Website besuchen', 'Demo anfordern'],
    },
    'explainer': {
      5: ['Ein Produkt / eine App', 'Einen Prozess / Workflow', 'Ein Konzept / eine Idee', 'Lass mich beschreiben...'],
      6: ['Sehr komplex, braucht Vereinfachung', 'Mittelschwer', 'Eigentlich einfach, muss nur gezeigt werden', 'Lass mich einschätzen...'],
      7: ['Zeitverlust / Ineffizienz', 'Fehlendes Verständnis', 'Komplizierter Prozess', 'Lass mich erklären...'],
      8: ['3 einfache Schritte', '5+ Schritte mit Details', 'Ein fließender Prozess', 'Lass mich beschreiben...'],
      9: ['Zeitersparnis', 'Kostenreduktion', 'Einfachheit', 'Alle drei...'],
      10: ['Alltags-Analogie', 'Technische Metapher', 'Visuelle Vereinfachung', 'Lass mich überlegen...'],
      11: ['Flat Design / Modern', 'Isometric / 3D', 'Whiteboard-Stil', 'Cartoon / Verspielt'],
      12: ['Ja, Charakter als Guide', 'Nein, nur Grafiken', 'Vielleicht dezent', 'Was passt besser?'],
      13: ['Technisch & präzise', 'Verspielt & freundlich', 'Business & clean', 'Lass mich beschreiben...'],
      14: ['Bullet Points & Keywords', 'Prozess-Nummern', 'Minimale Texte', 'Datenvisualisierung'],
      15: ['Ja, dezente Sounds', 'Knackige Transitions', 'Nein, nur Musik', 'Was empfiehlst du?'],
      16: ['Produkt testen', 'Mehr erfahren', 'Demo buchen', 'Jetzt starten'],
    },
    'event': {
      5: ['Konferenz / Summit', 'Produkt-Launch', 'Firmenfeier / Gala', 'Messe / Expo'],
      6: ['Geplantes zukünftiges Event', 'Bereits stattgefunden', 'Regelmäßiges Event', 'Lass mich beschreiben...'],
      7: ['Recap / Zusammenfassung', 'Teaser für nächstes Jahr', 'Dokumentation / Archiv', 'Promotion / Werbung'],
      8: ['Keynote / Hauptredner', 'Networking-Momente', 'Produkt-Enthüllung', 'Mehrere Highlights...'],
      9: ['Ja, Speaker vorstellen', 'Nein, Fokus auf Atmosphäre', 'Mix aus beidem', 'Lass mich beschreiben...'],
      10: ['Ja, Teilnehmer-Stimmen', 'Nein, nur Bilder & Musik', 'Mix aus O-Tönen & Musik', 'Was passt besser?'],
      11: ['Ja, Behind-the-Scenes zeigen', 'Nein, nur fertiges Event', 'Kurzer Blick hinter Kulissen', 'Lass mich beschreiben...'],
      12: ['Begeisterung & Energie', 'Professionalität & Netzwerk', 'Party & Spaß', 'Inspiration & Lernen'],
      13: ['Event-Farben & Branding', 'Sponsoren einbinden', 'Eigene Brand-Farben', 'Lass mich beschreiben...'],
      14: ['Ja, Drohnenflug', 'Zeitraffer vom Aufbau', 'Slow-Motion Highlights', 'Standard-Perspektiven reichen'],
      15: ['Standing Ovation / Applaus', 'Networking-Moment', 'Überraschungs-Reveal', 'Lass mich beschreiben...'],
      16: ['Tickets fürs nächste Jahr', 'Newsletter abonnieren', 'Galerie / Fotos ansehen', 'Social Media folgen'],
    },
    'promo': {
      5: ['Produkt-Launch', 'Sale / Rabattaktion', 'Event-Ankündigung', 'Feature-Release'],
      6: ['In den nächsten Tagen', 'In 2-4 Wochen', 'Kein festes Datum', 'Lass mich beschreiben...'],
      7: ['Mystery / Andeutung', 'Direkte Ankündigung', 'Countdown-Reveal', 'Mix aus beidem'],
      8: ['Revolutionär neu', 'Bester Deal ever', 'Exklusiver Zugang', 'Lass mich formulieren...'],
      9: ['Countdown-Timer', 'Schritt-für-Schritt Reveal', 'Teaser → Full Reveal', 'Lass mich beschreiben...'],
      10: ['Limited Edition', 'Early Access', 'Sonderpreis für Erste', 'Keine Exklusivität'],
      11: ['FOMO erzeugen', 'Vorfreude aufbauen', 'Neugier wecken', 'Begeisterung entfachen'],
      12: ['Produkt-Shot', 'Emotionaler Moment', 'Überraschungs-Reveal', 'Lass mich beschreiben...'],
      13: ['Schnelle Cuts, dynamisch', 'Langsamer Build-up', 'Cinematic & episch', 'Was passt besser?'],
      14: ['Dramatisch & episch', 'Electronic & modern', 'Upbeat & energetisch', 'Lass mich beschreiben...'],
      15: ['Big Reveal am Ende', 'Schrittweise enthüllen', 'Am Anfang zeigen, Details folgen', 'Lass mich beschreiben...'],
      16: ['Pre-Order starten', 'Save the Date', 'Link / Website besuchen', 'Reminder setzen'],
    },
    'presentation': {
      5: ['Firmen-Internes Meeting', 'Konferenz-Vortrag', 'Pitch Deck / Investoren', 'Lass mich beschreiben...'],
      6: ['Investoren überzeugen', 'Team schulen', 'Kunden informieren', 'Idee pitchen'],
      7: ['Überzeugen & verkaufen', 'Informieren & schulen', 'Inspirieren & motivieren', 'Lass mich erklären...'],
      8: ['Einen klaren Hauptpunkt', 'Lass mich formulieren...', 'Noch nicht sicher', 'Mehrere Kernaussagen'],
      9: ['3 starke Argumente', 'Datengetriebene Beweise', 'Emotionale Argumente', 'Lass mich auflisten...'],
      10: ['Ja, Statistiken & Charts', 'Wenige, aber wichtige Zahlen', 'Keine Daten', 'Lass mich beschreiben...'],
      11: ['Ja, eine Erfolgsgeschichte', 'Mehrere Mini-Cases', 'Nein, theoretisch bleiben', 'Lass mich erzählen...'],
      12: ['Ja, narrativer Bogen', 'Nein, faktenbasiert', 'Leichtes Storytelling', 'Was empfiehlst du?'],
      13: ['Charts & Diagramme', 'Infografiken', 'Illustrationen', 'Mix aus allem'],
      14: ['Sprecher sichtbar (PiP)', 'Nur Voice-Over', 'Kein Sprecher, nur Slides', 'Was passt besser?'],
      15: ['Minimalistisch & clean', 'Datenreich & detailliert', 'Visuell & bildstark', 'Corporate & professionell'],
      16: ['Meeting vereinbaren', 'Entscheidung treffen', 'Mehr erfahren', 'Kontakt aufnehmen'],
    },
    'custom': {
      5: ['Lass mich beschreiben...', 'Ähnlich wie ein Werbevideo', 'Eher dokumentarisch', 'Komplett frei & kreativ'],
      6: ['Verkaufen / Konvertieren', 'Informieren / Erklären', 'Unterhalten / Begeistern', 'Lass mich erklären...'],
      7: ['Ja, ich habe Referenzen', 'Nein, komplett neu', 'Ähnlich wie Apple/Nike-Style', 'Lass mich beschreiben...'],
      8: ['Modern & minimalistisch', 'Cinematic & episch', 'Verspielt & bunt', 'Lass mich beschreiben...'],
      9: ['Komplett animiert', 'Real-Footage', 'Mix aus beidem', 'Was empfiehlst du?'],
      10: ['Ja, Charakter/Sprecher', 'Nein, nur Visuals', 'Vielleicht Voice-Over', 'Lass mich beschreiben...'],
      11: ['Linear / chronologisch', 'Problem → Lösung', 'Episodisch / Kapitel', 'Frei & experimentell'],
      12: ['Begeisterung & Wow', 'Vertrauen & Sicherheit', 'Neugier & Interesse', 'Lass mich beschreiben...'],
      13: ['Ja, spezielle Effekte', 'Nein, clean & einfach', 'Dezente Effekte', 'Lass mich beschreiben...'],
      14: ['Headlines & Keywords', 'Bullet Points', 'Minimale Texte', 'Lass mich beschreiben...'],
      15: ['Ja, besondere Sounds', 'Standard Sound Design', 'Nur Musik', 'Lass mich beschreiben...'],
      16: ['Website besuchen', 'Kontakt aufnehmen', 'Produkt testen', 'Lass mich beschreiben...'],
    },
  },
  en: {
    'advertisement': {
      5: ['Time loss & inefficiency', 'High costs', 'Poor quality', 'Let me explain...'],
      6: ['Frustration & stress', 'Uncertainty & doubt', 'Overwhelm', 'Let me describe...'],
      7: ['Relief & time savings', 'Security & trust', 'Excitement & pride', 'Let me describe...'],
      8: ['Easy to use', 'Time savings', 'Best quality', 'All three...'],
      9: ['500+ happy customers', '4.9 star rating', 'Well-known award', 'No concrete numbers'],
      10: ['Complicated tools', 'Too expensive', 'Bad support', 'Let me explain...'],
      11: ['Ask provocative question', 'Shocking statement', 'Show problem visually', 'I have an idea...'],
      12: ['Too expensive → Show ROI', 'Too complex → Demo', 'No trust → Social proof', 'Other objections...'],
      13: ['Yes, discount/special offer', 'Free trial', 'Bonus material included', 'No special offer'],
      14: ['Only X spots left', 'Offer ends on...', 'Early-bird price', 'No urgency'],
      15: ['Yes, I have a quote', 'Please write one', 'Multiple customer voices', 'No testimonial needed'],
      16: ['Buy now + shop link', 'Try for free + demo', 'Learn more + website', 'Book appointment'],
    },
    'storytelling': {
      5: ['Horror / Thriller', 'Romance / Drama', 'Adventure / Action', 'Documentary / Real'],
      6: ['The founder', 'A customer / user', 'The team as a whole', 'A fictional character'],
      7: ['Normal everyday life', 'Already problematic', 'Nostalgic, earlier times', 'Let me describe...'],
      8: ['Existential crisis', 'Technical problem', 'Emotional conflict', 'Let me tell...'],
      9: ['Almost gave up', 'Everything at stake', 'Emotional breakdown', 'No low point needed'],
      10: ['A realization / aha moment', 'Help from outside', 'Courage & decision', 'Let me tell...'],
      11: ['Completely new life', 'Gradual improvement', 'Emotional healing', 'Let me describe...'],
      12: ['Hope & inspiration', 'Fear & tension', 'Joy & nostalgia', 'Wonder & awe'],
      13: ['Nature metaphors', 'Journey / path metaphor', 'Light & darkness', 'Let me describe...'],
      14: ['Slow build → climax', 'Immediate action, then calm', 'Evenly emotional', 'Alternating (fast/slow)'],
      15: ['Real numbers & facts', 'Personal details', 'Original quotes', 'Let me tell...'],
      16: ['Happy end with CTA', 'Open end (thought-provoking)', 'Cliffhanger (series)', 'Surprising twist'],
    },
    'tutorial': {
      5: ['Explain a software feature', 'Hands-on guide', 'Concept / theory', 'Let me describe...'],
      6: ['Beginners (no experience)', 'Intermediate', 'Experts', 'Mixed audience'],
      7: ['Topic basics', 'Specific tools installed', 'Industry knowledge', 'No prerequisites needed'],
      8: ['Master a specific skill', 'Execute process yourself', 'Understand concept', 'Let me explain...'],
      9: ['3-5 clear steps', '5-10 steps with chapters', 'Free explanation', 'Let me structure...'],
      10: ['Top 3 beginner mistakes', 'One critical error', 'Multiple pitfalls', 'No typical errors'],
      11: ['Time-saving shortcuts', 'Hidden features', 'Best practices', 'No pro tips needed'],
      12: ['Software/App', 'Tools/Materials', 'Knowledge only', 'Let me list...'],
      13: ['Screen recording', 'Animation & graphics', 'Whiteboard style', 'Mix of everything'],
      14: ['Numbered steps', 'Highlight keywords', 'Arrows & markers', 'Minimal text overlays'],
      15: ['Yes, pauses to follow along', 'No, continuous', 'Quiz at the end', 'Exercise'],
      16: ['Recommend next tutorial', 'Resource links', 'Join community', 'Try product'],
    },
    'product-video': {
      5: ['Physical product', 'Software / App', 'Hardware / Device', 'Let me describe...'],
      6: ['Time savings', 'Cost reduction', 'Quality improvement', 'Let me explain...'],
      7: ['3 strong features', 'One killer feature', 'Technical specs', 'Let me list...'],
      8: ['Premium segment', 'Mid-range', 'Budget-friendly', 'Best value'],
      9: ['At the office / work', 'At home / private', 'On the go / mobile', 'Multiple scenarios...'],
      10: ['Dramatic improvement', 'Gradual optimization', 'Completely new workflow', 'Let me describe...'],
      11: ['4.9 stars, 500+ reviews', 'Well-known brands as customers', 'Award winner', 'No reviews yet'],
      12: ['Clearly better than X', 'Unique feature', 'Better price', 'Let me compare...'],
      13: ['360° product view', 'Close-up details', 'Product in action', 'Unboxing style'],
      14: ['Show in real life', 'Stylish setting', 'Minimalist, product only', 'Let me describe...'],
      15: ['Provocative question', 'Show problem visually', 'Wow effect of product', 'I have an idea...'],
      16: ['Buy now', 'Try for free', 'Learn more', 'Request demo'],
    },
    'corporate': {
      5: ['Recruiting / Employer branding', 'Image film', 'Investor pitch', 'General introduction'],
      6: ['Long tradition (10+ years)', 'Startup / young & dynamic', 'Family business', 'Let me tell...'],
      7: ['Improve the world', 'Revolutionize industry', 'Make customers happy', 'Let me explain...'],
      8: ['Innovation & progress', 'Quality & reliability', 'Team spirit & unity', 'Let me list...'],
      9: ['Market leadership', 'Rapid growth', 'Innovative products', 'Let me tell...'],
      10: ['Management', 'Various team members', 'No one specific', 'The whole team'],
      11: ['Family atmosphere', 'High-performance culture', 'Creative & relaxed', 'Let me describe...'],
      12: ['Show headquarters', 'Multiple locations', 'Remote / Digital', 'Let me describe...'],
      13: ['Yes, include customer voices', 'Partner statements', 'No, internal focus', 'Maybe subtly'],
      14: ['Yes, sustainability matters', 'Social projects', 'Not relevant', 'Let me explain...'],
      15: ['Serious & trustworthy', 'Modern & innovative', 'Approachable & authentic', 'Inspiring & visionary'],
      16: ['Apply now', 'Get in touch', 'Visit website', 'Follow on social media'],
    },
    'social-content': {
      5: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Multiple platforms'],
      6: ['Trend / Viral', 'Educational / Tips', 'Entertainment / Fun', 'Behind-the-Scenes'],
      7: ['Provocative question', 'Unexpected fact', 'Visual wow effect', 'I have an idea...'],
      8: ['Problem → Solution', 'Question → Answer', 'Expectation → Reality', 'Before → After'],
      9: ['Bold & large', 'Handwritten', 'Minimal / no text', 'Animated & dynamic'],
      10: ['Yes, use current trend', 'Own music/sound', 'Trending audio', 'No specific trend'],
      11: ['3-5 relevant hashtags', 'I know my hashtags', 'Please suggest', 'No hashtags'],
      12: ['Comment (ask question)', 'Share (tag friends)', 'Follow for more', 'Click link'],
      13: ['Yes, recurring format', 'No, single video', 'Maybe as series', 'Not sure yet'],
      14: ['Very fast (1s cuts)', 'Medium (2-3s cuts)', 'Rather calm', 'Alternating'],
      15: ['Animated subtitles', 'Static subtitles', 'No subtitles', 'What do you recommend?'],
      16: ['Follow for more', 'Link in bio', 'Leave a comment', 'Share video'],
    },
    'testimonial': {
      5: ['Customer / User', 'Business partner', 'Employee', 'Let me describe...'],
      6: ['Long-term customer (2+ years)', 'New customer with wow experience', 'Partner/Employee', 'Let me describe...'],
      7: ['Frustrated with old solutions', 'Looking for something better', 'Skeptical about new things', 'Let me tell...'],
      8: ['Recommendation from friends', 'Online research', 'Competition was bad', 'Let me explain...'],
      9: ['Smooth & easy', 'Surprisingly good', 'Learning curve but positive', 'Let me describe...'],
      10: ['50%+ time savings', 'Significant cost reduction', 'Better quality results', 'Let me share numbers...'],
      11: ['Relieved & happy', 'Excited & proud', 'Secure & relaxed', 'Let me describe...'],
      12: ['Unexpected time savings', 'Great support', 'Community feeling', 'Let me tell...'],
      13: ['Yes, I have a real quote', 'Please write one', 'Multiple quotes available', 'Let me think...'],
      14: ['Absolutely, to everyone!', 'To specific audience', 'Yes, with caveats', 'Let me explain...'],
      15: ['Professional in office', 'Casual / Authentic', 'Neutral / Studio', 'Let me describe...'],
      16: ['Try product yourself', 'Book appointment', 'Visit website', 'Request demo'],
    },
    'explainer': {
      5: ['A product / an app', 'A process / workflow', 'A concept / idea', 'Let me describe...'],
      6: ['Very complex, needs simplification', 'Medium difficulty', 'Actually simple, just needs showing', 'Let me assess...'],
      7: ['Time loss / inefficiency', 'Lack of understanding', 'Complicated process', 'Let me explain...'],
      8: ['3 simple steps', '5+ steps with details', 'A flowing process', 'Let me describe...'],
      9: ['Time savings', 'Cost reduction', 'Simplicity', 'All three...'],
      10: ['Everyday analogy', 'Technical metaphor', 'Visual simplification', 'Let me think...'],
      11: ['Flat Design / Modern', 'Isometric / 3D', 'Whiteboard style', 'Cartoon / Playful'],
      12: ['Yes, character as guide', 'No, graphics only', 'Maybe subtly', 'What fits better?'],
      13: ['Technical & precise', 'Playful & friendly', 'Business & clean', 'Let me describe...'],
      14: ['Bullet points & keywords', 'Process numbers', 'Minimal text', 'Data visualization'],
      15: ['Yes, subtle sounds', 'Crisp transitions', 'No, music only', 'What do you recommend?'],
      16: ['Try product', 'Learn more', 'Book demo', 'Get started'],
    },
    'event': {
      5: ['Conference / Summit', 'Product launch', 'Company party / Gala', 'Trade show / Expo'],
      6: ['Planned future event', 'Already happened', 'Recurring event', 'Let me describe...'],
      7: ['Recap / Summary', 'Teaser for next year', 'Documentation / Archive', 'Promotion / Advertising'],
      8: ['Keynote / Main speaker', 'Networking moments', 'Product reveal', 'Multiple highlights...'],
      9: ['Yes, introduce speakers', 'No, focus on atmosphere', 'Mix of both', 'Let me describe...'],
      10: ['Yes, participant voices', 'No, only images & music', 'Mix of interviews & music', 'What fits better?'],
      11: ['Yes, show behind-the-scenes', 'No, only finished event', 'Brief backstage peek', 'Let me describe...'],
      12: ['Excitement & energy', 'Professionalism & networking', 'Party & fun', 'Inspiration & learning'],
      13: ['Event colors & branding', 'Include sponsors', 'Own brand colors', 'Let me describe...'],
      14: ['Yes, drone flight', 'Time-lapse of setup', 'Slow-motion highlights', 'Standard perspectives'],
      15: ['Standing ovation / applause', 'Networking moment', 'Surprise reveal', 'Let me describe...'],
      16: ['Tickets for next year', 'Subscribe to newsletter', 'View gallery / photos', 'Follow on social media'],
    },
    'promo': {
      5: ['Product launch', 'Sale / Discount', 'Event announcement', 'Feature release'],
      6: ['In the next few days', 'In 2-4 weeks', 'No fixed date', 'Let me describe...'],
      7: ['Mystery / Hint', 'Direct announcement', 'Countdown reveal', 'Mix of both'],
      8: ['Revolutionary new', 'Best deal ever', 'Exclusive access', 'Let me formulate...'],
      9: ['Countdown timer', 'Step-by-step reveal', 'Teaser → Full reveal', 'Let me describe...'],
      10: ['Limited edition', 'Early access', 'Special price for first', 'No exclusivity'],
      11: ['Create FOMO', 'Build anticipation', 'Spark curiosity', 'Ignite excitement'],
      12: ['Product shot', 'Emotional moment', 'Surprise reveal', 'Let me describe...'],
      13: ['Quick cuts, dynamic', 'Slow build-up', 'Cinematic & epic', 'What fits better?'],
      14: ['Dramatic & epic', 'Electronic & modern', 'Upbeat & energetic', 'Let me describe...'],
      15: ['Big reveal at the end', 'Gradually unveil', 'Show at start, details follow', 'Let me describe...'],
      16: ['Start pre-order', 'Save the date', 'Visit link / website', 'Set reminder'],
    },
    'presentation': {
      5: ['Internal company meeting', 'Conference talk', 'Pitch deck / Investors', 'Let me describe...'],
      6: ['Convince investors', 'Train team', 'Inform customers', 'Pitch idea'],
      7: ['Convince & sell', 'Inform & train', 'Inspire & motivate', 'Let me explain...'],
      8: ['One clear main point', 'Let me formulate...', 'Not sure yet', 'Multiple key messages'],
      9: ['3 strong arguments', 'Data-driven evidence', 'Emotional arguments', 'Let me list...'],
      10: ['Yes, statistics & charts', 'Few but important numbers', 'No data', 'Let me describe...'],
      11: ['Yes, a success story', 'Multiple mini-cases', 'No, stay theoretical', 'Let me tell...'],
      12: ['Yes, narrative arc', 'No, fact-based', 'Light storytelling', 'What do you recommend?'],
      13: ['Charts & diagrams', 'Infographics', 'Illustrations', 'Mix of everything'],
      14: ['Speaker visible (PiP)', 'Voice-over only', 'No speaker, slides only', 'What fits better?'],
      15: ['Minimalist & clean', 'Data-rich & detailed', 'Visual & image-heavy', 'Corporate & professional'],
      16: ['Schedule meeting', 'Make decision', 'Learn more', 'Get in touch'],
    },
    'custom': {
      5: ['Let me describe...', 'Similar to an advertisement', 'Rather documentary', 'Completely free & creative'],
      6: ['Sell / Convert', 'Inform / Explain', 'Entertain / Excite', 'Let me explain...'],
      7: ['Yes, I have references', 'No, completely new', 'Similar to Apple/Nike style', 'Let me describe...'],
      8: ['Modern & minimalist', 'Cinematic & epic', 'Playful & colorful', 'Let me describe...'],
      9: ['Fully animated', 'Real footage', 'Mix of both', 'What do you recommend?'],
      10: ['Yes, character/speaker', 'No, visuals only', 'Maybe voice-over', 'Let me describe...'],
      11: ['Linear / chronological', 'Problem → Solution', 'Episodic / Chapters', 'Free & experimental'],
      12: ['Excitement & wow', 'Trust & security', 'Curiosity & interest', 'Let me describe...'],
      13: ['Yes, special effects', 'No, clean & simple', 'Subtle effects', 'Let me describe...'],
      14: ['Headlines & keywords', 'Bullet points', 'Minimal text', 'Let me describe...'],
      15: ['Yes, special sounds', 'Standard sound design', 'Music only', 'Let me describe...'],
      16: ['Visit website', 'Get in touch', 'Try product', 'Let me describe...'],
    },
  },
  es: {
    'advertisement': {
      5: ['Pérdida de tiempo e ineficiencia', 'Costos altos', 'Mala calidad', 'Déjame explicar...'],
      6: ['Frustración y estrés', 'Incertidumbre y duda', 'Agobio', 'Déjame describir...'],
      7: ['Alivio y ahorro de tiempo', 'Seguridad y confianza', 'Entusiasmo y orgullo', 'Déjame describir...'],
      8: ['Fácil de usar', 'Ahorro de tiempo', 'Mejor calidad', 'Los tres...'],
      9: ['500+ clientes satisfechos', 'Calificación de 4.9 estrellas', 'Premio conocido', 'Sin números concretos'],
      10: ['Herramientas complicadas', 'Demasiado caro', 'Mal soporte', 'Déjame explicar...'],
      11: ['Hacer pregunta provocadora', 'Declaración impactante', 'Mostrar problema visualmente', 'Tengo una idea...'],
      12: ['Muy caro → Mostrar ROI', 'Muy complejo → Demo', 'Sin confianza → Prueba social', 'Otras objeciones...'],
      13: ['Sí, descuento/oferta especial', 'Prueba gratuita', 'Material bonus incluido', 'Sin oferta especial'],
      14: ['Solo quedan X plazas', 'Oferta termina el...', 'Precio early-bird', 'Sin urgencia'],
      15: ['Sí, tengo una cita', 'Por favor escribe una', 'Varias voces de clientes', 'No necesito testimonial'],
      16: ['Comprar ahora + link', 'Probar gratis + demo', 'Más información + web', 'Reservar cita'],
    },
    'storytelling': {
      5: ['Horror / Thriller', 'Romance / Drama', 'Aventura / Acción', 'Documental / Real'],
      6: ['El fundador', 'Un cliente / usuario', 'El equipo completo', 'Un personaje ficticio'],
      7: ['Vida cotidiana normal', 'Ya problemática', 'Nostálgica, tiempos anteriores', 'Déjame describir...'],
      8: ['Crisis existencial', 'Problema técnico', 'Conflicto emocional', 'Déjame contar...'],
      9: ['Casi se rindió', 'Todo en juego', 'Colapso emocional', 'Sin punto bajo necesario'],
      10: ['Un descubrimiento / momento aha', 'Ayuda externa', 'Coraje y decisión', 'Déjame contar...'],
      11: ['Vida completamente nueva', 'Mejora gradual', 'Sanación emocional', 'Déjame describir...'],
      12: ['Esperanza e inspiración', 'Miedo y tensión', 'Alegría y nostalgia', 'Asombro y admiración'],
      13: ['Metáforas de naturaleza', 'Metáfora de viaje/camino', 'Luz y oscuridad', 'Déjame describir...'],
      14: ['Construcción lenta → Clímax', 'Acción inmediata, luego calma', 'Emoción uniforme', 'Alternante (rápido/lento)'],
      15: ['Números y hechos reales', 'Detalles personales', 'Citas originales', 'Déjame contar...'],
      16: ['Final feliz con CTA', 'Final abierto (reflexivo)', 'Cliffhanger (serie)', 'Giro sorprendente'],
    },
    'tutorial': {
      5: ['Explicar una función de software', 'Guía práctica', 'Concepto / teoría', 'Déjame describir...'],
      6: ['Principiantes (sin experiencia)', 'Intermedios', 'Expertos', 'Audiencia mixta'],
      7: ['Conceptos básicos del tema', 'Herramientas específicas instaladas', 'Conocimiento del sector', 'Sin requisitos previos'],
      8: ['Dominar habilidad específica', 'Ejecutar proceso uno mismo', 'Entender concepto', 'Déjame explicar...'],
      9: ['3-5 pasos claros', '5-10 pasos con capítulos', 'Explicación libre', 'Déjame estructurar...'],
      10: ['Los 3 errores más comunes', 'Un error crítico', 'Varios obstáculos', 'Sin errores típicos'],
      11: ['Atajos para ahorrar tiempo', 'Funciones ocultas', 'Mejores prácticas', 'Sin tips pro necesarios'],
      12: ['Software/App', 'Herramientas/Material', 'Solo conocimiento', 'Déjame listar...'],
      13: ['Grabación de pantalla', 'Animación y gráficos', 'Estilo pizarra', 'Mix de todo'],
      14: ['Pasos numerados', 'Resaltar palabras clave', 'Flechas y marcadores', 'Textos mínimos'],
      15: ['Sí, pausas para practicar', 'No, continuo', 'Quiz al final', 'Ejercicio'],
      16: ['Recomendar siguiente tutorial', 'Links de recursos', 'Unirse a comunidad', 'Probar producto'],
    },
    'product-video': {
      5: ['Producto físico', 'Software / App', 'Hardware / Dispositivo', 'Déjame describir...'],
      6: ['Ahorro de tiempo', 'Reducción de costos', 'Mejora de calidad', 'Déjame explicar...'],
      7: ['3 características fuertes', 'Una característica estrella', 'Specs técnicos', 'Déjame listar...'],
      8: ['Segmento premium', 'Gama media', 'Económico', 'Mejor relación calidad-precio'],
      9: ['En la oficina / trabajo', 'En casa / privado', 'En movimiento / móvil', 'Varios escenarios...'],
      10: ['Mejora dramática', 'Optimización gradual', 'Workflow completamente nuevo', 'Déjame describir...'],
      11: ['4.9 estrellas, 500+ reseñas', 'Marcas conocidas como clientes', 'Ganador de premios', 'Sin reseñas aún'],
      12: ['Claramente mejor que X', 'Característica única', 'Mejor precio', 'Déjame comparar...'],
      13: ['Vista 360° del producto', 'Detalles close-up', 'Producto en acción', 'Estilo unboxing'],
      14: ['Mostrar en vida real', 'Entorno estilizado', 'Minimalista, solo producto', 'Déjame describir...'],
      15: ['Pregunta provocadora', 'Mostrar problema visualmente', 'Efecto wow del producto', 'Tengo una idea...'],
      16: ['Comprar ahora', 'Probar gratis', 'Más información', 'Solicitar demo'],
    },
    'corporate': {
      5: ['Reclutamiento / Employer branding', 'Video institucional', 'Pitch inversores', 'Presentación general'],
      6: ['Larga tradición (10+ años)', 'Startup / joven y dinámico', 'Empresa familiar', 'Déjame contar...'],
      7: ['Mejorar el mundo', 'Revolucionar el sector', 'Hacer felices a los clientes', 'Déjame explicar...'],
      8: ['Innovación y progreso', 'Calidad y confiabilidad', 'Espíritu de equipo y unión', 'Déjame listar...'],
      9: ['Liderazgo de mercado', 'Crecimiento rápido', 'Productos innovadores', 'Déjame contar...'],
      10: ['Dirección', 'Varios miembros del equipo', 'Nadie específico', 'Todo el equipo'],
      11: ['Ambiente familiar', 'Cultura de alto rendimiento', 'Creativo y relajado', 'Déjame describir...'],
      12: ['Mostrar sede principal', 'Varias ubicaciones', 'Remoto / Digital', 'Déjame describir...'],
      13: ['Sí, incluir voces de clientes', 'Declaraciones de socios', 'No, enfoque interno', 'Quizás sutilmente'],
      14: ['Sí, sostenibilidad es importante', 'Proyectos sociales', 'No relevante', 'Déjame explicar...'],
      15: ['Serio y confiable', 'Moderno e innovador', 'Cercano y auténtico', 'Inspirador y visionario'],
      16: ['Postularse ahora', 'Contactar', 'Visitar web', 'Seguir en redes sociales'],
    },
    'social-content': {
      5: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Varias plataformas'],
      6: ['Tendencia / Viral', 'Educativo / Tips', 'Entretenimiento / Diversión', 'Behind-the-Scenes'],
      7: ['Pregunta provocadora', 'Dato inesperado', 'Efecto visual wow', 'Tengo una idea...'],
      8: ['Problema → Solución', 'Pregunta → Respuesta', 'Expectativa → Realidad', 'Antes → Después'],
      9: ['Bold y grande', 'Manuscrito', 'Mínimo / sin texto', 'Animado y dinámico'],
      10: ['Sí, usar tendencia actual', 'Música/sonido propio', 'Audio trending', 'Sin tendencia específica'],
      11: ['3-5 hashtags relevantes', 'Conozco mis hashtags', 'Sugiere por favor', 'Sin hashtags'],
      12: ['Comentar (hacer pregunta)', 'Compartir (etiquetar amigos)', 'Seguir para más', 'Hacer clic en link'],
      13: ['Sí, formato recurrente', 'No, video individual', 'Quizás como serie', 'Aún no seguro'],
      14: ['Muy rápido (cortes de 1s)', 'Medio (cortes de 2-3s)', 'Más tranquilo', 'Alternante'],
      15: ['Subtítulos animados', 'Subtítulos estáticos', 'Sin subtítulos', '¿Qué recomiendas?'],
      16: ['Seguir para más', 'Link en bio', 'Dejar comentario', 'Compartir video'],
    },
    'testimonial': {
      5: ['Cliente / Usuario', 'Socio comercial', 'Empleado', 'Déjame describir...'],
      6: ['Cliente a largo plazo (2+ años)', 'Cliente nuevo con experiencia wow', 'Socio/Empleado', 'Déjame describir...'],
      7: ['Frustrado con soluciones anteriores', 'Buscando algo mejor', 'Escéptico ante lo nuevo', 'Déjame contar...'],
      8: ['Recomendación de amigos', 'Investigación online', 'La competencia era mala', 'Déjame explicar...'],
      9: ['Fluido y fácil', 'Sorprendentemente bueno', 'Con curva de aprendizaje pero positivo', 'Déjame describir...'],
      10: ['50%+ ahorro de tiempo', 'Reducción significativa de costos', 'Resultados de mejor calidad', 'Déjame compartir números...'],
      11: ['Aliviado y feliz', 'Entusiasmado y orgulloso', 'Seguro y relajado', 'Déjame describir...'],
      12: ['Ahorro de tiempo inesperado', 'Gran soporte', 'Sentimiento de comunidad', 'Déjame contar...'],
      13: ['Sí, tengo una cita real', 'Por favor escribe una', 'Varias citas disponibles', 'Déjame pensar...'],
      14: ['¡Absolutamente, a todos!', 'A audiencia específica', 'Sí, con reservas', 'Déjame explicar...'],
      15: ['Profesional en oficina', 'Casual / Auténtico', 'Neutral / Estudio', 'Déjame describir...'],
      16: ['Probar producto', 'Reservar cita', 'Visitar web', 'Solicitar demo'],
    },
    'explainer': {
      5: ['Un producto / una app', 'Un proceso / workflow', 'Un concepto / idea', 'Déjame describir...'],
      6: ['Muy complejo, necesita simplificación', 'Dificultad media', 'Realmente simple, solo hay que mostrarlo', 'Déjame evaluar...'],
      7: ['Pérdida de tiempo / ineficiencia', 'Falta de comprensión', 'Proceso complicado', 'Déjame explicar...'],
      8: ['3 pasos simples', '5+ pasos con detalles', 'Un proceso fluido', 'Déjame describir...'],
      9: ['Ahorro de tiempo', 'Reducción de costos', 'Simplicidad', 'Los tres...'],
      10: ['Analogía cotidiana', 'Metáfora técnica', 'Simplificación visual', 'Déjame pensar...'],
      11: ['Flat Design / Moderno', 'Isométrico / 3D', 'Estilo pizarra', 'Cartoon / Divertido'],
      12: ['Sí, personaje como guía', 'No, solo gráficos', 'Quizás sutilmente', '¿Qué encaja mejor?'],
      13: ['Técnico y preciso', 'Divertido y amigable', 'Business y limpio', 'Déjame describir...'],
      14: ['Viñetas y palabras clave', 'Números de proceso', 'Texto mínimo', 'Visualización de datos'],
      15: ['Sí, sonidos sutiles', 'Transiciones nítidas', 'No, solo música', '¿Qué recomiendas?'],
      16: ['Probar producto', 'Más información', 'Reservar demo', 'Empezar ahora'],
    },
    'event': {
      5: ['Conferencia / Summit', 'Lanzamiento de producto', 'Fiesta de empresa / Gala', 'Feria / Expo'],
      6: ['Evento futuro planificado', 'Ya ocurrió', 'Evento recurrente', 'Déjame describir...'],
      7: ['Resumen / Recap', 'Teaser para el próximo año', 'Documentación / Archivo', 'Promoción / Publicidad'],
      8: ['Keynote / Ponente principal', 'Momentos de networking', 'Revelación de producto', 'Varios highlights...'],
      9: ['Sí, presentar ponentes', 'No, enfoque en atmósfera', 'Mix de ambos', 'Déjame describir...'],
      10: ['Sí, voces de participantes', 'No, solo imágenes y música', 'Mix de entrevistas y música', '¿Qué encaja mejor?'],
      11: ['Sí, mostrar behind-the-scenes', 'No, solo evento terminado', 'Breve vistazo al backstage', 'Déjame describir...'],
      12: ['Emoción y energía', 'Profesionalismo y networking', 'Fiesta y diversión', 'Inspiración y aprendizaje'],
      13: ['Colores y branding del evento', 'Incluir patrocinadores', 'Colores propios de marca', 'Déjame describir...'],
      14: ['Sí, vuelo de drone', 'Time-lapse del montaje', 'Highlights en cámara lenta', 'Perspectivas estándar'],
      15: ['Ovación de pie / aplausos', 'Momento de networking', 'Revelación sorpresa', 'Déjame describir...'],
      16: ['Entradas para el próximo año', 'Suscribirse al newsletter', 'Ver galería / fotos', 'Seguir en redes sociales'],
    },
    'promo': {
      5: ['Lanzamiento de producto', 'Oferta / Descuento', 'Anuncio de evento', 'Lanzamiento de función'],
      6: ['En los próximos días', 'En 2-4 semanas', 'Sin fecha fija', 'Déjame describir...'],
      7: ['Misterio / Insinuación', 'Anuncio directo', 'Countdown reveal', 'Mix de ambos'],
      8: ['Revolucionariamente nuevo', 'Mejor oferta', 'Acceso exclusivo', 'Déjame formular...'],
      9: ['Temporizador countdown', 'Reveal paso a paso', 'Teaser → Reveal completo', 'Déjame describir...'],
      10: ['Edición limitada', 'Acceso anticipado', 'Precio especial primeros', 'Sin exclusividad'],
      11: ['Crear FOMO', 'Construir anticipación', 'Despertar curiosidad', 'Encender entusiasmo'],
      12: ['Toma de producto', 'Momento emocional', 'Revelación sorpresa', 'Déjame describir...'],
      13: ['Cortes rápidos, dinámico', 'Build-up lento', 'Cinemático y épico', '¿Qué encaja mejor?'],
      14: ['Dramático y épico', 'Electrónico y moderno', 'Upbeat y enérgico', 'Déjame describir...'],
      15: ['Gran reveal al final', 'Revelar gradualmente', 'Mostrar al inicio, detalles después', 'Déjame describir...'],
      16: ['Iniciar pre-order', 'Save the date', 'Visitar link / web', 'Activar recordatorio'],
    },
    'presentation': {
      5: ['Reunión interna de empresa', 'Charla de conferencia', 'Pitch deck / Inversores', 'Déjame describir...'],
      6: ['Convencer inversores', 'Capacitar equipo', 'Informar clientes', 'Presentar idea'],
      7: ['Convencer y vender', 'Informar y capacitar', 'Inspirar y motivar', 'Déjame explicar...'],
      8: ['Un punto principal claro', 'Déjame formular...', 'Aún no seguro', 'Varios mensajes clave'],
      9: ['3 argumentos fuertes', 'Evidencia basada en datos', 'Argumentos emocionales', 'Déjame listar...'],
      10: ['Sí, estadísticas y gráficos', 'Pocos pero importantes números', 'Sin datos', 'Déjame describir...'],
      11: ['Sí, una historia de éxito', 'Varios mini-casos', 'No, mantener teórico', 'Déjame contar...'],
      12: ['Sí, arco narrativo', 'No, basado en hechos', 'Storytelling ligero', '¿Qué recomiendas?'],
      13: ['Gráficos y diagramas', 'Infografías', 'Ilustraciones', 'Mix de todo'],
      14: ['Presentador visible (PiP)', 'Solo voz en off', 'Sin presentador, solo slides', '¿Qué encaja mejor?'],
      15: ['Minimalista y limpio', 'Rico en datos y detallado', 'Visual y con mucha imagen', 'Corporativo y profesional'],
      16: ['Agendar reunión', 'Tomar decisión', 'Más información', 'Contactar'],
    },
    'custom': {
      5: ['Déjame describir...', 'Similar a un anuncio', 'Más documental', 'Completamente libre y creativo'],
      6: ['Vender / Convertir', 'Informar / Explicar', 'Entretener / Emocionar', 'Déjame explicar...'],
      7: ['Sí, tengo referencias', 'No, completamente nuevo', 'Similar al estilo Apple/Nike', 'Déjame describir...'],
      8: ['Moderno y minimalista', 'Cinemático y épico', 'Divertido y colorido', 'Déjame describir...'],
      9: ['Completamente animado', 'Footage real', 'Mix de ambos', '¿Qué recomiendas?'],
      10: ['Sí, personaje/narrador', 'No, solo visuales', 'Quizás voz en off', 'Déjame describir...'],
      11: ['Lineal / cronológico', 'Problema → Solución', 'Episódico / Capítulos', 'Libre y experimental'],
      12: ['Emoción y wow', 'Confianza y seguridad', 'Curiosidad e interés', 'Déjame describir...'],
      13: ['Sí, efectos especiales', 'No, limpio y simple', 'Efectos sutiles', 'Déjame describir...'],
      14: ['Titulares y palabras clave', 'Viñetas', 'Texto mínimo', 'Déjame describir...'],
      15: ['Sí, sonidos especiales', 'Diseño de sonido estándar', 'Solo música', 'Déjame describir...'],
      16: ['Visitar web', 'Contactar', 'Probar producto', 'Déjame describir...'],
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// Build full 22-phase array for a category
// ═══════════════════════════════════════════════════════════════

function buildCategoryPhases(category: string, lang: Lang, messages?: any[]): string[] {
  const block1 = getBlock1Phases(category, lang, messages);
  const specific = getBlock2Phases(category, lang, messages);
  return [...block1, ...specific, ...UNIVERSAL_PHASES_BLOCK3[lang]];
}

// Category display names per language
const CATEGORY_NAMES: Record<Lang, Record<string, string>> = {
  de: {
    'advertisement': 'Werbevideo', 'storytelling': 'Brand Story', 'tutorial': 'Tutorial/How-To',
    'product-video': 'Produktvideo', 'corporate': 'Unternehmensfilm', 'social-content': 'Social Media Content',
    'testimonial': 'Testimonial Video', 'explainer': 'Erklärvideo', 'event': 'Event Video',
    'promo': 'Promo/Teaser', 'presentation': 'Präsentation Video', 'custom': 'Custom Video',
  },
  en: {
    'advertisement': 'Advertisement', 'storytelling': 'Brand Story', 'tutorial': 'Tutorial/How-To',
    'product-video': 'Product Video', 'corporate': 'Corporate Film', 'social-content': 'Social Media Content',
    'testimonial': 'Testimonial Video', 'explainer': 'Explainer Video', 'event': 'Event Video',
    'promo': 'Promo/Teaser', 'presentation': 'Presentation Video', 'custom': 'Custom Video',
  },
  es: {
    'advertisement': 'Video Publicitario', 'storytelling': 'Historia de Marca', 'tutorial': 'Tutorial/How-To',
    'product-video': 'Video de Producto', 'corporate': 'Video Corporativo', 'social-content': 'Contenido Social Media',
    'testimonial': 'Video Testimonial', 'explainer': 'Video Explicativo', 'event': 'Video de Evento',
    'promo': 'Promo/Teaser', 'presentation': 'Video de Presentación', 'custom': 'Video Personalizado',
  },
};

const getCategoryConfig = (category: string, lang: Lang) => {
  const phases = buildCategoryPhases(category, lang);
  const name = CATEGORY_NAMES[lang][category] || 'Custom Video';
  return { name, phases };
};

// Localized system prompt
const getCategorySystemPrompt = (category: string, mode: string, currentPhase: number, lang: Lang): string => {
  const cat = getCategoryConfig(category, lang);
  const totalPhases = 22;

  const blockLabels: Record<Lang, [string, string, string]> = {
    de: ['ZWECK & KONTEXT', 'KATEGORIE-SPEZIFISCH', 'PRODUKTION'],
    en: ['PURPOSE & CONTEXT', 'CATEGORY-SPECIFIC', 'PRODUCTION'],
    es: ['PROPÓSITO Y CONTEXTO', 'ESPECÍFICO DE CATEGORÍA', 'PRODUCCIÓN'],
  };

  const labels = blockLabels[lang];
  let blockInfo = '';
  if (currentPhase <= 4) {
    blockInfo = `BLOCK 1: ${labels[0]}`;
  } else if (currentPhase <= 16) {
    blockInfo = `BLOCK 2: ${labels[1]} (${cat.name})`;
  } else {
    blockInfo = `BLOCK 3: ${labels[2]}`;
  }

  const categoryRoles: Record<string, Record<Lang, string>> = {
    'storytelling': {
      de: 'Du bist Max, ein erfahrener Geschichtenerzähler, Drehbuchautor und Kreativdirektor. Du erstellst eine GESCHICHTE — KEINE Werbung, keinen Marketing-Content.',
      en: 'You are Max, an experienced storyteller, screenwriter and creative director. You are creating a STORY — NOT an advertisement, not marketing content.',
      es: 'Eres Max, un experimentado narrador, guionista y director creativo. Estás creando una HISTORIA — NO un anuncio, no contenido de marketing.',
    },
    'tutorial': {
      de: 'Du bist Max, ein erfahrener Bildungs-Content-Experte und Tutorial-Spezialist. Du erstellst ein TUTORIAL — konzentriere dich auf Wissensvermittlung und Lernziele.',
      en: 'You are Max, an experienced educational content expert and tutorial specialist. You are creating a TUTORIAL — focus on knowledge transfer and learning goals.',
      es: 'Eres Max, un experimentado experto en contenido educativo y especialista en tutoriales. Estás creando un TUTORIAL — enfócate en transmitir conocimiento y objetivos de aprendizaje.',
    },
    'corporate': {
      de: 'Du bist Max, ein erfahrener Corporate-Film-Regisseur und Unternehmenskommunikations-Experte. Du erstellst einen UNTERNEHMENSFILM — fokussiere auf Werte, Kultur und Authentizität.',
      en: 'You are Max, an experienced corporate film director and communications expert. You are creating a CORPORATE FILM — focus on values, culture and authenticity.',
      es: 'Eres Max, un experimentado director de cine corporativo y experto en comunicación empresarial. Estás creando un VIDEO CORPORATIVO — enfócate en valores, cultura y autenticidad.',
    },
    'testimonial': {
      de: 'Du bist Max, ein erfahrener Testimonial-Produzent und Interview-Spezialist. Du erstellst ein TESTIMONIAL-VIDEO — fokussiere auf die authentische Erfahrung und emotionale Transformation.',
      en: 'You are Max, an experienced testimonial producer and interview specialist. You are creating a TESTIMONIAL VIDEO — focus on authentic experience and emotional transformation.',
      es: 'Eres Max, un experimentado productor de testimonios y especialista en entrevistas. Estás creando un VIDEO TESTIMONIAL — enfócate en la experiencia auténtica y la transformación emocional.',
    },
    'explainer': {
      de: 'Du bist Max, ein erfahrener Erklärvideo-Experte und visueller Kommunikator. Du erstellst ein ERKLÄRVIDEO — fokussiere auf Klarheit, Vereinfachung und visuelle Metaphern.',
      en: 'You are Max, an experienced explainer video expert and visual communicator. You are creating an EXPLAINER VIDEO — focus on clarity, simplification and visual metaphors.',
      es: 'Eres Max, un experimentado experto en videos explicativos y comunicador visual. Estás creando un VIDEO EXPLICATIVO — enfócate en claridad, simplificación y metáforas visuales.',
    },
    'event': {
      de: 'Du bist Max, ein erfahrener Event-Filmer und Atmosphäre-Spezialist. Du erstellst ein EVENT-VIDEO — fokussiere auf Highlights, Stimmung und besondere Momente.',
      en: 'You are Max, an experienced event filmmaker and atmosphere specialist. You are creating an EVENT VIDEO — focus on highlights, mood and special moments.',
      es: 'Eres Max, un experimentado cineasta de eventos y especialista en atmósfera. Estás creando un VIDEO DE EVENTO — enfócate en highlights, ambiente y momentos especiales.',
    },
    'social-content': {
      de: 'Du bist Max, ein erfahrener Social-Media-Content-Creator und Trend-Experte. Du erstellst SOCIAL MEDIA CONTENT — fokussiere auf Scroll-Stopper, Plattform-Trends und Community-Engagement.',
      en: 'You are Max, an experienced social media content creator and trend expert. You are creating SOCIAL MEDIA CONTENT — focus on scroll stoppers, platform trends and community engagement.',
      es: 'Eres Max, un experimentado creador de contenido social media y experto en tendencias. Estás creando CONTENIDO SOCIAL MEDIA — enfócate en scroll stoppers, tendencias de plataforma y engagement.',
    },
    'promo': {
      de: 'Du bist Max, ein erfahrener Promo-Spezialist und Launch-Stratege. Du erstellst ein PROMO/TEASER-VIDEO — fokussiere auf Spannung, Reveal und Dringlichkeit.',
      en: 'You are Max, an experienced promo specialist and launch strategist. You are creating a PROMO/TEASER VIDEO — focus on suspense, reveal and urgency.',
      es: 'Eres Max, un experimentado especialista en promos y estratega de lanzamientos. Estás creando un VIDEO PROMO/TEASER — enfócate en suspense, revelación y urgencia.',
    },
    'presentation': {
      de: 'Du bist Max, ein erfahrener Präsentations-Coach und Pitch-Experte. Du erstellst ein PRÄSENTATIONSVIDEO — fokussiere auf überzeugende Argumente, Datenvisualisierung und klare Struktur.',
      en: 'You are Max, an experienced presentation coach and pitch expert. You are creating a PRESENTATION VIDEO — focus on compelling arguments, data visualization and clear structure.',
      es: 'Eres Max, un experimentado coach de presentaciones y experto en pitch. Estás creando un VIDEO DE PRESENTACIÓN — enfócate en argumentos convincentes, visualización de datos y estructura clara.',
    },
  };

  const defaultRole: Record<Lang, string> = {
    de: 'Du bist Max, ein erfahrener Video-Stratege und Kreativdirektor.',
    en: 'You are Max, an experienced video strategist and creative director.',
    es: 'Eres Max, un experimentado estratega de video y director creativo.',
  };

  const role = categoryRoles[category]?.[lang] || defaultRole[lang];

  const langInstructions: Record<Lang, { respondIn: string; forbidden: string[]; modeLabel: string }> = {
    de: {
      respondIn: 'Antworte IMMER auf Deutsch',
      forbidden: ['Also ich habe', 'Ich habe', 'Also...'],
      modeLabel: mode === 'full-service' ? 'Full-Service (KI erstellt alles automatisch nach Briefing)' : 'Manuell (Nutzer hat volle Kontrolle)',
    },
    en: {
      respondIn: 'ALWAYS respond in English',
      forbidden: ['So I have', 'I have', 'So...'],
      modeLabel: mode === 'full-service' ? 'Full-Service (AI creates everything automatically from briefing)' : 'Manual (user has full control)',
    },
    es: {
      respondIn: 'Responde SIEMPRE en español',
      forbidden: ['Entonces yo tengo', 'Yo tengo', 'Entonces...'],
      modeLabel: mode === 'full-service' ? 'Full-Service (La IA crea todo automáticamente del briefing)' : 'Manual (usuario tiene control total)',
    },
  };

  const li = langInstructions[lang];

  let phaseInstructions = '';
  if (currentPhase < 22) {
    const nextPhases = cat.phases.slice(currentPhase, currentPhase + 3).map((p: string, i: number) => `- Phase ${currentPhase + i + 1}: ${p}`).join('\n');
    phaseInstructions = `Phase ${currentPhase}/22. ${blockInfo}\nCurrent question: "${cat.phases[currentPhase - 1] || ''}"\n\nNext:\n${nextPhases}`;
  } else {
    phaseInstructions = lang === 'de' 
      ? 'Phase 22/22 - FINALE ZUSAMMENFASSUNG! Fasse ALLE gesammelten Informationen zusammen.'
      : lang === 'es'
      ? 'Fase 22/22 - ¡RESUMEN FINAL! Resume TODA la información recopilada.'
      : 'Phase 22/22 - FINAL SUMMARY! Summarize ALL collected information.';
  }

  return `${role}
${li.respondIn}

INTERVIEW STRUCTURE (3 Blocks):
BLOCK 1 — ${labels[0]} (Phase 1-4):
${cat.phases.slice(0, 4).map((p: string, i: number) => `  ${i + 1}. ${p}`).join('\n')}

BLOCK 2 — ${labels[1]} ${cat.name.toUpperCase()} (Phase 5-16):
${cat.phases.slice(4, 16).map((p: string, i: number) => `  ${i + 5}. ${p}`).join('\n')}

BLOCK 3 — ${labels[2]} (Phase 17-22):
${cat.phases.slice(16).map((p: string, i: number) => `  ${i + 17}. ${p}`).join('\n')}

${phaseInstructions}

RULES:
- Complete ALL 22 phases — NO exceptions
- Ask only ONE question per message
- Move to next phase only when current one is answered
- Use emojis sparingly (🎬 🎯 🎨 💡)

RESPONSE FORMAT (ALWAYS JSON):
{
  "message": "Your message with summary + next question",
  "quickReplies": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "currentPhase": ${currentPhase},
  "isComplete": ${currentPhase >= 22}
}

Mode: ${li.modeLabel}`;
};

// Calculate progress and current phase
const calculatePhaseInfo = (messages: any[]) => {
  const userMessages = messages.filter((m: any) => m.role === 'user').length;
  const currentPhase = Math.min(userMessages + 1, 22);
  const progress = Math.round((userMessages / 22) * 100);
  return { currentPhase, progress: Math.min(progress, 100) };
};

// Generate phase-specific quick replies (category-aware, language-aware)
function generateQuickReplies(phase: number, category: string, lang: Lang): string[] {
  const fallback: Record<Lang, string[]> = {
    de: ['Ja, genau so', 'Lass mich erklären...', 'Weiter', 'Ich brauche Hilfe'],
    en: ['Yes, exactly', 'Let me explain...', 'Continue', 'I need help'],
    es: ['Sí, exactamente', 'Déjame explicar...', 'Continuar', 'Necesito ayuda'],
  };

  if (phase >= 1 && phase <= 4) {
    const catBlock1 = CATEGORY_QUICK_REPLIES_BLOCK1[lang][category];
    if (catBlock1 && catBlock1[phase]) {
      return catBlock1[phase];
    }
    return CATEGORY_QUICK_REPLIES_BLOCK1[lang]['custom']?.[phase] || fallback[lang];
  }
  
  if (phase >= 5 && phase <= 16) {
    const catReplies = CATEGORY_QUICK_REPLIES[lang][category];
    if (catReplies && catReplies[phase]) {
      return catReplies[phase];
    }
    const customReplies = CATEGORY_QUICK_REPLIES[lang]['custom'];
    return customReplies?.[phase] || fallback[lang];
  }
  
  if (phase >= 17 && phase <= 22) {
    return UNIVERSAL_QUICK_REPLIES_BLOCK3[lang][phase] || fallback[lang];
  }
  
  return fallback[lang];
}

// ═══════════════════════════════════════════════════════════════
// ROBUST SEMANTIC EXTRACTION (replaces fragile index-based)
// ═══════════════════════════════════════════════════════════════

const extractRecommendation = (messages: any[], category: string) => {
  const userResponses = messages.filter((m: any) => m.role === 'user').map((m: any) => m.content);
  const aiMessages = messages.filter((m: any) => m.role === 'assistant').map((m: any) => m.content);
  const allText = [...userResponses, ...aiMessages].join(' ');
  const allTextLower = allText.toLowerCase();
  
  const findResponse = (keywords: string[]): string => {
    for (let i = 0; i < aiMessages.length; i++) {
      const aiMsg = (aiMessages[i] || '').toLowerCase();
      if (keywords.some(k => aiMsg.includes(k))) {
        return userResponses[i] || userResponses[i - 1] || '';
      }
    }
    return '';
  };
  
  const extractUrl = (text: string): string => {
    const urlMatch = text.match(/(?:https?:\/\/|www\.)[^\s,;)]+/i);
    return urlMatch ? urlMatch[0] : '';
  };
  
  // Extract format/aspect ratio (multilingual keywords)
  const formatResponse = findResponse(['format', '16:9', '9:16', '1:1', 'plattform', 'platform', 'plataforma']);
  const aspectRatio = formatResponse.includes('9:16') ? '9:16' 
    : formatResponse.includes('1:1') ? '1:1'
    : formatResponse.includes('4:5') ? '4:5'
    : '16:9';
  
  // Extract duration (multilingual)
  const durationResponse = findResponse(['länge', 'length', 'duración', 'sekunden', 'seconds', 'segundos', 'dauer', 'duration', 'lang soll', 'videolänge']);
  const durationMatch = durationResponse.match(/(\d+)\s*(sekunde|minute|min|sec|s\b|segundo)/i);
  let duration = 60;
  if (durationMatch) {
    const num = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    duration = (unit.startsWith('min') || unit === 'minute') ? num * 60 : num;
  } else if (durationResponse.includes('30')) duration = 30;
  else if (durationResponse.includes('90')) duration = 90;
  else if (durationResponse.includes('120') || durationResponse.includes('2 min')) duration = 120;

  // Semantic extraction (multilingual keywords)
  const zweck = findResponse(['zweck', 'ziel', 'wofür', 'warum', 'purpose', 'goal', 'propósito', 'objetivo']) || userResponses[0] || '';
  const zielgruppe = findResponse(['zielgruppe', 'publikum', 'audience', 'für wen', 'público', 'target']) || userResponses[1] || '';
  const produkt = findResponse(['produkt', 'service', 'tool', 'angebot', 'dienstleistung', 'unternehmen', 'firma', 'product', 'company', 'producto', 'empresa']) || userResponses[2] || '';
  const usp = findResponse(['usp', 'alleinstellung', 'besonder', 'unterscheid', 'vorteil', 'unique', 'advantage', 'único', 'ventaja']) || userResponses[3] || '';
  
  const companyName = findResponse(['unternehmen', 'firma', 'marke', 'brand', 'company', 'empresa', 'marca']).substring(0, 100);
  const productName = findResponse(['produkt', 'service', 'tool', 'angebot', 'dienstleistung', 'name', 'product', 'producto']).substring(0, 100);
  const websiteUrl = extractUrl(allText);
  
  const categoryResponses = userResponses.slice(4, 16);
  
  const styleResponse = findResponse(['stil', 'visuell', 'design', 'aussehen', 'ästhetik', 'style', 'visual', 'estilo']);
  const visualStyle = styleResponse || 'modern';
  
  const toneResponse = findResponse(['tonalität', 'ton ', 'stimmung', 'voice-over', 'tone', 'mood', 'tono', 'voz']);
  const tone = toneResponse || 'professional';
  
  const colorResponse = findResponse(['farbe', 'color', 'hex', 'markenfarben', 'brand', 'colores', 'marca']);
  const hookResponse = findResponse(['hook', 'einstieg', 'anfang', 'ersten sekunden', 'scroll', 'first seconds', 'primeros segundos']);
  const ctaResponse = findResponse(['cta', 'call to action', 'handlung', 'am ende tun', 'finale', 'action', 'acción']);
  const emotionResponse = findResponse(['emotion', 'gefühl', 'fühlen', 'stimmung', 'feeling', 'emoción', 'sentir']);
  
  console.log(`[extractRecommendation] companyName="${companyName}", productName="${productName}", websiteUrl="${websiteUrl}"`);
  
  return {
    purpose: zweck.substring(0, 200),
    productSummary: `${produkt} ${usp}`.substring(0, 500),
    companyName: companyName || productName || '',
    productName: productName || companyName || '',
    websiteUrl,
    targetAudience: zielgruppe ? [zielgruppe.substring(0, 200)] : ['Allgemein'],
    usp: usp.substring(0, 200),
    categoryInsights: categoryResponses.filter(Boolean).join(' | ').substring(0, 1000),
    painPoints: findResponse(['problem', 'pain', 'herausforderung', 'frustration', 'löst', 'challenge', 'dolor']).substring(0, 200),
    emotionalHook: emotionResponse.substring(0, 100) || 'Interesse wecken',
    visualStyle: visualStyle.substring(0, 100),
    tone: tone.substring(0, 100),
    brandColors: colorResponse.substring(0, 100),
    duration,
    videoDuration: duration,
    format: aspectRatio,
    aspectRatio,
    outputFormats: [aspectRatio],
    hookIdea: hookResponse.substring(0, 200),
    ctaText: ctaResponse.substring(0, 100) || 'Mehr erfahren',
    category
  };
};

// Compress context for later phases to avoid timeout
function compressContext(messages: any[], currentPhase: number): any[] {
  if (currentPhase <= 12 || messages.length <= 15) {
    return messages;
  }
  
  const firstMessages = messages.slice(0, 3);
  const lastMessages = messages.slice(-8);
  
  const middleMessages = messages.slice(3, -8);
  const userMiddleResponses = middleMessages
    .filter((m: any) => m.role === 'user')
    .map((m: any) => m.content)
    .join(' | ');
  
  const summaryMessage = {
    role: 'system',
    content: `[SUMMARY of previous answers: ${userMiddleResponses.substring(0, 500)}...]`
  };
  
  console.log(`[universal-video-consultant] Compressed ${messages.length} messages to ${firstMessages.length + 1 + lastMessages.length} for phase ${currentPhase}`);
  
  return [...firstMessages, summaryMessage, ...lastMessages];
}

// Parse SSE stream and collect full content
async function parseSSEStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data: ')) continue;
      
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
        }
      } catch {
        // Incomplete JSON, ignore
      }
    }
  }
  
  return fullContent;
}

// Error messages per language
const ERROR_MESSAGES: Record<Lang, { rateLimited: string; creditsExhausted: string; genericError: string; retry: string; skip: string; rechargeCredits: string }> = {
  de: {
    rateLimited: 'Entschuldigung, ich bin gerade etwas überlastet. Bitte versuche es in einer Minute erneut. 🕐',
    creditsExhausted: 'Die Credits sind aufgebraucht. Bitte lade dein Konto auf.',
    genericError: 'Entschuldigung, es gab einen technischen Fehler. Bitte versuche es erneut. 🔧',
    retry: 'Erneut versuchen',
    skip: 'Beratung überspringen',
    rechargeCredits: 'Credits aufladen',
  },
  en: {
    rateLimited: 'Sorry, I\'m a bit overloaded right now. Please try again in a minute. 🕐',
    creditsExhausted: 'Credits exhausted. Please recharge your account.',
    genericError: 'Sorry, there was a technical error. Please try again. 🔧',
    retry: 'Try again',
    skip: 'Skip consultation',
    rechargeCredits: 'Recharge credits',
  },
  es: {
    rateLimited: 'Lo siento, estoy un poco sobrecargado. Por favor intenta de nuevo en un minuto. 🕐',
    creditsExhausted: 'Créditos agotados. Por favor recarga tu cuenta.',
    genericError: 'Lo siento, hubo un error técnico. Por favor intenta de nuevo. 🔧',
    retry: 'Intentar de nuevo',
    skip: 'Saltar consulta',
    rechargeCredits: 'Recargar créditos',
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { messages, category, mode, language } = await req.json();
    const lang: Lang = (language === 'en' || language === 'es') ? language : 'de';
    const errors = ERROR_MESSAGES[lang];
    
    const { currentPhase, progress } = calculatePhaseInfo(messages);
    
    console.log(`[universal-video-consultant] Category: ${category}, Mode: ${mode}, Phase: ${currentPhase}/22, Progress: ${progress}%, Messages: ${messages.length}, Lang: ${lang}`);

    const systemPrompt = getCategorySystemPrompt(category, mode, currentPhase, lang);
    
    const compressedMessages = compressContext(messages, currentPhase);
    
    const aiMessages = [{ role: 'system', content: systemPrompt }, ...compressedMessages];
    
    if (currentPhase >= 15 && currentPhase < 22) {
      const cat = getCategoryConfig(category, lang);
      const remainingPhases = cat.phases.slice(currentPhase - 1);
      const warningText = lang === 'de'
        ? `ACHTUNG: Du bist in Phase ${currentPhase}/22. Du MUSST noch diese Themen abfragen:\n${remainingPhases.map((p: string, i: number) => `- Phase ${currentPhase + i}: ${p}`).join('\n')}\n\nBeende das Gespräch NICHT bevor alle 22 Phasen abgefragt sind!`
        : lang === 'es'
        ? `ATENCIÓN: Estás en la fase ${currentPhase}/22. DEBES preguntar sobre estos temas:\n${remainingPhases.map((p: string, i: number) => `- Phase ${currentPhase + i}: ${p}`).join('\n')}\n\n¡NO termines la conversación antes de completar las 22 fases!`
        : `WARNING: You are at phase ${currentPhase}/22. You MUST still ask about these topics:\n${remainingPhases.map((p: string, i: number) => `- Phase ${currentPhase + i}: ${p}`).join('\n')}\n\nDo NOT end the conversation before all 22 phases are covered!`;
      
      aiMessages.push({ role: 'system', content: warningText });
    }

    console.log(`[universal-video-consultant] Sending ${aiMessages.length} messages to AI (streaming enabled)`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[universal-video-consultant] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit',
          message: errors.rateLimited,
          quickReplies: [errors.retry],
          progress,
          currentPhase
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Credits exhausted',
          message: errors.creditsExhausted,
          quickReplies: [errors.rechargeCredits],
          progress,
          currentPhase
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiContent = await parseSSEStream(response);
    
    console.log('[universal-video-consultant] AI response length:', aiContent.length);

    let parsedResponse: any = null;
    try {
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiContent.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiContent];
      const jsonStr = jsonMatch[1] || aiContent;
      parsedResponse = JSON.parse(jsonStr.trim());
    } catch (e) {
      console.log('[universal-video-consultant] Parsing as plain text');
    }

    const isComplete = currentPhase >= 22 && messages.filter((m: any) => m.role === 'user').length >= 21;

    let cleanedMessage = parsedResponse?.message;
    
    if (!cleanedMessage) {
      const jsonBlockMatch = aiContent.match(/\{[\s\S]*"message"[\s\S]*\}/);
      if (jsonBlockMatch) {
        try {
          const parsed = JSON.parse(jsonBlockMatch[0]);
          cleanedMessage = parsed.message;
        } catch {}
      }
      
      if (!cleanedMessage) {
        const messageMatch = aiContent.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (messageMatch) {
          cleanedMessage = messageMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
      
      if (!cleanedMessage) {
        cleanedMessage = aiContent
          .replace(/```json[\s\S]*?```/g, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\{[\s\S]*?\}/g, '')
          .trim();
      }
    }
    
    // Phase-based quick replies as PRIMARY (category-aware, language-aware)
    const phaseBasedReplies = generateQuickReplies(Math.max(1, currentPhase - 1), category, lang);
    
    const aiReplies = parsedResponse?.quickReplies;
    const useAiReplies = aiReplies && 
                         Array.isArray(aiReplies) && 
                         aiReplies.length >= 4 &&
                         !aiReplies.some((r: string) => r.toLowerCase().includes('weiter') || r.toLowerCase().includes('continue') || r.toLowerCase().includes('continuar') || r.toLowerCase() === 'ja' || r.toLowerCase() === 'yes' || r.toLowerCase() === 'sí');
    
    const smartQuickReplies = useAiReplies ? aiReplies : phaseBasedReplies;

    const responseData = {
      message: cleanedMessage,
      quickReplies: smartQuickReplies,
      progress,
      currentPhase,
      isComplete,
      recommendation: isComplete ? extractRecommendation(messages, category) : null
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[universal-video-consultant] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errors = ERROR_MESSAGES['de']; // fallback to DE for catch block
    return new Response(JSON.stringify({ 
      error: errorMessage,
      message: errors.genericError,
      quickReplies: [errors.retry, errors.skip],
      progress: 0,
      currentPhase: 1
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
