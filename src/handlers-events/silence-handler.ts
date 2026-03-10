import { RealtimeSession } from '@openai/agents/realtime'
import type { CallCtx } from './../Interfaces/CallCtx.js';
import { AbstractSessionHandler } from './abstract-handler.js';

export class SilenceHandler extends AbstractSessionHandler{

   private silenceTimeout: NodeJS.Timeout | null = null;
   private SILENCE_MS: number;
  
   private inToolCall: boolean = false;
   private silenceCounter = 0;

   constructor(session: RealtimeSession<CallCtx>, silenceMs: number) {
      super(session);
      this.SILENCE_MS = silenceMs;
   }


   // Handlers que vamos a poder desuscribir luego
   private readonly onTransportEvent = (event: any) => {
      //console.log("EVENT →", event.type, event);

      //EVENT → input_audio_buffer.speech_started {type: 'input_audio_buffer.speech_started', event_id: 'event_D9fplDEw8ocb5S2RtRJHc', item_id: 'item_D9fplJYASzfG1GP9zLOrA', audio_start_ms: 24748}

      // EVENT → input_audio_buffer.speech_stopped {type: 'input_audio_buffer.speech_stopped', event_id: 'event_D9fpok0pasFV36h1htkZw', item_id: 'item_D9fplJYASzfG1GP9zLOrA', audio_end_ms: 28040}
      if (event.type === "input_audio_buffer.dtmf_event_received") {
         //console.log("DTMF RECIBIDO →", event.event);
         this.stopSilenceTimer();
         this.startSilenceTimer();
      } else if (event.type === "input_audio_buffer.speech_started") {
         // el usuario o agente comenzó a hablar 
         //console.log("EVENT →", event.type, event);
         this.stopSilenceTimer();
         this.silenceCounter = 0; // Resetear contador de silencio
         console.info(`SILENCE-TIMER OFF`)

      } else if (event.type === "output_audio_buffer.stopped") {
         // el usuario o agente terminó de hablar → comenzar el timer de silencio
         //console.log("EVENT →", event.type, event);
         this.startSilenceTimer();

         console.info(`SILENCE-TIMER ON`)
      } else if (event.type === "conversation.item.truncated") {
         // si se trunca es una interrupcion del usuario.
      
        
      }
   };


   public initialize() {

      // Suscribir a eventos
      this.session.transport.on("*", this.onTransportEvent);

      this.session.on("agent_tool_start", (toolEvent) => {
         // El agente empezó a usar una herramienta
         this.inToolCall = true;

      });

      this.session.on("agent_tool_end", () => {
         // El agente terminó de usar una herramienta
         this.inToolCall = false;
         //this.stopSilenceTimer();
      });


      this.session.on("agent_start", () => {
         // El agente empezó a hablar / responder
         console.log("AGENT START → Deteniendo timer de silencio");
         this.stopSilenceTimer();
      })


   }

   private startSilenceTimer(): void {
      if (this.silenceTimeout) {
         clearTimeout(this.silenceTimeout);
      }
      this.silenceTimeout = setTimeout(() => {
         this.stopSilenceTimer();
         this.session.sendMessage("Se ha detectado un silencio prolongado. Informar al usuario de la situacion");
         this.silenceCounter++;

      }, this.SILENCE_MS);
   }
   private stopSilenceTimer() {
      if (this.silenceTimeout) {
         clearTimeout(this.silenceTimeout);
         this.silenceTimeout = null;
      }
   }

   public stop(): void {
      this.stopSilenceTimer();

      //Desuscribir listeners
      this.session.transport.off("*", this.onTransportEvent);

   }
}