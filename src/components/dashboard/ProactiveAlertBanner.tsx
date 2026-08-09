import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProactiveTips } from '@/hooks/useProactiveTips';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function ProactiveAlertBanner() {
  const navigate = useNavigate();
  const { diagnostics, hasIssues, errorCount, warningCount, refetchDiagnostics, isLoading } = useProactiveTips();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !hasIssues || diagnostics.length === 0) {
    return null;
  }

  // Get the most critical issue
  const criticalIssue = diagnostics.find(d => d.status === 'error') || diagnostics[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={cn(
          "rounded-xl p-4 mb-6 border backdrop-blur-md",
          "bg-gradient-to-r",
          errorCount > 0 
            ? "from-destructive/10 to-destructive/5 border-destructive/30" 
            : "from-[hsl(45,93%,69%)]/10 to-[hsl(45,93%,69%)]/5 border-[hsl(45,93%,69%)]/30"
        )}
      >
        <div className="flex items-start gap-4">
          {/* Icon with pulse effect */}
          <motion.div 
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              errorCount > 0 ? "bg-destructive/20" : "bg-[hsl(45,93%,69%)]/20"
            )}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <AlertTriangle className={cn(
              "w-5 h-5",
              errorCount > 0 ? "text-destructive" : "text-[hsl(45,93%,69%)]"
            )} />
          </motion.div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-foreground">
                {errorCount > 0 
                  ? `${errorCount} kritische${errorCount > 1 ? ' Probleme' : 's Problem'} erkannt`
                  : `${warningCount} Warnung${warningCount > 1 ? 'en' : ''}`
                }
              </h4>
              {isLoading && (
                <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
            </div>
            
            <p className="text-sm text-muted-foreground mb-3">
              {criticalIssue.message}
            </p>

            {/* Show other issues if there are more */}
            {diagnostics.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {diagnostics.slice(0, 3).map((d, i) => (
                  <span 
                    key={i}
                    className={cn(
                      "text-xs px-2 py-1 rounded-full",
                      d.status === 'error' ? "bg-destructive/20 text-destructive" : "bg-[hsl(45,93%,69%)]/20 text-[hsl(45,93%,47%)]"
                    )}
                  >
                    {d.category === 'connections' && '🔗'}
                    {d.category === 'credits' && '💳'}
                    {d.category === 'rendering' && '🎬'}
                    {d.category === 'calendar' && '📅'}
                    {' '}{d.message.split('!')[0]}
                  </span>
                ))}
                {diagnostics.length > 3 && (
                  <span className="text-xs px-2 py-1 text-muted-foreground">
                    +{diagnostics.length - 3} weitere
                  </span>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {criticalIssue.action && (
                <Button
                  size="sm"
                  variant={errorCount > 0 ? "destructive" : "default"}
                  className="gap-1"
                  onClick={() => navigate(criticalIssue.action!)}
                >
                  {criticalIssue.actionLabel || 'Jetzt beheben'}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refetchDiagnostics()}
                disabled={isLoading}
              >
                <RefreshCw className={cn("w-3 h-3 mr-1", isLoading && "animate-spin")} />
                Prüfen
              </Button>
            </div>
          </div>

          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}