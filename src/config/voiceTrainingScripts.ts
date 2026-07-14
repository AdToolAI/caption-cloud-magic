/**
 * Voice-cloning training scripts (~60–90s spoken).
 * Phonetically balanced: statements, question, exclamation, numbers,
 * soft & hard consonants, vowel range, prosody variation.
 */

export type TrainingScriptLang = "de" | "en" | "es";

export const VOICE_TRAINING_SCRIPTS: Record<
  TrainingScriptLang,
  { title: string; hint: string; text: string }
> = {
  de: {
    title: "Deutsches Trainingsskript",
    hint: "Sprich in normalem Tempo, natürlich und ruhig. Ziel: 60–90 Sekunden.",
    text: `Hallo, mein Name ist Alex und ich nehme diese Aufnahme auf, um meine eigene Stimme zu klonen.

Heute ist ein sonniger Tag, und ich sitze in einem ruhigen Raum ohne Hintergrundgeräusche. Ich spreche gleichmäßig, deutlich und in meinem natürlichen Tonfall.

Wusstest du, dass eine gute Sprachaufnahme fast wichtiger ist als der Text selbst? Genau! Deshalb achte ich auf klare Aussprache, kurze Pausen zwischen den Sätzen und eine ausgewogene Lautstärke.

Zahlen und Daten sind ebenfalls wichtig: Am siebzehnten März zweitausendsechsundzwanzig um neun Uhr dreißig treffen wir uns am Bahnhof. Der Betrag liegt bei einhundertfünfundzwanzig Euro und neunundneunzig Cent.

Manchmal flüstere ich, manchmal spreche ich energisch – doch für dieses Training bleibe ich neutral. Vielen Dank fürs Zuhören, und lass uns eine großartige Stimme erstellen.`,
  },
  en: {
    title: "English training script",
    hint: "Speak at a normal pace, calm and natural. Target 60–90 seconds.",
    text: `Hello, my name is Alex, and I'm recording this sample to clone my own voice.

It's a bright, quiet day, and I'm sitting in a room with almost no background noise. I'm speaking steadily, clearly, and in my natural tone.

Did you know that the quality of a voice recording matters almost more than the words themselves? Exactly. That's why I pay attention to clear pronunciation, short pauses between sentences, and a balanced volume level.

Numbers and dates matter too: on March seventeenth, twenty twenty-six, at nine thirty in the morning, we'll meet at the central station. The total amount is one hundred twenty-five dollars and ninety-nine cents.

Sometimes I whisper, sometimes I speak with energy — but for this training I'll stay neutral. Thanks for listening, and let's build a great voice together.`,
  },
  es: {
    title: "Guion de entrenamiento en español",
    hint: "Habla a ritmo normal, tranquilo y natural. Objetivo: 60–90 segundos.",
    text: `Hola, me llamo Alex y estoy grabando esta muestra para clonar mi propia voz.

Hoy es un día soleado y estoy en una habitación tranquila, casi sin ruido de fondo. Hablo de forma constante, clara y con mi tono natural.

¿Sabías que la calidad de una grabación de voz es casi más importante que las propias palabras? ¡Exacto! Por eso cuido la pronunciación, hago pausas breves entre frases y mantengo un volumen equilibrado.

Los números y las fechas también cuentan: el diecisiete de marzo de dos mil veintiséis, a las nueve y media, nos vemos en la estación central. El importe total es de ciento veinticinco euros con noventa y nueve céntimos.

A veces susurro, a veces hablo con energía, pero para este entrenamiento me mantengo neutral. Gracias por escuchar, y vamos a crear una gran voz.`,
  },
};
