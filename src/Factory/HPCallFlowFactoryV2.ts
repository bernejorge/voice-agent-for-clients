import {
   RealtimeSession,
   type RealtimeAgent,
   type RealtimeSessionOptions,
} from "@openai/agents/realtime";

import type { CallCtx } from "../Interfaces/CallCtx.js";
import { CallFlowFactory } from "./CallFlowFactory.js";

import { AbstractSessionHandler } from "./../handlers-events/abstract-handler.js";
import { HPSessionHandler } from "../handlers-events/HPSessionHandler.js";
import { multiagenteTest02 } from "../Agents/hp/multiple-test-02.js";

export class HPCallFlowFactoryV2 extends CallFlowFactory {

   public createAgent(): RealtimeAgent<CallCtx> {
      // multiagenteTest01 funciona como un buider de agentes
      return new multiagenteTest02().getAgent();
   }

   public getSaludoInicial(): string {
      return "Hola, soy el asistente del Hospital Privado de Córdoba, ¿en qué puedo ayudarte?";
   }

   public createSessionHandler(session: RealtimeSession<CallCtx>): AbstractSessionHandler {
      return new HPSessionHandler(session);
   }

}