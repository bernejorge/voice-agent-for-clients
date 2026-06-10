import { RealtimeAgent, RealtimeSession, type RealtimeSessionOptions} from '@openai/agents/realtime';
import type { CallCtx } from './../Interfaces/CallCtx.js';
import { CallFlowFactory } from "./CallFlowFactory.js";

import { AbstractSessionHandler } from "./../handlers-events/abstract-handler.js";
import { HPSessionHandler } from "../handlers-events/HPSessionHandler.js";

import { OrquestationAgentHRF } from './../Agents/hrf/orquestation-agent-hrf.js';

export class HRFCallFlowFactory extends CallFlowFactory {

   public createAgent(): RealtimeAgent<CallCtx> {
      return new OrquestationAgentHRF().getAgent();
   }

   public getSaludoInicial(): string {
      return "Hola, soy el asistente virtual del Hospital Raúl Angel Ferreyra, ¿en qué puedo ayudarte?";
   }

   public createSessionHandler(session: RealtimeSession<CallCtx>): AbstractSessionHandler {
      return new HPSessionHandler(session);
   }
   
}