// tools-hrf.ts
// ------------------------------------------------------------
// Herramientas para la gestión de turnos en el Hospital Raul Angel Ferreyra
// Compatibles con la Realtime API de OpenAI
// ------------------------------------------------------------
import { z } from "zod";
import { tool, backgroundResult } from "@openai/agents/realtime";
import type { CallCtx } from "./../Interfaces/CallCtx.js";
import { success } from "zod/v4";
import { error } from "console";
import { postProcessHorariosWithOpenAI } from "./../utils/post-procesador-horarios.js";
import { estaEnHorarioAtencion } from "./../utils/horarios_atencion.js"
import type { CentrosServiciosDelProfesional, CentrosServiciosPrestacionesDelProfesional } from "../Interfaces/Dtos.js";

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
   name: "validarDni",
   description:
      "Valida que el número de DNI o documento del usuario se encuentre empadronado en el sistema. Devuelve el IdPersona y las coberturas (cons sus IdCobertura) disponibles del usuario. "  +
      "Antes de llamar a esta herramienta di al usuario en su propio idioma: 'Un momento voy a validar el DNI en el sistema.'",
   parameters: z.object({
      dni: z.number().describe("Número de DNI o documento del usuario a validar. Es un numero sin puntos de 7 u 8 digitos."),
   }),
   execute: async (parameters, context) => {
      const from = (context?.context as CallCtx)?.phoneNumber?.split(" ")[0];
      const callId = (context?.context as CallCtx)?.callId || "unknown";
      console.log(`[${timestamp(context?.context as CallCtx)}] - From:[${callId}] Validando DNI ${parameters.dni}...`);
      const url = `${process.env.BACKEND_URL}/turnos/validar-dni?dni=${parameters.dni}`;

      try {
         if (!parameters.dni) return { success: false, error: "El número de DNI es requerido para validar al paciente." };
         if (parameters.dni < 1_000_000 || parameters.dni > 99_999_999) return { success: false, error: "El número de DNI ingresado no es válido. Debe tener entre 7 y 8 dígitos." };

         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));

         console.info(`[${timestamp(context?.context as CallCtx)}] - From:[${callId}] DNI ${parameters.dni} `, data);

         // Filtrar coberturas para que solo queden las permitidas para gestionar turnos en el HRF (PLAN MATERNO y BASICO)
         const planesPermitidos = ['PLAN MATERNO', 'BASICO'];
         data.coberturas = (data.coberturas || [])
            .filter((c: any) => planesPermitidos.includes(c.plan));  


         return { success: true, data, dni_consultado: parameters.dni };
      } catch (error: any) {
         console.error("Error al validar DNI:", error.message);
         return { success: false, error: error.message, dni_consultado: parameters.dni };
      }
   },
});

// ---------------- BUSCAR SERVICIOS y CENTROS ----------------
export const hrf_buscar_servicios_y_centros = tool({
   name: "hrf_buscar_servicios_y_centros",
   description: `Utiliza esta herramienta para recuperar los servicios que ofrece un profesional y en que centro de atención los ofrece. `,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hrf_buscar_servicios_y_centros:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/obtener-servicios-centros?IdProfesional=${parameters.IdProfesional}`;

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

// ---------------- OBTENER CENTROS ----------------
export const hrf_obtener_centros_para_el_servicio = tool({
   name: "hrf_obtener_centros_para_el_servicio",
   description:
      "Recupera los centros de atención donde se realizan las prestaciones seleccionadas.",
   parameters: z.object({
      IdServicio: z.number(),
      IdPrestacion: z.number(),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hrf_obtener_centros_para_el_servicio:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/ObtenerCentroPorServiciosPrestacion?IdServicio=${parameters.IdServicio}&IdPrestacion=${parameters.IdPrestacion}`;

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

// ---------------- RECUPERAR TODOS LOS CENTROS DISPONIBLES ----------------
export const hrf_obtener_todos_los_centros_atencion = tool({
   name: "hrf_obtener_todos_los_centros_atencion",
   description: "Recupera todos los centros de atención disponibles en el Hospital Raúl Angel Ferreyra.",
   parameters: z.object({}),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hrf_obtener_todos_los_centros_atencion...`);

      const url = `${process.env.BACKEND_URL}/turnos/obtener-centros-atencion`;

      try {
         const response = await fetch(url, { headers: { "Content-Type": "application/json" } });

         // if(!response.ok){
         //    throw new Error(`HTTP error! status: ${response.status}`);
         // }

         // const data = await response.json().catch(async () => ({ result: await response.text() }));

         const data = {
            Centros: [
               {
                  "Id": 19,
                  "Nombre": "Hospital Raúl Ángel Ferreyra",
                  "Direccion": "Av. Pablo Ricchieri 2200, Córdoba",
                  "Telefono": "0351-4688888"
               },
               {
                  "Id": 32,
                  "Nombre": "HRF Anexo Centro",
                  "Direccion": "Santa Rosa 770, Córdoba",
                  "Telefono": "0351-4688888"
               },
            ]
         };

         return { success: true, data };

      } catch (error) {
         console.error("Error al obtener todos los centros de atención:", error);
         return { success: false, error: (error as Error).message };
      }
   },
});

// ---------------- BUSCAR PRESTACIONES ----------------
export const hrf_buscar_prestaciones = tool({
   name: "hrf_buscar_prestaciones",
   description: `Utiliza esta herramienta para obtener las prestaciones que ofrece un profesional o médico en un centro de atención, para un servicio determinado. Por ejemplo  Consulta Medica, Telemedicina, Colocacion de holter.`,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
      IdCentroAtencion: z.number().describe("ID del centro de atención a consultar."),
      IdServicio: z.number().describe("ID del servicio a consultar."),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] hrf_buscar_prestaciones:`, parameters);
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

// ---------------- ASIGNAR TURNO ----------------
// export const asignar_turno = tool({
//    name: "asignar_turno",
//    description: "Asigna un turno a un paciente.",
//    parameters: z.object({
//       IdTurno: z.number(),
//       IdPersona: z.number(),
//       IdCobertura: z.number(),
//       IdPrestacion: z.number(),
//    }),
//    execute: async (parameters) => {
//       console.log(`[${timestamp()}] asignar_turno:`, parameters);
//       const url = `${process.env.BACKEND_URL}/turnos/asignar`;

//       try {
//          const response = await fetch(url, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//                ...parameters,
//                origen_solicitud: "voice-agent"
//             }),
//          });
//          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//          return { success: true, data: await response.json() };
//       } catch (error: any) {
//          console.error("Error al asignar turno:", error.message);
//          return { success: false, error: error.message };
//       }
//    },
// });
export const asignar_turno = tool({
  name: "asignar_turno",
  description: "Asigna un turno a un paciente.",
  parameters: z.object({
    IdTurno: z.number(),
    IdPersona: z.number(),
    IdCobertura: z.number(),
    IdPrestacion: z.number(),
  }),
  execute: async (parameters, context) => {
   const callId = (context?.context as CallCtx)?.callId || "unknown";
    console.log(`[${timestamp(context?.context as CallCtx)}] ${callId} => asignar_turno:`, parameters);
    const url = `${process.env.BACKEND_URL}/turnos/asignar`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parameters, origen_solicitud: "voice-agent" }),
      });

      // 👇 leer body aunque sea error
      const raw = await response.text();
      let data: any;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = { raw };
      }

      if (!response.ok) {
        // si backend devuelve { Mensaje: "..." } o { data: { Mensaje: "..." } }
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
      const instruccion = `
         # Instrucciones para informar al usuario:
         - No vuelvas a repetir todos los datos del turno.
         - Informa al usuario si el turno fue asignado exitosamente.
         - Indicale que recibira un email con los datos del turno.

      `;
      return { success: true, status: response.status, data, instruccion };
    } catch (err: any) {
      console.error(`${callId} Error al asignar turno:`, err);
      return { success: false, status: 0, message: err?.message ?? String(err) };
    }
  },
});
// ---------------- OBTERNER MIS PROXIMOS TURNO ----------------
export const hrf_obtener_mis_proximos_turnos = tool({
   name: "hrf_obtener_mis_proximos_turnos",
   description: `Utiliza esta herramienta para obtener los próximos turnos asignados a un paciente.`,
   parameters: z.object({
      IdPersona: z.number().describe("ID de la persona a consultar."),
   }),
   execute: async (parameters, context) => {
      const callId = (context?.context as CallCtx)?.callId || "unknown";
      console.log(`[${timestamp(context?.context as CallCtx)}] ${callId} => hrf_obtener_mis_proximos_turnos:`, parameters);

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
   description: "Anula un turno previamente asignado a un paciente.",
   parameters: z.object({
      IdTurno: z.number().describe("ID del turno a anular."),
      IdPersona: z.number().describe("ID de la persona que tiene el turno."),
   }),
   execute: async (parameters, context) => {
      const callId = (context?.context as CallCtx)?.callId || "unknown";
      console.log(`[${timestamp(context?.context as CallCtx)}] ${callId} => anular_turno:`, parameters);
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

// ---------------- BUSCAR SERVICIOS ----------------
export const hrf_buscar_servicios = tool({
   name: "hrf_buscar_servicios",
   description:
      "Busca servicios y prestaciones médicas del hospital según el texto de consulta.",
   parameters: z.object({
      consulta: z.string().describe("Texto con la consulta del usuario."),
   }),
   execute: async (parameters, context) => {
      console.log(`[${timestamp(context?.context as CallCtx)}] hrf_buscar_servicios:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/buscar_servicio?inputText=${parameters.consulta}`;

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

// ---------------- BUSCAR PROFESIONAL ----------------
export const hrf_buscar_profesional = tool({
   name: "hrf_buscar_profesional",
   description: `Utiliza esta herramienta cuando el usuario quiera buscar un profesional por su nombre.
Devuelve los profesionales con los nombres más similares al valor pasado como parametro.`,
   parameters: z.object({
      nombreProfesional: z.string().describe("Nombre completo o parcial del profesional a buscar."),
      servicio: z.string().optional().describe("Nombre del servicio en el que atiende el profesional. Opcional."),
   }),
   execute: async (parameters, context) => {
      console.log(`[${timestamp(context?.context as CallCtx)}] hrf_buscar_profesional:`, parameters);
      const input = parameters.servicio 
         ? `Profesional: ${parameters.nombreProfesional} Servicio: ${parameters.servicio}` 
         : `Profesional: ${parameters.nombreProfesional}`;
      
      const url = `${process.env.BACKEND_URL}/getByProfesionalNameHRF?inputText=${input}`;

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

// ---------------- BUSCAR TURNOS ----------------
export const buscar_turnos = tool({
   name: "buscar_turnos",
   description:
      "Encuentra los primeros turnos disponibles a partir de una fecha para determinados días de la semana.",
   parameters: z.object({
      IdPersona: z.number(),
      IdCobertura: z.number(),
      IdServicio: z.number(),
      IdPrestacion: z.number(),
      IdCentroAtencion: z.number().nullable().optional().describe("ID del centro de atención. Opcional. Si no se proporciona, se buscarán turnos en todos los centros."),
      fecha: z.string().nullable().optional().describe("Fecha a partir de la cual se buscaran los primeros turnos disponibles en formato YYYY-MM-DD. Opcional. Si no se proporciona, se usará la fecha actual."),
      IdProfesional: z.number().nullable().optional(),
      DiasSemana: z.string().nullable().optional(),
      horaDesde: z.string().nullable().optional(),
      horaHasta: z.string().nullable().optional(),
   }),
   execute: async (parameters, context) => {
      const callId = (context?.context as CallCtx)?.callId || "unknown";
      console.log(`[${timestamp(context?.context as CallCtx)}] ${callId} => buscar_turnos:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/obtener_primeros_turnos_disponibles`;

      if (parameters.IdCobertura === 0) return { success: false, error: "El IdCobertura no puede ser 0!" }

      try {
         const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parameters),
         });
         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

         const data = await response.json().catch(async () => ({ result: await response.text() }));
         if (data?.Turnos && data.Turnos?.length > 0) {
            console.log(`[${timestamp(context?.context as CallCtx)}] Turnos para ${parameters.IdPersona} `, data.Turnos.length);
         } else {
            console.log(`[${timestamp(context?.context as CallCtx)}] No se encontraron turnos disponibles para ${parameters.IdPersona}.`);
         }


         return { success: true, data };
      } catch (error: any) {
         console.error("Error al buscar turnos:", error.message);
         return { success: false, error: error.message };
      }
   },
});

// ---------------- FECHA Y HORA ACTUAL DE ARGENTINA (UTC-3) ----------------
export const hrf_fecha_hora_argentina = tool({
   name: "hrf_fecha_hora_argentina",
   description:
      "Devuelve la fecha y hora actual de Argentina (UTC-3) en formato yyyy-MM-dd HH:mm:ss.",
   parameters: z.object({}),
   execute: async (parameters, context) => {
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

         //const fechaHoraArgentina = '2025-12-05 21:30:00'; // Hardcodeado para pruebas

         console.log(`[${timestamp(context?.context as CallCtx)}] hrf_fecha_hora_argentina ejecutada → ${fechaHoraArgentina}`);

         return {
            success: true,
            data: {
               fechaHoraArgentina,
               zona: "UTC-3",
            },
         };
      } catch (err: any) {
         console.error("Error en hrf_fecha_hora_argentina:", err.message);
         return {
            success: false,
            error: err.message,
         };
      }
   },
});


export const hrf_informacion_general = tool({
   name: "hrf_informacion_general",
   description: "Proporciona información general sobre el Hospital Raúl Angel Ferreyra, como ubicación, horarios de atención y servicios ofrecidos.",
   parameters: z.object({}),
   execute: async (parameters, context) => {
      const info = `
         BASE DE CONOCIMIENTO - HOSPITAL RAÚL ÁNGEL FERREYRA

Hospital Raúl Ángel Ferreyra – Sede Central
Dirección: Av. Richieri 2200, Barrio Jardín, Córdoba.
Teléfono: (0351) 4475799
Horarios de atención:
-Consultorios: Lunes a Viernes de 08:00 a 20:00 h.
-Laboratorio: Extracciones de Lunes a Viernes de 7:00 a 13:00 h.
Entrega de resultados de Lunes a Viernes de 7:00 a 16:00 h.
-Guardia Adultos: 24 h.

Hospital Raúl Ángel Ferreyra – Anexo Centro
Dirección: Santa Rosa 770
Teléfono: (0351) 4475799
Horarios de atención:
-Consultorios: Lunes a viernes de 08:00 a 20:00 h.
-Guardia Ginecológica y Pediátrica: 24 hs.
Laboratorio: Extracciones de Lunes a Viernes de 07:00h a 13:00 h.
Entrega de resultados de Lunes a Viernes de 7:00 a 15:30 h.


Vacunatorio (sin turno)
Horarios de atención:
Hospital Raúl Ángel Ferreyra – Sede Central:  Lunes a viernes de 08:30 a 14:00 h.
Hospital Raúl Ángel Ferreyra – Anexo Centro: Lunes a viernes de 08:30 a 12:00 h y de 13:00 a 15:00 h.

Laboratorio (sin turno)


Horario internado
Horario de visita internado: de 16:00 a 20:00 h.
Horario de visita terapia intensiva: de 13:00 a 14:00 h y de 17:00 a 18:00 h.

TURNOS Y CONTACTOS CLAVE
- WhatsApp (24 h, todos los días): +54 9 3518 12-1325
- Central de Turnos: (0351) 4475799  (Lun–Vie 08:00 a 20:00 h)
- Portal de Turnos (24 h, todos los días): https://turnos.hospitalraulferreyra.com.ar
- Turnos para servicio de Diagnóstico por Imágenes: (0351) 4438301 - WhatsApp: +54 9 3515 51-9207


DONACIÓN DE SANGRE
Donación de sangre:
- Requisitos: 18 a 65 años, >50 kg, buena salud.Las personas mayores de 16 y menores de 18 años
  podrán donar, si concurren acompañados por alguno de los padres o tutor, quienes presten el consentimiento.
- Lugar: Hospital Raúl Ángel Ferreyra – Sede Central
- Horario: Martes y Jeves 00:08 a 11:30 h. sin turno previo.
- Mail: donantesdesangre@hospitalprivado.com.ar
- Documentación: DNI.
- Preparación: Ayuno de alimentos grasos y lácteos, ingerir líquidos azucarados antes.
      `

      return info;
   },
})

export const hrf_buscar_por_subespecialidad = tool({
   name: "hrf_buscar_por_subespecialidad",
   description: `Utiliza esta herramienta para obtener profesionales del hospital según una subespecialidad médica específica.`,
   parameters: z.object({
      subespecialidad: z.string().describe("Nombre de la subespecialidad médica a consultar."),
   }),
   execute: async (parameters, context) => {
      console.log(`[${timestamp(context?.context as CallCtx)}] hrf_buscar_por_subespecialidad:`, parameters);

      const url = `${process.env.BACKEND_URL}/buscar_profesionales_subespecialidad_hrf?subespecialidad=${parameters.subespecialidad}`;   
      
      try {
         const response = await fetch(url, {headers: {"Content-Type": "application/json"}} );

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
            1. Falta recuperar el IdPrestacion para cada profesional. Usa la herramienta hrf_buscar_prestaciones con IdProfesional, IdCentroAtencion e IdServicio para obtener las prestaciones disponibles.
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

export const hrf_buscar_horarios_profesional = tool({
   name: "hrf_buscar_horarios_profesional",
   description: `Utiliza esta herramienta para obtener los horarios de atención de un profesional en el hospital. Devuelve los días y horas en que el profesional atiende, agrupados por centro de atención y servicio.`,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
   }),
   execute: async (parameters, context) => {
      console.log(`[${timestamp(context?.context as CallCtx)}] hrf_buscar_horarios_profesional:`, parameters);
      const callId = (context?.context as CallCtx)?.callId || "desconocido";
      const url = `${process.env.BACKEND_URL}/turnos/recuperar_horarios_atencion?IdProfesional=${parameters.IdProfesional}`;
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

      const feriados = [
         "2026-04-02", // Jueves Santo
         "2026-04-03", // Viernes Santo
      ]

      const now = new Date();
      const hoy = now.toISOString().split("T")[0];
      const esFeriado = hoy ? feriados.includes(hoy) : false;

      if (esFeriado) {
         return {
            success: false,
            message: "No es posible derivar la llamada hoy porque es un día feriado.",
         };
      }

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

export const obtener_dias_feriados = tool({
   name: "obtener_dias_feriados",
   description: "Devuelve una lista de los próximos días feriados en Argentina, incluyendo su fecha y nombre. Útil para evitar ofrecer derivar a asistentes humanos en esos días.",
   parameters: z.object({}),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] obtener_dias_feriados ejecutada`);
      // TODO: harcodear con las fecha 2 y 3 de abril de 2026
      const hardcode_data = [
         { fecha: "2026-04-02", nombre: "Jueves Santo" },
         { fecha: "2026-04-03", nombre: "Viernes Santo" },
      ];
      return { success: true, data: hardcode_data };
   }
});

// ---------------- RECUPERAR SERVICIOS Y PRESTACIONES DE UN PROFESIONAL ----------------
export const hrf_recuperar_servicios_y_prestaciones = tool({
   name: "hrf_recuperar_servicios_y_prestaciones",
   description: `Utiliza esta herramienta para obtener la lista de servicios y prestaciones que ofrece el profesional en el Hospital Privado de Córdoba. Esta información es útil para conocer las opciones disponibles y poder ofrecer turnos adecuados a los pacientes.`,
   parameters: z.object({
      IdProfesional: z.number().describe("ID del profesional a consultar."),
   }),
   execute: async (parameters, context) => {

      console.log(`[${timestamp(context?.context as CallCtx)}] hrf_recuperar_servicios_y_prestaciones:`, parameters);

      try {
         let centros = await recuperarCentrosServiciosDelProfesional(parameters.IdProfesional);

         if (centros.length === 0) {
            console.log("El profesional no tiene centros de atencion asociados.");
            return { success: true, data: [], message: "El profesional no tiene centros de atención asociados." };;
         }

         centros = Array.isArray(centros) ? centros : [centros]; // Asegurar que es un array

         const prestacionesDisponibles = (
            await Promise.all(
               centros.map(async (centro) => {
                  try {
                     const prestaciones = await recuperarServiciosYPrestacionesDelProfesionalEnCentro(
                        centro.IdProfesional,
                        centro.IdCentroAtencion,
                        centro.IdServicio
                     );

                     return prestaciones.map((prestacion: any) => ({
                        idProfesional: centro.IdProfesional,
                        IdCentroAtencion: centro.IdCentroAtencion,
                        NombreCentroAtencion: centro.NombreCentroAtencion,
                        IdServicio: centro.IdServicio,
                        NombreServicio: centro.NombreServicio,
                        IdPrestacion: prestacion.IdPrestacion,
                        Prestacion: prestacion.NombrePrestacion
                     }));
                  } catch (error) {
                     console.warn(
                        `No se pudieron recuperar prestaciones para IdProfesional=${centro?.IdProfesional}, IdCentroAtencion=${centro?.IdCentroAtencion}, IdServicio=${centro?.IdServicio}`,
                        error
                     );
                     return [];
                  }
               })
            )
         ).flat();
         let instrucciones = `
         # Instrucciones para continuar con la busqueda de turnos
         1. Si el usuario no indico centro de atencion y el profesional atiende en varios centros, buscar turnos sin IdCentroAtencion.
         2. Si el usuario no indico prestacion especifica, buscar turnos con el IdPrestacion *consulta* si esta disponible.
         3. Si el profesional ofrece varios *servicios*, preguntar al usuario por cual servicio quiere turno.
         4. No ofrezcas opciones si no es necesario. Debes ser lo mas proactivo posible para buscar turnos.
         `;

         return { success: true, data: prestacionesDisponibles, instrucciones };
      } catch (error) {
         console.error("Error al buscar servicios y centros del profesional:", error);
         return { success: false, error: (error as Error).message };
      }

   }
});

export const recuperarCentrosServiciosDelProfesional: (IdProfesional: number) => Promise<CentrosServiciosDelProfesional[]> = async (IdProfesional: number) => {
   const url = `${process.env.BACKEND_URL}/turnos/obtener-servicios-centros?IdProfesional=${IdProfesional}`;
   try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json().catch(async () => ({ result: await response.text() }));

      const lista = Array.isArray(data?.ListaCentroAtencionServicio)
         ? data.ListaCentroAtencionServicio
         : [];

      const centros_servicios = lista.map((item: any) => ({
         IdCentroAtencion: item.IdCentroAtencion,
         IdProfesional: item.IdRecurso,
         IdServicio: item.IdServicio,
         NombreCentroAtencion: item.NombreCentroAtencion,
         NombreProfesional: item.NombreRecurso,
         NombreServicio: item.NombreServicio,
      }));

      return centros_servicios;

   } catch (error) {
      console.error("Error al recuperar centros del profesional:", error);
      throw error;
   }
};

export const recuperarServiciosYPrestacionesDelProfesionalEnCentro: (IdProfesional: number, IdCentroAtencion: number, IdServicio: number) => Promise<CentrosServiciosPrestacionesDelProfesional[]> = async (IdProfesional: number, IdCentroAtencion: number, IdServicio: number) => {
   const url = `${process.env.BACKEND_URL}/turnos/obtener-prestaciones`;
   try {
      const response = await fetch(url, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ IdProfesional, IdCentroAtencion, IdServicio }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json().catch(async () => ({ result: await response.text() }));
      return data.Prestaciones;
   } catch (error) {
      console.error("Error al recuperar servicios y prestaciones del profesional en centro:", error);
      throw error;
   }
};

// ---------------- BUSCAR TURNOS PARA PRÁCTICAS ----------------
export const hrf_buscar_turnos_para_practicas = tool({
   name: "hrf_buscar_turnos_para_practicas",
   description: `Busca los primeros turnos disponibles para prácticas o estudios médicos.

Preamble sample phrases:
*IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.

- Estoy buscando los turnos disponibles para la práctica, un momento...
- Voy a consultar en el sistema los turnos disponibles para ese estudio.
- Estoy verificando disponibilidad para la práctica médica indicada...
`,
   parameters: z.object({
      IdSolicitudDeEstudio: z.string().optional().describe("Id de la solicitud de estudio si es que corresponde a una solicitud de estudio registrada."),
      idCentroAtencion: z.number().optional().default(0),
      idServicio: z.number(),
      idPersona: z.number(),
      idCobertura: z.number(),
      idsPrestaciones: z.array(z.number()).optional().default([]),
      fecha: z.string().nullable().optional().describe("Fecha a partir de la cual buscar turnos, en formato yyyy-MM-dd. Si no se indica, se buscará a partir de la fecha actual."),
      
      horaDesde: z.string().nullable().optional(),
      horaHasta: z.string().nullable().optional(),
   }),
   execute: async (parameters, ctx) => {
      console.log(
         `[${timestamp(ctx?.context as CallCtx)}] hrf_buscar_turnos_para_practicas:`,
         parameters
      );

      const url = `${process.env.BACKEND_URL}/turnos/obtener_primeros_turnos_disponibles_para_practicas`;

      if (!parameters.idServicio) {
         return {
            success: false,
            error: "El idServicio es requerido para buscar turnos para prácticas.",
         };
      }

      if (!parameters.idPersona) {
         return {
            success: false,
            error: "El idPersona es requerido para buscar turnos para prácticas.",
         };
      }

      if (!parameters.idCobertura) {
         return {
            success: false,
            error: "El idCobertura es requerido para buscar turnos para prácticas.",
         };
      }

      if ( (!parameters.idsPrestaciones || parameters.idsPrestaciones.length === 0) ) {
         return {
            success: false,
            error: "Al menos un idPrestacion es requerido para buscar turnos para prácticas.",
         };
      }

      const body = {
         IdSolicitudDeEstudio: parameters.IdSolicitudDeEstudio ?? "",
         IdCentroAtencion: parameters.idCentroAtencion ?? 0,
         IdServicio: parameters.idServicio,
         IdPersona: parameters.idPersona,
         IdCobertura: parameters.idCobertura,
         IdsPrestaciones: parameters.idsPrestaciones ?? [],
         fecha: parameters.fecha ?? "",
         horaHasta: parameters.horaHasta ?? "",
         horaDesde: parameters.horaDesde ?? "",
         origen_solicitud: "voice-agent",
         //diasSemana: parameters.DiasSemana ?? [],
      };

      try {
         const response = await fetch(url, {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
         });

         const raw = await response.text();

         let data: any;
         try {
            data = raw ? JSON.parse(raw) : null;
         } catch {
            data = { result: raw };
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
               error: msg,
               data,
            };
         }

         let instrucciones = "";

         if (data?.Turnos && data.Turnos.length === 0) {
            instrucciones = `
No hay turnos disponibles para la práctica solicitada a partir de la fecha indicada.
Si no se indicó fecha, significa que no hay turnos disponibles en el futuro para la combinación de parámetros indicada.
Si no se indicó idCentroAtencion, significa que se buscó en todos los centros.
`;
         } else {
            instrucciones = `
# Instrucciones para gestionar la respuesta al usuario:
- Agrupar los turnos por centro y fecha.
- Informar fecha, hora, centro de atención. (*NO INFORMES EL RECURSO*, ya que se refiere al equipo o aparato disponible, no a un profesional, y puede confundir al usuario).
- Luego de que el usuario elija un turno, informale el detalle completo del turno elegido.
- Preguntale si quiere confirmar ese turno antes de asignarlo.
`;
         }

         return {
            success: true,
            data,
            instrucciones,
         };
      } catch (error: any) {
         console.error("Error al buscar turnos para prácticas:", error.message);
         return {
            success: false,
            error: error.message,
         };
      }
   }
});

// ---------------- ASIGNAR TURNO DE ESTUDIO ----------------
export const asignar_turno_estudios_hrf = tool({
   name: "asignar_turno_estudios_hrf",
   description: `
   Asigna un turno de estudios o solicitud de estudio a un paciente. 
   Preamble sample phrases:
   *IMPORTANT: You must use the preambles before calling the tool. Remember say the preambles in the same language the user is speaking. For this tool, you can use these examples in the language the user is using.

   - Estoy asignando el turno en el sistema un momento...
   - Voy a asignar el turno en el sistema un momento...
   `,
   parameters: z.object({
      IdTurno: z.number(),
      IdPersona: z.number(),
      IdCobertura: z.number(),
      IdsPrestaciones: z.array(z.number()).optional().default([]),
      IdSolicitudDeEstudio: z.string().optional(),
   }),
   execute: async (parameters, ctx) => {
      console.log(`[${timestamp(ctx?.context as CallCtx)}] asignar_turno_estudios_hrf:`, parameters);
      const url = `${process.env.BACKEND_URL}/turnos/asignar-estudio`;

      try {
         const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parameters),
         });

         const raw = await response.text();
         let data: any;
         try {
            data = raw ? JSON.parse(raw) : null;
         } catch {
            data = { result: raw };
         }

         if (!response.ok) {
            // si backend devuelve { Mensaje: "..." } o { data: { Mensaje: "..." } }
            const msg =
               data?.Mensaje ??
               data?.mensaje ??
               data?.data?.Mensaje ??
               data?.data?.mensaje ??
               `HTTP ${response.status}`;

            return {
               success: false,
               error: msg,
               instrucciones: `Error al asignar turno: ${msg}. Informar al usuario que hubo un error al asignar el turno.`
            };
         }

         //if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
         return { success: true, data, instrucciones: '*Importante:* Informa al usuario que el turno ha sido asignado exitosamente y recibirá un mail con la confirmación.' };
      } catch (error: any) {
         console.error("Error al asignar turno:", error.message);
         return { success: false, error: error.message };
      }
   },
});

export const wait_for_user = tool({
  name: "wait_for_user",

  description:
    "Call this when the latest audio does not need a spoken response, such as silence, background noise, hold music, TV audio, side conversation, or speech not addressed to the assistant. This tool helps end the turn without a spoken reply.",

  parameters: z.object({}),

  execute: async (_args, _ctx) => {
    // No-op intentionally.
    // The model should call this tool to stay silent and keep listening.
    console.log("wait_for_user called - assistant will stay silent and keep listening.");
    return {
      ok: true,
      action: "wait",
    };
  },
});