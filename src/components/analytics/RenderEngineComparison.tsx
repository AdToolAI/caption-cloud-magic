import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Zap, DollarSign } from 'lucide-react';

interface RenderEngineComparisonProps {
  remotionCredits: number;
  shotstackCredits: number;
  remotionCount: number;
  shotstackCount: number;
}

export const RenderEngineComparison = ({ 
  remotionCredits, 
  shotstackCredits,
  remotionCount,
  shotstackCount 
}: RenderEngineComparisonProps) => {
  const totalCredits = remotionCredits + shotstackCredits;
  const totalCount = remotionCount + shotstackCount;
  
  const remotionPercent = totalCredits > 0 ? (remotionCredits / totalCredits) * 100 : 0;
  const shotstackPercent = totalCredits > 0 ? (shotstackCredits / totalCredits) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Engine-Vergleich
        </CardTitle>
        <CardDescription>
          Remotion vs. Shotstack Nutzung
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Remotion */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">Remotion</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{remotionCount} Renders</Badge>
                <Badge variant="outline">{remotionCredits} Credits</Badge>
              </div>
            </div>
            <Progress value={remotionPercent} className="h-2 bg-secondary/20" />
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>{remotionPercent.toFixed(1)}% der Credits</span>
              <span>Ø {remotionCount > 0 ? (remotionCredits / remotionCount).toFixed(1) : 0} Credits/Render</span>
            </div>
          </div>

          {/* Shotstack */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-secondary" />
                <span className="font-medium text-sm">Shotstack</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{shotstackCount} Renders</Badge>
                <Badge variant="outline">{shotstackCredits} Credits</Badge>
              </div>
            </div>
            <Progress value={shotstackPercent} className="h-2 bg-secondary/20" />
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>{shotstackPercent.toFixed(1)}% der Credits</span>
              <span>Ø {shotstackCount > 0 ? (shotstackCredits / shotstackCount).toFixed(1) : 0} Credits/Render</span>
            </div>
          </div>

          {/* Summary */}
          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{totalCount}</div>
                <div className="text-xs text-muted-foreground">Gesamt Renders</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{totalCredits}</div>
                <div className="text-xs text-muted-foreground">Gesamt Credits</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
