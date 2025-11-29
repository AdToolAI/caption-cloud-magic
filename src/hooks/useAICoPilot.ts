import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export interface CoPilotSuggestion {
  id: string;
  type: 'tip' | 'warning' | 'optimization' | 'creative';
  title: string;
  description: string;
  action?: {
    label: string;
    command: string;
  };
  priority: 'low' | 'medium' | 'high';
  dismissed: boolean;
}

export interface CoPilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  command?: string;
}

export interface CoPilotContext {
  currentStep: number;
  scenesCount: number;
  hasTransitions: boolean;
  hasEffects: boolean;
  videoDuration: number;
  videoUrl?: string;
}

interface UseAICoPilotOptions {
  context: CoPilotContext;
  onCommand?: (command: string, params?: Record<string, any>) => void;
}

export function useAICoPilot({ context, onCommand }: UseAICoPilotOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<CoPilotMessage[]>([]);
  const [suggestions, setSuggestions] = useState<CoPilotSuggestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Generate proactive suggestions based on context
  const generateSuggestions = useCallback(() => {
    const newSuggestions: CoPilotSuggestion[] = [];

    // Step-based suggestions
    if (context.currentStep === 2 && context.scenesCount === 0) {
      newSuggestions.push({
        id: 'analyze-scenes',
        type: 'tip',
        title: 'Szenen analysieren',
        description: 'Starte die KI-Analyse, um automatisch Szenen zu erkennen und Verbesserungsvorschläge zu erhalten.',
        action: { label: 'Analyse starten', command: 'analyze_scenes' },
        priority: 'high',
        dismissed: false,
      });
    }

    if (context.scenesCount > 0 && !context.hasTransitions) {
      newSuggestions.push({
        id: 'add-transitions',
        type: 'optimization',
        title: 'Übergänge hinzufügen',
        description: 'Dein Video hat noch keine Übergänge. KI-generierte Übergänge verbessern den Fluss.',
        action: { label: 'KI-Übergänge generieren', command: 'generate_transitions' },
        priority: 'medium',
        dismissed: false,
      });
    }

    if (context.videoDuration > 60 && context.scenesCount < 3) {
      newSuggestions.push({
        id: 'more-scenes',
        type: 'warning',
        title: 'Wenige Szenen erkannt',
        description: 'Bei einem Video über 60 Sekunden empfehlen wir mehr Schnitte für besseres Engagement.',
        action: { label: 'Auto-Cut aktivieren', command: 'auto_cut' },
        priority: 'high',
        dismissed: false,
      });
    }

    if (context.currentStep >= 4 && !context.hasEffects) {
      newSuggestions.push({
        id: 'add-style',
        type: 'creative',
        title: 'Style Transfer ausprobieren',
        description: 'Verleihe deinem Video einen einzigartigen Look mit KI Style Transfer.',
        action: { label: 'Styles erkunden', command: 'open_styles' },
        priority: 'low',
        dismissed: false,
      });
    }

    setSuggestions(prev => {
      const existingIds = prev.filter(s => s.dismissed).map(s => s.id);
      return newSuggestions.map(s => ({
        ...s,
        dismissed: existingIds.includes(s.id),
      }));
    });
  }, [context]);

  useEffect(() => {
    generateSuggestions();
  }, [generateSuggestions]);

  // Parse natural language commands
  const parseCommand = useCallback((input: string): { command: string; params: Record<string, any> } | null => {
    const lowerInput = input.toLowerCase();

    // Scene commands
    if (lowerInput.includes('szene') && (lowerInput.includes('analysier') || lowerInput.includes('erkenn'))) {
      return { command: 'analyze_scenes', params: {} };
    }
    if (lowerInput.includes('übergang') && (lowerInput.includes('generier') || lowerInput.includes('erstell'))) {
      return { command: 'generate_transitions', params: {} };
    }
    if (lowerInput.includes('auto') && lowerInput.includes('cut')) {
      return { command: 'auto_cut', params: {} };
    }

    // Style commands
    if (lowerInput.includes('style') || lowerInput.includes('stil')) {
      if (lowerInput.includes('cinema') || lowerInput.includes('film')) {
        return { command: 'apply_style', params: { style: 'cinematic' } };
      }
      if (lowerInput.includes('vintage') || lowerInput.includes('retro')) {
        return { command: 'apply_style', params: { style: 'vintage' } };
      }
      return { command: 'open_styles', params: {} };
    }

    // Color grading
    if (lowerInput.includes('farb') || lowerInput.includes('color')) {
      if (lowerInput.includes('warm')) {
        return { command: 'apply_color', params: { preset: 'warm' } };
      }
      if (lowerInput.includes('kalt') || lowerInput.includes('cool')) {
        return { command: 'apply_color', params: { preset: 'cool' } };
      }
      return { command: 'open_color', params: {} };
    }

    // Audio commands
    if (lowerInput.includes('audio') || lowerInput.includes('ton')) {
      if (lowerInput.includes('laut') || lowerInput.includes('erhöh')) {
        return { command: 'adjust_volume', params: { change: 0.1 } };
      }
      if (lowerInput.includes('leis') || lowerInput.includes('reduzier')) {
        return { command: 'adjust_volume', params: { change: -0.1 } };
      }
      if (lowerInput.includes('rausch') || lowerInput.includes('noise')) {
        return { command: 'noise_reduction', params: {} };
      }
    }

    // Export commands
    if (lowerInput.includes('export') || lowerInput.includes('render')) {
      if (lowerInput.includes('4k')) {
        return { command: 'export', params: { quality: '4k' } };
      }
      return { command: 'open_export', params: {} };
    }

    // Navigation
    if (lowerInput.includes('nächst') && lowerInput.includes('schritt')) {
      return { command: 'next_step', params: {} };
    }
    if (lowerInput.includes('zurück')) {
      return { command: 'prev_step', params: {} };
    }

    return null;
  }, []);

  // Send message to co-pilot
  const sendMessage = useCallback(async (content: string) => {
    const userMessage: CoPilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    // Parse for commands
    const parsed = parseCommand(content);

    let responseContent: string;

    if (parsed) {
      // Execute command
      onCommand?.(parsed.command, parsed.params);
      
      const commandResponses: Record<string, string> = {
        analyze_scenes: 'Ich starte die Szenenanalyse für dein Video...',
        generate_transitions: 'Generiere KI-Übergänge basierend auf der Stimmung deiner Szenen...',
        auto_cut: 'Aktiviere Auto-Cut für optimale Schnittplatzierung...',
        apply_style: `Wende den ${parsed.params.style || 'gewählten'} Stil auf dein Video an...`,
        open_styles: 'Öffne die Style-Auswahl für dich...',
        apply_color: `Wende die ${parsed.params.preset || 'gewählte'} Farbkorrektur an...`,
        open_color: 'Öffne die Farbkorrektur für dich...',
        adjust_volume: parsed.params.change > 0 ? 'Erhöhe die Lautstärke...' : 'Reduziere die Lautstärke...',
        noise_reduction: 'Aktiviere KI-Rauschunterdrückung...',
        export: `Starte Export in ${parsed.params.quality || 'HD'} Qualität...`,
        open_export: 'Öffne die Export-Einstellungen...',
        next_step: 'Navigiere zum nächsten Schritt...',
        prev_step: 'Navigiere zum vorherigen Schritt...',
      };

      responseContent = commandResponses[parsed.command] || 'Führe den Befehl aus...';
    } else {
      // Contextual response
      responseContent = generateContextualResponse(content, context);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const assistantMessage: CoPilotMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: responseContent,
      timestamp: new Date(),
      command: parsed?.command,
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);
  }, [parseCommand, onCommand, context]);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, dismissed: true } : s));
  }, []);

  const executeSuggestionAction = useCallback((suggestion: CoPilotSuggestion) => {
    if (suggestion.action) {
      onCommand?.(suggestion.action.command);
      dismissSuggestion(suggestion.id);
      toast.success(`${suggestion.action.label} ausgeführt`);
    }
  }, [onCommand, dismissSuggestion]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const activeSuggestions = suggestions.filter(s => !s.dismissed);

  return {
    isOpen,
    setIsOpen,
    messages,
    suggestions: activeSuggestions,
    isProcessing,
    sendMessage,
    dismissSuggestion,
    executeSuggestionAction,
    clearMessages,
  };
}

function generateContextualResponse(input: string, context: CoPilotContext): string {
  const lowerInput = input.toLowerCase();

  if (lowerInput.includes('hilf') || lowerInput.includes('help')) {
    return `Ich kann dir bei vielen Aufgaben helfen! Probiere:
• "Analysiere Szenen" - Startet KI-Szenenanalyse
• "Generiere Übergänge" - Erstellt passende Übergänge
• "Wende Cinematic Style an" - Für filmischen Look
• "Erhöhe die Lautstärke" - Audio anpassen
• "Exportiere in 4K" - Video rendern`;
  }

  if (lowerInput.includes('tipp') || lowerInput.includes('empfehl')) {
    if (context.scenesCount === 0) {
      return 'Mein Tipp: Starte mit der Szenenanalyse! Sie erkennt automatisch die besten Schnittpunkte.';
    }
    if (!context.hasTransitions) {
      return 'Probiere KI-Übergänge aus - sie wählen automatisch passende Effekte für jede Szene.';
    }
    return 'Dein Video sieht gut aus! Experimentiere mit Style Transfer für einen einzigartigen Look.';
  }

  if (lowerInput.includes('was kann') || lowerInput.includes('funktion')) {
    return `Im Director's Cut kannst du:
• KI-Szenenanalyse durchführen
• Automatische Übergänge generieren
• Style Transfer anwenden
• Farbkorrektur und Grading
• Audio optimieren
• In HD oder 4K exportieren`;
  }

  return 'Ich verstehe deine Anfrage. Versuche einen spezifischen Befehl wie "Analysiere Szenen" oder frage nach "Hilfe" für alle Optionen.';
}
