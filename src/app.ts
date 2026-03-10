import dotenv from "dotenv";
import { Server } from "./servers/server.js";
import { HPCallFlowFactory } from "./Factory/HPCallFlowFactory.js";
import { CallFlowFactory } from "./Factory/CallFlowFactory.js";

dotenv.config();

function buildCallFlowFactory(): CallFlowFactory {
  const callFlow = process.env.CALL_FLOW?.trim().toUpperCase();

  switch (callFlow) {
    case "HP":
      return new HPCallFlowFactory();
   
   // completar con otros factorias para otros clientes

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
    console.error("Failed to bootstrap application.", error);
    process.exit(1);
  }
}

bootstrap();