import { tx, type TriText } from '@/lib/i18nText';
interface StatusPillProps {
  status: string;
}

const statusConfig: Record<string, { label: TriText; color: string }> = {
  draft: { label: { de: 'Entwurf', en: 'Draft', es: 'Borrador' }, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  scheduled: { label: { de: 'Geplant', en: 'Scheduled', es: 'Programado' }, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  published: { label: { de: 'Veröffentlicht', en: 'Published', es: 'Publicado' }, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: { de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  suggested: { label: { de: 'Vorgeschlagen', en: 'Suggested', es: 'Sugerido' }, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  missed: { label: { de: 'Verpasst', en: 'Missed', es: 'Perdido' }, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const fallbackConfig: { label: TriText; color: string } = { label: { de: 'Unbekannt', en: 'Unknown', es: 'Desconocido' }, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status] ?? fallbackConfig;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
      {tx(config.label)}
    </span>
  );
}
