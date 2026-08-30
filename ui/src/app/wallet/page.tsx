import { Section, Stat } from '@/components/Primitives';
import { getAgentSnapshot } from '@/lib/data';
import { formatAddress } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WalletPage() {
  const snapshot = await getAgentSnapshot();
  const wallet = snapshot.walletAddress;

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Wallet</span>
        <h1 className="page__title">{wallet ? formatAddress(wallet, 8, 6) : 'No wallet configured'}</h1>
        <p className="page__sub">
          The agent's dedicated testnet trading wallet. The private key is loaded
          from <code>AGENT_PRIVATE_KEY</code> in <code>.env</code> and is never
          exposed to the browser, the API, or the network. The wallet is treated
          as disposable testnet infrastructure.
        </p>
      </header>

      <Section title="Address">
        <Stat label="Address" value={wallet ?? '—'} sub={wallet ? 'EVM-compatible' : 'Set AGENT_PRIVATE_KEY to load'} />
        <Stat label="Network" value={snapshot.network} sub={snapshot.rpcUrl || 'no RPC configured'} />
        <Stat label="Wallet type" value="Local signer" sub="v1 — future: session keys, smart accounts" />
      </Section>

      <Section title="What this wallet is for">
        <ul className="reasoning">
          <li>Approving the exchange / market contract to spend USDC</li>
          <li>Placing binary market orders on the configured network</li>
          <li>Redeeming winning conditional tokens after resolution</li>
        </ul>
      </Section>

      <Section title="What this wallet is NOT for">
        <ul className="reasoning">
          <li>Not a personal wallet. Do not send mainnet funds here.</li>
          <li>Not exposed through any browser endpoint. The private key never crosses the network boundary.</li>
          <li>Not registered, listed, or scored anywhere. CEPID is not a marketplace.</li>
        </ul>
      </Section>

      <Section title="Architecture" hint="how the wallet can evolve">
        <ul className="reasoning">
          <li>Local private-key signer (V1): simple, disposable, demo-friendly.</li>
          <li>Session keys (future): scoped signers, time-limited, ideal for autonomous agents.</li>
          <li>Smart accounts (future): account-abstraction wallets with policy-controlled execution.</li>
          <li>Delegated signing (future): the agent signs on behalf of a managed owner.</li>
        </ul>
      </Section>
    </div>
  );
}
