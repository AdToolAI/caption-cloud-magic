import { Link } from "react-router-dom";
import { trackUDC } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Lock, Users, Scissors, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

const pillars = [
  {
    icon: Lock,
    title: "Voice-Lock",
    body: "One voice across every scene. Locked per project — no accidental voice swaps, no drift between takes.",
  },
  {
    icon: Users,
    title: "Anchor-Refresh",
    body: "Character identity stays consistent across cuts. Detects drift, snaps every scene back to the master face.",
  },
  {
    icon: ShieldCheck,
    title: "CI-Preflight",
    body: "Aspect-ratio, endcard length, loudness, brand contrast — checked before render. Fails block export.",
  },
  {
    icon: Scissors,
    title: "Auto Cut-Down",
    body: "One master, endless variants. Generate 15s and 6s cutdowns that preserve hook and payoff automatically.",
  },
];

export function UDCShowcase() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      {/* subtle glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="container max-w-6xl mx-auto relative">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Universal Directors Cut
          </div>
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            The first <span className="text-primary">Consistency-First</span> AI editor.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            CapCut cuts. Descript transcribes. UDC keeps your character, voice, and brand identical across every second — automatically.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/directors-cut" onClick={() => trackUDC('udc_showcase_cta_clicked', { target: 'directors-cut' })}>
            <Button size="lg" className="gap-2">
              Open Directors Cut
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/pricing" onClick={() => trackUDC('udc_showcase_cta_clicked', { target: 'pricing' })}>
            <Button size="lg" variant="outline">
              See pricing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default UDCShowcase;
