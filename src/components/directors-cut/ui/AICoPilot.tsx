import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, X, Send, Sparkles, Trash2, 
  MessageSquare, Lightbulb, Command
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CoPilotMessage, CoPilotSuggestion } from '@/hooks/useAICoPilot';
import { AICoPilotSuggestionsList } from './AICoPilotSuggestion';

interface AICoPilotProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  messages: CoPilotMessage[];
  suggestions: CoPilotSuggestion[];
  isProcessing: boolean;
  onSendMessage: (content: string) => void;
  onDismissSuggestion: (id: string) => void;
  onExecuteSuggestion: (suggestion: CoPilotSuggestion) => void;
  onClearMessages: () => void;
}

const quickCommands = [
  { label: 'Szenen analysieren', command: 'Analysiere Szenen' },
  { label: 'Übergänge generieren', command: 'Generiere Übergänge' },
  { label: 'Auto-Cut', command: 'Aktiviere Auto-Cut' },
  { label: 'Style Transfer', command: 'Öffne Style Transfer' },
];

export function AICoPilot({
  isOpen,
  onOpenChange,
  messages,
  suggestions,
  isProcessing,
  onSendMessage,
  onDismissSuggestion,
  onExecuteSuggestion,
  onClearMessages,
}: AICoPilotProps) {
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'suggestions'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleQuickCommand = (command: string) => {
    onSendMessage(command);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => onOpenChange(true)}
            className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
          >
            <Bot className="w-6 h-6" />
            {suggestions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {suggestions.length}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-6 z-50 w-96 h-[500px] max-h-[70vh] rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">KI Co-Pilot</h3>
                    <p className="text-xs text-muted-foreground">Dein Video-Assistent</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClearMessages}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenChange(false)}
                    className="h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'chat'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button
                  onClick={() => setActiveTab('suggestions')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'suggestions'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Tipps
                  {suggestions.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {suggestions.length}
                    </Badge>
                  )}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === 'chat' ? (
                <div className="h-full flex flex-col min-h-0">
                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    <div className="space-y-4">
                      {messages.length === 0 && (
                        <div className="text-center py-8">
                          <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
                          <p className="text-sm text-muted-foreground">
                            Frag mich etwas oder nutze einen Befehl!
                          </p>
                          <div className="flex flex-wrap gap-2 justify-center mt-4">
                            {quickCommands.map(cmd => (
                              <button
                                key={cmd.label}
                                onClick={() => handleQuickCommand(cmd.command)}
                                className="px-3 py-1.5 rounded-full bg-muted/50 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              >
                                {cmd.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {messages.map(message => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-br-md'
                                : 'bg-muted rounded-bl-md'
                            }`}
                          >
                            {message.content}
                            {message.command && (
                              <div className="mt-2 pt-2 border-t border-white/10">
                                <Badge variant="outline" className="text-[10px]">
                                  <Command className="w-2.5 h-2.5 mr-1" />
                                  {message.command}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}

                      {isProcessing && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex justify-start"
                        >
                          <div className="bg-muted p-3 rounded-2xl rounded-bl-md">
                            <div className="flex gap-1">
                              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <form onSubmit={handleSubmit} className="p-4 border-t border-border/50">
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Schreibe einen Befehl..."
                        className="flex-1 bg-muted/50"
                        disabled={isProcessing}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || isProcessing}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-4 h-full overflow-auto">
                  {suggestions.length === 0 ? (
                    <div className="text-center py-8">
                      <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Keine Vorschläge momentan
                      </p>
                    </div>
                  ) : (
                    <AICoPilotSuggestionsList
                      suggestions={suggestions}
                      onDismiss={onDismissSuggestion}
                      onAction={onExecuteSuggestion}
                    />
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
