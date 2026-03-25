// tools-hp.ts
// ------------------------------------------------------------
// Herramientas para la gestión de turnos en el Hospital Privado
// Compatibles con la Realtime API de OpenAI
// ------------------------------------------------------------
import { z } from "zod";
import { tool } from "@openai/agents/realtime";
import type { CallCtx } from "./../Interfaces/CallCtx.js";
import { estaEnHorarioAtencion } from "./../utils/horarios_atencion.js"
import { success } from "zod/v4";
import { postProcessHorariosWithOpenAI } from "./../utils/post-procesador-horarios.js";


// Helper para obtener la fecha y hora en formato legible en español (24 horas, UTC-3)
export function timestamp(ctx: CallCtx): string {
   try {
      const timestamp = new Date().toLocaleString("es-AR", {
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
         hour12: false,
         timeZone: "America/Argentina/Buenos_Aires"
      });
      return `${timestamp} - ${ctx.callId ? `CallID: ${ctx.callId}` : "No CallID"}`;
   } catch {
      return new Date().toISOString();
   }
}

// ---------------- VALIDAR DNI ----------------
export const validarDni = tool({
   name: "validar_dni",
   description:
      "Valida que el número de DNI o documento del usuario se encuentre empadronado en el sistema. Devuelve el IdPersona y las coberturas disponibles del usuario./n" +
      `
Preamble sample phrases:
*IMPORTANT:* You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.
- Voy a validar el dni del paciente.
- Dejame buscar el dni en el sistema.
- Voy a verificar si el dni esta empadronado.
- Un momento por favor, estoy validando el dni del paciente.`,
   parameters: z.object({
      dni: z.string().describe("Número de DNI o documento del usuario a validar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] Validando DNI ${parameters.dni}...`);
      const url = `${process.env.BACKEND_URL}/turnoshp/validar-dni?dni=${parameters.dni}`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));

          let instrucciones = `
          # Intrucciones para el manejo de errores.
          - Diferenciar de errores tecnicos o errores porque el dni no figura empadronado en el sistema
          
          ## Intrucciones para el manejo de error por DNI no empadronado
          - Repetir el DNI ingresado digito por digito e informar que no esta empadronado. Ejemplo: 'El Dni 1-2-3-4-5-6-7-8 no esta empadronado.'
          - Si el numero ingresado tiene algun error de tipeo ofrece re-intentar validar al paciente nuevamete con el dni correcto. 
          - Si el numero fue correctamente ingresado, sugerir derivar con un asistente humano para gestionar el empadronamiento.

          ## Instrucciones para errores 
          - Informar al usuario de que estas experimentando errores tecnicos.
          - Reintentar otra vez mas. Si el error persiste ofrecer derivar con un asistente humano.
          `

         if (!data.exito && data.mensaje) {
            return { success: false, error: data.mensaje, instrucciones: instrucciones};
         } else if (!data.exito) {
            return { success: false, data, instrucciones: instrucciones };
         }

         let isPAMI = false;
         if (Array.isArray(data.coberturas)) {
            const excluir = ["PARTICULAR", "APROSS"];
            data.coberturas = data.coberturas.filter(
               (cob: any) => !excluir.some((ex) => cob.nombre.includes(ex))
            );
            isPAMI = data.coberturas.some(
               (c: any) => typeof c?.nombre === "string" && c.nombre.toLowerCase().includes("pami")
            );
            
         }

          instrucciones = `
         # Instrucciones para manejar esta respuesta.
         - No informes al usuario de los Ids
         
         ## Instrucciones de validadcion para obtener un nuevo turno 
         - Si el usuario esta intentando obtner turnos segui estas instrucciones
         - Indicale al usuario el nombre del paciente registrado con el DNI que ingreso. 
         - Si el paciente tiene mas de una cobertura debe elegir una para gestionar el turno. Si solo tiene una, procede con la unica vigente.
         - Realiza la transferencia al agente especializado proactivamente sin decirle al usuario.

         ## Instrucciones de validacion para cancelar, consultar o reprogramar turnos
         - Si el usuario esta intentando cancelar, consultar o reprogramar turnos, no es necesario informale sus coberturas.
         - Si el usuario esta empadronado y tiene al menos una cobertura vigente hace la transferencia al agente especializado proactivamente sin decirle al usuario.
         - Si no tiene que niguna cobertura informale que podra consultar turnos pero no podra obtener uno nuevo o reprogramar.         
         ` ;

         if(isPAMI){
            instrucciones += `
            ## Instrucciones para cobertura PAMI.
            - Para la cobertura PAMI solo esta disponible agendar turnos para el servicio de oftalmologia o para profesionales en dicho servicio.
            - Si el paciente solo posee cobertura PAMI o elije PAMI como su cobertura para gestionar el turno, informar que solo podra gestionar turnos para oftalmologia.
            `
         }

         if (data.coberturas.length === 0) {
            instrucciones = "El paciente no posee cobertura válida para gestionar turnos en el Hospital Privado de Córdoba. Ofrecele transferir a un asistente humano";
         } //else if( data.coberturas.length > 1 ) {
         //    instrucciones = "El paciente posee más de una cobertura. Pedile que elija una para continuar. ";
         // }else{
         //    instrucciones = "El paciente posee una cobertura válida. Continuar con la gestión de turnos con el IdCobertura: " + data.coberturas[0].idCobertura;
         // }

         instrucciones += 'Si el usuario esta intentando cancelar o consultar turnos asignados, no es necesario informarle las coberturas, ni necesario que eliga una. Solo es necesario el IdPersona para usar la herramienta *hp_obtener_mis_proximos_turnos* para recuperar sus turnos asignados.';
         return { success: true, data, instrucciones };
      } catch (error: any) {
         console.error("Error al validar DNI:", error.message);
         return { success: false, error: error.message };
      }
   },
});

// ---------------- BUSCAR SERVICIOS ----------------
export const hp_buscar_servicios = tool({
   name: "hp_buscar_servicios",
   description:
      `Busca servicios y prestaciones médicas del hospital según el texto de consulta.
      Preamble sample phrases:
      *IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.
      - Estoy buscando los servicios en el sistema un momento...
      - Voy a consultar en el sistema los servicios disponibles para esa consulta.
      `,
   parameters: z.object({
      consulta: z.string().describe("Texto con la consulta del usuario."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_buscar_servicios:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnoshp/buscar_servicio?inputText=${parameters.consulta}`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));
         return { success: true, data };
      } catch (error: any) {
         console.error("Error al buscar servicios:", error.message);
         return { success: false, error: error.message };
      }
   },
});

// ---------------- OBTENER CENTROS ----------------
export const hp_obtener_centros_para_el_servicio = tool({
   name: "hp_obtener_centros_para_el_servicio",
   description:
      "Recupera los centros de atención donde se realizan las prestaciones seleccionadas.",
   parameters: z.object({
      IdServicio: z.number(),
      IdPrestacion: z.number(),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_obtener_centros_para_el_servicio:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnoshp/ObtenerCentroPorServiciosPrestacion?IdServicio=${parameters.IdServicio}&IdPrestacion=${parameters.IdPrestacion}`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
         const data = await response.json();
         return { success: true, data };
      } catch (error: any) {
         console.error("Error al obtener centros:", error.message);
         return { success: false, error: error.message };
      }
   },
});

// ---------------- BUSCAR TURNOS ----------------
export const buscar_turnos = tool({
   name: "buscar_turnos",
   description:
      `Encuentra los primeros turnos disponibles a partir de una fecha para determinados días de la semana.
      Preamble sample phrases:
      *IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.

      - Estoy buscando los turnos disponibles en el sistema un momento...
      - Voy a consultar en el sistema los turnos disponibles para esa consulta.
      - Estoy buscando los turnos disponibles a partir de la fecha indicada en el sistema un momento...
      `,
   parameters: z.object({
      IdPersona: z.number(),
      IdCobertura: z.number(),
      IdServicio: z.number(),
      IdPrestacion: z.number(),
      IdCentroAtencion: z.number().nullable().optional().describe("ID del centro de atención. Opcional. Si no se proporciona, se buscarán turnos en todos los centros."),
      fecha: z.string().nullable().optional().describe("Fecha a partir de la cual buscar turnos, en formato yyyy-MM-dd. Si no se indica, se buscará a partir de la fecha actual."),
      IdProfesional: z.number().nullable().optional().describe("ID del profesional. Opcional. Si no se proporciona, se buscarán turnos con cualquier profesional."),
      DiasSemana: z.string().nullable().optional(),
      horaDesde: z.string().nullable().optional(),
      horaHasta: z.string().nullable().optional(),
      multiple: z.boolean().nullable().optional().describe("Indica si se están buscando múltiples turnos para un mismo paciente o para diferentes pacientes. Si es true, el agente especializado en gestión de turnos múltiples se encargará de buscar los turnos más próximos entre sí para cada paciente.")
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] buscar_turnos:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnoshp/obtener_primeros_turnos_disponibles`;

      try {
         const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parameters),
         });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));

         let instrucciones = "";
         //TODO: revisar si el backend devuelve turnos. Si no hay turnos generar una instruccion diciendole al agente que no hay turnos disponibles a partir de la fecha en adelante.
         if (data.Turnos && data.Turnos.length === 0) {

            instrucciones = `
            No hay turnos disponibles a partir de la fecha indicada. Si no se indico fecha, significa que no hay turnos disponibles en el futuro para la combinación de parámetros indicada. 
            Si no se indico IdCentroAtencion, significa que se busco en todos los centros.
            Si no se indico IdProfesional, significa que se busco con todos los profesionales.
            Solo sugerir alternativas si el usuario indico un centro o profesional específico o fecha posterior a la actual.
            `;

         } else {
            if (!parameters.IdCentroAtencion) {
               instrucciones += "Si el usuario quiere en un centro especifico, usa la herramienta *hp_obtener_todos_los_centros_atencion* para obtener el IdCentroAtencion y luego busca nuevamente los turnos con ese IdCentroAtencion. ";
            }
            if (!parameters.IdProfesional) instrucciones += "Si el usuario quiere con un profesional especifico, usa la herramienta *hp_buscar_profesional* para obtener el IdProfesional y luego busca nuevamente los turnos con ese IdProfesional. ";

            instrucciones += `
            #Intrucciones para gestionar la respuesta al usuario:
            - Agrupar los turnos por fecha.
            - Decirle al usuario el día y luego los turnos disponibles para ese día. Solo informa el dia y luego la hora de cada turno disponible. Por ejemplo: "El 12 de Octubre de 2024 hay turnos 3 turnos, a las 10:00, 11:00 y 15:00hs. El 15 de Octubre de 2024 hay 2 turnos, a las 9:00 y 14:00hs."
            - Luego que el usuario eliga un turno, informale el detalle completo del turno elegido (IdTurno, fecha, hora, profesional, centro de atención) y preguntale si quiere confirmar ese turno. 
            - Si el usuario confirma, usá la herramienta *asignar_turno* para asignarle ese turno.
            `
         }

         if (parameters.multiple) instrucciones += "\n - Si estas buscando multples turnos, no des las opciones hasta no encontrar las coincidencias mas proximas"

         return { success: true, data, instrucciones };
      } catch (error: any) {
         console.error("Error al buscar turnos:", error.message);
         return { success: false, error: error.message };
      }
   },
});

// ---------------- ASIGNAR TURNO ----------------
export const asignar_turno = tool({
   name: "asignar_turno",
   description: `
   Asigna un turno a un paciente. 
   Preamble sample phrases:
   *IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.

   - Estoy asignando el turno en el sistema un momento...
   - Voy a asignar el turno en el sistema un momento...
   `,
   parameters: z.object({
      IdTurno: z.number(),
      IdPersona: z.number(),
      IdCobertura: z.number(),
      IdPrestacion: z.number(),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] asignar_turno:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnoshp/asignar`;

      try {
         const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parameters),
         });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
         return { success: true, data: await response.json(), instrucciones: '*Importante:* Informa al usuario que el turno ha sido asignado exitosamente y recibirá un mail con la confirmación.' };
      } catch (error: any) {
         console.error("Error al asignar turno:", error.message);
         return { success: false, error: error.message };
      }
   },
});

// ---------------- BUSCAR PROFESIONAL ----------------
export const hp_buscar_profesional = tool({
   name: "hp_buscar_profesional",
   description: `Utiliza esta herramienta cuando el usuario quiera buscar un profesional por su nombre.
Devuelve los profesionales con los nombres más similares al valor pasado como parametro.
Preamble sample phrases
*IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.
- Estoy buscando el profesional en el sistema un momento...
- Voy a consultar en el sistema el profesional un momento...
- Estoy buscando el profesional en el sistema a partir del nombre indicado un momento...

`,
   parameters: z.object({
      nombreProfesional: z.string().describe("Nombre completo o parcial del profesional a buscar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_buscar_profesional:`, parameters);
      const url = `${process.env.BACKEND_URL}/getByProfesionalNameHP?inputText=Profesional: ${parameters.nombreProfesional}`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });

         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));
         return { success: true, data };
      } catch (error) {
         console.error("Error al buscar profesional:", error);
         return { success: false, error: (error as Error).message };
      }
   },
});

// ---------------- BUSCAR SERVICIOS y CENTROS ----------------
export const hp_buscar_servicios_y_centros = tool({
   name: "hp_buscar_servicios_y_centros",
   description: `Utiliza esta herramienta para recuperar los servicios que ofrece un profesional y en que centro de atención los ofrece. `,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_buscar_servicios_y_centros:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnoshp/obtener-servicios-centros?IdProfesional=${parameters.IdProfesional}`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });

         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));
         return { success: true, data };
      } catch (error) {
         console.error("Error al buscar servicios y centros del profesional:", error);
         return { success: false, error: (error as Error).message };
      }

   },
});

// ---------------- BUSCAR PRESTACIONES ----------------
export const hp_buscar_prestaciones = tool({
   name: "hp_buscar_prestaciones",
   description: `Utiliza esta herramienta para obtener las prestaciones que ofrece un profesional o médico en un centro de atención, para un servicio determinado. Por ejemplo  Consulta Medica, Telemedicina, Colocacion de holter.`,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
      IdCentroAtencion: z.number().describe("ID del centro de atención a consultar."),
      IdServicio: z.number().describe("ID del servicio a consultar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_buscar_prestaciones:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/obtener-prestaciones`;

      const options = {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify({
            IdCentroAtencion: parameters.IdCentroAtencion, // El string con la información del cliente
            IdServicio: parameters.IdServicio,        // El string con la lista de productos
            IdProfesional: parameters.IdProfesional,
         })
      };

      try {
         const response = await fetch(url, options);
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));
         return { success: true, data };
      } catch (error) {
         console.error("Error al buscar prestaciones del profesional:", error);
         return { success: false, error: (error as Error).message };
      }
   },
});

// ---------------- OBTENER MIS PROXIMOS TURNO ----------------
export const hp_obtener_mis_proximos_turnos = tool({
   name: "hp_obtener_mis_proximos_turnos",
   description: `Utiliza esta herramienta para obtener los próximos turnos asignados a un paciente.
   Preamble sample phrases
   *IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.

   - Estoy buscando en el sistema tus próximos turnos un momento...
   - Voy a consultar en el sistema tus próximos turnos un momento...
   - Voy a buscar en el sistema tus turnos asignados un momento...
   `,
   parameters: z.object({
      IdPersona: z.number().describe("ID de la persona a consultar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_obtener_mis_proximos_turnos:`, parameters);

      const url = `${process.env.BACKEND_URL}/turnos/mis-turnos`;

      const options = {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify({
            IdPersona: parameters.IdPersona
         })
      };

      try {
         const response = await fetch(url, options);
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
         const data = await response.json().catch(async () => ({ result: await response.text() }));
         return { success: true, data };
      } catch (error) {
         console.error("Error al obtener mis próximos turnos:", error);
         return { success: false, error: (error as Error).message }
      }
   }
});

// ---------------- ANULAR TURNO ----------------
export const anular_turno = tool({
   name: "anular_turno",
   description: `
   Anula un turno previamente asignado a un paciente.
   Preamble sample phrases
   *IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.
   - Estoy anulando el turno en el sistema un momento...
   - Voy a anular el turno en el sistema un momento...
   - Ahora voy a cancelar el turno en el sistema un momento...
   `,
   parameters: z.object({
      IdTurno: z.number().describe("ID del turno a anular."),
      IdPersona: z.number().describe("ID de la persona que tiene el turno."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] anular_turno:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/anular_turno`;

      const options = {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify({
            IdTurno: parameters.IdTurno,
            IdPersona: parameters.IdPersona
         })
      };

      try {
         const response = await fetch(url, options);
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));
         return { success: true, data };
      } catch (error) {
         console.error("Error al anular el turno:", error);
         return { success: false, error: (error as Error).message };
      }
   },
});

// ---------------- TRANSFERIR LLAMADA ----------------
export const transferir_llamada = tool({
   name: "transferir_llamada",
   description: `Transfiere la llamada actual a un destino SIP configurado en el entorno.
Usar esta herramienta cuando el usuario solicita hablar con un operador humano o cuando se requiere derivar la llamada.`,
   parameters: z.object({
      motivo: z.string().describe("Motivo por el cual se transfiere la llamada."),
   }), // sin parámetros
   execute: async (parameters, ctx) => {
      const callId = (ctx?.context as CallCtx)?.callId;
      if (!callId) {
         return {
            success: false,
            error: "No hay callId disponible en el contexto de la llamada.",
         };
      };

      if (!estaEnHorarioAtencion()) {
         return {
            success: false,
            message: "No es posible derivar la llamada fuera del horario de atención.",
         };
      };

      const targetUri = process.env.SIP_TRANSFER_TARGET;
      if (!targetUri) {
         return {
            success: false,
            message:
               "No es posible derivar la llamada en este momento. El destino de transferencia no está configurado.",
         };
      }

      const baseUrl = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}`;
      const headers = {
         Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
         "Content-Type": "application/json",
      };

      console.info(`👉 Motivo de la transferencia ${callId}: ${parameters.motivo}`);

      try {
         // ⏳ Esperar 5 segundos antes de transferir
         await new Promise((resolve) => setTimeout(resolve, 5000));

         // 1️⃣ Enviar la solicitud de transferencia (REFER)
         const referRes = await fetch(`${baseUrl}/refer`, {
            method: "POST",
            headers,
            body: JSON.stringify({ target_uri: targetUri }),
         });

         if (!referRes.ok) {
            const text = await referRes.text();
            return {
               success: false,
               message: `No se pudo derivar la llamada (HTTP ${referRes.status}).`,
               error: text,
            };
         }

         console.log(`✅ Llamada derivada correctamente a ${targetUri}`);

         // 2️⃣ Intentar finalizar la llamada en OpenAI (sin interrumpir si falla)
         try {
            setTimeout(async () => {
               const hangupRes = await fetch(`${baseUrl}/hangup`, {
                  method: "POST",
                  headers,
               });

               if (!hangupRes.ok) {
                  const text = await hangupRes.text();
                  console.warn(
                     `⚠️ No se pudo finalizar la llamada (HTTP ${hangupRes.status}).`,
                     text
                  );
               } else {
                  console.log(`📞 Llamada finalizada localmente tras la transferencia.`);
               }
            }, 1500);
         } catch (hangupError) {
            console.warn("⚠️ Error al intentar colgar la llamada:", hangupError);
         }

         return {
            success: true,
            message: `Llamada derivada correctamente a ${targetUri}. *No es necesario que hables para indicarle al usuario*.`,
         };
      } catch (error: any) {
         console.error("❌ Error al transferir la llamada:", error);
         return {
            success: false,
            message: "Error al intentar derivar la llamada.",
            error: error.message,
         };
      }
   },
});

// ---------------- COLGAR LLAMADA ----------------
export const colgar_llamada = tool({
   name: "colgar_llamada",
   description: `finaliza la llamada actual (hangup). Usar cuando la conversación ha terminado o el usuario lo solicita. 
Preamble sample phrases
*IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.
- Voy a colgar la llamada, que tengas un buen día.
- Finalizo la llamada, gracias por comunicarte con el Hospital Privado de Córdoba.
- Voy a finalizar la llamada, que tengas un buen día.
 `,
   parameters: z.object({
      reason: z.string().optional().describe("Motivo del corte (opcional)."),
   }),
   execute: async (_args, ctx) => {
      // Retornar una promesa que se resuelve después del timeout
      return new Promise((resolve) => {
         setTimeout(async () => {
            const callId = (ctx?.context as CallCtx)?.callId;
            if (!callId) {
               resolve({
                  success: false,
                  error: "No hay callId disponible en el contexto.",
               });
               return;
            }

            const url = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`;

            try {
               const res = await fetch(url, {
                  method: "POST",
                  headers: {
                     Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  },
               });

               if (!res.ok) {
                  const text = await res.text();
                  resolve({
                     success: false,
                     error: `Error al colgar (${res.status}): ${text}`,
                  });
                  return;
               }

               console.log(`Llamada ${callId} finalizada correctamente.`);
               resolve({
                  success: true,
                  message: "Llamada finalizada correctamente.",
               });
            } catch (error: any) {
               console.error("Error al colgar la llamada:", error);
               resolve({
                  success: false,
                  error: error.message,
               });
            }
         }, 5000); // Espera 5 segundos antes de cortar
      });
   },
});

// ---------------- FECHA Y HORA ACTUAL DE ARGENTINA (UTC-3) ----------------
export const hp_fecha_hora_argentina = tool({
   name: "hp_fecha_hora_argentina",
   description:
      "Devuelve la fecha y hora actual de Argentina (UTC-3) en formato yyyy-MM-dd HH:mm:ss.",
   parameters: z.object({}),
   execute: async (parameters, ctx) => {
      try {
         const date = new Date();

         // Forzamos la zona horaria de Argentina
         const dateInArgentina = new Intl.DateTimeFormat("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
         })
            .formatToParts(date)
            .reduce((acc: any, part) => {
               acc[part.type] = part.value;
               return acc;
            }, {});

         // Armamos el formato solicitado: yyyy-MM-dd HH:mm:ss
         const fechaHoraArgentina = `${dateInArgentina.year}-${dateInArgentina.month}-${dateInArgentina.day} ${dateInArgentina.hour}:${dateInArgentina.minute}:${dateInArgentina.second}`;

         console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_fecha_hora_argentina ejecutada → ${fechaHoraArgentina}`);

         return {
            success: true,
            data: {
               fechaHoraArgentina,
               zona: "UTC-3",
            },
         };
      } catch (err: any) {
         console.error("Error en hp_fecha_hora_argentina:", err.message);
         return {
            success: false,
            error: err.message,
         };
      }
   },
});


// ---------------- OBTENER TODOS LOS CENTROS DE ATENCIÓN DEL HP ----------------
export const Centros_de_Atencion_del_HP = tool({
   name: "hp_obtener_todos_los_centros_atencion",
   description: "Recupera la lista de todos los centros de atención del Hospital Privado de Córdoba.",
   parameters: z.object({}),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_obtener_todos_los_centros_atencion ejecutada`);
      const ressult = `{
  "CentrosDeAtenciones": [
    {
      "Id": 20,
      "Nombre": "Anexo Jardin",
      "Direccion": "Av. Richieri 3176",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 14,
      "Nombre": "Central",
      "Direccion": "Av. Naciones Unidas 346, Córdoba",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 34,
      "Nombre": "Centro Rehabilitación SDE",
      "Direccion": "Santiago del Estero 333, Córdoba",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 17,
      "Nombre": "Cerro",
      "Direccion": "Luis de Tejeda 4625. Córdoba. CP 5000.",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 33,
      "Nombre": "Ctro Perif. Finochietto",
      "Direccion": "Enrique Finocchietto 460",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 31,
      "Nombre": "Ctro Perif. Jardín Espinosa     ",
      "Direccion": "Jardín Espinosa",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 30,
      "Nombre": "Ctro Perif. Recta Martinolli",
      "Direccion": "Recta Martinolli",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 35,
      "Nombre": "Ctro Perif. SDE",
      "Direccion": "Santiago del Estero 333, Córdoba",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 16,
      "Nombre": "Hiper Libertad",
      "Direccion": "Hiper Libertad Rodriguez del Busto - Fray Luis Beltrán y Cardeñosa, Poeta Lugones - Córdoba",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 29,
      "Nombre": "Hospital Privado Nuñez",
      "Direccion": "Av. Rafael Nuñez 5229 - Córdoba",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 37,
      "Nombre": "Hospital Privado Urquiza",
      "Direccion": "Justo José de Urquiza 332 - Córdoba Capital",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 15,
      "Nombre": "Patio Olmos",
      "Direccion": "Obispo Trejo 320, Córdoba",
      "Email": null,
      "Telefono": "0351-4688200"
    },
    {
      "Id": 18,
      "Nombre": "Villa Allende",
      "Direccion": "Río de Janeiro 1725 (esq. Mendoza) - Villa Allende",
      "Email": null,
      "Telefono": "0351-4688200"
    }
  ],
  "IdRequest": null,
  "Exito": false,
  "Codigo": 200,
  "Mensaje": null,
  "Mensajes": [],
  "HasException": false
}`;
      return { success: true, data: JSON.parse(ressult) };
   },

});


export const hp_buscar_por_subespecialidad = tool({
   name: "hp_buscar_por_subespecialidad",
   description: `Utiliza esta herramienta para obtener profesionales del hospital según una subespecialidad médica específica.`,
   parameters: z.object({
      subespecialidad: z.string().describe("Nombre de la subespecialidad médica a consultar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hp_buscar_por_subespecialidad:`, parameters);

      const url = `${process.env.BACKEND_URL}/buscar_profesionales_subespecialidad_hp?subespecialidad=${parameters.subespecialidad}`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });

         // leer body aunque sea error
         const raw = await response.text();
         let data: any;
         try {
            data = raw ? JSON.parse(raw) : null;
         } catch {
            data = { raw };
         }
         if (!response.ok) {
            const msg =
               data?.Mensaje ??
               data?.mensaje ??
               data?.data?.Mensaje ??
               data?.data?.mensaje ??
               `HTTP ${response.status}`;
            return {
               success: false,
               status: response.status,
               message: msg,
               data, // te dejo el payload completo para debug/LLM
            };
         }

         const instrucciones = `
            # Instrucciones para interpretar la respuesta:
            - Devuelve una lista de profesionales que coinciden con la subespecialidad médica solicitada.
            - Cada regitro incluye: Profesional, IdProfesional, IdServicio, Servicio, IdCentroAtencion.
            ## Instrucciones para dar un turno con estos profesionales.
            (si el usuario no eligio un profesional en particular repetí estas instrucciones por cada profesional)
            1. Falta recuperar el IdPrestacion para cada profesional. Usa la herramienta hp_buscar_prestaciones con IdProfesional, IdCentroAtencion e IdServicio para obtener las prestaciones disponibles.
            2. Luego, usa la herramienta buscar_turnos con IdServicio, IdPrestacion, IdPersona, IdCobertura, para finalmente encontrar los primeros turnos disponibles.
               - Si el usuario manifiesta que quiere un turno para una fecha especifica inclui el parametro *"fecha"* y el sistema te devolverá los primeros turnos disponibles a partir de esa fecha. Si no, se usará la fecha actual.
               - Si el usuario quiere buscar turnos para días de semanas específicos, envía el parámetro  *"DiasSemana"* con los dias separados por coma (ej: "lunes, miércoles, viernes").
               - Si el usuario quiere turnos por la tarde o por la mañana usa el parametro *"horaDesde"* y *"horaHasta"* para filtrar los turnos.
            3. Informa al usuario los primeros turnos disponibles, incluyendo fecha, hora, centro de atención y profesional (si aplica). Preguntar si quiere reservar alguno.
            4. Si el usuario selecciona un turno para reservar, volver a informar el turno. Si ningun turno es aceptado, ofrece buscar nuevamente con otros filtros.
            5. Si el usuario confirma Usar la herramienta *"asignar_turno"*  para asignar el turno seleccionado.
            6. Informar al usuario si el turno fue asignado exitosamente y preguntar si podes ayudar en algo mas.
         `;

         return { success: true, data, instrucciones };
      } catch (error: any) {
         console.error("Error al buscar profesionales por subespecialidad:", error.message);
         return { success: false, error: error.message };
      }
   }
});

export const hp_obtener_horarios_de_atencion_profesional = tool({
   name: "hp_buscar_horarios_profesional",
   description: `Utiliza esta herramienta para obtener los horarios de atención de un profesional en el hospital. Devuelve los días y horas en que el profesional atiende, agrupados por centro de atención y servicio.`,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
   }),
   execute: async (parameters, context) => {
      console.log(`[${timestamp(context?.context as CallCtx)}] hp_buscar_horarios_profesional:`, parameters);
      const callId = (context?.context as CallCtx)?.callId || "desconocido";
      const url = `${process.env.BACKEND_URL}/turnoshp/recuperar_horarios_atencion?IdProfesional=${parameters.IdProfesional}`;
      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
         // leer body aunque sea error
         const raw = await response.text();
         let data: any;
         try {
            data = raw ? JSON.parse(raw) : null;
         } catch {
            data = { raw };
         }
         if (!response.ok) {
            const msg =
               data?.Mensaje ??
               data?.mensaje ??
               data?.data?.Mensaje ??
               data?.data?.mensaje ??
               `HTTP ${response.status}`;
            return {
               success: false,
               status: response.status,
               message: msg,
               data, // te dejo el payload completo para debug/LLM
            };
         }

         const formatted = await postProcessHorariosWithOpenAI(data);

         return formatted
            ? { success: true, status: response.status, data, formatted }
            : { success: true, status: response.status, data };
      } catch (error: any) {
         console.error("Error al buscar horarios del profesional:", error.message);
         return { success: false, error: error.message };
      }
   },
});

export const hp_informacion_general = tool({
   name: "hp_informacion_general",
   description: `Utiliza esta herramienta para responder preguntas generales sobre el Hospital Privado de Córdoba, como su dirección, teléfonos de contacto, horarios de atención, etc. Devuelve la información solicitada en formato claro y conciso.`,
   parameters: z.object({
      consulta: z.string().describe("Texto con la consulta del usuario sobre información general del hospital."),
   }),
   execute: async (parameters, context) => {
      console.log(`[${timestamp(context?.context as CallCtx)}] hp_informacion_general:`, parameters);
      //const url = `${process.env.BACKEND_URL}/turnoshp/informacion_general?consulta=${encodeURIComponent(parameters.consulta)}`;

      const hardcode_data = `
      
Hospital Privado - Preguntas Frecuentes (FAQ)
=============================================

1. Turnos y Atención
--------------------
P: ¿Cómo saco un turno?
R: Podés obtener un turno de las siguientes maneras:
   - Llamando a la Central de Turnos al (0351) 468 8888 (lunes a viernes de 8 a 20 h).
   - Vía WhatsApp al +54 9 3517 65-0637 (disponible las 24 horas, todos los días).
   - A través del portal de pacientes en la web oficial del Hospital Privado.

P: ¿Se pueden pedir turnos por WhatsApp?
R: Sí, al número +54 9 3517 65-0637, disponible las 24 horas, todo el año.

P: ¿Dónde puedo sacar turno para Dermatología?
R: La especialidad de Dermatología se encuentra disponible en varias sedes:
   - Sede Central (Av. Naciones Unidas 346, Córdoba).
   - Núñez (Av. Rafael Núñez 5229, Córdoba).
   - Patio Olmos (Obispo Trejo 320, Córdoba).
   - Villa Allende (Río de Janeiro 1725, Villa Allende).
   - Cerro de las Rosas (Luis de Tejeda 4625, Córdoba).
   Podés sacar turno por Central de Turnos o por WhatsApp.

2. Internaciones y Visitas
--------------------------
P: ¿Cuáles son los horarios de visita?
R: Los horarios de visita son:
   - Terapia Intensiva de Adultos: 12:30 a 13:30 h y 19:30 a 20:30 h.
   - Internación General Adultos: 11:30 a 13:00 h y 18:30 a 20:00 h.
   - Terapia Intensiva Pediátrica y Neonatal: 12:00 a 12:30 h y 19:00 a 19:30 h.
   Importante: No se permite el ingreso con flores ni plantas.

P: ¿Cómo puedo visitar a un paciente internado?
R: Debés asistir en los horarios de visita establecidos. El acceso es por la entrada principal, y deberás registrarte al ingreso.

3. Urgencias
------------
P: ¿Qué hago en caso de una derivación de urgencia?
R: Comunicarse al (0351) 4688200 opción 2.

P: ¿La Guardia Externa atiende las 24 horas?
R: Sí, la Guardia Externa de adultos funciona las 24 horas en las sedes principales (Central y Núñez). Guardia pediátrica disponible de 8 a 21 h.

4. Laboratorios y Estudios
--------------------------
P: ¿Cuáles son los horarios de Laboratorio en Patio Olmos?
R: Lunes a viernes: 08:00 a 18:30 h (extracciones y resultados).  
   Sábados: 10:00 a 13:00 h.

P: ¿Se realizan tomografías?
R: Sí, en las sedes con Diagnóstico por Imágenes (Central, Núñez, Patio Olmos y Villa Allende).

P: ¿Dónde puedo vacunarme?
R: Los vacunatorios funcionan en varias sedes:
   - Central (Pediátrico: 08:00 a 13:00 y 14:00 a 15:00 h / Adultos: 09:00 a 16:30 h).
   - Villa Allende: 08:20 a 15:40 h.
   - Patio Olmos: 08:00 a 15:20 h (fines de semana y feriados: 10:30 a 12:30 h y 14:00 a 20:00 h).
   - Cerro de las Rosas: 09:40 a 13:00 h y 14:00 a 15:00 h.
   Importante: Se debe pedir turno previamente al (0351) 468 8888.

5. Donaciones
-------------
P: ¿Cómo hago para donar sangre?
R: Debés tener entre 18 y 55 años, pesar más de 50 kg y gozar de buena salud. 
   Solicitar turno previo al (0351) 468 8888 y concurrir con DNI, en ayunas de lácteos y alimentos grasos.
  
P: ¿Puedo inscribirme como donante de médula ósea?
R: Sí, en el Servicio de Hemoterapia del Hospital Privado. Se toma una muestra de sangre para ingresar al registro nacional.

6. Servicios Especiales
-----------------------
P: ¿Qué es el Circuito Ginecológico?
R: Es un circuito de controles preventivos para mujeres de todas las edades. Incluye estudios ginecológicos, laboratorio y diagnóstico por imágenes en un mismo día.

P: ¿Qué es el CUS (Certificado Único de Salud)?
R: Es un circuito de consultas y prácticas médicas para niños y adolescentes en edad escolar. Incluye pediatría, controles de salud, vacunas y laboratorios.

7. Información General
----------------------
P: ¿Qué especialidades ofrece el Hospital Privado?
R: El Hospital ofrece una amplia variedad de especialidades médicas y programas, como Cardiología, Dermatología, Ginecología, Traumatología, Oncología, Pediatría, Reumatología, Salud Mental, entre muchas otras.  
   La disponibilidad depende de cada sede.

P: ¿En qué sedes puedo atenderme?
R: El Hospital Privado cuenta con las siguientes sedes y centros:
   - Sede Central (Av. Naciones Unidas 346, Córdoba).
   - Núñez (Av. Rafael Núñez 5229, Córdoba).
   - Patio Olmos (Obispo Trejo 320, Córdoba).
   - Villa Allende (Río de Janeiro 1725, Villa Allende).
   - Cerro de las Rosas (Luis de Tejeda 4625, Córdoba).
   - Hiper Libertad (Fray Luis Beltrán y Cardeñosa, Córdoba).
   - Centros de Rehabilitación: Jardín Espinosa, Recta Martinolli y Finochietto.

p: ¿Cómo puedo realizar una queja?
R: Tu experiencia nos ayuda a mejorar cada día a día, te invitamos a completar nuestro nuevo formulario de calidad de atención haciendo click en el siguiente link https://form.jotform.com/253165646727667
   Muchas gracias por tu colaboración.


   🏥 ATENCIÓN AL PÚBLICO – HOSPITAL CENTRAL
Lunes a Viernes: 06:00 a 20:00 hs
Fines de semana y feriados: Atención por Guardia Externa las 24 hs

🩺 SERVICIO DE MEDICINA AMBULATORIA
Lunes a Viernes: 08:00 a 20:00 hs (de 20:00 a 23:00 hs, recepción por Guardia Externa)
Sábados, Domingos y Feriados: 09:00 a 19:00 hs (recepción por Guardia Externa)

🧪 LABORATORIOS
- Hematología, Oncología, Genética y Biología Molecular: 07:30 a 19:00 hs
- Bioquímica Clínica:
  - Lunes a Viernes: 07:00 a 19:00 hs (Av. Naciones Unidas 346)
  - Lunes a Viernes: 08:00 a 19:00 hs (Ambulatorio Patio Olmos)
- Microbiología: Lunes a Viernes, 07:00 a 19:00 hs
- Hemoterapia – Extracciones: Lunes a Viernes, 07:00 a 13:30 hs
- Hemoterapia – Banco de sangre: Lunes a Viernes, 07:00 a 15:30 hs

ECG:
   Para Electrocardiograma (ECG) no necesitás sacar turno 👍
   Podés presentarte directamente dentro del horario de atención:

      - Central: Lunes a viernes de 08:30 A 18:30 por orden de llegada
      - Nuñez: Lunes a viernes de 7 A 15:20 por orden de llegada
      - Villa Allende: Lunes a viernes de 8 A 15:30 por orden de llegada
      - Patio Olmos: Con turno
      - Cerro de las Rosas: lun a vie 08:00–20:00
      - Híper Libertad: lun a vie 08:00–20:00


--------------------------------------------------------------
1) SEDES Y CENTROS
--------------------------------------------------------------

[1] Hospital Privado Universitario de Córdoba – Sede Central
    Dirección: Naciones Unidas 346, Córdoba Capital
    Teléfono: (0351) 4688888
    Horarios:
      - Consultorios: Lun–Vie 08:00 a 20:00 h
      - Laboratorio: Lun–Vie 07:00 a 18:00 h | Sáb 07:00 a 11:00 h
      - Guardia Externa: Adultos y Pediátrica 24 h

[2] Hospital Privado Núñez
    Dirección: Av. Rafael Núñez 5229, Granja de Funes – Córdoba Capital
    Teléfono: 0810 999 3656
    Horarios:
      - Lun–Vie: Atención 08:00 a 21:00 h | Laboratorio 07:00 a 16:00 h
      - Sáb, Dom y feriados: Medicina Ambulatoria 09:00 a 17:00 h
      - Guardia: Adultos 24 h | Pediátrica 08:00 a 21:00 h

[3] Hospital Privado Villa Allende
    Dirección: Río de Janeiro 1725 (esq. Mendoza), Villa Allende Shopping – Villa Allende, Córdoba
    Teléfonos: (0351) 5697610 | Fax: (03543) 439571
    Horarios:
      - Lun–Vie: Turnos programados 08:00 a 20:00 h
      - Laboratorio: 07:30 a 14:00 h (int. 4111)
      - Guardia: Adultos 24 h | Pediátrica 08:00 a 21:00 h

[4] Hospital Privado Paseo Libertad (Híper Libertad)
    Dirección: Fray Luis Beltrán y Cardeñosa, Poeta Lugones, Córdoba Capital
    Teléfono: (0351) 5697600
    Horarios:
      - Consultorios: Lun–Vie 08:00 a 20:00 h
      - Laboratorio: Lun–Vie 07:00 a 10:00 h
      

[5] Hospital Privado Patio Olmos
    Dirección: Obispo Trejo 320, Centro – Córdoba Capital
    Teléfono: (0351) 5697600
    Horarios:
      - Consultorios: Lun–Vie 08:00 a 22:00 h | Sáb, Dom y feriados 10:00 a 21:00 h
      - Laboratorio: Lun–Vie 08:00 a 18:30 h | Sáb 10:00 a 13:00 h
      
[6] Hospital Privado Cerro de las Rosas
    Dirección: Hugo Wast 5331, Córdoba Capital
    Teléfono: (0351) 5697600
    Horarios:
      - Consultorios: Lun–Vie 08:00 a 20:00 h

[7] C.I.R.E.D. – Jardín Espinosa
    Dirección: Av. Richieri 3717, Córdoba Capital
    Teléfonos: (0351) 4678612 | Cel: (0351) 157015851
    Horarios:
      - Lun–Vie 08:00 a 20:00 h

[8] C.I.R.E.D. – Recta Martinolli
    Dirección: Av. Recta Martinolli 5525, Córdoba Capital
    Teléfonos: (0351) 5697630 | Cel: (0351) 157616431
    Horarios:
      - Lun–Vie 08:00 a 20:00 h

[9] C.I.R.E.D. – Finochietto
    Dirección: Enrique Finochietto 460, Córdoba Capital
    Teléfonos: (0351) 4608970 | Cel: (0351) 157154743
    Horarios:
      - Lun–Vie 08:00 a 20:00 h

👥 VISITAS A PACIENTES INTERNADOS

SEDE CENTRAL
- Internado General: 16:00 a 20:00 hs
- UTI/UCCO: 13:00 a 14:00 hs y 19:00 a 20:00 hs
- Neonatología: 16:00 a 20:00 hs
- Maternidad: 16:00 a 20:00 hs
- Unidad de Cuidados Especiales Adulto: 11:00 a 12:00 hs y 18:30 a 20:30 hs

HOSPITAL PRIVADO NÚÑEZ
- Internado General: 16:00 a 20:00 hs (solo una persona por habitación; acompañante permitido 24 hs)
- UTI: 12:00 a 13:00 hs (una visita por vez)

NORMAS DE VISITA
- Internación general: 12:00–14:00 h y 18:00–20:00 h.
- Terapias y neonatología: 12:00–12:30 h y 19:00–19:30 h.
- No se permite ingreso con flores o plantas.

      `;

      return { success: true, data: hardcode_data };

   }
});



export const BuscarTurnosItemSchema = z.object({
   IdPersona: z.number(),
   IdCobertura: z.number(),
   IdServicio: z.number(),
   IdPrestacion: z.number(),
   IdCentroAtencion: z
      .number()
      .nullable()
      .describe(
         "ID del centro de atención. Opcional. Si no se proporciona, se buscarán turnos en todos los centros."
      ),
   fecha: z
      .string()
      .nullable()
      .describe(
         "Fecha a partir de la cual buscar turnos, en formato yyyy-MM-dd. Si no se indica, se buscará a partir de la fecha actual."
      ),
   IdProfesional: z
      .number()
      .nullable()
      .optional()
      .describe(
         "ID del profesional. Opcional. Si no se proporciona, se buscarán turnos con cualquier profesional."
      ),
   DiasSemana: z.string().nullable().optional(),
   horaDesde: z.string().nullable().optional(),
   horaHasta: z.string().nullable().optional(),
});

// 2) Nueva herramienta: array de ese objeto
export const buscar_multiples_turnos = tool({
   name: "buscar_multiples_turnos",
   description: `Busca turnos para múltiples consultas/pacientes en un solo llamado.

Preamble sample phrases:
*IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.

- Estoy buscando los turnos disponibles para varias consultas, un momento...
- Voy a consultar en el sistema los turnos para cada solicitud.
- Estoy verificando opciones de turnos para múltiples pacientes/consultas...
`,
   parameters: z.object({
      solicitudes: z
         .array(BuscarTurnosItemSchema)
         .min(1)
         .describe("Listado de solicitudes de búsqueda de turnos."),
   }),
   execute: async ({ solicitudes }, ctx) => {
      console.log(
         `[${timestamp(ctx?.context as CallCtx)}] buscar_multiples_turnos:`,
         solicitudes
      );

      // Opción A (recomendada si tu backend lo soporta): endpoint bulk
      // const url = `${process.env.BACKEND_URL}/turnoshp/obtener_primeros_turnos_disponibles_bulk`;
      // body: { solicitudes }

      // Opción B (sin endpoint bulk): hacer N llamadas al endpoint actual
      const url = `${process.env.BACKEND_URL}/turnoshp/obtener_primeros_turnos_disponibles`;

      try {
         const results = await Promise.all(
            solicitudes.map(async (params, index) => {
               const response = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(params),
               });

               if (!response.ok) {
                  return {
                     index,
                     params,
                     success: false as const,
                     error: `HTTP error! status: ${response.status}`,
                  };
               }

               const data = await response
                  .json()
                  .catch(async () => ({ result: await response.text() }));

               return {
                  index,
                  params,
                  success: true as const,
                  data,
               };
            })
         );

         // Instrucciones para el agente (pensadas para “múltiples”)
         let instrucciones = `
# Instrucciones para gestionar la respuesta al usuario (múltiples solicitudes):
- Informa al usuario los turnos mas proximos entre si.
- Si no hay turnos disponibles en el mismo dia para todas las solicitudes, informa al usuario de la situacion y ofrece opciones:
   1. Mostrar los turnos disponibles para cada solicitud por separado, sin importar la fecha.
   2. Buscar nuevamente pero esta vez a partir de la fecha del turno mas distante entre todas las solicitudes, para intentar encontrar turnos mas cercanos entre si.
   3. Ofrecer buscar en otros centros. Si el usuario acepta esta opcion, podes proactivamente usar esta herramienta para todos los centros disponibles sin necesidad de que el usuario te lo pida, para maximizar las chances de encontrar turnos cercanos entre si.
`;

         return { success: true, results, instrucciones };
      } catch (error: any) {
         console.error("Error al buscar múltiples turnos:", error.message);
         return { success: false, error: error.message };
      }
   },
});
