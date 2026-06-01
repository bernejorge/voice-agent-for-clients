import { success, z } from "zod";
import { tool } from "@openai/agents/realtime";
import type { CallCtx } from "./../Interfaces/CallCtx.js";
import { getMockTurnosData } from "./../Interfaces/Estudios-mock-interface.js";

export const buscar_turnos_estudios = tool({
   name: "buscar_turnos_estudios",
   description: "Usa esta herramienta para turnos disponibles para estudios medicos o practicas como ecografias, resonancias, electrocardiogramas, etc.",
   parameters: z.object({
      IdServicio: z.number().describe("ID del servicio. Requerido."),
      IdPrestacion: z.number(),
      IdPersona: z.number(),
      IdCobertura: z.number(),
      IdCentro: z.number().optional().describe("ID del centro de atención. Opcional. Si no se proporciona, se buscarán turnos en todos los centros."),
      fecha: z.string().nullable().optional().describe("Fecha a partir de la cual se buscaran los primeros turnos disponibles en formato YYYY-MM-DD. Opcional. Si no se proporciona, se buscarán turnos a partir de la fecha actual.")
   }),
   execute: async (parameters, ctx) => {
      const turnos = getMockTurnosData();
      // Implement the logic to filter turnos based on the provided parameters
      const { IdServicio, IdPrestacion, IdPersona, IdCobertura, IdCentro, fecha } = parameters;

      // Filter turnos based on the provided parameters
      const filteredTurnos = turnos.filter((turno) => {
         if (turno.IdServicio !== parameters.IdServicio) return false;
         if (parameters.IdCentro && turno.IdCentro !== parameters.IdCentro) return false;
         
         const matchPrestacion =
            turno.IdPrestacion === parameters.IdPrestacion ||
            turno.Prestaciones.some((p) => p.Id === parameters.IdPrestacion);

         if (!matchPrestacion) return false;


         return true;
      });

      // Return the filtered turnos
      const result = {success: true, data: filteredTurnos};
      return result;
   },
});

export const asignar_turno_estudios = tool({
   name: "asignar_turno_estudios",
   description: "Usa esta herramienta para asignar un turno para estudios medicos seleccionado por el usuario. Esta herramienta se debe usar una vez que el usuario selecciono un turno disponible para reservarlo.",
   parameters: z.object({
      IdTurno: z.number().describe("ID del turno a reservar"),
      IdPersona: z.number().describe("ID de la persona para la cual se reserva el turno"),
      IdCobertura: z.number().describe("ID de la cobertura de la persona para la cual se reserva el turno"),
      IdPrestacion: z.number().describe("ID de la prestacion que se va a reservar"),
   }),
   execute: async (parameters, ctx) => {

      // Implement the logic to assign the turno based on the provided parameters
      const { IdTurno, IdPersona, IdCobertura, IdPrestacion } = parameters;

      // Assign the turno

      const result = {success: true, message: `Turno con ID ${IdTurno} asignado exitosamente a la persona con ID ${IdPersona} para la prestacion con ID ${IdPrestacion}.`};
      return result;

   }
});