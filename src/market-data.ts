import {SomniaMarkets,SOMNIA_TESTNET_ADDRESSES} from '@somnia-chain/markets-sdk'
import {somniaShannon} from '@somnia-chain/markets-sdk/chains'
import type {MarketSnapshot,SupportedAsset,SupportedWindow} from './types'

export const INDEXER='https://dev.smk.somnia.host/v1/graphql'
export const WS_RPC=somniaShannon.rpcUrls.default.webSocket[0]
export function createExchange(privateKey?:`0x${string}`){return new SomniaMarkets({chain:somniaShannon,indexerUrl:INDEXER,wsRpcUrl:WS_RPC,addresses:SOMNIA_TESTNET_ADDRESSES,...(privateKey?{privateKey}:{})})}
export async function findActiveMarkets(exchange:SomniaMarkets):Promise<MarketSnapshot[]> {
  const rows=(await exchange.fetchMarkets()).filter(m=>m.type==='binary'&&m.active&&(['BTC','ETH'] as string[]).includes(m.info?.asset??'')&&(['15m','1h'] as string[]).includes(m.info?.interval??''))
  const snapshots:MarketSnapshot[]=[]
  for(const row of rows){if(!row.info?.poolAddress||!row.info.asset||!row.info.interval)continue;const book=await exchange.fetchOrderBook(row.symbol,5);const noAsks=book.info&&'noAsks' in book.info?(book.info as {noAsks:{price:string;quantity:string}[]}).noAsks.map(level=>[Number(level.price)/1e6,Number(level.quantity)/1e6] as [number,number]):[];snapshots.push({id:row.id,symbol:row.symbol,pool:row.info.poolAddress as `0x${string}`,asset:row.info.asset as SupportedAsset,window:row.info.interval==='15m'?'15M':'1H',expiry:Number(row.info.expiry),active:row.active,minQuantity:Number(row.limits.amount.min),bids:book.bids,asks:book.asks,noAsks})}
  return snapshots.sort((a,b)=>a.expiry-b.expiry)
}
