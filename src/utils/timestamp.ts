import type { CallCtx } from "./../Interfaces/CallCtx.js";

export function timestamp(ctx: CallCtx): string {
   try {
      const timestamp = new Date().toLocaleString("es-AR", {
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
         hour12: false,
         timeZone: "America/Argentina/Buenos_Aires"
      });
      return `${timestamp} - ${ctx.callId ? `CallID: ${ctx.callId}` : "No CallID"}`;
   } catch {
      return new Date().toISOString();
   }
}