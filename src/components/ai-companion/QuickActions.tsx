import { tx } from "@/lib/i18nText";
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Video, Calendar, Sparkles, BarChart3, Upload, 
  Link2, Settings, HelpCircle, Zap, Wand2, Coins,
  Shield, MessageSquare, FileText, Palette, Target,
  TrendingUp, Users, Clock, PenTool, Layout
} from 'lucide-react';

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

interface QuickActionsProps {
  currentPage: string;
  onActionClick: (prompt: string) => void;
}

const PAGE_ACTIONS: Record<string, QuickAction[]> = {
  '/': [
    { label: tx({ de: 'Was kann AdTool?', en: 'What can AdTool do?', es: '¿Qué puede hacer AdTool?' }), icon: <HelpCircle className="w-3 h-3" />, prompt: tx({ de: 'Was sind die wichtigsten Features von AdTool und wie kann ich loslegen?', en: 'What are the key features of AdTool and how do I get started?', es: '¿Cuáles son las características clave de AdTool y cómo puedo empezar?' }) },
    { label: tx({ de: 'Quick Start', en: 'Quick Start', es: 'Inicio rápido' }), icon: <Zap className="w-3 h-3" />, prompt: tx({ de: 'Führe mich durch die ersten Schritte in AdTool.', en: 'Guide me through the first steps in AdTool.', es: 'Guíame por los primeros pasos en AdTool.' }) },
    { label: tx({ de: 'Social verbinden', en: 'Connect social', es: 'Conectar redes sociales' }), icon: <Link2 className="w-3 h-3" />, prompt: tx({ de: 'Wie verbinde ich meinen Instagram oder TikTok Account?', en: 'How do I connect my Instagram or TikTok account?', es: '¿Cómo conecto mi cuenta de Instagram o TikTok?' }) },
    { label: tx({ de: 'Erstes Video', en: 'First video', es: 'Primer vídeo' }), icon: <Video className="w-3 h-3" />, prompt: tx({ de: 'Wie erstelle ich mein erstes Video mit AdTool?', en: 'How do I create my first video with AdTool?', es: '¿Cómo creo mi primer vídeo con AdTool?' }) },
    { label: tx({ de: 'Credits erklärt', en: 'Credits explained', es: 'Créditos explicados' }), icon: <Coins className="w-3 h-3" />, prompt: tx({ de: 'Wie funktioniert das Credit-System in AdTool?', en: 'How does the credit system in AdTool work?', es: '¿Cómo funciona el sistema de créditos en AdTool?' }) },
    { label: tx({ de: 'Account Status', en: 'Account status', es: 'Estado de la cuenta' }), icon: <Shield className="w-3 h-3" />, prompt: '/status' },
  ],
  '/dashboard': [
    { label: tx({ de: 'Metrics verstehen', en: 'Understand metrics', es: 'Entender métricas' }), icon: <BarChart3 className="w-3 h-3" />, prompt: tx({ de: 'Erkläre mir die wichtigsten Metriken auf meinem Dashboard.', en: 'Explain the most important metrics on my dashboard.', es: 'Explícame las métricas más importantes de mi panel.' }) },
    { label: tx({ de: 'Performance Tipps', en: 'Performance tips', es: 'Consejos de rendimiento' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Gib mir Tipps wie ich meine Performance verbessern kann.', en: 'Give me tips on how to improve my performance.', es: 'Dame consejos para mejorar mi rendimiento.' }) },
    { label: tx({ de: 'Beste Posting-Zeit', en: 'Best posting time', es: 'Mejor hora de publicación' }), icon: <Calendar className="w-3 h-3" />, prompt: tx({ de: 'Wann ist die beste Zeit um auf meinen Social Media Kanälen zu posten?', en: 'What is the best time to post on my social media channels?', es: '¿Cuál es el mejor momento para publicar en mis canales de redes sociales?' }) },
    { label: tx({ de: 'Trends erkennen', en: 'Spot trends', es: 'Detectar tendencias' }), icon: <TrendingUp className="w-3 h-3" />, prompt: tx({ de: 'Welche Trends erkennst du in meinen Dashboard-Daten?', en: 'What trends do you see in my dashboard data?', es: '¿Qué tendencias ves en los datos de mi panel?' }) },
    { label: tx({ de: 'Zielgruppe', en: 'Target audience', es: 'Público objetivo' }), icon: <Users className="w-3 h-3" />, prompt: tx({ de: 'Was kann ich über meine Zielgruppe aus den Daten lernen?', en: 'What can I learn about my target audience from the data?', es: '¿Qué puedo aprender sobre mi público objetivo a partir de los datos?' }) },
  ],
  '/directors-cut': [
    { label: tx({ de: 'Workflow erklären', en: 'Explain workflow', es: 'Explicar flujo de trabajo' }), icon: <Video className="w-3 h-3" />, prompt: tx({ de: "Erkläre mir den Director's Cut Workflow Schritt für Schritt.", en: "Explain the Director's Cut workflow step by step.", es: "Explícame el flujo de trabajo de Director's Cut paso a paso." }) },
    { label: tx({ de: 'AI Auto-Cut', en: 'AI Auto-Cut', es: 'Auto-Cut IA' }), icon: <Wand2 className="w-3 h-3" />, prompt: tx({ de: 'Wie funktioniert der AI Auto-Cut und wann sollte ich ihn nutzen?', en: 'How does AI Auto-Cut work and when should I use it?', es: '¿Cómo funciona el Auto-Cut de IA y cuándo debo usarlo?' }) },
    { label: tx({ de: 'Export Optionen', en: 'Export options', es: 'Opciones de exportación' }), icon: <Settings className="w-3 h-3" />, prompt: tx({ de: 'Welche Export-Formate und Qualitätsoptionen gibt es?', en: 'What export formats and quality options are available?', es: '¿Qué formatos de exportación y opciones de calidad hay disponibles?' }) },
    { label: tx({ de: 'Effekte hinzufügen', en: 'Add effects', es: 'Añadir efectos' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Welche visuellen Effekte kann ich meinem Video hinzufügen?', en: 'What visual effects can I add to my video?', es: '¿Qué efectos visuales puedo añadir a mi vídeo?' }) },
    { label: tx({ de: 'Renderzeit', en: 'Render time', es: 'Tiempo de renderizado' }), icon: <Clock className="w-3 h-3" />, prompt: tx({ de: 'Wie lange dauert das Rendering und wie kann ich es beschleunigen?', en: 'How long does rendering take and how can I speed it up?', es: '¿Cuánto tiempo tarda el renderizado y cómo puedo acelerarlo?' }) },
  ],
  '/universal-creator': [
    { label: tx({ de: 'Video erstellen', en: 'Create video', es: 'Crear vídeo' }), icon: <Video className="w-3 h-3" />, prompt: tx({ de: 'Wie erstelle ich ein neues Video mit dem Universal Creator?', en: 'How do I create a new video with the Universal Creator?', es: '¿Cómo creo un nuevo vídeo con el Universal Creator?' }) },
    { label: tx({ de: 'Templates nutzen', en: 'Use templates', es: 'Usar plantillas' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Wie kann ich Templates effektiv nutzen?', en: 'How can I use templates effectively?', es: '¿Cómo puedo usar las plantillas de forma eficaz?' }) },
    { label: tx({ de: 'KI Features', en: 'AI features', es: 'Funciones de IA' }), icon: <Wand2 className="w-3 h-3" />, prompt: tx({ de: 'Welche KI-Features hat der Universal Creator?', en: 'What AI features does the Universal Creator have?', es: '¿Qué funciones de IA tiene el Universal Creator?' }) },
    { label: tx({ de: 'Szenen bearbeiten', en: 'Edit scenes', es: 'Editar escenas' }), icon: <Layout className="w-3 h-3" />, prompt: tx({ de: 'Wie kann ich Szenen im Universal Creator anpassen?', en: 'How can I adjust scenes in the Universal Creator?', es: '¿Cómo puedo ajustar escenas en el Universal Creator?' }) },
    { label: tx({ de: 'Text & Untertitel', en: 'Text & subtitles', es: 'Texto y subtítulos' }), icon: <FileText className="w-3 h-3" />, prompt: tx({ de: 'Wie füge ich Text und Untertitel zu meinem Video hinzu?', en: 'How do I add text and subtitles to my video?', es: '¿Cómo añado texto y subtítulos a mi vídeo?' }) },
  ],
  '/calendar': [
    { label: tx({ de: 'Post planen', en: 'Schedule post', es: 'Programar publicación' }), icon: <Calendar className="w-3 h-3" />, prompt: tx({ de: 'Wie plane ich einen Post im Kalender?', en: 'How do I schedule a post in the calendar?', es: '¿Cómo programo una publicación en el calendario?' }) },
    { label: tx({ de: 'Auto-Publish', en: 'Auto-publish', es: 'Publicación automática' }), icon: <Zap className="w-3 h-3" />, prompt: tx({ de: 'Wie funktioniert Auto-Publish und wie aktiviere ich es?', en: 'How does Auto-Publish work and how do I enable it?', es: '¿Cómo funciona la publicación automática y cómo la activo?' }) },
    { label: tx({ de: 'Kampagne erstellen', en: 'Create campaign', es: 'Crear campaña' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Wie erstelle ich eine komplette Kampagne?', en: 'How do I create a complete campaign?', es: '¿Cómo creo una campaña completa?' }) },
    { label: tx({ de: 'Zeitslots', en: 'Time slots', es: 'Franjas horarias' }), icon: <Clock className="w-3 h-3" />, prompt: tx({ de: 'Wie richte ich optimale Posting-Zeitslots ein?', en: 'How do I set up optimal posting time slots?', es: '¿Cómo configuro franjas horarias óptimas de publicación?' }) },
    { label: tx({ de: 'Event bearbeiten', en: 'Edit event', es: 'Editar evento' }), icon: <PenTool className="w-3 h-3" />, prompt: tx({ de: 'Wie bearbeite ich einen geplanten Post im Kalender?', en: 'How do I edit a scheduled post in the calendar?', es: '¿Cómo edito una publicación programada en el calendario?' }) },
  ],
  '/media-library': [
    { label: tx({ de: 'Upload Tipps', en: 'Upload tips', es: 'Consejos de subida' }), icon: <Upload className="w-3 h-3" />, prompt: tx({ de: 'Welche Dateiformate und Größen werden unterstützt?', en: 'What file formats and sizes are supported?', es: '¿Qué formatos y tamaños de archivo son compatibles?' }) },
    { label: tx({ de: 'Speicherlimit', en: 'Storage limit', es: 'Límite de almacenamiento' }), icon: <Settings className="w-3 h-3" />, prompt: tx({ de: 'Wie viel Speicher habe ich und was passiert bei Überschreitung?', en: 'How much storage do I have and what happens if I exceed it?', es: '¿Cuánto almacenamiento tengo y qué pasa si lo supero?' }) },
    { label: tx({ de: 'Medien organisieren', en: 'Organize media', es: 'Organizar medios' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Wie kann ich meine Medien am besten organisieren?', en: 'How can I best organize my media?', es: '¿Cómo puedo organizar mejor mis medios?' }) },
    { label: tx({ de: 'Video zu Projekt', en: 'Video to project', es: 'Vídeo a proyecto' }), icon: <Video className="w-3 h-3" />, prompt: tx({ de: 'Wie verwende ich ein Video aus der Library in einem Projekt?', en: 'How do I use a video from the Library in a project?', es: '¿Cómo utilizo un vídeo de la Biblioteca en un proyecto?' }) },
  ],
  '/ai-text-studio': [
    { label: tx({ de: 'Caption erstellen', en: 'Create caption', es: 'Crear subtítulo' }), icon: <Wand2 className="w-3 h-3" />, prompt: tx({ de: 'Wie erstelle ich die beste Caption mit dem KI-Generator?', en: 'How do I create the best caption with the AI generator?', es: '¿Cómo creo el mejor pie de foto con el generador de IA?' }) },
    { label: tx({ de: 'Tone auswählen', en: 'Choose tone', es: 'Elegir tono' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Welcher Ton ist für welche Plattform am besten?', en: 'Which tone is best for which platform?', es: '¿Qué tono es el mejor para cada plataforma?' }) },
    { label: tx({ de: 'Hashtag Strategie', en: 'Hashtag strategy', es: 'Estrategia de hashtags' }), icon: <HelpCircle className="w-3 h-3" />, prompt: tx({ de: 'Wie viele Hashtags sollte ich nutzen und welche?', en: 'How many hashtags should I use and which ones?', es: '¿Cuántos hashtags debo usar y cuáles?' }) },
    { label: tx({ de: 'Viral Hooks', en: 'Viral hooks', es: 'Ganchos virales' }), icon: <Target className="w-3 h-3" />, prompt: tx({ de: 'Wie erstelle ich virale Hooks für meine Posts?', en: 'How do I create viral hooks for my posts?', es: '¿Cómo creo ganchos virales para mis publicaciones?' }) },
  ],
  '/settings': [
    { label: tx({ de: 'Token erneuern', en: 'Renew token', es: 'Renovar token' }), icon: <Link2 className="w-3 h-3" />, prompt: tx({ de: 'Wie erneuere ich meine Social-Media-Tokens?', en: 'How do I renew my social media tokens?', es: '¿Cómo renuevo mis tokens de redes sociales?' }) },
    { label: tx({ de: 'Passwort ändern', en: 'Change password', es: 'Cambiar contraseña' }), icon: <Shield className="w-3 h-3" />, prompt: tx({ de: 'Wie ändere ich mein Passwort?', en: 'How do I change my password?', es: '¿Cómo cambio mi contraseña?' }) },
    { label: tx({ de: 'Plan wechseln', en: 'Switch plan', es: 'Cambiar de plan' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Welche Abo-Pläne gibt es und wie wechsle ich?', en: 'What subscription plans are available and how do I switch?', es: '¿Qué planes de suscripción hay y cómo cambio?' }) },
    { label: tx({ de: 'Benachrichtigungen', en: 'Notifications', es: 'Notificaciones' }), icon: <Settings className="w-3 h-3" />, prompt: tx({ de: 'Wie stelle ich meine E-Mail-Benachrichtigungen ein?', en: 'How do I set up my email notifications?', es: '¿Cómo configuro mis notificaciones por correo electrónico?' }) },
  ],
  '/credits': [
    { label: tx({ de: 'Credits kaufen', en: 'Buy credits', es: 'Comprar créditos' }), icon: <Coins className="w-3 h-3" />, prompt: tx({ de: 'Wie kann ich mehr Credits kaufen?', en: 'How can I buy more credits?', es: '¿Cómo puedo comprar más créditos?' }) },
    { label: tx({ de: 'Verbrauch', en: 'Usage', es: 'Consumo' }), icon: <BarChart3 className="w-3 h-3" />, prompt: tx({ de: 'Wofür werden meine Credits verwendet?', en: 'What are my credits used for?', es: '¿Para qué se usan mis créditos?' }) },
    { label: tx({ de: 'Preise', en: 'Pricing', es: 'Precios' }), icon: <HelpCircle className="w-3 h-3" />, prompt: tx({ de: 'Was kosten die verschiedenen Credit-Pakete?', en: 'How much do the different credit packages cost?', es: '¿Cuánto cuestan los distintos paquetes de créditos?' }) },
  ],
  '/content-studio': [
    { label: tx({ de: 'Template erstellen', en: 'Create template', es: 'Crear plantilla' }), icon: <Layout className="w-3 h-3" />, prompt: tx({ de: 'Wie erstelle ich ein neues Template im Content Studio?', en: 'How do I create a new template in the Content Studio?', es: '¿Cómo creo una nueva plantilla en el Content Studio?' }) },
    { label: tx({ de: 'Template finden', en: 'Find template', es: 'Buscar plantilla' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Wie finde ich das passende Template für meinen Content?', en: 'How do I find the right template for my content?', es: '¿Cómo encuentro la plantilla adecuada para mi contenido?' }) },
    { label: tx({ de: 'Template anpassen', en: 'Customize template', es: 'Personalizar plantilla' }), icon: <Palette className="w-3 h-3" />, prompt: tx({ de: 'Wie kann ich ein Template an meine Brand anpassen?', en: 'How can I adapt a template to my brand?', es: '¿Cómo puedo adaptar una plantilla a mi marca?' }) },
  ],
  '/campaign-wizard': [
    { label: tx({ de: 'Kampagne starten', en: 'Start campaign', es: 'Iniciar campaña' }), icon: <Target className="w-3 h-3" />, prompt: tx({ de: 'Wie starte ich eine neue Kampagne im Wizard?', en: 'How do I start a new campaign in the Wizard?', es: '¿Cómo inicio una nueva campaña en el Asistente?' }) },
    { label: tx({ de: 'Media zuweisen', en: 'Assign media', es: 'Asignar medios' }), icon: <Upload className="w-3 h-3" />, prompt: tx({ de: 'Wie weise ich Medien zu einzelnen Posts zu?', en: 'How do I assign media to individual posts?', es: '¿Cómo asigno medios a publicaciones individuales?' }) },
    { label: tx({ de: 'Vorschau', en: 'Preview', es: 'Vista previa' }), icon: <Video className="w-3 h-3" />, prompt: tx({ de: 'Wie sehe ich eine Vorschau meiner Kampagne?', en: 'How do I preview my campaign?', es: '¿Cómo veo una vista previa de mi campaña?' }) },
    { label: tx({ de: 'Veröffentlichen', en: 'Publish', es: 'Publicar' }), icon: <Zap className="w-3 h-3" />, prompt: tx({ de: 'Wie veröffentliche ich meine Kampagne?', en: 'How do I publish my campaign?', es: '¿Cómo publico mi campaña?' }) },
  ],
  '/content-planner': [
    { label: tx({ de: 'Posts verwalten', en: 'Manage posts', es: 'Gestionar publicaciones' }), icon: <FileText className="w-3 h-3" />, prompt: tx({ de: 'Wie verwalte ich meine geplanten Posts?', en: 'How do I manage my scheduled posts?', es: '¿Cómo gestiono mis publicaciones programadas?' }) },
    { label: tx({ de: 'Zum Kalender', en: 'To calendar', es: 'Al calendario' }), icon: <Calendar className="w-3 h-3" />, prompt: tx({ de: 'Wie übertrage ich Posts in den Kalender?', en: 'How do I transfer posts to the calendar?', es: '¿Cómo transfiero publicaciones al calendario?' }) },
    { label: tx({ de: 'Kampagnen', en: 'Campaigns', es: 'Campañas' }), icon: <Target className="w-3 h-3" />, prompt: tx({ de: 'Wie sehe ich meine Kampagnen im Planner?', en: 'How do I see my campaigns in the Planner?', es: '¿Cómo veo mis campañas en el Planificador?' }) },
  ],
  '/analytics': [
    { label: tx({ de: 'Daten verstehen', en: 'Understand data', es: 'Entender los datos' }), icon: <BarChart3 className="w-3 h-3" />, prompt: tx({ de: 'Erkläre mir die wichtigsten Analytics-Metriken.', en: 'Explain the most important analytics metrics to me.', es: 'Explícame las métricas de análisis más importantes.' }) },
    { label: tx({ de: 'Performance', en: 'Performance', es: 'Rendimiento' }), icon: <TrendingUp className="w-3 h-3" />, prompt: tx({ de: 'Wie verbessere ich meine Content-Performance?', en: 'How do I improve my content performance?', es: '¿Cómo mejoro el rendimiento de mi contenido?' }) },
    { label: tx({ de: 'Beste Inhalte', en: 'Best content', es: 'Mejor contenido' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Welche meiner Inhalte performen am besten?', en: 'Which of my content performs best?', es: '¿Cuál de mi contenido tiene mejor rendimiento?' }) },
  ],
  '/comments': [
    { label: tx({ de: 'Kommentare laden', en: 'Load comments', es: 'Cargar comentarios' }), icon: <MessageSquare className="w-3 h-3" />, prompt: tx({ de: 'Wie importiere ich Kommentare von Social Media?', en: 'How do I import comments from social media?', es: '¿Cómo importo comentarios de redes sociales?' }) },
    { label: tx({ de: 'Analysieren', en: 'Analyze', es: 'Analizar' }), icon: <BarChart3 className="w-3 h-3" />, prompt: tx({ de: 'Wie analysiere ich die Stimmung meiner Kommentare?', en: 'How do I analyze the sentiment of my comments?', es: '¿Cómo analizo el sentimiento de mis comentarios?' }) },
    { label: tx({ de: 'Antworten', en: 'Reply', es: 'Responder' }), icon: <PenTool className="w-3 h-3" />, prompt: tx({ de: 'Wie kann ich auf Kommentare effizient antworten?', en: 'How can I reply to comments efficiently?', es: '¿Cómo puedo responder a los comentarios de forma eficiente?' }) },
  ],
};

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: tx({ de: 'Hilfe starten', en: 'Start help', es: 'Iniciar ayuda' }), icon: <HelpCircle className="w-3 h-3" />, prompt: tx({ de: 'Was kann ich mit AdTool alles machen?', en: 'What all can I do with AdTool?', es: '¿Qué puedo hacer con AdTool?' }) },
  { label: tx({ de: 'Onboarding', en: 'Onboarding', es: 'Incorporación' }), icon: <Zap className="w-3 h-3" />, prompt: tx({ de: 'Führe mich durch die ersten Schritte.', en: 'Guide me through the first steps.', es: 'Guíame por los primeros pasos.' }) },
  { label: tx({ de: 'Feature finden', en: 'Find feature', es: 'Buscar función' }), icon: <Sparkles className="w-3 h-3" />, prompt: tx({ de: 'Ich suche ein bestimmtes Feature...', en: 'I am looking for a specific feature...', es: 'Estoy buscando una función específica...' }) },
  { label: tx({ de: 'Account Status', en: 'Account status', es: 'Estado de la cuenta' }), icon: <Shield className="w-3 h-3" />, prompt: '/status' },
  { label: tx({ de: 'Support', en: 'Support', es: 'Soporte' }), icon: <MessageSquare className="w-3 h-3" />, prompt: tx({ de: 'Ich brauche Hilfe vom Support-Team.', en: 'I need help from the support team.', es: 'Necesito ayuda del equipo de soporte.' }) },
];

export function QuickActions({ currentPage, onActionClick }: QuickActionsProps) {
  // Find the best matching page actions
  const getActionsForPage = () => {
    // Direct match
    if (PAGE_ACTIONS[currentPage]) {
      return PAGE_ACTIONS[currentPage];
    }
    
    // Partial match (e.g., /directors-cut/something matches /directors-cut)
    for (const [path, actions] of Object.entries(PAGE_ACTIONS)) {
      if (currentPage.startsWith(path) && path !== '/') {
        return actions;
      }
    }
    
    return DEFAULT_ACTIONS;
  };

  const actions = getActionsForPage();

  return (
    <div className="px-4 pb-3">
      <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">{tx({ de: 'Schnellaktionen', en: 'Quick actions', es: 'Acciones rápidas' })}</p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, index) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onActionClick(action.prompt)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs bg-muted/30 hover:bg-primary/20 border border-white/5 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
          >
            {action.icon}
            <span>{action.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
