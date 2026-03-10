import { RealtimeAgent } from '@openai/agents/realtime';
import {} from "../../agent-tools/tools-hp.js";
import type { AgentInterface } from "./../agent-interface.js" 
import type { CallCtx } from "./../../Interfaces/CallCtx.js";

const instructions = `
Eres el agente especializado en buscar los profesionales en el sistema del Hospital Privado.

`;

export class FindDoctorsAgent implements AgentInterface {
   agent: RealtimeAgent<CallCtx>;
   
   constructor (){
      this.agent = new RealtimeAgent<CallCtx>({
         name: "FindDoctorsAgent",
         instructions: instructions,
         handoffDescription: `
         This agent is the spcialist to find Doctors in the system.
         Use it when need to find a Doctor and IdProfesional.
         `
      });

   }
   getAgent(): RealtimeAgent<CallCtx> {
      throw new Error('Method not implemented.');
   }

}