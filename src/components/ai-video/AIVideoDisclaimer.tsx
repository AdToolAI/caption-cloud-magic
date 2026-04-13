import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Tag, Copyright, Ban, Database, ShieldOff, Scale, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface Section {
  icon: React.ElementType;
  title: string;
  items: string[];
}

const content: Record<string, { heading: string; updated: string; sections: Section[] }> = {
  de: {
    heading: 'Rechtliche Hinweise — KI-generierte Videos',
    updated: 'Letzte Aktualisierung: April 2026',
    sections: [
      {
        icon: ShieldAlert,
        title: '1. Haftungsausschluss',
        items: [
          'Alle Videos werden von KI-Modellen Dritter (OpenAI, Replicate, MiniMax, Luma AI u. a.) generiert. Wir übernehmen keinerlei Haftung für Inhalt, Richtigkeit, Vollständigkeit oder Rechtmäßigkeit des erzeugten Materials.',
          'Wir garantieren nicht, dass die generierten Videos frei von Fehlern, Verzerrungen, Halluzinationen oder diskriminierenden Darstellungen sind.',
          'Die Nutzung der generierten Videos erfolgt ausschließlich auf eigenes Risiko des Nutzers.',
        ],
      },
      {
        icon: Tag,
        title: '2. Kennzeichnungspflicht (EU AI Act)',
        items: [
          'Gemäß Art. 50 Abs. 2 der EU-KI-Verordnung (AI Act) müssen KI-generierte Videos bei Veröffentlichung oder Teilen eindeutig als KI-generiert gekennzeichnet werden.',
          'Die Kennzeichnung muss maschinenlesbar sein und für den Empfänger deutlich erkennbar (z. B. durch Wasserzeichen, Overlay-Text oder Metadaten).',
          'Eine fehlende Kennzeichnung kann nach geltendem Recht Bußgelder und rechtliche Konsequenzen nach sich ziehen. Die Verantwortung liegt ausschließlich beim Nutzer.',
        ],
      },
      {
        icon: Copyright,
        title: '3. Urheberrecht & geistiges Eigentum',
        items: [
          'Der Nutzer ist allein verantwortlich dafür, dass generierte Inhalte keine Urheber-, Marken-, Patent- oder Persönlichkeitsrechte Dritter verletzen.',
          'KI-generierte Inhalte können unbeabsichtigt geschütztes Material reproduzieren. Vor kommerzieller Nutzung ist eine rechtliche Prüfung empfohlen.',
          'An den generierten Videos entstehen keine automatischen urheberrechtlichen Ansprüche. Die Rechtslage zur Schutzfähigkeit von KI-generierten Werken ist in vielen Ländern ungeklärt.',
        ],
      },
      {
        icon: Ban,
        title: '4. Verbotene Nutzung',
        items: [
          'KI-generierte Videos dürfen nicht für illegale, diskriminierende, beleidigende, pornografische, gewaltverherrlichende oder irreführende Zwecke verwendet werden.',
          'Die Erstellung von Deepfakes, die reale Personen ohne deren Einwilligung darstellen, ist ausdrücklich untersagt.',
          'Videos, die zur Verbreitung von Desinformation, Hassrede oder zur Beeinflussung demokratischer Prozesse erstellt werden, sind verboten.',
          'Verstöße können zur sofortigen Sperrung des Kontos und zur Weitergabe relevanter Daten an Strafverfolgungsbehörden führen.',
        ],
      },
      {
        icon: Database,
        title: '5. Datenschutz & Datenverarbeitung',
        items: [
          'Eingegebene Prompts und hochgeladene Bilder werden zur Videogenerierung an Drittanbieter-APIs (OpenAI, Replicate Inc., MiniMax, Luma AI) übermittelt.',
          'Diese Drittanbieter können eigene Datenschutzrichtlinien anwenden und Daten ggf. zur Modellverbesserung verwenden. Wir empfehlen, keine personenbezogenen oder vertraulichen Daten in Prompts zu verwenden.',
          'Generierte Videos werden für den Nutzer gespeichert und können jederzeit gelöscht werden. Nach Löschung werden sie innerhalb von 30 Tagen vollständig von unseren Servern entfernt.',
          'Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).',
        ],
      },
      {
        icon: ShieldOff,
        title: '6. Keine Garantie',
        items: [
          'Es besteht kein Anspruch auf Verfügbarkeit, bestimmte Qualität oder ein bestimmtes Ergebnis der Videogenerierung.',
          'Die Generierung kann fehlschlagen, übermäßig lange dauern oder unerwartete Ergebnisse liefern. In solchen Fällen werden die Credits automatisch zurückerstattet.',
          'Wir behalten uns das Recht vor, KI-Modelle, Preise oder Funktionen jederzeit ohne Vorankündigung zu ändern.',
        ],
      },
      {
        icon: Scale,
        title: '7. Haftungsbeschränkung',
        items: [
          'Die Haftung ist in jedem Fall auf den vom Nutzer tatsächlich gezahlten Betrag für die betroffene Videogenerierung begrenzt.',
          'Für mittelbare Schäden, entgangenen Gewinn, Reputationsverluste oder Folgeschäden jeglicher Art wird keine Haftung übernommen.',
          'Diese Beschränkung gilt nicht bei Vorsatz oder grober Fahrlässigkeit sowie bei der Verletzung wesentlicher Vertragspflichten (Kardinalpflichten).',
          'Es gilt deutsches Recht. Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz des Anbieters.',
        ],
      },
    ],
  },
  en: {
    heading: 'Legal Notice — AI-Generated Videos',
    updated: 'Last updated: April 2026',
    sections: [
      {
        icon: ShieldAlert,
        title: '1. Disclaimer of Liability',
        items: [
          'All videos are generated by third-party AI models (OpenAI, Replicate, MiniMax, Luma AI, etc.). We assume no liability for the content, accuracy, completeness, or legality of the generated material.',
          'We do not guarantee that generated videos are free from errors, distortions, hallucinations, or discriminatory depictions.',
          'Use of generated videos is entirely at the user\'s own risk.',
        ],
      },
      {
        icon: Tag,
        title: '2. Labeling Requirements (EU AI Act)',
        items: [
          'Under Art. 50(2) of the EU AI Act, AI-generated videos must be clearly labeled as AI-generated when published or shared.',
          'Labeling must be machine-readable and clearly visible to recipients (e.g., via watermarks, overlay text, or metadata).',
          'Failure to label may result in fines and legal consequences under applicable law. Responsibility lies solely with the user.',
        ],
      },
      {
        icon: Copyright,
        title: '3. Copyright & Intellectual Property',
        items: [
          'The user is solely responsible for ensuring that generated content does not infringe third-party copyrights, trademarks, patents, or personality rights.',
          'AI-generated content may unintentionally reproduce protected material. Legal review is recommended before commercial use.',
          'No automatic copyright claims arise from generated videos. The legal status of AI-generated works remains unresolved in many jurisdictions.',
        ],
      },
      {
        icon: Ban,
        title: '4. Prohibited Use',
        items: [
          'AI-generated videos must not be used for illegal, discriminatory, offensive, pornographic, glorifying violence, or misleading purposes.',
          'Creating deepfakes depicting real persons without their consent is expressly prohibited.',
          'Videos created to spread disinformation, hate speech, or to influence democratic processes are forbidden.',
          'Violations may result in immediate account suspension and disclosure of relevant data to law enforcement authorities.',
        ],
      },
      {
        icon: Database,
        title: '5. Privacy & Data Processing',
        items: [
          'Submitted prompts and uploaded images are transmitted to third-party APIs (OpenAI, Replicate Inc., MiniMax, Luma AI) for video generation.',
          'These third parties may apply their own privacy policies and may use data for model improvement. We recommend not including personal or confidential data in prompts.',
          'Generated videos are stored for the user and can be deleted at any time. After deletion, they are fully removed from our servers within 30 days.',
          'Processing is based on Art. 6(1)(b) GDPR (contract performance) and Art. 6(1)(f) GDPR (legitimate interest).',
        ],
      },
      {
        icon: ShieldOff,
        title: '6. No Warranty',
        items: [
          'There is no entitlement to availability, specific quality, or a particular result from video generation.',
          'Generation may fail, take excessively long, or produce unexpected results. In such cases, credits are automatically refunded.',
          'We reserve the right to change AI models, pricing, or features at any time without prior notice.',
        ],
      },
      {
        icon: Scale,
        title: '7. Limitation of Liability',
        items: [
          'Liability is in any case limited to the amount actually paid by the user for the affected video generation.',
          'No liability is assumed for indirect damages, lost profits, reputational losses, or consequential damages of any kind.',
          'This limitation does not apply in cases of intent or gross negligence, or breach of essential contractual obligations.',
          'German law applies. The place of jurisdiction is, to the extent permitted by law, the registered office of the provider.',
        ],
      },
    ],
  },
  es: {
    heading: 'Aviso Legal — Videos Generados por IA',
    updated: 'Última actualización: Abril 2026',
    sections: [
      {
        icon: ShieldAlert,
        title: '1. Exención de Responsabilidad',
        items: [
          'Todos los videos son generados por modelos de IA de terceros (OpenAI, Replicate, MiniMax, Luma AI, etc.). No asumimos ninguna responsabilidad por el contenido, precisión, integridad o legalidad del material generado.',
          'No garantizamos que los videos generados estén libres de errores, distorsiones, alucinaciones o representaciones discriminatorias.',
          'El uso de los videos generados es bajo el propio riesgo del usuario.',
        ],
      },
      {
        icon: Tag,
        title: '2. Obligación de Etiquetado (EU AI Act)',
        items: [
          'Según el Art. 50(2) del EU AI Act, los videos generados por IA deben etiquetarse claramente como generados por IA cuando se publiquen o compartan.',
          'El etiquetado debe ser legible por máquinas y claramente visible para los destinatarios (p. ej., marcas de agua, texto superpuesto o metadatos).',
          'La falta de etiquetado puede resultar en multas y consecuencias legales. La responsabilidad recae exclusivamente en el usuario.',
        ],
      },
      {
        icon: Copyright,
        title: '3. Derechos de Autor y Propiedad Intelectual',
        items: [
          'El usuario es el único responsable de garantizar que el contenido generado no infrinja derechos de autor, marcas comerciales, patentes o derechos de personalidad de terceros.',
          'El contenido generado por IA puede reproducir involuntariamente material protegido. Se recomienda una revisión legal antes del uso comercial.',
          'No surgen derechos de autor automáticos sobre los videos generados. El estatus legal de las obras generadas por IA no está resuelto en muchas jurisdicciones.',
        ],
      },
      {
        icon: Ban,
        title: '4. Uso Prohibido',
        items: [
          'Los videos generados por IA no deben utilizarse con fines ilegales, discriminatorios, ofensivos, pornográficos, que glorifiquen la violencia o engañosos.',
          'La creación de deepfakes que representen a personas reales sin su consentimiento está expresamente prohibida.',
          'Los videos creados para difundir desinformación, discurso de odio o para influir en procesos democráticos están prohibidos.',
          'Las violaciones pueden resultar en la suspensión inmediata de la cuenta y la divulgación de datos relevantes a las autoridades.',
        ],
      },
      {
        icon: Database,
        title: '5. Privacidad y Procesamiento de Datos',
        items: [
          'Los prompts enviados y las imágenes cargadas se transmiten a APIs de terceros (OpenAI, Replicate Inc., MiniMax, Luma AI) para la generación de videos.',
          'Estos terceros pueden aplicar sus propias políticas de privacidad y pueden usar datos para mejorar sus modelos. Recomendamos no incluir datos personales o confidenciales en los prompts.',
          'Los videos generados se almacenan para el usuario y pueden eliminarse en cualquier momento. Tras la eliminación, se eliminan completamente de nuestros servidores en 30 días.',
          'El procesamiento se basa en el Art. 6(1)(b) RGPD (cumplimiento del contrato) y Art. 6(1)(f) RGPD (interés legítimo).',
        ],
      },
      {
        icon: ShieldOff,
        title: '6. Sin Garantía',
        items: [
          'No existe derecho a disponibilidad, calidad específica o un resultado particular de la generación de video.',
          'La generación puede fallar, tardar excesivamente o producir resultados inesperados. En tales casos, los créditos se reembolsan automáticamente.',
          'Nos reservamos el derecho de cambiar modelos de IA, precios o funciones en cualquier momento sin previo aviso.',
        ],
      },
      {
        icon: Scale,
        title: '7. Limitación de Responsabilidad',
        items: [
          'La responsabilidad se limita en cualquier caso al monto efectivamente pagado por el usuario por la generación de video afectada.',
          'No se asume responsabilidad por daños indirectos, lucro cesante, pérdidas reputacionales o daños consecuentes de cualquier tipo.',
          'Esta limitación no se aplica en casos de dolo o negligencia grave, o incumplimiento de obligaciones contractuales esenciales.',
          'Se aplica la legislación alemana. El lugar de jurisdicción es, en la medida permitida por la ley, el domicilio social del proveedor.',
        ],
      },
    ],
  },
};

function DisclaimerSection({ section, index }: { section: Section; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const Icon = section.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
    >
      <div className={cn(
        'backdrop-blur-xl bg-card/50 border border-border/60 rounded-xl overflow-hidden transition-all duration-300',
        open && 'shadow-[0_0_25px_hsla(43,90%,68%,0.08)]'
      )}>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg transition-all duration-300',
              open ? 'bg-primary/15 shadow-[0_0_12px_hsla(43,90%,68%,0.25)]' : 'bg-muted/50'
            )}>
              <Icon className={cn('w-4 h-4 transition-colors', open ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <h3 className={cn('text-sm font-semibold transition-colors', open ? 'text-primary' : 'text-foreground')}>
              {section.title}
            </h3>
          </div>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronDown className={cn('w-4 h-4', open ? 'text-primary' : 'text-muted-foreground')} />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="px-4 pb-4 pt-0">
                <ul className="pl-10 space-y-2">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function AIVideoDisclaimer() {
  const { language } = useTranslation();
  const data = content[language as keyof typeof content] || content.en;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <ShieldAlert className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{data.heading}</h2>
          <p className="text-xs text-muted-foreground">{data.updated}</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {data.sections.map((section, idx) => (
          <DisclaimerSection key={idx} section={section} index={idx} />
        ))}
      </div>
    </div>
  );
}
