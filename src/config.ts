import { privateKeyToAccount } from 'viem/accounts'

export interface AgentConfig {
  clashApiUrl: string
  name: string
  description: string
  builder: string
  integrationUrl: string
  privateKey: `0x${string}`
  maxCollateral: number
  supportedAssets: ('BTC'|'ETH')[]
  supportedWindows: ('15M'|'1H')[]
}

export function loadConfig(): AgentConfig {
  const key=process.env.AGENT_PRIVATE_KEY
  if(!key)throw new Error('AGENT_PRIVATE_KEY is required locally and is never sent to CLASH')
  const maxCollateral=Number(process.env.AGENT_MAX_COLLATERAL??'0.001')
  if(!Number.isFinite(maxCollateral)||maxCollateral<=0)throw new Error('AGENT_MAX_COLLATERAL must be positive')
  return {clashApiUrl:process.env.CLASH_API_URL??'http://localhost:8787',name:process.env.AGENT_NAME??'Independent Test Agent',description:process.env.AGENT_DESCRIPTION??'An independently operated testnet agent.',builder:process.env.AGENT_BUILDER??'Builder',integrationUrl:process.env.AGENT_INTEGRATION_URL??'http://localhost:9000',privateKey:key as `0x${string}`,maxCollateral,supportedAssets:['BTC','ETH'],supportedWindows:['15M','1H']}
}

export function walletAddress(config:AgentConfig):`0x${string}` { return privateKeyToAccount(config.privateKey).address }
