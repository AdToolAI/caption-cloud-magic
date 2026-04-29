import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export const BUYER_LICENSE_VERSION = 'buyer-v1-2026-04-29';

export default function MarketplaceBuyerTerms() {
  return (
    <>
      <Helmet>
        <title>Marketplace Buyer License | AdTool</title>
        <meta name="description" content="Lizenzbedingungen für den Erwerb von Brand Characters im AdTool Marketplace." />
      </Helmet>
      <div className="container mx-auto max-w-3xl py-10 px-4">
        <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Marketplace
        </Link>
        <header className="flex items-start gap-3 mb-8">
          <ShieldCheck className="h-8 w-8 text-primary mt-1" />
          <div>
            <h1 className="text-3xl font-bold">Marketplace — Buyer License</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Version <code className="px-1.5 py-0.5 rounded bg-muted text-xs">{BUYER_LICENSE_VERSION}</code> · Effective 29 April 2026
            </p>
          </div>
        </header>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2>1. License Grant</h2>
            <p>Upon a successful purchase, AdTool grants the Buyer a non-exclusive, worldwide, perpetual (for the lifetime of the listing on the Marketplace), non-transferable license to use the purchased Brand Character ("Character") within the AdTool platform to generate videos, images, voice content and related marketing assets ("Outputs") for the Buyer's own commercial and non-commercial purposes.</p>
          </section>

          <section>
            <h2>2. Permitted Use</h2>
            <ul>
              <li>Use the Character as identity reference in any AdTool studio (Composer, Director's Cut, Video Toolkit, Talking Head).</li>
              <li>Publish the resulting Outputs on the Buyer's own social channels, ads, websites and presentations.</li>
              <li>Edit, color-grade, subtitle, translate and re-render Outputs.</li>
            </ul>
          </section>

          <section>
            <h2>3. Prohibited Use</h2>
            <ul>
              <li>Reselling, redistributing, sub-licensing or making the bare Character (image, identity card, voice profile) available to third parties outside AdTool.</li>
              <li>Creating Outputs that depict identifiable real persons in misleading, defamatory, sexually explicit or politically manipulative ways ("malicious deepfakes").</li>
              <li>Using the Character for content that violates applicable law, infringes third-party rights, promotes hate speech, harassment or self-harm.</li>
              <li>Using the Character for adult or sexually explicit content (current platform policy disallows this regardless of any third-party tag).</li>
              <li>Using the Character to impersonate a real, identifiable person without that person's documented consent.</li>
            </ul>
          </section>

          <section>
            <h2>4. Compliance Responsibilities</h2>
            <p>The Buyer is solely responsible for compliance with applicable laws when publishing Outputs, including:</p>
            <ul>
              <li>EU AI Act labelling obligations (Art. 50) for AI-generated content where required.</li>
              <li>GDPR and equivalent data protection laws in jurisdictions where Outputs are published.</li>
              <li>Advertising standards, sector-specific rules (e.g. financial, medical, political advertising) and platform community guidelines.</li>
            </ul>
          </section>

          <section>
            <h2>5. Take-Down Effect</h2>
            <p>If a Character is permanently removed from the Marketplace following a successful rights-holder complaint, the Buyer must cease creating new Outputs with that Character within 14 days of receiving notification. Already-published Outputs may remain online unless ordered otherwise; in all cases the Buyer will receive an automatic refund of credits paid.</p>
          </section>

          <section>
            <h2>6. Disclaimer</h2>
            <p>AdTool provides the Marketplace as an intermediary platform. While we enforce the Creator Terms strictly (origin wall, model-release uploads, admin review for premium and real-person characters, audit trails), AdTool does not pre-screen every Output and is not the rights holder of Characters offered by Creators. The Buyer must perform their own clearance review when using any Character in high-stakes contexts (broadcast advertising, regulated industries, claims of endorsement).</p>
          </section>

          <section>
            <h2>7. Audit Trail</h2>
            <p>Acceptance of this license is recorded with timestamp, hashed IP address and license version on every purchase, and may be used as evidence in legal proceedings.</p>
          </section>

          <section>
            <h2>8. Refunds</h2>
            <p>Credit purchases are non-refundable except where a Character is permanently removed (section 5) or where mandatory consumer protection law requires otherwise.</p>
          </section>

          <section>
            <h2>9. Governing Law</h2>
            <p>This license is governed by the law of the Federal Republic of Germany. Place of jurisdiction is Berlin, where permitted.</p>
          </section>
        </div>
      </div>
    </>
  );
}
