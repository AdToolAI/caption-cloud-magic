import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ═══════════════════════════════════════════════════════════════
// MULTILINGUAL SUPPORT (DE, EN, ES)
// ═══════════════════════════════════════════════════════════════

type Lang = 'de' | 'en' | 'es';

// ═══════════════════════════════════════════════════════════════
// INFORMATION SLOTS — What data we need per category
// ═══════════════════════════════════════════════════════════════

interface InfoSlot {
  key: string;
  label: Record<Lang, string>;
  required: boolean;
  keywords: string[]; // keywords to detect if slot is filled
}

const UNIVERSAL_SLOTS: InfoSlot[] = [
  { key: 'brand_colors', label: { de: 'Markenfarben', en: 'Brand Colors', es: 'Colores de Marca' }, required: false, keywords: ['farbe', 'color', 'hex', '#', 'rgb', 'brand color', 'markenfarbe', 'colores de marca'] },
  { key: 'voiceover', label: { de: 'Voice-Over', en: 'Voice-Over', es: 'Voz en Off' }, required: false, keywords: ['voice', 'stimme', 'sprecher', 'narrat', 'voz', 'männlich', 'weiblich', 'male', 'female'] },
  { key: 'music_style', label: { de: 'Musikstil', en: 'Music Style', es: 'Estilo Musical' }, required: false, keywords: ['musik', 'music', 'música', 'soundtrack', 'beat', 'cinematic', 'upbeat', 'ambient', 'corporate'] },
  { key: 'format', label: { de: 'Format & Plattform', en: 'Format & Platform', es: 'Formato y Plataforma' }, required: true, keywords: ['16:9', '9:16', '1:1', '4:5', 'youtube', 'tiktok', 'reels', 'instagram', 'format', 'plattform', 'platform', 'plataforma'] },
  { key: 'duration', label: { de: 'Videolänge', en: 'Video Length', es: 'Duración' }, required: true, keywords: ['sekunde', 'second', 'segundo', 'minute', 'min', 'länge', 'length', 'duración', 'dauer', 'duration', 'lang', 'long', '30s', '60s', '90s'] },
  { key: 'cta', label: { de: 'Call-to-Action', en: 'Call-to-Action', es: 'Call-to-Action' }, required: false, keywords: ['cta', 'call to action', 'handlung', 'am ende', 'at the end', 'al final', 'tun soll', 'should do', 'hacer'] },
];

const CATEGORY_SLOTS: Record<string, InfoSlot[]> = {
  'advertisement': [
    { key: 'product', label: { de: 'Produkt/Dienstleistung', en: 'Product/Service', es: 'Producto/Servicio' }, required: true, keywords: ['produkt', 'product', 'producto', 'service', 'dienstleistung', 'servicio', 'angebot', 'offering'] },
    { key: 'target_audience', label: { de: 'Zielgruppe', en: 'Target Audience', es: 'Público Objetivo' }, required: true, keywords: ['zielgruppe', 'target', 'audience', 'público', 'alter', 'age', 'edad', 'beruf', 'profession'] },
    { key: 'usp', label: { de: 'USP / Alleinstellungsmerkmal', en: 'USP / Unique Selling Point', es: 'USP / Propuesta Única' }, required: true, keywords: ['usp', 'alleinstellung', 'unique', 'unterscheid', 'besonder', 'diferencia', 'único'] },
    { key: 'goal', label: { de: 'Werbeziel', en: 'Ad Goal', es: 'Objetivo Publicitario' }, required: true, keywords: ['ziel', 'goal', 'objetivo', 'verkauf', 'sales', 'ventas', 'leads', 'awareness', 'bekanntheit'] },
    { key: 'pain_point', label: { de: 'Hauptproblem', en: 'Main Problem', es: 'Problema Principal' }, required: true, keywords: ['problem', 'pain', 'schmerz', 'frustrat', 'herausforder', 'challenge', 'dolor'] },
    { key: 'transformation', label: { de: 'Transformation', en: 'Transformation', es: 'Transformación' }, required: false, keywords: ['vorher', 'nachher', 'before', 'after', 'antes', 'después', 'transform', 'verändert', 'changed'] },
    { key: 'social_proof', label: { de: 'Social Proof', en: 'Social Proof', es: 'Prueba Social' }, required: false, keywords: ['bewertung', 'review', 'reseña', 'kunde', 'customer', 'cliente', 'testimonial', 'award', 'sterne', 'stars'] },
    { key: 'hook', label: { de: 'Hook / Scroll-Stopper', en: 'Hook / Scroll Stopper', es: 'Hook / Scroll Stopper' }, required: false, keywords: ['hook', 'einstieg', 'anfang', 'scroll', 'first seconds', 'erste sekunden', 'primeros segundos', 'aufmerksamkeit', 'attention'] },
    { key: 'offer', label: { de: 'Angebot / Rabatt', en: 'Offer / Discount', es: 'Oferta / Descuento' }, required: false, keywords: ['angebot', 'offer', 'oferta', 'rabatt', 'discount', 'descuento', 'bonus', 'gratis', 'free'] },
    { key: 'visual_style', label: { de: 'Visueller Stil', en: 'Visual Style', es: 'Estilo Visual' }, required: false, keywords: ['stil', 'style', 'estilo', 'visuell', 'visual', 'ästhetik', 'aesthetic', 'estética', 'look', 'design'] },
  ],
  'product-video': [
    { key: 'product', label: { de: 'Produkt', en: 'Product', es: 'Producto' }, required: true, keywords: ['produkt', 'product', 'producto', 'name', 'kategorie', 'category', 'categoría'] },
    { key: 'problem_emotion', label: { de: 'Problem & Emotion', en: 'Problem & Emotion', es: 'Problema y Emoción' }, required: true, keywords: ['problem', 'emotion', 'emoción', 'gefühl', 'feeling', 'sentir', 'löst', 'solves', 'resuelve'] },
    { key: 'features', label: { de: 'Top Features', en: 'Top Features', es: 'Características Principales' }, required: true, keywords: ['feature', 'funktion', 'función', 'eigenschaft', 'vorteil', 'benefit', 'beneficio', 'charakteristik'] },
    { key: 'target_audience', label: { de: 'Zielgruppe', en: 'Target Audience', es: 'Público Objetivo' }, required: true, keywords: ['zielgruppe', 'target', 'audience', 'público', 'für wen', 'for whom', 'para quién'] },
    { key: 'visual_style', label: { de: 'Filmischer Stil', en: 'Cinematic Style', es: 'Estilo Cinematográfico' }, required: true, keywords: ['stil', 'style', 'estilo', 'apple', 'nike', 'luxury', 'minimal', 'cinematic', 'filmisch'] },
    { key: 'setting', label: { de: 'Setting / Umgebung', en: 'Setting / Environment', es: 'Escenario / Entorno' }, required: false, keywords: ['setting', 'umgebung', 'environment', 'entorno', 'ort', 'location', 'lugar', 'studio', 'natur', 'nature'] },
    { key: 'mood', label: { de: 'Stimmung', en: 'Mood', es: 'Ambiente' }, required: false, keywords: ['stimmung', 'mood', 'ambiente', 'premium', 'verspielt', 'playful', 'warm', 'technisch', 'technical'] },
    { key: 'showcase_style', label: { de: 'Produktinszenierung', en: 'Product Showcase', es: 'Presentación del Producto' }, required: false, keywords: ['slow-motion', 'makro', 'macro', 'detail', 'aktion', 'action', 'acción', 'unboxing', 'reveal'] },
    { key: 'transformation', label: { de: 'Vorher/Nachher', en: 'Before/After', es: 'Antes/Después' }, required: false, keywords: ['vorher', 'nachher', 'before', 'after', 'antes', 'después', 'transform', 'verändert'] },
    { key: 'usp', label: { de: 'Alleinstellungsmerkmal', en: 'USP', es: 'Propuesta Única' }, required: false, keywords: ['usp', 'alleinstellung', 'unique', 'unterscheid', 'besonder', 'wettbewerb', 'competition', 'competencia'] },
  ],
  'storytelling': [
    { key: 'story_type', label: { de: 'Story-Art', en: 'Story Type', es: 'Tipo de Historia' }, required: true, keywords: ['erfind', 'invent', 'inventa', 'wahr', 'true', 'real', 'fiktiv', 'fiction'] },
    { key: 'genre', label: { de: 'Genre', en: 'Genre', es: 'Género' }, required: true, keywords: ['genre', 'drama', 'comedy', 'thriller', 'sci-fi', 'romance', 'fantasy', 'abenteuer', 'adventure'] },
    { key: 'protagonist', label: { de: 'Protagonist', en: 'Protagonist', es: 'Protagonista' }, required: true, keywords: ['protagonist', 'hauptperson', 'character', 'personaje', 'figur', 'held', 'hero'] },
    { key: 'conflict', label: { de: 'Konflikt / Hindernis', en: 'Conflict / Obstacle', es: 'Conflicto / Obstáculo' }, required: true, keywords: ['konflikt', 'conflict', 'conflicto', 'hindernis', 'obstacle', 'obstáculo', 'antagonist', 'problem'] },
    { key: 'emotion', label: { de: 'Emotion / Stimmung', en: 'Emotion / Mood', es: 'Emoción / Ambiente' }, required: true, keywords: ['emotion', 'emoción', 'stimmung', 'mood', 'ambiente', 'hoffnung', 'hope', 'spannung', 'suspense'] },
    { key: 'setting', label: { de: 'Welt / Setting', en: 'World / Setting', es: 'Mundo / Escenario' }, required: false, keywords: ['welt', 'world', 'mundo', 'setting', 'ort', 'zeit', 'time', 'época'] },
    { key: 'twist', label: { de: 'Plot-Twist', en: 'Plot Twist', es: 'Giro Argumental' }, required: false, keywords: ['twist', 'wendung', 'überraschung', 'surprise', 'sorpresa', 'unerwartet', 'unexpected'] },
    { key: 'ending', label: { de: 'Ende', en: 'Ending', es: 'Final' }, required: false, keywords: ['ende', 'ending', 'final', 'happy end', 'cliffhanger', 'offen', 'open', 'abierto'] },
    { key: 'visual_aesthetic', label: { de: 'Visuelle Ästhetik', en: 'Visual Aesthetic', es: 'Estética Visual' }, required: false, keywords: ['ästhetik', 'aesthetic', 'estética', 'cinematic', 'anime', 'dokumentarisch', 'documentary', 'surreal'] },
    { key: 'narrative_perspective', label: { de: 'Erzählperspektive', en: 'Narrative Perspective', es: 'Perspectiva Narrativa' }, required: false, keywords: ['perspektive', 'perspective', 'perspectiva', 'erzähler', 'narrator', 'ich-form', 'first person'] },
  ],
  'corporate': [
    { key: 'purpose', label: { de: 'Hauptzweck', en: 'Main Purpose', es: 'Propósito Principal' }, required: true, keywords: ['zweck', 'purpose', 'propósito', 'recruiting', 'imagefilm', 'image', 'investor', 'employer branding'] },
    { key: 'company', label: { de: 'Unternehmen', en: 'Company', es: 'Empresa' }, required: true, keywords: ['unternehmen', 'company', 'empresa', 'firma', 'name', 'branche', 'industry', 'industria'] },
    { key: 'mission', label: { de: 'Mission & Vision', en: 'Mission & Vision', es: 'Misión y Visión' }, required: true, keywords: ['mission', 'misión', 'vision', 'visión', 'warum', 'why', 'por qué', 'existiert', 'exist'] },
    { key: 'culture', label: { de: 'Unternehmenskultur', en: 'Company Culture', es: 'Cultura Empresarial' }, required: true, keywords: ['kultur', 'culture', 'cultura', 'atmosphäre', 'atmosphere', 'werte', 'values', 'valores'] },
    { key: 'milestones', label: { de: 'Meilensteine', en: 'Milestones', es: 'Hitos' }, required: false, keywords: ['meilenstein', 'milestone', 'hito', 'errungenschaft', 'achievement', 'logro', 'stolz', 'proud'] },
    { key: 'team', label: { de: 'Team', en: 'Team', es: 'Equipo' }, required: false, keywords: ['team', 'equipo', 'mitarbeiter', 'employee', 'empleado', 'führung', 'leadership', 'liderazgo'] },
    { key: 'visual_style', label: { de: 'Stilrichtung', en: 'Style Direction', es: 'Dirección de Estilo' }, required: false, keywords: ['stil', 'style', 'estilo', 'seriös', 'serious', 'modern', 'nahbar', 'approachable'] },
  ],
  'tutorial': [
    { key: 'topic', label: { de: 'Thema', en: 'Topic', es: 'Tema' }, required: true, keywords: ['thema', 'topic', 'tema', 'beibringen', 'teach', 'enseñar', 'erklär', 'explain', 'explicar'] },
    { key: 'audience_level', label: { de: 'Schwierigkeitsgrad', en: 'Difficulty Level', es: 'Nivel de Dificultad' }, required: true, keywords: ['anfänger', 'beginner', 'principiante', 'fortgeschritten', 'intermediate', 'intermedio', 'experte', 'expert', 'schwierig', 'difficulty'] },
    { key: 'learning_goal', label: { de: 'Lernziel', en: 'Learning Goal', es: 'Objetivo de Aprendizaje' }, required: true, keywords: ['lernziel', 'learning goal', 'objetivo', 'können', 'can do', 'poder hacer', 'fähigkeit', 'skill', 'habilidad'] },
    { key: 'tools', label: { de: 'Tools & Materialien', en: 'Tools & Materials', es: 'Herramientas y Materiales' }, required: false, keywords: ['tool', 'material', 'software', 'app', 'werkzeug', 'herramienta'] },
    { key: 'steps', label: { de: 'Schritte / Struktur', en: 'Steps / Structure', es: 'Pasos / Estructura' }, required: false, keywords: ['schritt', 'step', 'paso', 'kapitel', 'chapter', 'capítulo', 'struktur', 'structure', 'estructura'] },
    { key: 'common_mistakes', label: { de: 'Häufige Fehler', en: 'Common Mistakes', es: 'Errores Comunes' }, required: false, keywords: ['fehler', 'mistake', 'error', 'vermeid', 'avoid', 'evitar', 'falsch', 'wrong'] },
    { key: 'presentation_style', label: { de: 'Darstellungsart', en: 'Presentation Style', es: 'Estilo de Presentación' }, required: false, keywords: ['screen', 'animation', 'whiteboard', 'grafik', 'graphic', 'gráfico', 'zeichn', 'draw'] },
  ],
  'social-content': [
    { key: 'platform', label: { de: 'Plattform', en: 'Platform', es: 'Plataforma' }, required: true, keywords: ['tiktok', 'instagram', 'reels', 'youtube', 'shorts', 'plattform', 'platform', 'plataforma'] },
    { key: 'content_type', label: { de: 'Content-Art', en: 'Content Type', es: 'Tipo de Contenido' }, required: true, keywords: ['trend', 'educational', 'entertainment', 'behind-the-scenes', 'meme', 'viral', 'content type', 'art'] },
    { key: 'community', label: { de: 'Community / Zielgruppe', en: 'Community / Target', es: 'Comunidad / Público' }, required: true, keywords: ['community', 'comunidad', 'follower', 'seguidor', 'zielgruppe', 'target', 'público'] },
    { key: 'scroll_stopper', label: { de: 'Scroll-Stopper', en: 'Scroll Stopper', es: 'Scroll Stopper' }, required: true, keywords: ['scroll', 'hook', 'aufmerksamkeit', 'attention', 'atención', 'first seconds', 'erste sekunden'] },
    { key: 'hashtags', label: { de: 'Hashtag-Strategie', en: 'Hashtag Strategy', es: 'Estrategia de Hashtags' }, required: false, keywords: ['hashtag', '#', 'tag'] },
    { key: 'interaction_goal', label: { de: 'Interaktionsziel', en: 'Interaction Goal', es: 'Objetivo de Interacción' }, required: false, keywords: ['kommentar', 'comment', 'comentario', 'teilen', 'share', 'compartir', 'duett', 'duet'] },
  ],
  'testimonial': [
    { key: 'person', label: { de: 'Testimonial-Geber', en: 'Testimonial Person', es: 'Persona del Testimonio' }, required: true, keywords: ['wer', 'who', 'quién', 'name', 'person', 'position', 'cargo', 'unternehmen', 'company'] },
    { key: 'problem_before', label: { de: 'Problem vorher', en: 'Problem Before', es: 'Problema Anterior' }, required: true, keywords: ['problem', 'vorher', 'before', 'antes', 'ausgangslage', 'starting situation'] },
    { key: 'result', label: { de: 'Konkretes Ergebnis', en: 'Concrete Result', es: 'Resultado Concreto' }, required: true, keywords: ['ergebnis', 'result', 'resultado', 'zahlen', 'numbers', 'números', 'zeitersparnis', 'time saving'] },
    { key: 'emotional_change', label: { de: 'Emotionale Veränderung', en: 'Emotional Change', es: 'Cambio Emocional' }, required: true, keywords: ['emotion', 'emoción', 'gefühl', 'feeling', 'sentir', 'veränder', 'change', 'cambio'] },
    { key: 'key_quote', label: { de: 'Kernzitat', en: 'Key Quote', es: 'Cita Clave' }, required: false, keywords: ['zitat', 'quote', 'cita', 'satz', 'sentence', 'frase'] },
    { key: 'setting', label: { de: 'Setting', en: 'Setting', es: 'Escenario' }, required: false, keywords: ['setting', 'ort', 'location', 'lugar', 'büro', 'office', 'oficina'] },
  ],
  'explainer': [
    { key: 'topic', label: { de: 'Was erklärt wird', en: 'What to Explain', es: 'Qué se Explica' }, required: true, keywords: ['erklär', 'explain', 'explicar', 'produkt', 'product', 'producto', 'prozess', 'process', 'proceso'] },
    { key: 'complexity', label: { de: 'Komplexität', en: 'Complexity', es: 'Complejidad' }, required: true, keywords: ['komplex', 'complex', 'complejo', 'einfach', 'simple', 'schwer', 'difficult', 'difícil'] },
    { key: 'problem', label: { de: 'Problem', en: 'Problem', es: 'Problema' }, required: true, keywords: ['problem', 'lösung', 'solution', 'solución', 'versteh', 'understand', 'entender'] },
    { key: 'target_audience', label: { de: 'Zielgruppe', en: 'Target Audience', es: 'Público Objetivo' }, required: true, keywords: ['zielgruppe', 'target', 'público', 'kunden', 'customer', 'cliente', 'mitarbeiter', 'employee'] },
    { key: 'animation_style', label: { de: 'Animationsstil', en: 'Animation Style', es: 'Estilo de Animación' }, required: false, keywords: ['animation', 'animación', 'flat', 'isometric', 'whiteboard', '3d', 'cartoon'] },
    { key: 'metaphors', label: { de: 'Metaphern', en: 'Metaphors', es: 'Metáforas' }, required: false, keywords: ['metapher', 'metaphor', 'metáfora', 'analogie', 'analogy', 'analogía', 'vergleich', 'comparison'] },
  ],
  'event': [
    { key: 'event_type', label: { de: 'Event-Art', en: 'Event Type', es: 'Tipo de Evento' }, required: true, keywords: ['konferenz', 'conference', 'conferencia', 'launch', 'feier', 'celebration', 'messe', 'trade show', 'workshop'] },
    { key: 'video_purpose', label: { de: 'Video-Zweck', en: 'Video Purpose', es: 'Propósito del Video' }, required: true, keywords: ['zweck', 'purpose', 'propósito', 'recap', 'teaser', 'dokumentation', 'documentation', 'promotion'] },
    { key: 'highlights', label: { de: 'Highlights', en: 'Highlights', es: 'Highlights' }, required: true, keywords: ['highlight', 'höhepunkt', 'peak', 'punto álgido', 'moment', 'keynote', 'speaker'] },
    { key: 'atmosphere', label: { de: 'Atmosphäre', en: 'Atmosphere', es: 'Atmósfera' }, required: true, keywords: ['atmosphäre', 'atmosphere', 'atmósfera', 'stimmung', 'mood', 'ambiente', 'energie', 'energy'] },
    { key: 'branding', label: { de: 'Branding', en: 'Branding', es: 'Branding' }, required: false, keywords: ['brand', 'marca', 'logo', 'farben', 'colors', 'colores', 'sponsor'] },
    { key: 'special_shots', label: { de: 'Spezielle Aufnahmen', en: 'Special Shots', es: 'Tomas Especiales' }, required: false, keywords: ['drohne', 'drone', 'dron', 'slow-motion', 'timelapse', 'aerial', 'special shot'] },
  ],
  'promo': [
    { key: 'what_promoted', label: { de: 'Was wird beworben', en: 'What is Promoted', es: 'Qué se Promociona' }, required: true, keywords: ['bewirb', 'promot', 'promocion', 'launch', 'sale', 'event', 'feature', 'ankündigung', 'announcement'] },
    { key: 'main_promise', label: { de: 'Hauptversprechen', en: 'Main Promise', es: 'Promesa Principal' }, required: true, keywords: ['versprechen', 'promise', 'promesa', 'hauptaussage', 'main message', 'mensaje principal'] },
    { key: 'deadline', label: { de: 'Deadline / Datum', en: 'Deadline / Date', es: 'Fecha Límite' }, required: false, keywords: ['deadline', 'datum', 'date', 'fecha', 'launch', 'stichtag', 'wann', 'when', 'cuándo'] },
    { key: 'emotion', label: { de: 'Gewünschte Emotion', en: 'Desired Emotion', es: 'Emoción Deseada' }, required: true, keywords: ['emotion', 'emoción', 'fomo', 'vorfreude', 'anticipation', 'neugier', 'curiosity', 'curiosidad'] },
    { key: 'teaser_style', label: { de: 'Teaser-Stil', en: 'Teaser Style', es: 'Estilo Teaser' }, required: false, keywords: ['teaser', 'mystery', 'countdown', 'reveal', 'andeutung', 'hint', 'insinuación'] },
    { key: 'exclusivity', label: { de: 'Exklusivität', en: 'Exclusivity', es: 'Exclusividad' }, required: false, keywords: ['exklusiv', 'exclusive', 'exclusivo', 'limited', 'limitiert', 'early access', 'sonderpreis'] },
  ],
  'presentation': [
    { key: 'topic_title', label: { de: 'Thema & Titel', en: 'Topic & Title', es: 'Tema y Título' }, required: true, keywords: ['thema', 'topic', 'tema', 'titel', 'title', 'título', 'präsentation', 'presentation'] },
    { key: 'audience', label: { de: 'Publikum', en: 'Audience', es: 'Público' }, required: true, keywords: ['publikum', 'audience', 'público', 'investoren', 'investors', 'kunden', 'clients', 'intern', 'konferenz'] },
    { key: 'core_thesis', label: { de: 'Kernthese', en: 'Core Thesis', es: 'Tesis Central' }, required: true, keywords: ['kernthese', 'core thesis', 'tesis', 'hauptaussage', 'main message', 'mensaje principal'] },
    { key: 'desired_action', label: { de: 'Gewünschte Handlung', en: 'Desired Action', es: 'Acción Deseada' }, required: true, keywords: ['handlung', 'action', 'acción', 'investieren', 'invest', 'kaufen', 'buy', 'verstehen', 'understand'] },
    { key: 'key_arguments', label: { de: 'Kernargumente', en: 'Key Arguments', es: 'Argumentos Clave' }, required: false, keywords: ['argument', 'punkt', 'point', 'beweis', 'evidence', 'evidencia', 'statistik', 'statistic'] },
    { key: 'data_visuals', label: { de: 'Datenvisualisierung', en: 'Data Visualization', es: 'Visualización de Datos' }, required: false, keywords: ['daten', 'data', 'datos', 'chart', 'grafik', 'graphic', 'gráfico', 'infografik', 'statistik'] },
    { key: 'slide_design', label: { de: 'Slide-Design', en: 'Slide Design', es: 'Diseño de Slides' }, required: false, keywords: ['slide', 'design', 'diseño', 'minimalistisch', 'minimalist', 'visuell', 'visual'] },
  ],
  'custom': [
    { key: 'idea', label: { de: 'Video-Idee', en: 'Video Idea', es: 'Idea de Video' }, required: true, keywords: ['idee', 'idea', 'vorstell', 'imagine', 'imaginar', 'konzept', 'concept', 'concepto'] },
    { key: 'goal', label: { de: 'Ziel', en: 'Goal', es: 'Objetivo' }, required: true, keywords: ['ziel', 'goal', 'objetivo', 'effekt', 'effect', 'efecto', 'erreichen', 'achieve', 'lograr'] },
    { key: 'target_audience', label: { de: 'Zielgruppe', en: 'Target Audience', es: 'Público Objetivo' }, required: true, keywords: ['zielgruppe', 'target', 'público', 'für wen', 'for whom', 'para quién'] },
    { key: 'references', label: { de: 'Referenzen / Inspiration', en: 'References / Inspiration', es: 'Referencias / Inspiración' }, required: false, keywords: ['referenz', 'reference', 'referencia', 'inspiration', 'inspiración', 'ähnlich', 'similar', 'like'] },
    { key: 'visual_style', label: { de: 'Visueller Stil', en: 'Visual Style', es: 'Estilo Visual' }, required: false, keywords: ['stil', 'style', 'estilo', 'visuell', 'visual', 'ästhetik', 'aesthetic'] },
    { key: 'emotional_impact', label: { de: 'Emotionale Wirkung', en: 'Emotional Impact', es: 'Impacto Emocional' }, required: false, keywords: ['emotion', 'emoción', 'gefühl', 'feeling', 'sentir', 'wirkung', 'impact', 'impacto'] },
  ],
};

// ═══════════════════════════════════════════════════════════════
// PRODUCT/BRAND INTELLIGENCE — Detect known entities
// ═══════════════════════════════════════════════════════════════

function detectKnownEntity(messages: any[]): { detected: boolean; entityName: string; entityType: string } {
  const userMessages = messages.filter((m: any) => m.role === 'user');
  const allUserText = userMessages.map((m: any) => (m.content || '')).join(' ');
  const allUserTextLower = allUserText.toLowerCase();

  // Well-known global brands
  const knownBrands = [
    'calvin klein', 'nike', 'adidas', 'apple', 'samsung', 'google', 'microsoft', 'amazon',
    'bmw', 'mercedes', 'audi', 'porsche', 'tesla', 'ferrari', 'lamborghini',
    'gucci', 'louis vuitton', 'prada', 'chanel', 'dior', 'versace', 'armani', 'hermes', 'hermès',
    'coca-cola', 'pepsi', 'red bull', 'monster energy',
    'netflix', 'spotify', 'disney', 'youtube', 'tiktok', 'instagram',
    'rolex', 'omega', 'tag heuer', 'cartier', 'tiffany',
    'sony', 'playstation', 'xbox', 'nintendo',
    'ikea', 'zara', 'h&m', 'uniqlo',
    'mcdonald', 'starbucks', 'burger king', 'subway',
    'l\'oréal', 'loreal', 'maybelline', 'nyx', 'mac cosmetics', 'estée lauder', 'estee lauder',
    'dove', 'nivea', 'neutrogena', 'clinique',
    'airbnb', 'uber', 'lyft', 'booking.com',
    'shopify', 'stripe', 'paypal', 'visa', 'mastercard',
    'openai', 'chatgpt', 'midjourney', 'figma', 'canva', 'notion', 'slack',
    'hugo boss', 'ralph lauren', 'tommy hilfiger', 'lacoste',
    'dyson', 'bose', 'bang & olufsen', 'sonos',
    'gopro', 'dji', 'canon', 'nikon',
    'lego', 'barbie', 'mattel',
    'patagonia', 'the north face', 'columbia',
    'sephora', 'douglas',
  ];

  // Product type indicators (multilingual)
  const productIndicators = [
    'parfüm', 'parfum', 'perfume', 'fragrance', 'duft',
    'app', 'software', 'plattform', 'platform', 'tool',
    'auto', 'car', 'coche', 'fahrzeug', 'vehicle',
    'uhr', 'watch', 'reloj',
    'schuh', 'shoe', 'sneaker', 'zapato',
    'getränk', 'drink', 'bebida',
    'kosmetik', 'cosmetic', 'cosmético', 'makeup', 'skincare',
    'kleidung', 'clothing', 'ropa', 'fashion', 'mode',
    'möbel', 'furniture', 'mueble',
    'schmuck', 'jewelry', 'joyería',
    'kamera', 'camera', 'cámara',
    'kopfhörer', 'headphone', 'auricular',
    'smartphone', 'tablet', 'laptop', 'computer',
  ];

  // Check for known brands
  for (const brand of knownBrands) {
    if (allUserTextLower.includes(brand)) {
      // Try to extract the full product name (brand + product line)
      const brandIndex = allUserTextLower.indexOf(brand);
      const surroundingText = allUserText.substring(Math.max(0, brandIndex - 10), brandIndex + brand.length + 40).trim();
      return { detected: true, entityName: surroundingText, entityType: 'brand' };
    }
  }

  // Check for generic product patterns: "[Name] + product indicator"
  for (const indicator of productIndicators) {
    const regex = new RegExp(`([A-ZÀ-ÖÙ-Ü][\\w\\s-]{1,30})\\s+${indicator}`, 'i');
    const match = allUserText.match(regex);
    if (match) {
      return { detected: true, entityName: match[0].trim(), entityType: 'product' };
    }
    // Also check "indicator + Name"  
    const regex2 = new RegExp(`${indicator}\\s+([A-ZÀ-ÖÙ-Ü][\\w\\s-]{1,30})`, 'i');
    const match2 = allUserText.match(regex2);
    if (match2) {
      return { detected: true, entityName: match2[0].trim(), entityType: 'product' };
    }
  }

  return { detected: false, entityName: '', entityType: '' };
}

// ═══════════════════════════════════════════════════════════════
// STORYTELLING SUB-MODE DETECTION
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
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUser) {
      const lastText = lastUser.content.toLowerCase();
      if (inventKeywords.some(k => lastText.includes(k))) return 'invented';
      if (trueKeywords.some(k => lastText.includes(k))) return 'true_story';
    }
  }
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// SLOT EXTRACTION — Analyze conversation to find filled slots
// ═══════════════════════════════════════════════════════════════

interface SlotStatus {
  key: string;
  label: string;
  required: boolean;
  filled: boolean;
  snippet: string; // brief excerpt of what was said
}

function extractFilledSlots(messages: any[], category: string, lang: Lang): { 
  slots: SlotStatus[]; 
  filledRequired: number; 
  totalRequired: number; 
  progress: number;
  filledLabels: string[];
  missingLabels: string[];
  missingRequiredLabels: string[];
} {
  const categorySlots = CATEGORY_SLOTS[category] || CATEGORY_SLOTS['custom'];
  const allSlots = [...categorySlots, ...UNIVERSAL_SLOTS];
  
  // Include BOTH user AND assistant messages for slot detection
  // This ensures that when the AI summarizes product info and the user confirms, slots count as filled
  const relevantMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');
  const allText = relevantMessages.map((m: any) => (m.content || '').toLowerCase()).join(' ');
  
  const slots: SlotStatus[] = allSlots.map(slot => {
    const filled = slot.keywords.some(keyword => allText.includes(keyword.toLowerCase()));
    
    let snippet = '';
    if (filled) {
      // Find the message that contains the keyword (prefer user messages)
      for (const msg of relevantMessages) {
        const msgLower = (msg.content || '').toLowerCase();
        if (slot.keywords.some(k => msgLower.includes(k.toLowerCase()))) {
          snippet = msg.content.substring(0, 80);
          break;
        }
      }
    }
    
    return {
      key: slot.key,
      label: slot.label[lang],
      required: slot.required,
      filled,
      snippet,
    };
  });
  
  const requiredSlots = slots.filter(s => s.required);
  const filledRequired = requiredSlots.filter(s => s.filled).length;
  const totalRequired = requiredSlots.length;
  const totalSlots = slots.length;
  const filledTotal = slots.filter(s => s.filled).length;
  
  // Progress based on filled slots (required weight more)
  const progress = totalRequired > 0 
    ? Math.round(((filledRequired / totalRequired) * 70 + (filledTotal / totalSlots) * 30))
    : Math.round((filledTotal / totalSlots) * 100);
  
  return {
    slots,
    filledRequired,
    totalRequired,
    progress: Math.min(progress, 100),
    filledLabels: slots.filter(s => s.filled).map(s => s.label),
    missingLabels: slots.filter(s => !s.filled).map(s => s.label),
    missingRequiredLabels: requiredSlots.filter(s => !s.filled).map(s => s.label),
  };
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY ROLES — Persona definitions
// ═══════════════════════════════════════════════════════════════

const categoryRoles: Record<string, Record<Lang, string>> = {
  'storytelling': {
    de: 'Du bist Max, ein erfahrener Geschichtenerzähler, Drehbuchautor und Kreativdirektor.',
    en: 'You are Max, an experienced storyteller, screenwriter and creative director.',
    es: 'Eres Max, un experimentado narrador, guionista y director creativo.',
  },
  'tutorial': {
    de: 'Du bist Max, ein erfahrener Bildungs-Content-Experte und Tutorial-Spezialist.',
    en: 'You are Max, an experienced educational content expert and tutorial specialist.',
    es: 'Eres Max, un experimentado experto en contenido educativo y especialista en tutoriales.',
  },
  'corporate': {
    de: 'Du bist Max, ein erfahrener Corporate-Film-Regisseur und Unternehmenskommunikations-Experte.',
    en: 'You are Max, an experienced corporate film director and communications expert.',
    es: 'Eres Max, un experimentado director de cine corporativo y experto en comunicación empresarial.',
  },
  'testimonial': {
    de: 'Du bist Max, ein erfahrener Testimonial-Produzent und Interview-Spezialist.',
    en: 'You are Max, an experienced testimonial producer and interview specialist.',
    es: 'Eres Max, un experimentado productor de testimonios y especialista en entrevistas.',
  },
  'explainer': {
    de: 'Du bist Max, ein erfahrener Erklärvideo-Experte und visueller Kommunikator.',
    en: 'You are Max, an experienced explainer video expert and visual communicator.',
    es: 'Eres Max, un experimentado experto en videos explicativos y comunicador visual.',
  },
  'event': {
    de: 'Du bist Max, ein erfahrener Event-Filmer und Atmosphäre-Spezialist.',
    en: 'You are Max, an experienced event filmmaker and atmosphere specialist.',
    es: 'Eres Max, un experimentado cineasta de eventos y especialista en atmósfera.',
  },
  'social-content': {
    de: 'Du bist Max, ein erfahrener Social-Media-Content-Creator und Trend-Experte.',
    en: 'You are Max, an experienced social media content creator and trend expert.',
    es: 'Eres Max, un experimentado creador de contenido social media y experto en tendencias.',
  },
  'promo': {
    de: 'Du bist Max, ein erfahrener Promo-Spezialist und Launch-Stratege.',
    en: 'You are Max, an experienced promo specialist and launch strategist.',
    es: 'Eres Max, un experimentado especialista en promos y estratega de lanzamientos.',
  },
  'presentation': {
    de: 'Du bist Max, ein erfahrener Präsentations-Coach und Pitch-Experte.',
    en: 'You are Max, an experienced presentation coach and pitch expert.',
    es: 'Eres Max, un experimentado coach de presentaciones y experto en pitch.',
  },
  'advertisement': {
    de: 'Du bist Max, ein erfahrener Werbefilm-Regisseur und Marketing-Stratege.',
    en: 'You are Max, an experienced advertising director and marketing strategist.',
    es: 'Eres Max, un experimentado director publicitario y estratega de marketing.',
  },
  'product-video': {
    de: 'Du bist Max, ein erfahrener Produkt-Werbefilm-Regisseur und Verkaufspsychologie-Experte.',
    en: 'You are Max, an experienced product advertising director and sales psychology expert.',
    es: 'Eres Max, un experimentado director de publicidad de productos y experto en psicología de ventas.',
  },
};

const defaultRole: Record<Lang, string> = {
  de: 'Du bist Max, dein Video-Marketing-Stratege.',
  en: 'You are Max, a video marketing strategist.',
  es: 'Eres Max, un estratega de video marketing.',
};

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

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE SYSTEM PROMPT — AI-driven interview
// ═══════════════════════════════════════════════════════════════

function buildAdaptiveSystemPrompt(
  category: string, 
  mode: string, 
  lang: Lang, 
  messages: any[],
  slotInfo: ReturnType<typeof extractFilledSlots>,
  userMessageCount: number,
  knownEntity: { detected: boolean; entityName: string; entityType: string },
): string {
  const categoryName = CATEGORY_NAMES[lang][category] || 'Custom Video';
  
  // Get role
  let role = categoryRoles[category]?.[lang] || defaultRole[lang];
  
  // Storytelling sub-mode enhancement
  if (category === 'storytelling' && messages.length > 0) {
    const subMode = detectStorytellingSubMode(messages);
    if (subMode === 'invented') {
      role = lang === 'de' 
        ? 'Du bist Max, ein visionärer Autor und kreativer Drehbuchschreiber. Entwickle eine fesselnde FIKTIVE STORY.'
        : lang === 'es'
        ? 'Eres Max, un autor visionario y guionista creativo. Desarrolla una HISTORIA FICTICIA cautivadora.'
        : 'You are Max, a visionary author and creative screenwriter. Develop a captivating FICTIONAL STORY.';
    } else if (subMode === 'true_story') {
      role = lang === 'de'
        ? 'Du bist Max, ein einfühlsamer Biograf und dokumentarischer Geschichtenerzähler. Extrahiere die Kernelemente der WAHREN GESCHICHTE.'
        : lang === 'es'
        ? 'Eres Max, un biógrafo empático y narrador documental. Extrae los elementos centrales de la HISTORIA REAL.'
        : 'You are Max, an empathetic biographer and documentary storyteller. Extract the core elements of the TRUE STORY.';
    }
  }

  const langInstructions: Record<Lang, string> = {
    de: 'Antworte IMMER auf Deutsch.',
    en: 'ALWAYS respond in English.',
    es: 'Responde SIEMPRE en español.',
  };

  const modeLabel: Record<Lang, Record<string, string>> = {
    de: { 'full-service': 'Full-Service (KI erstellt alles automatisch)', 'manual': 'Manuell (Nutzer hat Kontrolle)' },
    en: { 'full-service': 'Full-Service (AI creates everything automatically)', 'manual': 'Manual (user has full control)' },
    es: { 'full-service': 'Full-Service (IA crea todo automáticamente)', 'manual': 'Manual (usuario tiene control)' },
  };

  // Build filled/missing slot summary
  const filledSummary = slotInfo.filledLabels.length > 0 
    ? slotInfo.filledLabels.join(', ') 
    : (lang === 'de' ? 'Noch nichts' : lang === 'es' ? 'Nada aún' : 'Nothing yet');
  
  const missingSummary = slotInfo.missingRequiredLabels.length > 0
    ? slotInfo.missingRequiredLabels.join(', ')
    : (lang === 'de' ? 'Alle Pflichtfelder gefüllt!' : lang === 'es' ? '¡Todos los campos obligatorios llenos!' : 'All required fields filled!');
  
  const optionalMissing = slotInfo.slots.filter(s => !s.filled && !s.required).map(s => s.label);

  const isNearComplete = slotInfo.filledRequired >= slotInfo.totalRequired;
  
  // Adaptive instruction based on progress
  let phaseInstruction: string;
  if (userMessageCount === 0) {
    // First message — greeting + first question
    phaseInstruction = lang === 'de' 
      ? `Dies ist der START des Interviews. Begrüße den Kunden warmherzig und professionell, stelle dich als Max vor, und stelle dann deine ERSTE Frage. Wähle die relevanteste offene Pflicht-Information aus der Liste unten.`
      : lang === 'es'
      ? `Este es el INICIO de la entrevista. Saluda al cliente con calidez y profesionalismo, preséntate como Max, y haz tu PRIMERA pregunta. Elige la información obligatoria más relevante de la lista.`
      : `This is the START of the interview. Greet the client warmly and professionally, introduce yourself as Max, and ask your FIRST question. Choose the most relevant required info from the list below.`;
  } else if (isNearComplete) {
    phaseInstruction = lang === 'de'
      ? `Alle Pflichtinformationen sind gesammelt! Du kannst jetzt:\n- Optionale Details erfragen (${optionalMissing.slice(0, 3).join(', ')})\n- Oder eine ZUSAMMENFASSUNG aller gesammelten Infos geben und fragen ob alles passt\n- Setze "isComplete": true wenn der Nutzer bestätigt oder du genug Infos hast`
      : lang === 'es'
      ? `¡Toda la información obligatoria está recopilada! Puedes:\n- Preguntar detalles opcionales (${optionalMissing.slice(0, 3).join(', ')})\n- O dar un RESUMEN y preguntar si todo está correcto\n- Pon "isComplete": true cuando el usuario confirme`
      : `All required information is gathered! You can:\n- Ask optional details (${optionalMissing.slice(0, 3).join(', ')})\n- Or give a SUMMARY of all gathered info and ask if everything looks good\n- Set "isComplete": true when the user confirms or you have enough info`;
  } else {
    phaseInstruction = lang === 'de'
      ? `Du brauchst noch: ${missingSummary}\nStelle die nächste relevante Frage. Wenn der Nutzer in seiner Antwort bereits mehrere Infos gegeben hat, überspringe die entsprechenden Themen.`
      : lang === 'es'
      ? `Aún necesitas: ${missingSummary}\nHaz la siguiente pregunta relevante. Si el usuario ya dio varias informaciones en su respuesta, salta esos temas.`
      : `You still need: ${missingSummary}\nAsk the next relevant question. If the user already provided multiple pieces of info in their answer, skip those topics.`;
  }

  const promptParts: Record<Lang, {
    adaptiveRules: string;
    quickReplyRules: string;
    personalityRules: string;
  }> = {
    de: {
      adaptiveRules: `
ADAPTIVES INTERVIEW-SYSTEM:
- Du entscheidest welche Frage als nächstes kommt — es gibt KEINE feste Reihenfolge
- Wenn der Nutzer in einer Antwort mehrere Informationen gibt, erkenne sie ALLE und überspringe die entsprechenden Fragen
- Stelle NIEMALS eine Frage zu einer Information die bereits gegeben wurde
- Du kannst das Interview beenden sobald alle Pflichtinformationen gesammelt sind (typisch 6-15 Nachrichten, NICHT immer 22)
- Stelle Follow-Up-Fragen wenn eine Antwort besonders interessant oder unklar ist
- Kombiniere verwandte Themen in einer Frage wenn es natürlich passt`,
      quickReplyRules: `
QUICK REPLIES — KONTEXTBEZOGEN GENERIEREN:
- Generiere 3-4 Antwortvorschläge die SPEZIFISCH zum aktuellen Gesprächskontext passen
- KEINE generischen Antworten wie "Weiter", "Ja", "Nein" — IMMER inhaltliche Optionen
- Beziehe dich auf die bisherigen Antworten des Nutzers
- Biete immer eine "freie Antwort"-Option an (z.B. "Lass mich erzählen...")
- Die Quick Replies müssen zur AKTUELLEN Frage passen, NICHT zur vorherigen`,
      personalityRules: `
PERSÖNLICHKEIT & INDIVIDUALITÄT:
- Reagiere auf die SPEZIFISCHEN Antworten des Nutzers — wenn er "Calvin Klein Parfüm" sagt, beziehe dich auf Luxusmarken-Konventionen
- Passe deinen Tonfall an den Kunden an — bei einem Startup lockerer, bei einer Anwaltskanzlei professioneller
- Stelle FOLLOW-UP-Fragen wenn eine Antwort besonders interessant ist — sei neugierig!
- Variiere deine Fragestellungen — nutze manchmal Szenarien ("Stell dir vor dein idealer Kunde sieht das Video..."), manchmal direkte Fragen, manchmal kreative Übungen ("Beschreibe dein Produkt in 3 Worten")
- Gib bei jeder Frage einen kurzen KONTEXT warum du das fragst (z.B. "Das hilft mir den perfekten Filmstil zu wählen")
- Zeige Begeisterung für gute Antworten und baue darauf auf`,
    },
    en: {
      adaptiveRules: `
ADAPTIVE INTERVIEW SYSTEM:
- YOU decide which question to ask next — there is NO fixed order
- If the user provides multiple pieces of information in one answer, recognize them ALL and skip those questions
- NEVER ask about information that was already provided
- You can end the interview once all required information is gathered (typically 6-15 messages, NOT always 22)
- Ask follow-up questions when an answer is particularly interesting or unclear
- Combine related topics into one question when it feels natural`,
      quickReplyRules: `
QUICK REPLIES — GENERATE CONTEXTUALLY:
- Generate 3-4 response suggestions that are SPECIFIC to the current conversation context
- NO generic responses like "Continue", "Yes", "No" — ALWAYS substantive options
- Reference the user's previous answers
- Always offer a "free answer" option (e.g. "Let me explain...")
- Quick replies must match the CURRENT question, NOT the previous one`,
      personalityRules: `
PERSONALITY & INDIVIDUALITY:
- React to the user's SPECIFIC answers — if they say "Calvin Klein perfume", reference luxury brand conventions
- Adapt your tone to the client — more casual with a startup, more professional with a law firm
- Ask FOLLOW-UP questions when an answer is particularly interesting — be curious!
- Vary your questioning style — sometimes use scenarios ("Imagine your ideal customer sees this video..."), sometimes direct questions, sometimes creative exercises ("Describe your product in 3 words")
- Give brief CONTEXT for each question (e.g. "This helps me choose the perfect film style")
- Show enthusiasm for great answers and build on them`,
    },
    es: {
      adaptiveRules: `
SISTEMA DE ENTREVISTA ADAPTATIVO:
- TÚ decides qué pregunta hacer a continuación — NO hay un orden fijo
- Si el usuario proporciona múltiples informaciones en una respuesta, reconócelas TODAS y salta esas preguntas
- NUNCA preguntes sobre información que ya fue proporcionada
- Puedes terminar la entrevista cuando toda la información obligatoria esté recopilada (típicamente 6-15 mensajes, NO siempre 22)
- Haz preguntas de seguimiento cuando una respuesta sea particularmente interesante o poco clara
- Combina temas relacionados en una pregunta cuando se sienta natural`,
      quickReplyRules: `
QUICK REPLIES — GENERAR CONTEXTUALMENTE:
- Genera 3-4 sugerencias de respuesta que sean ESPECÍFICAS al contexto actual de la conversación
- SIN respuestas genéricas como "Continuar", "Sí", "No" — SIEMPRE opciones sustantivas
- Haz referencia a las respuestas anteriores del usuario
- Siempre ofrece una opción de "respuesta libre" (ej. "Déjame explicar...")
- Los quick replies deben coincidir con la pregunta ACTUAL, NO con la anterior`,
      personalityRules: `
PERSONALIDAD E INDIVIDUALIDAD:
- Reacciona a las respuestas ESPECÍFICAS del usuario — si dice "perfume Calvin Klein", referencia convenciones de marcas de lujo
- Adapta tu tono al cliente — más casual con una startup, más profesional con un bufete de abogados
- Haz preguntas de SEGUIMIENTO cuando una respuesta sea particularmente interesante — ¡sé curioso!
- Varía tu estilo de preguntas — a veces usa escenarios, a veces preguntas directas, a veces ejercicios creativos
- Da un breve CONTEXTO para cada pregunta
- Muestra entusiasmo por buenas respuestas y construye sobre ellas`,
    },
  };

  const pp = promptParts[lang];

  return `${role}
${langInstructions[lang]}

VIDEO TYPE: ${categoryName}
Mode: ${modeLabel[lang][mode] || modeLabel[lang]['full-service']}

INFORMATION GATHERED: ${filledSummary}
STILL MISSING (required): ${missingSummary}
PROGRESS: ${slotInfo.progress}%
USER MESSAGES SO FAR: ${userMessageCount}

${phaseInstruction}

${pp.adaptiveRules}

${pp.quickReplyRules}

${pp.personalityRules}

RESPONSE FORMAT (ALWAYS valid JSON):
{
  "message": "Your conversational message with acknowledgment of previous answer + next question",
  "quickReplies": ["Specific option 1", "Specific option 2", "Specific option 3", "Let me describe..."],
  "isComplete": false
}

IMPORTANT:
- Use emojis sparingly (🎬 🎯 🎨 💡 🔥 ✨)
- Keep messages concise but warm — max 3-4 sentences
- ALWAYS include "quickReplies" with 3-4 CONTEXT-SPECIFIC options
- Set "isComplete": true ONLY when all required info is gathered AND user confirms the summary`;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT COMPRESSION for long conversations
// ═══════════════════════════════════════════════════════════════

function compressContext(messages: any[], userCount: number): any[] {
  if (userCount <= 8 || messages.length <= 15) {
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
  
  console.log(`[universal-video-consultant] Compressed ${messages.length} messages to ${firstMessages.length + 1 + lastMessages.length}`);
  
  return [...firstMessages, summaryMessage, ...lastMessages];
}

// ═══════════════════════════════════════════════════════════════
// SSE STREAM PARSER
// ═══════════════════════════════════════════════════════════════

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
        if (content) fullContent += content;
      } catch {
        // Incomplete JSON, ignore
      }
    }
  }
  
  return fullContent;
}

// ═══════════════════════════════════════════════════════════════
// RECOMMENDATION EXTRACTION (slot-based)
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
        const userResponse = userResponses[i] || '';
        if (userResponse.length > 5) return userResponse;
      }
    }
    // Fallback: search all user messages
    for (const resp of userResponses) {
      if (keywords.some(k => resp.toLowerCase().includes(k))) return resp;
    }
    return '';
  };
  
  const extractUrl = (text: string): string => {
    const urlMatch = text.match(/(?:https?:\/\/|www\.)[^\s,;)]+/i);
    return urlMatch ? urlMatch[0] : '';
  };
  
  // Extract format/aspect ratio
  const formatResponse = findResponse(['format', '16:9', '9:16', '1:1', 'plattform', 'platform', 'plataforma']);
  const aspectRatio = formatResponse.includes('9:16') ? '9:16' 
    : formatResponse.includes('1:1') ? '1:1'
    : formatResponse.includes('4:5') ? '4:5'
    : '16:9';
  
  // Extract duration
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

  // Semantic extraction
  const zweck = findResponse(['zweck', 'ziel', 'wofür', 'warum', 'purpose', 'goal', 'propósito', 'objetivo']) || userResponses[0] || '';
  const zielgruppe = findResponse(['zielgruppe', 'publikum', 'audience', 'für wen', 'público', 'target']) || userResponses[1] || '';
  const produkt = findResponse(['produkt', 'service', 'tool', 'angebot', 'dienstleistung', 'unternehmen', 'firma', 'product', 'company', 'producto', 'empresa']) || userResponses[2] || '';
  const usp = findResponse(['usp', 'alleinstellung', 'besonder', 'unterscheid', 'vorteil', 'unique', 'advantage', 'único', 'ventaja']) || userResponses[3] || '';
  
  const companyName = findResponse(['unternehmen', 'firma', 'marke', 'brand', 'company', 'empresa', 'marca']).substring(0, 100);
  const productName = findResponse(['produkt', 'service', 'tool', 'angebot', 'dienstleistung', 'name', 'product', 'producto']).substring(0, 100);
  const websiteUrl = extractUrl(allText);
  
  const categoryResponses = userResponses.slice(2, 14);
  
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

// ═══════════════════════════════════════════════════════════════
// ERROR MESSAGES
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { messages, category: rawCategory, mode, language } = await req.json();
    const lang: Lang = (language === 'en' || language === 'es') ? language : 'de';
    const errors = ERROR_MESSAGES[lang];
    
    // Map new UI categories to internal pipeline keys
    const UI_TO_INTERNAL_CATEGORY: Record<string, string> = {
      'corporate-ad': 'advertisement',
      'product-ad': 'product-video',
      'storytelling': 'storytelling',
      'custom': 'custom',
    };
    const category = UI_TO_INTERNAL_CATEGORY[rawCategory] || rawCategory;
    
    // Count user messages
    const userMessageCount = messages.filter((m: any) => m.role === 'user').length;
    
    // Extract filled slots from conversation
    const slotInfo = extractFilledSlots(messages, category, lang);
    
    console.log(`[universal-video-consultant] Category: ${category}, Mode: ${mode}, UserMsgs: ${userMessageCount}, Progress: ${slotInfo.progress}%, FilledRequired: ${slotInfo.filledRequired}/${slotInfo.totalRequired}, Lang: ${lang}`);

    // Build adaptive system prompt
    const systemPrompt = buildAdaptiveSystemPrompt(category, mode, lang, messages, slotInfo, userMessageCount);
    
    // Compress context for long conversations
    const compressedMessages = compressContext(messages, userMessageCount);
    
    const aiMessages = [{ role: 'system', content: systemPrompt }, ...compressedMessages];

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
          progress: slotInfo.progress,
          currentPhase: userMessageCount + 1,
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
          progress: slotInfo.progress,
          currentPhase: userMessageCount + 1,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiContent = await parseSSEStream(response);
    
    console.log('[universal-video-consultant] AI response length:', aiContent.length);

    // Parse AI response
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

    // Determine if interview is complete
    // AI signals completion OR all required slots filled and enough messages
    const aiSaysComplete = parsedResponse?.isComplete === true;
    const allRequiredFilled = slotInfo.filledRequired >= slotInfo.totalRequired;
    const isComplete = aiSaysComplete || (allRequiredFilled && userMessageCount >= 6);

    // Extract message
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
    
    // Extract quick replies from AI response (contextual, dynamic)
    const aiReplies = parsedResponse?.quickReplies;
    const validAiReplies = aiReplies && 
      Array.isArray(aiReplies) && 
      aiReplies.length >= 3 &&
      !aiReplies.every((r: string) => r.toLowerCase().includes('weiter') || r.toLowerCase().includes('continue') || r.toLowerCase() === 'ja' || r.toLowerCase() === 'yes');
    
    // Minimal fallback if AI fails to generate replies
    const fallbackReplies: Record<Lang, string[]> = {
      de: ['Lass mich erzählen...', 'Ich brauche Hilfe bei der Frage', 'Überspringe diese Frage'],
      en: ['Let me explain...', 'I need help with this', 'Skip this question'],
      es: ['Déjame explicar...', 'Necesito ayuda con esto', 'Saltar esta pregunta'],
    };
    
    const smartQuickReplies = validAiReplies ? aiReplies : fallbackReplies[lang];

    // Build response — keep currentPhase for backward compatibility
    const responseData = {
      message: cleanedMessage,
      quickReplies: smartQuickReplies,
      progress: isComplete ? 100 : slotInfo.progress,
      currentPhase: userMessageCount + 1, // backward compat
      isComplete,
      recommendation: isComplete ? extractRecommendation(messages, category) : null,
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[universal-video-consultant] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errors = ERROR_MESSAGES['de'];
    return new Response(JSON.stringify({ 
      error: errorMessage,
      message: errors.genericError,
      quickReplies: [errors.retry, errors.skip],
      progress: 0,
      currentPhase: 1,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
