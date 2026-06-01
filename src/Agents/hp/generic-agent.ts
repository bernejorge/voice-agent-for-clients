
import { RealtimeAgent } from '@openai/agents/realtime';
import type { CallCtx } from "../../Interfaces/CallCtx.js";
import type { AgentInterface } from './../agent-interface.js';


export class GenericAgent implements AgentInterface{

   private agent: RealtimeAgent<CallCtx>;

   constructor(){
      this.agent = new RealtimeAgent<CallCtx>({
         name: "GenericAgent",
         instructions: "Eres un agente util. Responde a las preguntas del usuario de la mejor manera posible. Si no sabes la respuesta, di que no lo sabes. Habla en español.",      
      });

   }
   getAgent(): RealtimeAgent<CallCtx> {
      return this.agent;
   }

   
   
}