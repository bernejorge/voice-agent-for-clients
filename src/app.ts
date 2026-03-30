import dotenv from "dotenv";
import { Server } from "./servers/server.js";
import { HPCallFlowFactory } from "./Factory/HPCallFlowFactory.js";
import { CallFlowFactory } from "./Factory/CallFlowFactory.js";
import { HPCallFlowFactoryV2 } from "./Factory/HPCallFlowFactoryV2.js";

dotenv.config();

function buildCallFlowFactory(): CallFlowFactory {
  const callFlow = process.env.CALL_FLOW?.trim().toUpperCase();

  switch (callFlow) {
    case "HP":
      return new HPCallFlowFactory();
      // completar con otros factorias para otros clientes

    case "HPV2":
      // FACTORY NUEVA CON EL AGENTE DE TURNOS REESCRITO PARA USAR LAS NUEVAS HERRAMIENTAS DE RECUPERO DE SERVICIOS Y PRESTACIONES DEL PROFESIONAL, 
      // Y LOS CENTROS DE ATENCION ASOCIADOS A ESOS SERVICIOS.
      return new HPCallFlowFactoryV2(); 

    default:
      throw new Error(
        `CALL_FLOW : "${process.env.CALL_FLOW}", is not supported.`
      );
  }
}

async function bootstrap(): Promise<void> {
  try {
    const factory = buildCallFlowFactory();
    const server = new Server(factory);

    await server.main();
  } catch (error) {
    console.error("Failed to start application.", error);
    process.exit(1);
  }
}

bootstrap();