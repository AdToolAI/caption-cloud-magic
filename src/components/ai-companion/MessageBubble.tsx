import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

// Parse special markdown-like syntax for rich content
function parseContent(content: string) {
  const parts: Array<{ type: 'text' | 'link' | 'action' | 'code'; content: string; url?: string }> = [];
  
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
      const isExternal = match[2].startsWith('http');
      parts.push({ 
        type: isExternal ? 'link' : 'action', 
        content: match[1], 
        url: match[2] 
      });
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

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = React.useState(false);
  
  const parts = parseContent(content);
  
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success('Kopiert!');
    setTimeout(() => setCopied(false), 2000);
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
        
        {/* Copy button for assistant messages */}
        {role === 'assistant' && !isStreaming && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-8 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={copyToClipboard}
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
