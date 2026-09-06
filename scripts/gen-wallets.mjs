// Throwaway keypair generator. Run once; never commit the result.
// Usage: node scripts/gen-wallets.mjs
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

function pair() {
  const pk = generatePrivateKey();             // 0x-prefixed
  const acct = privateKeyToAccount(pk);
  return { address: acct.address, privateKey: pk };
}

const demo = pair();
const pay  = pair();

const out = {
  DEMO_AGENT_ADDRESS:      demo.address,
  DEMO_AGENT_PRIVATE_KEY:   demo.privateKey,
  CEPID_PAYMENT_ADDRESS:    pay.address,
  CEPID_PAYMENT_WALLET_KEY: pay.privateKey,
};
console.log(JSON.stringify(out, null, 2));
