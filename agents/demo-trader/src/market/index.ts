/**
 * MarketProvider factory — picks the right provider for the configured network.
 */
import type { AgentConfig } from '../config/types.js';
import type { MarketProvider } from './provider.js';
import { LimitlessMarketProvider } from './limitless-provider.js';
import { BaseSepoliaTestMarketProvider } from './base-sepolia-test-provider.js';
import { MockMarketProvider } from './mock-provider.js';
import type { MockMarketSeed } from './mock-provider.js';

export function createMarketProvider(
  config: AgentConfig,
  mockSeed?: MockMarketSeed,
): MarketProvider {
  switch (config.network) {
    case 'base':
      return new LimitlessMarketProvider(config);
    case 'base-sepolia':
      return new BaseSepoliaTestMarketProvider(config);
    case 'mock':
      if (!mockSeed) {
        return new MockMarketProvider({ markets: [] });
      }
      return new MockMarketProvider(mockSeed);
    default: {
      const exhaustive: never = config.network;
      throw new Error(`Unknown network: ${String(exhaustive)}`);
    }
  }
}

export type { MarketProvider, MockMarketSeed };
