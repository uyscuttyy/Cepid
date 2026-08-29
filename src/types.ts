export type Direction = 'BUY_YES' | 'BUY_NO' | 'SELL_YES' | 'SELL_NO' | 'NO_TRADE'
export type SupportedAsset = 'BTC' | 'ETH'
export type SupportedWindow = '15M' | '1H'

export interface MarketSnapshot {
  id: string
  symbol: string
  pool: `0x${string}`
  asset: SupportedAsset
  window: SupportedWindow
  expiry: number
  active: boolean
  minQuantity: number
  bids: [number, number][]
  asks: [number, number][]
  noAsks: [number, number][]
}

export interface TradeIntent {
  marketId: string
  marketSymbol: string
  pool: `0x${string}`
  direction: Direction
  quantity: number
  price: number
  confidence: number
  reason: string
  createdAt: string
}

export interface RiskDecision { approved: boolean; reasons: string[]; collateral: number; intent: TradeIntent }
