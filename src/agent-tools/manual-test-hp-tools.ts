import "dotenv/config";
import {
   recuperarCentrosServiciosDelProfesional,
   recuperarServiciosYPrestacionesDelProfesionalEnCentro,
} from "./tools-hp.js";
import { prefault } from "zod";
import type { CentrosServiciosPrestacionesDelProfesional } from "../Interfaces/Dtos.js";

function toNumber(value: string | undefined, label: string): number {
   const n = Number(value);
   if (!Number.isFinite(n)) {
      throw new Error(`Parámetro inválido: ${label}`);
   }
   return n;
}

async function main() {
   const [idProfesionalArg, idCentroArg] = process.argv.slice(2);

   if (!process.env.BACKEND_URL) {
      throw new Error("Falta BACKEND_URL en variables de entorno.");
   }

   if (!idProfesionalArg) {
      throw new Error("Uso: pnpm tsx src/agent-tools/manual-test-hp-tools.ts <IdProfesional> [IdCentroAtencion]");
   }

   const IdProfesional = toNumber(idProfesionalArg, "IdProfesional");

   console.log("\n=== Test recuperarCentrosServiciosDelProfesional ===");
   let centros = await recuperarCentrosServiciosDelProfesional(IdProfesional);
   console.dir(centros, { depth: null });

   if (centros.length === 0) {
      console.log("El profesional no tiene centros de atencion asociados.");
      return;
   }
   centros = Array.isArray(centros) ? centros : [centros]; // Asegurar que es un array

   const prestacionesDisponibles = (
      await Promise.all(
         centros.map(async (centro) => {
            const prestaciones = await recuperarServiciosYPrestacionesDelProfesionalEnCentro(IdProfesional, centro.IdCentroAtencion, centro.IdServicio);
            return prestaciones.map((prestacion: any) => ({
               idProfesional: centro.IdProfesional,
               IdCentroAtencion: centro.IdCentroAtencion,
               NombreCentroAtencion: centro.NombreCentroAtencion,
               IdServicio: centro.IdServicio,
               NombreServicio: centro.NombreServicio,
               IdPrestacion: prestacion.IdPrestacion,
               Prestacion: prestacion.NombrePrestacion
            }));
         })
      )
   ).flat();
   console.log("\n=== Test recuperarServiciosYPrestacionesDelProfesionalEnCentro para cada centro asociado al profesional ===");
   console.dir(prestacionesDisponibles, { depth: null });

   if (idCentroArg) {
      const idCentro = toNumber(idCentroArg, "IdCentroAtencion");
      console.log("\n=== Test recuperarServiciosYPrestacionesDelProfesionalEnCentro ===");
      const prestaciones = await recuperarServiciosYPrestacionesDelProfesionalEnCentro(IdProfesional, idCentro, 498);
      console.dir(prestaciones, { depth: null });
   } else {
      console.log("\n(No se ejecutó recuperarServiciosYPrestacionesDelProfesionalEnCentro porque no pasaste IdCentroAtencion)");
   }
}

main().catch((error) => {
   console.error("Error en test manual:", error);
   process.exit(1);
});
