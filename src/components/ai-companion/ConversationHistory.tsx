import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, MessageCircle, Trash2, ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Conversation {
  id: string;
  title: string;
  context_type: string;
  created_at: string;
  updated_at: string;
}

interface ConversationHistoryProps {
  userId: string;
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onClose: () => void;
}

export function ConversationHistory({
  userId,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onClose,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, [userId]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('companion_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Delete messages first
      await supabase
        .from('companion_messages')
        .delete()
        .eq('conversation_id', conversationId);

      // Then delete conversation
      await supabase
        .from('companion_conversations')
        .delete()
        .eq('id', conversationId);

      setConversations(prev => prev.filter(c => c.id !== conversationId));
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute inset-0 bg-card/98 backdrop-blur-xl z-10 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <span className="font-medium">Gesprächsverlauf</span>
        </div>
      </div>

      {/* New Conversation Button */}
      <div className="p-3 border-b border-white/5">
        <Button
          onClick={() => {
            onNewConversation();
            onClose();
          }}
          className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
          size="sm"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Neues Gespräch
        </Button>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Noch keine Gespräche</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <motion.button
                key={conv.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                onClick={() => {
                  onSelectConversation(conv.id);
                  onClose();
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors group ${
                  currentConversationId === conv.id 
                    ? 'bg-primary/10 border border-primary/20' 
                    : 'border border-transparent hover:border-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(conv.updated_at), { 
                        addSuffix: true, 
                        locale: de 
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => deleteConversation(conv.id, e)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
