
import OpenAI  from "openai";

export async function postProcessHorariosWithOpenAI(data: any): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const cuadrante = Array.isArray(data?.Cuadrante) ? data.Cuadrante : [];
  if (cuadrante.length === 0) return "No hay horarios disponibles.";

  const limited = { ...data, Cuadrante: cuadrante.slice(0, 80) };
  const payload = JSON.stringify(limited);

  const prompt =
    "Formatea los horarios de atencion para un paciente en texto breve y claro.\n" +
    "Responde en espanol. Maximo 25 lineas.\n" +
    "Agrupa por Centro de Atencion y Servicio. Luego por Profesional.\n" +
    "Ordena por DiaSemanaNombre y HoraDesde.\n" +
    "Si no hay horarios, indicalo.\n\n" +
    `Datos JSON: ${payload}`;

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create({
      model: "gpt-5-mini", // "gpt-4o-mini",
      input: prompt,
      max_output_tokens: 500,
      temperature: 0.2,
    });

    return response.output_text?.trim() || null;
  } catch (err) {
    console.error("OpenAI Error:", err);
    return null;
  }
}