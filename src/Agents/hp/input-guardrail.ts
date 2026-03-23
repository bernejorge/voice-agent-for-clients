import {
  Agent,
  run,
  InputGuardrailTripwireTriggered,
} from '@openai/agents';
import type {
  InputGuardrail,
} from '@openai/agents';
import { z } from 'zod';

const guardrailAgent = new Agent({
  name: 'Guardrail-check',
  instructions: `
Check if the user input is related to the correct usage of a hospital appointment
and hospital information agent.

Valid requests include:
- booking an appointment
- rescheduling an appointment
- cancelling an appointment
- checking existing appointments
- asking for hospital information
- asking about medical specialties
- asking about doctors
- asking about locations or centers
- asking about schedules
- asking about health insurance / coverage
- asking about studies, services, or medical practices

Invalid requests include:
- unrelated personal questions
- programming help
- homework
- politics
- entertainment
- shopping
- finance
- any request unrelated to hospital appointments or hospital information

Return true only if the request is clearly related to hospital appointment management
or hospital information.
  `,
  outputType: z.object({
    isHospitalRelatedRequest: z.boolean(),
    reasoning: z.string(),
  }),
})


export const hospitalInputGuardrail: InputGuardrail = {
  name: 'Hospital-input-guardrail',
  execute: async ({ input }) => {
    const result = await run(guardrailAgent, input);

    return {
      tripwireTriggered: result.finalOutput?.isHospitalRelatedRequest === false,
      outputInfo: result.finalOutput,
    };
  },
};