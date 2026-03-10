import { RealtimeSession, type RealtimeContextData } from "@openai/agents/realtime";
import type { CallCtx } from './../Interfaces/CallCtx.js';
import type { RunContext } from "@openai/agents";
import  { AbstractSessionHandler } from "./abstract-handler.js";

export class DtmfDniHandler extends AbstractSessionHandler {
   //private readonly session: RealtimeSession<CallCtx>;

   private dniBuffer = "";
   private activeResponse = false;



   constructor(session: RealtimeSession<CallCtx>) {
      super(session);
      
   }

   private readonly onTransportEvent = (event: any) => {
      if (event.type === "input_audio_buffer.dtmf_event_received") {
         const digit = event.event;
         //console.log("[DTMF DNI] dígito recibido →", digit);

         if (digit !== "#") {
            // Acumular dígitos
            this.dniBuffer += digit;
            return;
         }

         // Llegó '#': DNI completo
         const fullDni = this.dniBuffer;
         this.dniBuffer = "";

         if (!fullDni) {
            console.warn("[DTMF DNI] '#' recibido pero el buffer está vacío.");
            return;
         }

         const ultimosOcho = fullDni.length > 8 ? fullDni.slice(-8) : fullDni;
         console.log("[DTMF DNI] DNI completo:", ultimosOcho);

         // Si el asistente está hablando, cancelamos la respuesta actual
         if (this.activeResponse) {
            this.session.transport.sendEvent({
               type: 'response.cancel',
            });
         }

         // Avisamos al modelo
         this.session.sendMessage(`DNI ingresado completo: ${ultimosOcho}#`);
      }

   }
   private readonly onAgentStart = () => {
      // El agente empezó a hablar / responder
      this.activeResponse = true;
   };

   private readonly onAgentEnd = () => {
      // El agente terminó su respuesta
      this.activeResponse = false;
   };

   private readonly onAgentToolStart = (toolEvent: RunContext<RealtimeContextData<CallCtx>>) => {
      // El agente empezó a usar una herramienta
      const history = (toolEvent as any)?.context?.history ?? [];
      const last = history[history.length - 1];

      // Safely derive a tool name from the last history item (use any casts to avoid strict type errors)
      const nombre =
         (last as any)?.name ??
         (last as any)?.tool?.name ??
         (Array.isArray((last as any)?.content) &&
            (((last as any).content.find((c: any) => c.name) as any)?.name ??
               ((last as any).content.find((c: any) => c.text) as any)?.text)) ??
         'unknown';

      if (nombre === "validar_dni") {
         this.dniBuffer = ""; // reset dni ingresado cuando se llama a validar_dni
      }
   };

   public initialize() {
      // Suscribir i
      this.session.transport.on("*", this.onTransportEvent);
      this.session.on("agent_start", this.onAgentStart);
      this.session.on("agent_end", this.onAgentEnd);
      this.session.on("agent_tool_start", this.onAgentToolStart);
   }
   
   public stop(): void {
    // Limpiar estado interno
    this.dniBuffer = "";
    this.activeResponse = false;

    // Desuscribir listeners, igual estilo que SilenceHandler
    this.session.transport.off("*", this.onTransportEvent);
    this.session.off("agent_start", this.onAgentStart);
    this.session.off("agent_end", this.onAgentEnd);
    this.session.off("agent_tool_start", this.onAgentToolStart);
  }
};
