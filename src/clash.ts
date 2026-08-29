import type { AgentConfig } from './config'
export async function notifyClash(config:AgentConfig,payload:Record<string,unknown>):Promise<'sent'|'unavailable'> {
  try { const response=await fetch(`${config.clashApiUrl}/api/agents/activity`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); return response.ok?'sent':'unavailable' } catch { return 'unavailable' }
}
