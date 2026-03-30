import { RealtimeAgent } from '@openai/agents/realtime';
import { RECOMMENDED_PROMPT_PREFIX, SHARED_INSTRUCTIONS } from './../../utils/shared-prompt.js'
import type { CallCtx } from './../../Interfaces/CallCtx.js';
//import { promptWithHandoffInstructions } from '@openai/agents-core/extensions';
import type { AgentInterface } from './../agent-interface.js';
import { AppointmentAgentV2 } from '../hp/appointment-agent-new.js';
import { CancelAndRescheduleAgent } from '../hp/cancel-and-reschedule-agent.js';
import { AuthenticateAgent } from '../hp/auth-agent.js';
import { MultipleAppointmentAgent } from './multiple-appointment-agent.js';
import type { InputGuardrail} from '@openai/agents';
import { hospitalInputGuardrail } from './../hp/input-guardrail.js'



export class multiagenteTest02 implements AgentInterface {
   private instruccionesCompartidas: string;
   private inputGuardRail: InputGuardrail;
   
   constructor(){
      this.instruccionesCompartidas = SHARED_INSTRUCTIONS;
      this.inputGuardRail = hospitalInputGuardrail;
   }

   getAgent(): RealtimeAgent<CallCtx> {

      const turnoAgent = new AppointmentAgentV2().getAgent();
      const cancelAgent = new CancelAndRescheduleAgent().getAgent();
      const authAgent = new AuthenticateAgent().getAgent();
      const multiplesTurnosAgent = new MultipleAppointmentAgent().getAgent();

      authAgent.inputGuardrails = [this.inputGuardRail];
      turnoAgent.inputGuardrails = [this.inputGuardRail];
      cancelAgent.inputGuardrails = [this.inputGuardRail];
      multiplesTurnosAgent.inputGuardrails = [this.inputGuardRail];

      authAgent.handoffs = [turnoAgent, cancelAgent, multiplesTurnosAgent];
      turnoAgent.handoffs = [cancelAgent, authAgent, multiplesTurnosAgent];
      cancelAgent.handoffs = [turnoAgent, authAgent, multiplesTurnosAgent];
      multiplesTurnosAgent.handoffs = [authAgent, cancelAgent];

      authAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + authAgent.instructions + "\n" + this.instruccionesCompartidas;
      turnoAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + turnoAgent.instructions + "\n" + this.instruccionesCompartidas;
      cancelAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + cancelAgent.instructions + "\n" + this.instruccionesCompartidas;
      multiplesTurnosAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + multiplesTurnosAgent.instructions + "\n" + this.instruccionesCompartidas;

      return authAgent;
   }

   
}
