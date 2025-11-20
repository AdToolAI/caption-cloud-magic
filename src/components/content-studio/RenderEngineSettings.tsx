import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Rocket, Zap } from 'lucide-react';

interface RenderEngineSettingsProps {
  value: 'remotion' | 'shotstack';
  onChange: (value: 'remotion' | 'shotstack') => void;
}

export const RenderEngineSettings = ({ value, onChange }: RenderEngineSettingsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Rendering Engine
        </CardTitle>
        <CardDescription>
          Wähle die Render-Engine für deine Videos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={value} onValueChange={onChange}>
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="remotion" id="remotion" />
              <Label htmlFor="remotion" className="flex flex-col gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Remotion</span>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Empfohlen
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  Schneller, günstiger (5 Credits), React-basiert
                </span>
              </Label>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="shotstack" id="shotstack" />
              <Label htmlFor="shotstack" className="flex flex-col gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Shotstack</span>
                  <Badge variant="outline">Bewährt</Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  Stabil, etabliert (10 Credits)
                </span>
              </Label>
            </div>
          </div>
        </RadioGroup>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-semibold mb-2 text-sm">💡 Remotion Vorteile:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 50% Kostenersparnis (5 statt 10 Credits)</li>
            <li>• Sofortige Live-Vorschau ohne API-Calls</li>
            <li>• Komplexere Animationen möglich</li>
            <li>• React-basiert, einfacher zu customizen</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
