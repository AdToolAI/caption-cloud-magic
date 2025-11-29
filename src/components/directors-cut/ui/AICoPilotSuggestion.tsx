import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, AlertTriangle, Sparkles, Palette, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoPilotSuggestion } from '@/hooks/useAICoPilot';

interface AICoPilotSuggestionProps {
  suggestion: CoPilotSuggestion;
  onDismiss: () => void;
  onAction: () => void;
}

const typeConfig = {
  tip: {
    icon: Lightbulb,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  optimization: {
    icon: Sparkles,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  creative: {
    icon: Palette,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
};

export function AICoPilotSuggestion({ suggestion, onDismiss, onAction }: AICoPilotSuggestionProps) {
  const config = typeConfig[suggestion.type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`
        relative p-4 rounded-xl border backdrop-blur-xl
        ${config.bg} ${config.border}
      `}
    >
      {/* Priority indicator */}
      {suggestion.priority === 'high' && (
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
      )}

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </button>

      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground mb-1">
            {suggestion.title}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {suggestion.description}
          </p>

          {suggestion.action && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAction}
              className={`mt-2 h-7 text-xs ${config.color} hover:${config.bg}`}
            >
              {suggestion.action.label}
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface AICoPilotSuggestionsListProps {
  suggestions: CoPilotSuggestion[];
  onDismiss: (id: string) => void;
  onAction: (suggestion: CoPilotSuggestion) => void;
}

export function AICoPilotSuggestionsList({ 
  suggestions, 
  onDismiss, 
  onAction 
}: AICoPilotSuggestionsListProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {suggestions.slice(0, 3).map(suggestion => (
          <AICoPilotSuggestion
            key={suggestion.id}
            suggestion={suggestion}
            onDismiss={() => onDismiss(suggestion.id)}
            onAction={() => onAction(suggestion)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
