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
    { label: 'Was kann AdTool?', icon: <HelpCircle className="w-3 h-3" />, prompt: 'Was sind die wichtigsten Features von AdTool und wie kann ich loslegen?' },
    { label: 'Quick Start', icon: <Zap className="w-3 h-3" />, prompt: 'Führe mich durch die ersten Schritte in AdTool.' },
    { label: 'Social verbinden', icon: <Link2 className="w-3 h-3" />, prompt: 'Wie verbinde ich meinen Instagram oder TikTok Account?' },
    { label: 'Erstes Video', icon: <Video className="w-3 h-3" />, prompt: 'Wie erstelle ich mein erstes Video mit AdTool?' },
    { label: 'Credits erklärt', icon: <Coins className="w-3 h-3" />, prompt: 'Wie funktioniert das Credit-System in AdTool?' },
    { label: 'Account Status', icon: <Shield className="w-3 h-3" />, prompt: '/status' },
  ],
  '/dashboard': [
    { label: 'Metrics verstehen', icon: <BarChart3 className="w-3 h-3" />, prompt: 'Erkläre mir die wichtigsten Metriken auf meinem Dashboard.' },
    { label: 'Performance Tipps', icon: <Sparkles className="w-3 h-3" />, prompt: 'Gib mir Tipps wie ich meine Performance verbessern kann.' },
    { label: 'Beste Posting-Zeit', icon: <Calendar className="w-3 h-3" />, prompt: 'Wann ist die beste Zeit um auf meinen Social Media Kanälen zu posten?' },
    { label: 'Trends erkennen', icon: <TrendingUp className="w-3 h-3" />, prompt: 'Welche Trends erkennst du in meinen Dashboard-Daten?' },
    { label: 'Zielgruppe', icon: <Users className="w-3 h-3" />, prompt: 'Was kann ich über meine Zielgruppe aus den Daten lernen?' },
  ],
  '/directors-cut': [
    { label: 'Workflow erklären', icon: <Video className="w-3 h-3" />, prompt: 'Erkläre mir den Director\'s Cut Workflow Schritt für Schritt.' },
    { label: 'AI Auto-Cut', icon: <Wand2 className="w-3 h-3" />, prompt: 'Wie funktioniert der AI Auto-Cut und wann sollte ich ihn nutzen?' },
    { label: 'Export Optionen', icon: <Settings className="w-3 h-3" />, prompt: 'Welche Export-Formate und Qualitätsoptionen gibt es?' },
    { label: 'Effekte hinzufügen', icon: <Sparkles className="w-3 h-3" />, prompt: 'Welche visuellen Effekte kann ich meinem Video hinzufügen?' },
    { label: 'Renderzeit', icon: <Clock className="w-3 h-3" />, prompt: 'Wie lange dauert das Rendering und wie kann ich es beschleunigen?' },
  ],
  '/universal-creator': [
    { label: 'Video erstellen', icon: <Video className="w-3 h-3" />, prompt: 'Wie erstelle ich ein neues Video mit dem Universal Creator?' },
    { label: 'Templates nutzen', icon: <Sparkles className="w-3 h-3" />, prompt: 'Wie kann ich Templates effektiv nutzen?' },
    { label: 'KI Features', icon: <Wand2 className="w-3 h-3" />, prompt: 'Welche KI-Features hat der Universal Creator?' },
    { label: 'Szenen bearbeiten', icon: <Layout className="w-3 h-3" />, prompt: 'Wie kann ich Szenen im Universal Creator anpassen?' },
    { label: 'Text & Untertitel', icon: <FileText className="w-3 h-3" />, prompt: 'Wie füge ich Text und Untertitel zu meinem Video hinzu?' },
  ],
  '/calendar': [
    { label: 'Post planen', icon: <Calendar className="w-3 h-3" />, prompt: 'Wie plane ich einen Post im Kalender?' },
    { label: 'Auto-Publish', icon: <Zap className="w-3 h-3" />, prompt: 'Wie funktioniert Auto-Publish und wie aktiviere ich es?' },
    { label: 'Kampagne erstellen', icon: <Sparkles className="w-3 h-3" />, prompt: 'Wie erstelle ich eine komplette Kampagne?' },
    { label: 'Zeitslots', icon: <Clock className="w-3 h-3" />, prompt: 'Wie richte ich optimale Posting-Zeitslots ein?' },
    { label: 'Event bearbeiten', icon: <PenTool className="w-3 h-3" />, prompt: 'Wie bearbeite ich einen geplanten Post im Kalender?' },
  ],
  '/media-library': [
    { label: 'Upload Tipps', icon: <Upload className="w-3 h-3" />, prompt: 'Welche Dateiformate und Größen werden unterstützt?' },
    { label: 'Speicherlimit', icon: <Settings className="w-3 h-3" />, prompt: 'Wie viel Speicher habe ich und was passiert bei Überschreitung?' },
    { label: 'Medien organisieren', icon: <Sparkles className="w-3 h-3" />, prompt: 'Wie kann ich meine Medien am besten organisieren?' },
    { label: 'Video zu Projekt', icon: <Video className="w-3 h-3" />, prompt: 'Wie verwende ich ein Video aus der Library in einem Projekt?' },
  ],
  '/generator': [
    { label: 'Caption erstellen', icon: <Wand2 className="w-3 h-3" />, prompt: 'Wie erstelle ich die beste Caption mit dem KI-Generator?' },
    { label: 'Tone auswählen', icon: <Sparkles className="w-3 h-3" />, prompt: 'Welcher Ton ist für welche Plattform am besten?' },
    { label: 'Hashtag Strategie', icon: <HelpCircle className="w-3 h-3" />, prompt: 'Wie viele Hashtags sollte ich nutzen und welche?' },
    { label: 'Viral Hooks', icon: <Target className="w-3 h-3" />, prompt: 'Wie erstelle ich virale Hooks für meine Posts?' },
  ],
  '/settings': [
    { label: 'Token erneuern', icon: <Link2 className="w-3 h-3" />, prompt: 'Wie erneuere ich meine Social-Media-Tokens?' },
    { label: 'Passwort ändern', icon: <Shield className="w-3 h-3" />, prompt: 'Wie ändere ich mein Passwort?' },
    { label: 'Plan wechseln', icon: <Sparkles className="w-3 h-3" />, prompt: 'Welche Abo-Pläne gibt es und wie wechsle ich?' },
    { label: 'Benachrichtigungen', icon: <Settings className="w-3 h-3" />, prompt: 'Wie stelle ich meine E-Mail-Benachrichtigungen ein?' },
  ],
  '/credits': [
    { label: 'Credits kaufen', icon: <Coins className="w-3 h-3" />, prompt: 'Wie kann ich mehr Credits kaufen?' },
    { label: 'Verbrauch', icon: <BarChart3 className="w-3 h-3" />, prompt: 'Wofür werden meine Credits verwendet?' },
    { label: 'Preise', icon: <HelpCircle className="w-3 h-3" />, prompt: 'Was kosten die verschiedenen Credit-Pakete?' },
  ],
  '/content-studio': [
    { label: 'Template erstellen', icon: <Layout className="w-3 h-3" />, prompt: 'Wie erstelle ich ein neues Template im Content Studio?' },
    { label: 'Template finden', icon: <Sparkles className="w-3 h-3" />, prompt: 'Wie finde ich das passende Template für meinen Content?' },
    { label: 'Template anpassen', icon: <Palette className="w-3 h-3" />, prompt: 'Wie kann ich ein Template an meine Brand anpassen?' },
  ],
  '/campaign-wizard': [
    { label: 'Kampagne starten', icon: <Target className="w-3 h-3" />, prompt: 'Wie starte ich eine neue Kampagne im Wizard?' },
    { label: 'Media zuweisen', icon: <Upload className="w-3 h-3" />, prompt: 'Wie weise ich Medien zu einzelnen Posts zu?' },
    { label: 'Vorschau', icon: <Video className="w-3 h-3" />, prompt: 'Wie sehe ich eine Vorschau meiner Kampagne?' },
    { label: 'Veröffentlichen', icon: <Zap className="w-3 h-3" />, prompt: 'Wie veröffentliche ich meine Kampagne?' },
  ],
  '/content-planner': [
    { label: 'Posts verwalten', icon: <FileText className="w-3 h-3" />, prompt: 'Wie verwalte ich meine geplanten Posts?' },
    { label: 'Zum Kalender', icon: <Calendar className="w-3 h-3" />, prompt: 'Wie übertrage ich Posts in den Kalender?' },
    { label: 'Kampagnen', icon: <Target className="w-3 h-3" />, prompt: 'Wie sehe ich meine Kampagnen im Planner?' },
  ],
  '/analytics': [
    { label: 'Daten verstehen', icon: <BarChart3 className="w-3 h-3" />, prompt: 'Erkläre mir die wichtigsten Analytics-Metriken.' },
    { label: 'Performance', icon: <TrendingUp className="w-3 h-3" />, prompt: 'Wie verbessere ich meine Content-Performance?' },
    { label: 'Beste Inhalte', icon: <Sparkles className="w-3 h-3" />, prompt: 'Welche meiner Inhalte performen am besten?' },
  ],
  '/comments': [
    { label: 'Kommentare laden', icon: <MessageSquare className="w-3 h-3" />, prompt: 'Wie importiere ich Kommentare von Social Media?' },
    { label: 'Analysieren', icon: <BarChart3 className="w-3 h-3" />, prompt: 'Wie analysiere ich die Stimmung meiner Kommentare?' },
    { label: 'Antworten', icon: <PenTool className="w-3 h-3" />, prompt: 'Wie kann ich auf Kommentare effizient antworten?' },
  ],
};

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: 'Hilfe starten', icon: <HelpCircle className="w-3 h-3" />, prompt: 'Was kann ich mit AdTool alles machen?' },
  { label: 'Onboarding', icon: <Zap className="w-3 h-3" />, prompt: 'Führe mich durch die ersten Schritte.' },
  { label: 'Feature finden', icon: <Sparkles className="w-3 h-3" />, prompt: 'Ich suche ein bestimmtes Feature...' },
  { label: 'Account Status', icon: <Shield className="w-3 h-3" />, prompt: '/status' },
  { label: 'Support', icon: <MessageSquare className="w-3 h-3" />, prompt: 'Ich brauche Hilfe vom Support-Team.' },
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
      <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Schnellaktionen</p>
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
