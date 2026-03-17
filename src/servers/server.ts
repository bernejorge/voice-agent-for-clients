import fastifyFactory, { type FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { APIError, InvalidWebhookSignatureError } from 'openai/error';
import {
  OpenAIRealtimeSIP,
  RealtimeSession,
} from '@openai/agents/realtime';

import type { CallCtx } from './../Interfaces/CallCtx.js';
import { timestamp } from './../utils/timestamp.js';
import { costCalculator } from './../utils/cost-calculator.js';
import type { CallFlowFactory } from './../Factory/CallFlowFactory.js';

dotenv.config();

export class Server {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly port: number;
  private readonly openai: OpenAI;

  constructor(private readonly factory: CallFlowFactory) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_WEBHOOK_SECRET = process.env.OPENAI_WEBHOOK_SECRET;
    const PORT = Number(process.env.PORT ?? 8000);

    if (!OPENAI_API_KEY || !OPENAI_WEBHOOK_SECRET) {
      throw new Error(
        'Missing OPENAI_API_KEY or OPENAI_WEBHOOK_SECRET environment variables.',
      );
    }

    this.apiKey = OPENAI_API_KEY;
    this.webhookSecret = OPENAI_WEBHOOK_SECRET;
    this.port = PORT;

    this.openai = new OpenAI({
      apiKey: this.apiKey,
      webhookSecret: this.webhookSecret,
    });
  }

  public async main(): Promise<void> {
    const fastify = fastifyFactory();

    await fastify.register(fastifyRawBody, {
      field: 'rawBody',
      global: false,
      encoding: 'utf8',
      runFirst: true,
      routes: ['/webhook'],
    });

    const activeCallTasks = new Map<string, Promise<void>>();

    await this.registerRoutes(fastify, activeCallTasks);

    const shutdown = async () => {
      try {
        await fastify.close();
      } catch (error) {
        console.error('Error during shutdown.', error);
      } finally {
        process.exit(0);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    try {
      await fastify.listen({ host: '0.0.0.0', port: this.port });
      console.log(`Server listening on port ${this.port}`);
    } catch (error) {
      console.error('Failed to start server.', error);
      process.exit(1);
    }
  }

  private async registerRoutes(
    fastify: FastifyInstance,
    activeCallTasks: Map<string, Promise<void>>,
  ): Promise<void> {
    fastify.post('/webhook', async (request, reply) => {
      const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
      const payload =
        typeof rawBody === 'string' ? rawBody : rawBody?.toString('utf8');

      if (!payload) {
        reply.status(400).send({
          error: 'Missing raw body for webhook verification.',
        });
        return;
      }

      let event: Awaited<ReturnType<typeof this.openai.webhooks.unwrap>>;

      try {
        event = await this.openai.webhooks.unwrap(payload, request.headers);
      } catch (error) {
        if (error instanceof InvalidWebhookSignatureError) {
          console.warn('Invalid webhook signature.');
          reply.status(400).send({ error: 'Invalid webhook signature.' });
          return;
        }

        console.error('Failed to parse webhook payload.', error);
        reply.status(500).send({ error: 'Failed to parse webhook payload.' });
        return;
      }

      if (event.type === 'realtime.call.incoming') {
        const callId = event.data.call_id;

        const phoneNumber =
          event.data?.sip_headers?.find(
            (hdr) => hdr.name.toLowerCase() === 'from',
          )?.value || 'unknown';

        if (!callId) {
          console.error('Test incoming call webhook.');
          reply.status(200).send({ ok: true });
          return;
        }

        const agent = this.factory.createAgent();

        try {
          await this.acceptCall(callId, agent);
        } catch (error) {
          console.error(`Failed to accept call ${callId}:`, error);
          reply.status(500).send({ error: 'Failed to accept call.' });
          return;
        }

        if (!activeCallTasks.has(callId)) {
          const task = this.observeCall(callId, agent, undefined, phoneNumber)
            .catch((error) => {
              console.error(
                `Unhandled error while observing call ${callId}:`,
                error,
              );
            })
            .finally(() => {
              activeCallTasks.delete(callId);
            });

          activeCallTasks.set(callId, task);
        } else {
          console.info(
            `Call ${callId} already being observed; skipping duplicate webhook.`,
          );
        }
      }

      reply.status(200).send({ ok: true });
    });

    fastify.get('/', async () => ({ status: 'ok' }));
  }

  private async acceptCall(callId: string, agent: any): Promise<void> {
    const sessionOptions = this.factory.getSessionOptions();

    try {
      const initialConfig =
        await OpenAIRealtimeSIP.buildInitialConfig<CallCtx>(
          agent,
          sessionOptions,
        );

      await this.openai.realtime.calls.accept(callId, initialConfig);

      console.info(
        `[${timestamp(sessionOptions.context as CallCtx)}] Accepted call ${callId}`,
      );
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        console.warn(
          `Call ${callId} no longer exists when attempting accept. Skipping.`,
        );
        return;
      }

      throw error;
    }
  }

  private async observeCall(
    callId: string,
    agent: any,
    sipHost?: string,
    from?: string,
  ): Promise<void> {
    const sessionOptions = this.factory.getSessionOptions();

    const session = new RealtimeSession<CallCtx>(agent, {
      transport: new OpenAIRealtimeSIP(),
      ...sessionOptions,
      context: { callId, sipHost, phoneNumber: from },
    });

    const sessionHandler = this.factory.createSessionHandler(session);
    const saludoInicial = this.factory.getSaludoInicial();
    const handleSessionError = (event: any) => {
      const error = event?.error?.error ?? event?.error ?? event;
      const code = error?.code;

      if (code === 'conversation_already_has_active_response') {
        console.warn(
          `[${callId}] Ignoring realtime overlap error: ${error?.message ?? code}`,
        );
        return;
      }

      console.error(`[${callId}] Realtime session error:`, event);
    };

    try {
      //session.on('error', handleSessionError);
      session.on('error', (event) => {
        console.error('Realtime session error:', event.error);
      });
      
      sessionHandler.initialize();

      await session.connect({ apiKey: this.apiKey, callId });

      console.info(
        `[${timestamp(sessionOptions.context as CallCtx)}] Attached to realtime call ${callId}`,
      );

      session.transport.sendEvent({
        type: 'response.create',
        response: {
          instructions: `Say exactly '${saludoInicial}' now before continuing the conversation.`,
        },
      });

      await new Promise<void>((resolve) => {
        const handleDisconnect = () => {
          session.transport.off('disconnected', handleDisconnect);
          resolve();
        };

        session.transport.on('disconnected', handleDisconnect);
      });
    } catch (error) {
      console.error(`Error while observing call ${callId}:`, error);
    } finally {
      try {
        sessionHandler.stop();
      } catch (e) {
        console.error('Error removing listeners:', e);
      }

      session.off('error', handleSessionError);

      session.close();

      const inputTokens = session.usage.inputTokens ?? 0;
      const outputTokens = session.usage.outputTokens ?? 0;
      const cost = costCalculator(inputTokens, outputTokens);

      console.info(
        `[${timestamp(sessionOptions.context as CallCtx)}] Call ${callId} ended. Cost: $${cost.toFixed(2)} USD`,
      );
    }
  }
}
