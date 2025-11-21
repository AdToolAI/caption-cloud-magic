import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EngineComparison as EngineData } from '@/hooks/useContentAnalytics';
import { Zap, Clock, CheckCircle2, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface Props {
  engineData: EngineData;
}

export function EngineComparison({ engineData }: Props) {
  const comparisonData = [
    {
      metric: 'Anzahl Renders',
      Remotion: engineData.remotion.total_renders,
      Shotstack: engineData.shotstack.total_renders
    },
    {
      metric: 'Avg. Zeit (s)',
      Remotion: engineData.remotion.avg_render_time,
      Shotstack: engineData.shotstack.avg_render_time
    },
    {
      metric: 'Erfolgsrate (%)',
      Remotion: engineData.remotion.success_rate,
      Shotstack: engineData.shotstack.success_rate
    }
  ];

  const radarData = [
    {
      metric: 'Speed',
      Remotion: (60 / engineData.remotion.avg_render_time) * 20,
      Shotstack: (60 / engineData.shotstack.avg_render_time) * 20,
      fullMark: 100
    },
    {
      metric: 'Reliability',
      Remotion: engineData.remotion.success_rate,
      Shotstack: engineData.shotstack.success_rate,
      fullMark: 100
    },
    {
      metric: 'Cost Efficiency',
      Remotion: 100 - (engineData.remotion.total_cost / engineData.remotion.total_renders) * 1000,
      Shotstack: 100 - (engineData.shotstack.total_cost / engineData.shotstack.total_renders) * 1000,
      fullMark: 100
    },
    {
      metric: 'Volume',
      Remotion: (engineData.remotion.total_renders / (engineData.remotion.total_renders + engineData.shotstack.total_renders)) * 100,
      Shotstack: (engineData.shotstack.total_renders / (engineData.remotion.total_renders + engineData.shotstack.total_renders)) * 100,
      fullMark: 100
    }
  ];

  const winner = {
    speed: engineData.shotstack.avg_render_time < engineData.remotion.avg_render_time ? 'Shotstack' : 'Remotion',
    reliability: engineData.shotstack.success_rate > engineData.remotion.success_rate ? 'Shotstack' : 'Remotion',
    cost: engineData.shotstack.total_cost < engineData.remotion.total_cost ? 'Shotstack' : 'Remotion'
  };

  return (
    <div className="space-y-6">
      {/* Engine Cards */}
      <div className="grid grid-cols-2 gap-6">
        {/* Remotion */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Remotion</h3>
            <Badge variant="outline">React-basiert</Badge>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                Total Renders
              </div>
              <p className="text-2xl font-bold">{engineData.remotion.total_renders}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Avg. Render Zeit
              </div>
              <p className="text-2xl font-bold">{engineData.remotion.avg_render_time}s</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Erfolgsrate
              </div>
              <p className="text-2xl font-bold">{engineData.remotion.success_rate}%</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Gesamtkosten
              </div>
              <p className="text-2xl font-bold">${engineData.remotion.total_cost.toFixed(2)}</p>
            </div>
          </div>
        </Card>

        {/* Shotstack */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Shotstack</h3>
            <Badge variant="outline">Cloud-API</Badge>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                Total Renders
              </div>
              <p className="text-2xl font-bold">{engineData.shotstack.total_renders}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Avg. Render Zeit
              </div>
              <p className="text-2xl font-bold">{engineData.shotstack.avg_render_time}s</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Erfolgsrate
              </div>
              <p className="text-2xl font-bold">{engineData.shotstack.success_rate}%</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Gesamtkosten
              </div>
              <p className="text-2xl font-bold">${engineData.shotstack.total_cost.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Winner Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Winner</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">🏃 Schnellster</p>
            <p className="text-xl font-bold">{winner.speed}</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">✅ Zuverlässigster</p>
            <p className="text-xl font-bold">{winner.reliability}</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">💰 Kostengünstigster</p>
            <p className="text-xl font-bold">{winner.cost}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Bar Comparison */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Direktvergleich</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Remotion" fill="hsl(var(--primary))" />
              <Bar dataKey="Shotstack" fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Radar Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Radar</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar name="Remotion" dataKey="Remotion" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
              <Radar name="Shotstack" dataKey="Shotstack" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.3} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recommendation */}
      <Card className="p-6 bg-primary/5">
        <h3 className="text-lg font-semibold mb-3">💡 Empfehlung</h3>
        <div className="space-y-2 text-sm">
          <p>
            <strong>Für schnelle, einfache Videos:</strong> Nutze Shotstack - 
            {engineData.shotstack.avg_render_time}s Renderzeit und {engineData.shotstack.success_rate}% Erfolgsrate
          </p>
          <p>
            <strong>Für komplexe, hochwertige Animationen:</strong> Nutze Remotion - 
            Mehr Flexibilität und React-Power, trotz {engineData.remotion.avg_render_time}s Renderzeit
          </p>
          <p className="text-muted-foreground mt-3">
            💰 Potenzielle Einsparung durch optimale Engine-Wahl: 
            ${Math.abs(engineData.remotion.total_cost - engineData.shotstack.total_cost).toFixed(2)} pro Monat
          </p>
        </div>
      </Card>
    </div>
  );
}
