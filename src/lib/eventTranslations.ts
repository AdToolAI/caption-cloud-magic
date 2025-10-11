// Event system translations - Separated for clarity
export const eventTranslations = {
  de: {
    captionCreated: "Neue Caption erstellt",
    hooksGenerated: "Hooks generiert",
    goalProgress: "Zielfortschritt aktualisiert",
    goalCompleted: "Ziel erreicht!",
    postScheduled: "Post geplant",
    todayActivity: "Heutige Aktivität",
    postsCreated: "Beiträge erstellt",
    hooksCreated: "Hooks erstellt",
    commentsImported: "Kommentare importiert",
    autoRepliesSent: "Auto-Antworten gesendet",
    recentActivity: "Letzte Aktivitäten",
    recentActivityDesc: "Deine neuesten Content-Erstellungsaktivitäten",
    noActivity: "Noch keine Aktivität. Beginne mit dem Erstellen, um deinen Feed zu sehen!",
    activitiesToday: "Aktivitäten heute",
    startCreating: "Beginne mit dem Erstellen, um deine Aktivität zu sehen",
  },
  en: {
    captionCreated: "New caption created",
    hooksGenerated: "Hooks generated",
    goalProgress: "Goal progress updated",
    goalCompleted: "Goal achieved!",
    postScheduled: "Post scheduled",
    todayActivity: "Today's Activity",
    postsCreated: "Posts created",
    hooksCreated: "Hooks created",
    commentsImported: "Comments imported",
    autoRepliesSent: "Auto-replies sent",
    recentActivity: "Recent Activity",
    recentActivityDesc: "Your latest content creation activities",
    noActivity: "No activity yet. Start creating to see your feed!",
    activitiesToday: "activities today",
    startCreating: "Start creating to see your activity",
  },
  es: {
    captionCreated: "Nueva descripción creada",
    hooksGenerated: "Hooks generados",
    goalProgress: "Progreso de objetivo actualizado",
    goalCompleted: "¡Meta alcanzada!",
    postScheduled: "Publicación programada",
    todayActivity: "Actividad de Hoy",
    postsCreated: "Publicaciones creadas",
    hooksCreated: "Hooks creados",
    commentsImported: "Comentarios importados",
    autoRepliesSent: "Respuestas automáticas enviadas",
    recentActivity: "Actividad Reciente",
    recentActivityDesc: "Tus últimas actividades de creación de contenido",
    noActivity: "Aún no hay actividad. ¡Comienza a crear para ver tu feed!",
    activitiesToday: "actividades hoy",
    startCreating: "Comienza a crear para ver tu actividad",
  },
};

// Helper to get event translation
export function getEventTranslation(key: string, language: string = 'en'): string {
  const lang = language as 'de' | 'en' | 'es';
  return eventTranslations[lang]?.[key as keyof typeof eventTranslations.de] || key;
}
