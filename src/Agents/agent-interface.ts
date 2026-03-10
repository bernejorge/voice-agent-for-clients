import type { RealtimeAgent } from "@openai/agents/realtime";
import type { CallCtx } from "./../Interfaces/CallCtx.js";

export interface AgentInterface {

   getAgent(): RealtimeAgent<CallCtx>;
}