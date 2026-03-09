import { RealtimeSession, type RealtimeContextData } from "@openai/agents/realtime";
import type { CallCtx } from "../Interfaces/CallCtx.js";

export abstract class AbstractHandler {

   protected session: RealtimeSession<CallCtx>; 

   constructor(session: RealtimeSession<CallCtx>) {
      this.session = session;
   }

   public abstract initialize(): void;

   public abstract stop(): void;

}