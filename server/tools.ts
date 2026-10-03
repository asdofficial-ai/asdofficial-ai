import { ProviderError } from './providers.ts';

export function calculate(expression: string): number {
  if (expression.length > 200 || !/^[\d\s.+*/()%-]+$/.test(expression)) throw new ProviderError('invalid_expression', 400);
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/%\-]/g) || [];
  let index = 0;
  const atom = (): number => {
    const token = tokens[index++];
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom();
    if (token === '(') { const result = sum(); if (tokens[index++] !== ')') throw new ProviderError('invalid_expression', 400); return result; }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new ProviderError('invalid_expression', 400);
    return Number(token);
  };
  const product = (): number => {
    let result = atom();
    while (['*', '/', '%'].includes(tokens[index])) { const op = tokens[index++]; const right = atom(); result = op === '*' ? result * right : op === '/' ? result / right : result % right; }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (['+', '-'].includes(tokens[index])) { const op = tokens[index++]; const right = product(); result = op === '+' ? result + right : result - right; }
    return result;
  };
  const result = sum();
  if (index !== tokens.length || !Number.isFinite(result)) throw new ProviderError('invalid_expression', 400);
  return result;
}
export const tools = [
  { name: 'calculator', purpose: 'Evaluate arithmetic without executing code', readOnly: true, permission: 'none', timeoutMs: 1000, inputSchema: { type: 'object', required: ['expression'], properties: { expression: { type: 'string', maxLength: 200 } } } },
  { name: 'time', purpose: 'Current date and time in an IANA timezone', readOnly: true, permission: 'none', timeoutMs: 1000, inputSchema: { type: 'object', properties: { timezone: { type: 'string' } } } }
];
export function executeTool(name: string, input: Record<string, unknown>) {
  if (name === 'calculator' && typeof input.expression === 'string') return { success: true, result: calculate(input.expression) };
  if (name === 'time') {
    const timezone = typeof input.timezone === 'string' ? input.timezone : 'UTC';
    try { return { success: true, result: new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date()) }; }
    catch { throw new ProviderError('invalid_timezone', 400); }
  }
  throw new ProviderError('unknown_tool_or_invalid_input', 400);
}
