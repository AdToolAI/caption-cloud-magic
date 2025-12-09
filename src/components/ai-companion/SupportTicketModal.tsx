import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bug, Lightbulb, User, CreditCard, HelpCircle, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  conversationSummary?: string;
  detectedError?: {
    message: string;
    stack?: string;
    url?: string;
  };
}

const categories = [
  { id: 'bug', label: 'Bug melden', icon: Bug, color: 'text-red-400' },
  { id: 'feature', label: 'Feature-Wunsch', icon: Lightbulb, color: 'text-yellow-400' },
  { id: 'account', label: 'Account-Problem', icon: User, color: 'text-blue-400' },
  { id: 'billing', label: 'Abrechnung', icon: CreditCard, color: 'text-green-400' },
  { id: 'other', label: 'Sonstiges', icon: HelpCircle, color: 'text-muted-foreground' },
];

export function SupportTicketModal({
  isOpen,
  onClose,
  conversationId,
  conversationSummary,
  detectedError
}: SupportTicketModalProps) {
  const [category, setCategory] = useState<string>(detectedError ? 'bug' : '');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!category) {
      toast.error('Bitte wähle eine Kategorie');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt');

      // Build metadata
      const ticketMetadata: Record<string, unknown> = {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      if (conversationSummary) {
        ticketMetadata.conversationSummary = conversationSummary;
      }

      if (detectedError) {
        ticketMetadata.error = detectedError;
      }

      // Create subject
      const categoryLabel = categories.find(c => c.id === category)?.label || category;
      const subject = detectedError 
        ? `[Auto] Fehler erkannt: ${detectedError.message.slice(0, 50)}...`
        : `${categoryLabel}: ${description.slice(0, 50)}${description.length > 50 ? '...' : ''}`;

      // Insert ticket using RPC or direct insert
      const ticketData = {
        user_id: user.id,
        conversation_id: conversationId || null,
        category,
        subject,
        description: description || conversationSummary || 'Keine Beschreibung',
        priority: detectedError ? 'high' : 'normal',
        metadata: ticketMetadata,
      };

      const { error: insertError } = await supabase
        .from('support_tickets')
        .insert(ticketData as any);

      if (insertError) throw insertError;

      // Send email notification
      await supabase.functions.invoke('send-support-ticket', {
        body: {
          userEmail: user.email,
          category,
          subject,
          description: description || conversationSummary,
          metadata: ticketMetadata,
        }
      });

      setIsSuccess(true);
      toast.success('Support-Ticket erstellt!');
      
      setTimeout(() => {
        onClose();
        setIsSuccess(false);
        setCategory('');
        setDescription('');
      }, 2000);

    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('Fehler beim Erstellen des Tickets');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-primary/10 to-transparent">
              <h3 className="text-lg font-semibold text-foreground">
                An Support weiterleiten
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {isSuccess ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-8 gap-4"
                >
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <p className="text-foreground font-medium">Ticket erfolgreich erstellt!</p>
                  <p className="text-sm text-muted-foreground">Wir melden uns so schnell wie möglich.</p>
                </motion.div>
              ) : (
                <>
                  {/* Detected Error Banner */}
                  {detectedError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-sm text-red-400 font-medium">Fehler erkannt:</p>
                      <p className="text-xs text-red-300/80 mt-1 font-mono truncate">
                        {detectedError.message}
                      </p>
                    </div>
                  )}

                  {/* Category Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Kategorie</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          className={`
                            flex items-center gap-2 p-3 rounded-lg border transition-all text-left
                            ${category === cat.id 
                              ? 'border-primary bg-primary/10' 
                              : 'border-white/10 hover:border-white/20 bg-muted/20'
                            }
                          `}
                        >
                          <cat.icon className={`w-4 h-4 ${cat.color}`} />
                          <span className="text-sm text-foreground">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Beschreibung (optional)
                    </Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Beschreibe dein Anliegen..."
                      rows={4}
                      className="bg-muted/20 border-white/10 focus:border-primary/60 resize-none"
                    />
                  </div>

                  {/* Conversation Context */}
                  {conversationSummary && (
                    <div className="p-3 rounded-lg bg-muted/20 border border-white/5">
                      <p className="text-xs text-muted-foreground mb-1">Chat-Verlauf wird angehängt:</p>
                      <p className="text-sm text-foreground/80 line-clamp-2">{conversationSummary}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    onClick={handleSubmit}
                    disabled={!category || isSubmitting}
                    className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Wird gesendet...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Ticket erstellen
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
