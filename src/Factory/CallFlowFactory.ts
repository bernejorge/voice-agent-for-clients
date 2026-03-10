
import { RealtimeAgent, RealtimeSession, type RealtimeSessionOptions } from "@openai/agents/realtime";
import type { CallCtx } from "../Interfaces/CallCtx.js";
import { AbstractSessionHandler } from "../handlers-events/abstract-handler.js";

export abstract class CallFlowFactory {

   abstract createAgent(): RealtimeAgent<CallCtx>;
   abstract getSaludoInicial(): string;
   abstract createSessionHandler(session: RealtimeSession<CallCtx>): AbstractSessionHandler

   public getSessionOptions(): Partial<RealtimeSessionOptions<CallCtx>> {
      return {
         model: this.getModel(),
         config: {
            audio: {
               input: {
                  format: "pcm16",
                  transcription: {
                     model: "gpt-4o-transcribe",
                     language: this.getLanguage(),
                  },
                  noiseReduction: {
                     type: "near_field",
                  },
                  turnDetection: {
                     type: "semantic_vad",
                     interruptResponse: true,
                  },
               },
               output: {
                  speed: 1.0,
                  voice: this.getVoice(),
               },
            },
         },
      };
   }

   protected getModel(): string {
      return "gpt-realtime";
   }

   protected getLanguage(): string {
      return "es";
   }

   protected getVoice(): string {
      return "marin";
   }

}