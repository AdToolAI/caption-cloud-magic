import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Copy, Check, RefreshCw, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { VoiceOutput } from './VoiceOutput';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  voiceId?: string;
  voiceEnabled?: boolean;
  autoSpeak?: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
  onAction?: (action: string, params?: Record<string, string>) => void;
}

type ContentPart = {
  type: 'text' | 'link' | 'action' | 'code' | 'reconnect' | 'connect' | 'support';
  content: string;
  url?: string;
  platform?: string;
  action?: string;
};

// Parse special markdown-like syntax for rich content
function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  
  // Pattern for links with query params: [text](/path?param=value)
  // Pattern for internal links: [text](/path)
  // Pattern for external links: [text](https://...)
  // Pattern for code blocks: `code`
  const regex = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    
    if (match[1] && match[2]) {
      // Link
      const url = match[2];
      const isExternal = url.startsWith('http');
      
      // Check for special action URLs
      if (url.includes('reconnect=')) {
        const platform = url.split('reconnect=')[1]?.split('&')[0];
        parts.push({ 
          type: 'reconnect', 
          content: match[1], 
          url,
          platform 
        });
      } else if (url.includes('connect=')) {
        const platform = url.split('connect=')[1]?.split('&')[0];
        parts.push({ 
          type: 'connect', 
          content: match[1], 
          url,
          platform 
        });
      } else if (url === '/support') {
        parts.push({ 
          type: 'support', 
          content: match[1], 
          url 
        });
      } else {
        parts.push({ 
          type: isExternal ? 'link' : 'action', 
          content: match[1], 
          url 
        });
      }
    } else if (match[3]) {
      // Code
      parts.push({ type: 'code', content: match[3] });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }
  
  return parts.length > 0 ? parts : [{ type: 'text' as const, content }];
}

export function MessageBubble({ 
  role, 
  content, 
  isStreaming,
  voiceId,
  voiceEnabled,
  autoSpeak,
  onSpeakingChange,
  onAction
}: MessageBubbleProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = React.useState(false);
  
  const parts = parseContent(content);
  
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success('Kopiert!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReconnect = (platform: string | undefined) => {
    if (platform) {
      onAction?.('reconnect', { platform });
      navigate(`/settings?tab=connections&reconnect=${platform}`);
    }
  };

  const handleConnect = (platform: string | undefined) => {
    if (platform) {
      onAction?.('connect', { platform });
      navigate(`/settings?tab=connections&connect=${platform}`);
    }
  };

  const handleSupport = () => {
    onAction?.('support');
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform?.toLowerCase()) {
      case 'instagram': return '📸';
      case 'tiktok': return '🎵';
      case 'youtube': return '📺';
      case 'linkedin': return '💼';
      case 'facebook': return '📘';
      case 'x':
      case 'twitter': return '𝕏';
      default: return '🔗';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex group",
        role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm relative",
          role === 'user'
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted/50 text-foreground rounded-bl-md border border-white/5"
        )}
      >
        <div className="whitespace-pre-wrap">
          {parts.map((part, i) => {
            switch (part.type) {
              case 'link':
                return (
                  <a
                    key={i}
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {part.content}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                );
              case 'action':
                return (
                  <button
                    key={i}
                    onClick={() => navigate(part.url!)}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    {part.content} →
                  </button>
                );
              case 'reconnect':
                return (
                  <button
                    key={i}
                    onClick={() => handleReconnect(part.platform)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 my-0.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {getPlatformIcon(part.platform || '')} {part.content}
                  </button>
                );
              case 'connect':
                return (
                  <button
                    key={i}
                    onClick={() => handleConnect(part.platform)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 my-0.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 font-medium transition-colors"
                  >
                    <Link2 className="w-3 h-3" />
                    {getPlatformIcon(part.platform || '')} {part.content}
                  </button>
                );
              case 'support':
                return (
                  <button
                    key={i}
                    onClick={handleSupport}
                    className="inline-flex items-center gap-1.5 px-2 py-1 my-0.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 font-medium transition-colors"
                  >
                    🎫 {part.content}
                  </button>
                );
              case 'code':
                return (
                  <code
                    key={i}
                    className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-xs"
                  >
                    {part.content}
                  </code>
                );
              default:
                return <span key={i}>{part.content}</span>;
            }
          })}
          
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse" />
          )}
        </div>
        
        {/* Action buttons for assistant messages */}
        {role === 'assistant' && !isStreaming && content.length > 5 && (
          <div className="flex items-center gap-1 absolute -right-14 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Voice output button */}
            {voiceEnabled && voiceId && (
              <VoiceOutput
                text={content}
                voiceId={voiceId}
                autoPlay={autoSpeak}
                onPlayStart={() => onSpeakingChange?.(true)}
                onPlayEnd={() => onSpeakingChange?.(false)}
              />
            )}
            
            {/* Copy button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={copyToClipboard}
            >
              {copied ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
