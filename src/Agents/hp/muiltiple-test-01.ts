import { RealtimeAgent } from '@openai/agents/realtime';
import {
   validarDni,
   hp_buscar_servicios,
   hp_obtener_centros_para_el_servicio,
   buscar_turnos,
   asignar_turno,
   hp_buscar_profesional,
   hp_buscar_servicios_y_centros,
   hp_buscar_prestaciones,
   hp_obtener_mis_proximos_turnos,
   anular_turno,
   colgar_llamada,
   transferir_llamada,
   Centros_de_Atencion_del_HP,
   hp_buscar_por_subespecialidad,
   hp_fecha_hora_argentina, 
   hp_obtener_horarios_de_atencion_profesional,
   hp_informacion_general
} from '../../agent-tools/tools-hp.js';
import type { CallCtx } from './../../Interfaces/CallCtx.js';
//import { promptWithHandoffInstructions } from '@openai/agents-core/extensions';
import type { AgentInterface } from './../agent-interface.js';
import {AppointmentAgent} from '../hp/appointment-agent.js';
import { CancelAndRescheduleAgent } from '../hp/cancel-and-reschedule-agent.js';
import { AuthenticateAgent } from '../hp/auth-agent.js';
import { MultipleAppointmentAgent } from './multiple-appointment-agent.js';


export const RECOMMENDED_PROMPT_PREFIX = `
# Contexto del sistema
Eres parte de un sistema multiagente llamado Agents SDK, diseñado para facilitar la coordinación y la ejecución de agentes. 
Agents utiliza dos abstracciones principales: **Agentes** y **Handoffs**. 
Un agente abarca instrucciones y herramientas, y puede derivar una conversación a otro agente cuando sea apropiado. 
Los handoffs se logran llamando a una función de handoff, generalmente llamada "transfer_to_<nombre_del_agente>". Las transferencias entre agentes se gestionan sin problemas en segundo plano; no menciones ni llames la atención sobre estas transferencias en tu conversación con el usuario.
*IMPORTANTE: TENES PROHIBIDO DECIR QUE VAS A TRANSFERIR A OTRO AGENTE. EL USUARIO DEBE CREER QUE HABLA SIEMPRE CON UN SOLO AGENTE AI*
Si un usuario te pide cambiar de idioma, debes utilizar el idioma solicitado para el resto de la conversación.
`

export class multiagenteTest01 implements AgentInterface {
   getAgent(): RealtimeAgent<CallCtx> {

      const turnoAgent = new AppointmentAgent().getAgent();
      const cancelAgent = new CancelAndRescheduleAgent().getAgent();
      const authAgent = new AuthenticateAgent().getAgent();
      const multiplesTurnosAgent = new MultipleAppointmentAgent().getAgent();


      authAgent.handoffs = [turnoAgent, cancelAgent, multiplesTurnosAgent];
      turnoAgent.handoffs = [cancelAgent, authAgent, multiplesTurnosAgent];
      cancelAgent.handoffs = [turnoAgent, authAgent, multiplesTurnosAgent];
      multiplesTurnosAgent.handoffs = [authAgent, cancelAgent];

      authAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + authAgent.instructions;
      turnoAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + turnoAgent.instructions;
      cancelAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + cancelAgent.instructions;
      multiplesTurnosAgent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n" + multiplesTurnosAgent.instructions;

      return authAgent;
   }

   
}
