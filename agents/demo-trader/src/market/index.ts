/**
 * MarketProvider factory — picks the real provider for the configured network.
 *
 * There is deliberately NO mock case here. In-memory markets are test-only:
 * tests construct MockMarketProvider directly and pass it via runOnce's
 * provider override. Production paths can never silently paper-trade.
 */
import type { AgentConfig } from '../config/types.js';
import type { MarketProvider } from './provider.js';
import { LimitlessMarketProvider } from './limitless-provider.js';
import { BaseSepoliaTestMarketProvider } from './base-sepolia-test-provider.js';
import type { MockMarketSeed } from './mock-provider.js';

export function createMarketProvider(config: AgentConfig): MarketProvider {
  switch (config.network) {
    case 'base':
      return new LimitlessMarketProvider(config);
    case 'base-sepolia':
      return new BaseSepoliaTestMarketProvider(config);
    case 'mock':
      throw new Error(
        'mock network requires an explicit MarketProvider (tests only) — pass provider to runOnce instead of relying on the factory',
      );
    default: {
      const exhaustive: never = config.network;
      throw new Error(`Unknown network: ${String(exhaustive)}`);
    }
  }
}

export type { MarketProvider, MockMarketSeed };
