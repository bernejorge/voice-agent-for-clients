import {
   RealtimeSession,
   type RealtimeAgent,
   type RealtimeSessionOptions,
} from "@openai/agents/realtime";

import type { CallCtx } from "../Interfaces/CallCtx.js";
import { CallFlowFactory } from "./CallFlowFactory.js";

import { AbstractSessionHandler } from "./../handlers-events/abstract-handler.js";
import { HPSessionHandler } from "../handlers-events/HPSessionHandler.js";
import { multiagenteTest01 } from "../Agents/hp/muiltiple-test-01.js";

export class HPCallFlowFactory extends CallFlowFactory {

   public createAgent(): RealtimeAgent<CallCtx> {
      return new multiagenteTest01().getAgent();
   }

   public getSaludoInicial(): string {
      return "Hola, soy el asistente del Hospital Privado de Córdoba, ¿en qué puedo ayudarte?";
   }

   public createSessionHandler(session: RealtimeSession<CallCtx>): AbstractSessionHandler {
      return new HPSessionHandler(session);
   }

}