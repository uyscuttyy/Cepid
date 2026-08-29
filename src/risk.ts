import type {AgentConfig} from './config'
import type {MarketSnapshot,RiskDecision,TradeIntent} from './types'

export function evaluateIntent(intent:TradeIntent,market:MarketSnapshot,config:AgentConfig):RiskDecision {
  const reasons:string[]=[]
  if(intent.direction==='NO_TRADE')reasons.push('Strategy returned NO_TRADE')
  if(!market.active)reasons.push('Market is inactive')
  if(Date.now()/1000>=market.expiry)reasons.push('Market has expired')
  if(!config.supportedAssets.includes(market.asset))reasons.push('Asset is not allowed')
  if(!config.supportedWindows.includes(market.window))reasons.push('Window is not allowed')
  if(intent.quantity<market.minQuantity)reasons.push('Quantity is below market minimum')
  if(intent.price<=0||intent.price>=1)reasons.push('Price is outside binary probability bounds')
  const collateral=intent.quantity*intent.price
  if(collateral>config.maxCollateral)reasons.push('Collateral exceeds configured limit')
  return {approved:reasons.length===0,reasons,collateral,intent}
}
