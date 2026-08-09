import { tx } from "@/lib/i18nText";
/**
 * Template System Error Classes
 * Custom error types for better error handling and user feedback
 */

export class TemplateError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

export class TemplateMappingError extends TemplateError {
  constructor(templateId: string, fieldKey: string, details?: string) {
    super(
      `Field mapping not found for template ${templateId}, field ${fieldKey}`,
      'MAPPING_NOT_FOUND',
      tx({ de: 'Die Feldkonfiguration für dieses Template konnte nicht geladen werden. Bitte versuche es erneut oder wähle ein anderes Template.', en: 'The field configuration for this template could not be loaded. Please try again or pick another template.', es: 'No se pudo cargar la configuración de campos de esta plantilla. Inténtalo de nuevo o elige otra.' }),
      { templateId, fieldKey, details }
    );
    this.name = 'TemplateMappingError';
  }
}

export class TransformationError extends TemplateError {
  constructor(
    fieldKey: string,
    transformationFunction: string,
    inputValue: any,
    originalError?: Error
  ) {
    super(
      `Transformation "${transformationFunction}" failed for field "${fieldKey}" with value: ${inputValue}`,
      'TRANSFORMATION_FAILED',
      tx({ de: `Der Wert für "${fieldKey}" konnte nicht verarbeitet werden. Bitte überprüfe die Eingabe.`, en: `The value for "${fieldKey}" could not be processed. Please check your input.`, es: `No se pudo procesar el valor de "${fieldKey}". Revisa la entrada.` }),
      {
        fieldKey,
        transformationFunction,
        inputValue,
        originalError: originalError?.message,
      }
    );
    this.name = 'TransformationError';
  }
}

export class ComponentLoadError extends TemplateError {
  constructor(componentId: string, details?: string) {
    super(
      `Failed to load Remotion component: ${componentId}`,
      'COMPONENT_LOAD_FAILED',
      tx({ de: 'Die Video-Komponente konnte nicht geladen werden. Bitte lade die Seite neu.', en: 'The video component could not be loaded. Please reload the page.', es: 'No se pudo cargar el componente de vídeo. Recarga la página.' }),
      { componentId, details }
    );
    this.name = 'ComponentLoadError';
  }
}

export class TemplateValidationError extends TemplateError {
  constructor(templateId: string, missingFields: string[]) {
    super(
      `Template validation failed: Missing required fields for template ${templateId}`,
      'VALIDATION_FAILED',
      tx({ de: `Bitte fülle alle erforderlichen Felder aus: ${missingFields.join(', ')}`, en: `Please fill in all required fields: ${missingFields.join(', ')}`, es: `Rellena todos los campos obligatorios: ${missingFields.join(', ')}` }),
      { templateId, missingFields }
    );
    this.name = 'TemplateValidationError';
  }
}

export class DatabaseError extends TemplateError {
  constructor(operation: string, tableName: string, originalError?: Error) {
    super(
      `Database operation "${operation}" failed on table "${tableName}"`,
      'DATABASE_ERROR',
      tx({ de: 'Es gab ein Problem beim Laden der Daten. Bitte versuche es erneut.', en: 'There was a problem loading the data. Please try again.', es: 'Hubo un problema al cargar los datos. Inténtalo de nuevo.' }),
      {
        operation,
        tableName,
        originalError: originalError?.message,
      }
    );
    this.name = 'DatabaseError';
  }
}

/**
 * Error Handler Utility
 */
export class ErrorHandler {
  static handle(error: unknown): { message: string; details?: string } {
    if (error instanceof TemplateError) {
      return {
        message: error.userMessage,
        details: import.meta.env.DEV ? error.message : undefined,
      };
    }

    if (error instanceof Error) {
      return {
        message: tx({ de: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.', en: 'An unexpected error occurred. Please try again.', es: 'Se ha producido un error inesperado. Inténtalo de nuevo.' }),
        details: import.meta.env.DEV ? error.message : undefined,
      };
    }

    return {
      message: tx({ de: 'Ein unbekannter Fehler ist aufgetreten. Bitte versuche es erneut.', en: 'An unknown error occurred. Please try again.', es: 'Se ha producido un error desconocido. Inténtalo de nuevo.' }),
    };
  }

  static log(error: unknown, context?: string) {
    const prefix = context ? `[${context}]` : '';
    
    if (error instanceof TemplateError) {
      console.error(`${prefix} Template Error:`, {
        code: error.code,
        message: error.message,
        userMessage: error.userMessage,
        metadata: error.metadata,
      });
    } else if (error instanceof Error) {
      console.error(`${prefix} Error:`, error.message, error.stack);
    } else {
      console.error(`${prefix} Unknown Error:`, error);
    }
  }

  static isRecoverable(error: unknown): boolean {
    if (error instanceof TemplateMappingError) return true;
    if (error instanceof TransformationError) return true;
    if (error instanceof DatabaseError) return true;
    return false;
  }
}

/**
 * Retry utility for recoverable errors
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!ErrorHandler.isRecoverable(error) || attempt === maxRetries) {
        throw error;
      }

      console.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
