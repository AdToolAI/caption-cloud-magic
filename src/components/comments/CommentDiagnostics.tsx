import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Target,
  Lightbulb
} from "lucide-react";

interface DiagnosticsData {
  mood: string;
  risk: string;
  generalStatement: string;
  recommendations: Array<{
    title: string;
    detail: string;
    impact: string;
    eta: string;
  }>;
  quoteTargets: {
    positiveRateCurrent: number;
    positiveRateTarget: number;
    replyRateCurrent: number;
    replyRateTarget: number;
  };
}

interface CommentDiagnosticsProps {
  data: DiagnosticsData | null;
  loading: boolean;
}

export const CommentDiagnostics = ({ data, loading }: CommentDiagnosticsProps) => {
  if (loading) {
    return (
      <div className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted/30 rounded w-3/4"></div>
          <div className="h-4 bg-muted/30 rounded"></div>
          <div className="h-4 bg-muted/30 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10"
      >
        <div className="text-center">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                       flex items-center justify-center shadow-[0_0_25px_hsla(43,90%,68%,0.15)]"
          >
            <Lightbulb className="h-8 w-8 text-primary/60" />
          </motion.div>
          <p className="text-muted-foreground">Noch keine Diagnose verfügbar.</p>
          <p className="text-sm mt-2 text-muted-foreground/70">Importiere Kommentare und analysiere sie.</p>
        </div>
      </motion.div>
    );
  }

  const getMoodIcon = () => {
    if (data.mood === "Gut") return <CheckCircle2 className="h-5 w-5 text-green-400" />;
    if (data.mood === "Kritisch") return <AlertTriangle className="h-5 w-5 text-red-400" />;
    return <TrendingUp className="h-5 w-5 text-yellow-400" />;
  };

  const getMoodBadgeClass = () => {
    if (data.mood === "Gut") return "bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_hsla(120,60%,50%,0.2)]";
    if (data.mood === "Kritisch") return "bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_10px_hsla(0,60%,50%,0.2)]";
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shadow-[0_0_10px_hsla(45,60%,50%,0.2)]";
  };

  const getRiskBadgeClass = () => {
    if (data.risk === "Hoch") return "bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_10px_hsla(0,60%,50%,0.2)]";
    if (data.risk === "Mittel") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shadow-[0_0_10px_hsla(45,60%,50%,0.2)]";
    return "bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_hsla(120,60%,50%,0.2)]";
  };

  const getImpactColor = (impact: string) => {
    if (impact === "hoch") return "text-red-400";
    if (impact === "mittel") return "text-yellow-400";
    return "text-green-400";
  };

  const positiveProgress = (data.quoteTargets.positiveRateCurrent / data.quoteTargets.positiveRateTarget) * 100;
  const replyProgress = (data.quoteTargets.replyRateCurrent / data.quoteTargets.replyRateTarget) * 100;

  return (
    <div className="space-y-4">
      {/* Status Badges */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl backdrop-blur-xl bg-card/60 border border-white/10
                   hover:border-primary/20 transition-all duration-300"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {getMoodIcon()}
            <span className="font-semibold">Stimmung</span>
          </div>
          <Badge className={`border ${getMoodBadgeClass()}`}>{data.mood}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">Risiko</span>
          </div>
          <Badge className={`border ${getRiskBadgeClass()}`}>{data.risk}</Badge>
        </div>
      </motion.div>

      {/* General Statement */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-4 rounded-xl backdrop-blur-xl bg-card/60 border border-white/10
                   hover:border-primary/20 transition-all duration-300"
      >
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
            <Lightbulb className="h-3 w-3 text-primary" />
          </div>
          Gesamt-Aussage
        </h3>
        <p className="text-sm text-muted-foreground">{data.generalStatement}</p>
      </motion.div>

      {/* Quote Targets */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-4 rounded-xl backdrop-blur-xl bg-card/60 border border-white/10
                   hover:border-primary/20 transition-all duration-300"
      >
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Target className="h-3 w-3 text-cyan-400" />
          </div>
          Ziele
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Positive-Quote</span>
              <span className="font-mono text-primary">
                {(data.quoteTargets.positiveRateCurrent * 100).toFixed(0)}% / {(data.quoteTargets.positiveRateTarget * 100).toFixed(0)}%
              </span>
            </div>
            <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(positiveProgress, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute h-full bg-gradient-to-r from-primary to-cyan-400
                           shadow-[0_0_10px_hsla(43,90%,68%,0.5)]"
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Antwort-Quote</span>
              <span className="font-mono text-primary">
                {(data.quoteTargets.replyRateCurrent * 100).toFixed(0)}% / {(data.quoteTargets.replyRateTarget * 100).toFixed(0)}%
              </span>
            </div>
            <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(replyProgress, 100)}%` }}
                transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                className="absolute h-full bg-gradient-to-r from-cyan-400 to-primary
                           shadow-[0_0_10px_hsla(180,60%,60%,0.5)]"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Recommendations */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="p-4 rounded-xl backdrop-blur-xl bg-card/60 border border-white/10
                   hover:border-primary/20 transition-all duration-300"
      >
        <h3 className="font-semibold mb-4">Verbesserungs-Vorschläge</h3>
        <div className="space-y-3">
          {data.recommendations.map((rec, idx) => (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + idx * 0.1 }}
              className="p-3 rounded-xl bg-muted/20 border-l-2 border-primary
                         hover:bg-muted/30 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-1">
                <h4 className="font-medium text-sm">{rec.title}</h4>
                <Badge variant="outline" className="text-xs border-white/20 bg-muted/20">
                  <Clock className="h-3 w-3 mr-1" />
                  {rec.eta}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{rec.detail}</p>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Impact:</span>
                <span className={`text-xs font-medium ${getImpactColor(rec.impact)}`}>
                  {rec.impact}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
