/**
 * Demo agent configuration loader — the agent's OWN config.
 *
 * The key rules: the private key is loaded from the environment, validated,
 * and NEVER logged, serialized, or written anywhere. The agent's config
 * object carries it only in memory for the signer. (Phase 0's shim re-exported
 * the platform loader; the agent now owns its own.)
 */
import type { AgentConfig } from './types.js';

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number, got "${raw}"`);
  }
  return value;
}

function readString(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }
  return raw;
}

function readPrivateKey(): `0x${string}` | null {
  const raw = process.env.DEMO_AGENT_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!raw) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('Private key must be a 0x-prefixed 32-byte hex string');
  }
  return raw as `0x${string}`;
}

export function loadConfig(): AgentConfig {
  const network = readString('CEPID_NETWORK', 'mock') as AgentConfig['network'];
  if (!['base', 'base-sepolia', 'mock'].includes(network)) {
    throw new Error(`Unsupported CEPID_NETWORK: ${network}`);
  }

  const rpcUrl =
    network === 'base'
      ? readString('CEPID_RPC_URL_BASE', 'https://mainnet.base.org')
      : network === 'base-sepolia'
        ? readString('CEPID_RPC_URL_BASE_SEPOLIA', 'https://sepolia.base.org')
        : '';

  const config: AgentConfig = {
    network,
    privateKey: readPrivateKey(),
    rpcUrl,
    dataDir: readString('CEPID_DATA_DIR', './data'),
    agentId: readString('DEMO_AGENT_ID', 'agent-demo-trader'),
    risk: {
      maxCollateralUsdc: readNumber('CEPID_MAX_COLLATERAL', 0.5),
      sessionMaxCollateralUsdc: readNumber('CEPID_SESSION_MAX_COLLATERAL', 1.0),
      sessionMaxOrders: readNumber('CEPID_SESSION_MAX_ORDERS', 3),
      maxSlippageBps: readNumber('CEPID_MAX_SLIPPAGE_BPS', 200),
    },
  };

  if (network === 'base') {
    config.limitless = {
      tokenId: readString('LMTS_TOKEN_ID', ''),
      tokenSecret: readString('LMTS_TOKEN_SECRET', ''),
      ownerId: readString('LMTS_OWNER_ID', ''),
      apiBase: 'https://api.limitless.exchange',
      wsUrl: 'wss://ws.limitless.exchange',
    };
  }

  return config;
}
