const inputCost = 4 // costo por 1M tokens de entrada
const outputCost = 16 // costo por 1M tokens de salida

export function costCalculator(inputTokens: number, outputTokens: number): number {
   const inputCostTotal = (inputTokens / 1_000_000) * inputCost;
   const outputCostTotal = (outputTokens / 1_000_000) * outputCost;
   return inputCostTotal + outputCostTotal;
}