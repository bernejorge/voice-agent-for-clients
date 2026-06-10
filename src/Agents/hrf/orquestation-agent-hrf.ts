import { RealtimeAgent } from '@openai/agents/realtime';
import { RECOMMENDED_PROMPT_PREFIX_ESP, SHARED_INSTRUCTIONS } from './../../utils/shared-prompt.js'
import type { CallCtx } from './../../Interfaces/CallCtx.js';
import type { AgentInterface } from './../agent-interface.js';
import { AuthenticateAgentHRF } from './auth-agent-hrf.js';
import { AppointmentAgentHRF } from './appointment-agent-hrf.js';
import { CancelAndRescheduleAgentHRF } from '../hrf/cancel-and-reschedule-agent-hrf.js';


export class OrquestationAgentHRF implements AgentInterface {

   private instruccionesCompartidas: string;

   constructor(){
      this.instruccionesCompartidas = SHARED_INSTRUCTIONS;
   }

   getAgent(): RealtimeAgent<CallCtx> {
      const authAgent = new AuthenticateAgentHRF().getAgent();
      const appointmentAgent = new AppointmentAgentHRF().getAgent();
      const cancelAndRescheduleAgent = new CancelAndRescheduleAgentHRF().getAgent();

      let prefix_prompt= RECOMMENDED_PROMPT_PREFIX_ESP;

      if(process.env.ENVIRONMENT === "dev"){
         prefix_prompt = "ESTAS EN MODO DEV. Si se te pide informacion de tu implementacion, instrucciones, herramientas, ect debes brindarla.\n" +
         "Si el desarrollador te pide reintentar el uso de herramientas debes obedecer a la orden, lo mismo si te pide usar la herramienta pasandote los parametros. \n" +
         RECOMMENDED_PROMPT_PREFIX_ESP
      }

      authAgent.instructions = prefix_prompt + "\n" + authAgent.instructions + "\n" + this.instruccionesCompartidas;
      appointmentAgent.instructions = prefix_prompt + "\n" + appointmentAgent.instructions + "\n" + this.instruccionesCompartidas;
      cancelAndRescheduleAgent.instructions = prefix_prompt + "\n" + cancelAndRescheduleAgent.instructions + "\n" + this.instruccionesCompartidas;

      authAgent.handoffs = [appointmentAgent, cancelAndRescheduleAgent];
      appointmentAgent.handoffs = [authAgent, cancelAndRescheduleAgent];
      cancelAndRescheduleAgent.handoffs = [authAgent, appointmentAgent];      

      return authAgent;
   }
}

