import { RenderEngineSettings as RenderEngineSettingsComponent } from '@/components/content-studio/RenderEngineSettings';
import { useRenderEngine } from '@/hooks/useRenderEngine';
import { trackEngineSelection } from '@/lib/analytics';

export const RenderEngineSettingsPage = () => {
  const { renderEngine, setRenderEngine } = useRenderEngine();

  const handleChange = (engine: 'remotion' | 'shotstack') => {
    setRenderEngine(engine);
    trackEngineSelection(engine);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Video Rendering Einstellungen</h1>
          <p className="text-muted-foreground">
            Wähle die Rendering Engine für deine Video-Projekte
          </p>
        </div>

        <RenderEngineSettingsComponent value={renderEngine} onChange={handleChange} />

        <div className="mt-8 p-6 border rounded-lg bg-card">
          <h3 className="font-semibold mb-3">Vergleich der Rendering Engines</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2 text-primary">Remotion</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ 50% günstiger (5 Credits)</li>
                <li>✓ Schnellere Render-Zeiten</li>
                <li>✓ Live-Vorschau ohne Wartezeit</li>
                <li>✓ React-basiert, flexibler</li>
                <li>✓ Komplexe Animationen möglich</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Shotstack</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Bewährt und stabil</li>
                <li>✓ Alle Templates verfügbar</li>
                <li>✓ Enterprise-Support</li>
                <li>✓ JSON-basiert</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <strong>Hinweis:</strong> Die Rendering Engine wird automatisch gewählt basierend auf der
          Template-Verfügbarkeit. Remotion wird bevorzugt verwendet wenn verfügbar.
        </div>
      </div>
    </div>
  );
};
