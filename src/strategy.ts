import type {MarketSnapshot,TradeIntent} from './types'

export interface Strategy { decide(market:MarketSnapshot):TradeIntent }

export class DeterministicStrategy implements Strategy {
  decide(market:MarketSnapshot):TradeIntent {
    const bid=market.bids[0]?.[0],ask=market.asks[0]?.[0]
    if(bid===undefined||ask===undefined)return {marketId:market.id,marketSymbol:market.symbol,pool:market.pool,direction:'NO_TRADE',quantity:0,price:0,confidence:0,reason:'Order book is incomplete',createdAt:new Date().toISOString()}
    const mid=(bid+ask)/2
    const direction=mid>=0.5?'BUY_YES':'BUY_NO'
    // DreamDEX's binary ABI always receives the YES-probability price. A BUY_NO
    // therefore converts the observed NO ask back to its YES complement.
    const price=direction==='BUY_YES'?ask:(1-(market.noAsks[0]?.[0]??(1-mid)))
    return {marketId:market.id,marketSymbol:market.symbol,pool:market.pool,direction,quantity:market.minQuantity,price,confidence:Math.abs(mid-0.5)*2,reason:`Deterministic midpoint rule: ${mid.toFixed(4)}`,createdAt:new Date().toISOString()}
  }
}
