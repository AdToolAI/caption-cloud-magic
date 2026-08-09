import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { tx } from '@/lib/i18nText';

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
  scenes?: Array<{ mood?: string; description?: string }>;
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

  // Parse natural language commands locally
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
    if (lowerInput.includes('teil') || (lowerInput.includes('szene') && lowerInput.includes('split'))) {
      return { command: 'split_scene', params: {} };
    }
    if (lowerInput.includes('dupliz') || lowerInput.includes('kopier')) {
      return { command: 'duplicate_scene', params: {} };
    }
    if (lowerInput.includes('lösch') || lowerInput.includes('entfern')) {
      return { command: 'delete_scene', params: {} };
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
    if (lowerInput.includes('audio') || lowerInput.includes('ton') || lowerInput.includes('laut')) {
      const volumeMatch = lowerInput.match(/(\d+)/);
      if (volumeMatch) {
        return { command: 'adjust_volume', params: { value: parseInt(volumeMatch[1]) } };
      }
      if (lowerInput.includes('laut') || lowerInput.includes('erhöh')) {
        return { command: 'adjust_volume', params: { change: 10 } };
      }
      if (lowerInput.includes('leis') || lowerInput.includes('reduzier')) {
        return { command: 'adjust_volume', params: { change: -10 } };
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

  // Generate AI-powered suggestions based on context
  const generateSuggestions = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('director-cut-copilot', {
        body: { 
          message: '', 
          context: {
            ...context,
            scenes: context.scenes?.slice(0, 3),
          }, 
          type: 'suggestions' 
        },
      });

      if (!error && Array.isArray(data?.response)) {
        const aiSuggestions: CoPilotSuggestion[] = data.response.map((s: any, idx: number) => ({
          id: `ai-suggestion-${Date.now()}-${idx}`,
          type: s.type || 'tip',
          title: s.title,
          description: s.description,
          action: s.action ? { label: s.action, command: s.action } : undefined,
          priority: s.priority || 'medium',
          dismissed: false,
        }));
        setSuggestions(prev => {
          const dismissedIds = prev.filter(p => p.dismissed).map(p => p.id);
          return aiSuggestions.map(s => ({
            ...s,
            dismissed: dismissedIds.some(id => id.includes(s.type)),
          }));
        });
        return;
      }
    } catch (error) {
      console.log('Using fallback suggestions');
    }

    // Fallback to local suggestions
    const newSuggestions: CoPilotSuggestion[] = [];

    if (context.currentStep === 2 && context.scenesCount === 0) {
      newSuggestions.push({
        id: 'analyze-scenes',
        type: 'tip',
        title: 'Szenen analysieren',
        description: 'Starte die KI-Analyse für automatische Szenenerkennung.',
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
        description: 'KI-generierte Übergänge verbessern den Videofluss.',
        action: { label: 'KI-Übergänge', command: 'generate_transitions' },
        priority: 'medium',
        dismissed: false,
      });
    }

    if (context.videoDuration > 60 && context.scenesCount < 3) {
      newSuggestions.push({
        id: 'more-scenes',
        type: 'warning',
        title: 'Wenige Szenen',
        description: 'Bei längeren Videos empfehlen wir mehr Schnitte.',
        action: { label: 'Auto-Cut', command: 'auto_cut' },
        priority: 'high',
        dismissed: false,
      });
    }

    if (context.currentStep >= 4 && !context.hasEffects) {
      newSuggestions.push({
        id: 'add-style',
        type: 'creative',
        title: 'Style Transfer',
        description: 'Verleihe deinem Video einen einzigartigen Look.',
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
  }, [context.currentStep, context.scenesCount]);

  // Send message to co-pilot using Lovable AI
  const sendMessage = useCallback(async (content: string) => {
    const userMessage: CoPilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    try {
      // First check for local command parsing
      const localCommand = parseCommand(content);
      
      if (localCommand) {
        onCommand?.(localCommand.command, localCommand.params);
        
        const commandResponses: Record<string, string> = {
          analyze_scenes: tx({ de: '🎬 Starte Szenenanalyse...', en: '🎬 Starting scene analysis...', es: '🎬 Iniciando análisis de escenas...' }),
          generate_transitions: tx({ de: '✨ Generiere KI-Übergänge...', en: '✨ Generating AI transitions...', es: '✨ Generando transiciones de IA...' }),
          auto_cut: tx({ de: '✂️ Aktiviere Auto-Cut...', en: '✂️ Activating auto-cut...', es: '✂️ Activando corte automático...' }),
          split_scene: tx({ de: '✂️ Teile Szene...', en: '✂️ Splitting scene...', es: '✂️ Dividiendo escena...' }),
          duplicate_scene: tx({ de: '📋 Dupliziere Szene...', en: '📋 Duplicating scene...', es: '📋 Duplicando escena...' }),
          delete_scene: tx({ de: '🗑️ Lösche Szene...', en: '🗑️ Deleting scene...', es: '🗑️ Eliminando escena...' }),
          apply_style: `🎨 ${tx({ de: 'Wende', en: 'Applying', es: 'Aplicando' })} ${localCommand.params.style || tx({ de: 'Style', en: 'style', es: 'estilo' })}...`,
          open_styles: tx({ de: '🎨 Öffne Style-Auswahl...', en: '🎨 Opening style selection...', es: '🎨 Abriendo selección de estilo...' }),
          apply_color: `🌈 ${tx({ de: 'Wende', en: 'Applying', es: 'Aplicando' })} ${localCommand.params.preset || tx({ de: 'Farbkorrektur', en: 'color correction', es: 'corrección de color' })}...`,
          open_color: tx({ de: '🌈 Öffne Farbkorrektur...', en: '🌈 Opening color correction...', es: '🌈 Abriendo corrección de color...' }),
          adjust_volume: localCommand.params.change > 0 ? tx({ de: '🔊 Erhöhe Lautstärke...', en: '🔊 Increasing volume...', es: '🔊 Aumentando volumen...' }) : tx({ de: '🔉 Reduziere Lautstärke...', en: '🔉 Decreasing volume...', es: '🔉 Reduciendo volumen...' }),
          noise_reduction: tx({ de: '🎙️ Aktiviere Rauschunterdrückung...', en: '🎙️ Activating noise reduction...', es: '🎙️ Activando reducción de ruido...' }),
          export: `📤 ${tx({ de: 'Starte', en: 'Starting', es: 'Iniciando' })} ${localCommand.params.quality || 'HD'} ${tx({ de: 'Export', en: 'export', es: 'exportación' })}...`,
          open_export: tx({ de: '📤 Öffne Export-Einstellungen...', en: '📤 Opening export settings...', es: '📤 Abriendo ajustes de exportación...' }),
          next_step: tx({ de: '➡️ Nächster Schritt...', en: '➡️ Next step...', es: '➡️ Siguiente paso...' }),
          prev_step: tx({ de: '⬅️ Vorheriger Schritt...', en: '⬅️ Previous step...', es: '⬅️ Paso anterior...' }),
        };

        const assistantMessage: CoPilotMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: commandResponses[localCommand.command] || '✅ Befehl ausgeführt',
          timestamp: new Date(),
          command: localCommand.command,
        };
        setMessages(prev => [...prev, assistantMessage]);
        setIsProcessing(false);
        return;
      }

      // Use Lovable AI for complex queries
      const { data, error } = await supabase.functions.invoke('director-cut-copilot', {
        body: { 
          message: content, 
          context: {
            ...context,
            scenes: context.scenes?.slice(0, 3),
          }, 
          type: 'chat' 
        },
      });

      if (error) throw error;

      let responseContent = typeof data?.response === 'string' 
        ? data.response 
        : data?.raw || tx({ de: 'Ich kann dir bei der Videobearbeitung helfen. Frag mich etwas!', en: "I can help with your video editing. Ask me something!", es: '¡Puedo ayudarte con la edición de video. Pregúntame algo!' });

      // Check if AI detected a command
      if (typeof data?.response === 'object' && data.response?.command) {
        onCommand?.(data.response.command, data.response.params);
        responseContent = data.response.response || `✅ ${data.response.command}`;
      }

      const assistantMessage: CoPilotMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('CoPilot error:', error);
      // Fallback to local contextual response
      const responseContent = generateContextualResponse(content, context);
      const fallbackMessage: CoPilotMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [parseCommand, onCommand, context]);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, dismissed: true } : s));
  }, []);

  const executeSuggestionAction = useCallback((suggestion: CoPilotSuggestion) => {
    if (suggestion.action) {
      onCommand?.(suggestion.action.command);
      dismissSuggestion(suggestion.id);
      toast.success(`${suggestion.action.label} ${tx({ de: 'ausgeführt', en: 'executed', es: 'ejecutado' })}`);
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
• "Analysiere Szenen" - Startet KI-Analyse
• "Generiere Übergänge" - Erstellt passende Übergänge
• "Teile Szene" - Aktuelle Szene splitten (oder Taste S)
• "Dupliziere Szene" - Szene kopieren (oder Taste D)
• "Lösche Szene" - Szene entfernen (oder Delete)
• "Wende Cinematic Style an" - Für filmischen Look
• "Erhöhe die Lautstärke" - Audio anpassen`;
  }

  if (lowerInput.includes('tipp') || lowerInput.includes('empfehl')) {
    if (context.scenesCount === 0) {
      return '💡 Tipp: Starte mit der Szenenanalyse - sie erkennt automatisch die besten Schnittpunkte!';
    }
    if (!context.hasTransitions) {
      return '💡 Tipp: Probiere KI-Übergänge - sie wählen automatisch passende Effekte.';
    }
    return tx({ de: '💡 Dein Video sieht gut aus! Experimentiere mit Style Transfer für einen einzigartigen Look.', en: '💡 Your video looks great! Experiment with style transfer for a unique look.', es: '💡 ¡Tu video se ve genial! Experimenta con la transferencia de estilo para un look único.' });
  }

  if (lowerInput.includes('shortcut') || lowerInput.includes('tastatur')) {
    return `⌨️ Keyboard Shortcuts:
• S - Szene teilen
• D - Szene duplizieren
• Delete/Backspace - Szene löschen
• T - Übergang bearbeiten
• ← → - Szenen navigieren
• 1-6 - Schnell Übergang wählen`;
  }

  return tx({ de: 'Ich verstehe deine Anfrage. Versuche einen Befehl wie "Analysiere Szenen" oder frage nach "Hilfe" für alle Optionen.', en: 'I understand your request. Try a command like "Analyze scenes" or ask for "Help" to see all options.', es: 'Entiendo tu solicitud. Prueba un comando como "Analizar escenas" o pide "Ayuda" para ver todas las opciones.' });
}
