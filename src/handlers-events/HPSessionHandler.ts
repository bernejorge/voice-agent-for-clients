import { RealtimeSession, type RealtimeContextData } from "@openai/agents/realtime";
import type { CallCtx } from './../Interfaces/CallCtx.js';
import type { RunContext } from "@openai/agents";
import  { AbstractSessionHandler } from "./abstract-handler.js";
import { DtmfDniHandler } from "./dtmf-handler.js";
import { SilenceHandler } from "./silence-handler.js";

export class HPSessionHandler extends AbstractSessionHandler {
   private handlers: AbstractSessionHandler[] ;

   constructor(session: RealtimeSession<CallCtx>){
      super(session);
      this.handlers = [
         new DtmfDniHandler(session),
         new SilenceHandler(session, 8000)
      ]
   }
   
   public initialize(): void {
    for (const handler of this.handlers) {
      handler.initialize();
    }
  }

  public stop(): void {
    for (const handler of [...this.handlers].reverse()) {
      handler.stop();
    }
  }
}