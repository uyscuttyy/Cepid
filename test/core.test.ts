import test from 'node:test'
import assert from 'node:assert/strict'
import { DeterministicStrategy } from '../src/strategy'
import { evaluateIntent } from '../src/risk'
const market:any={id:'m',symbol:'BTC',pool:'0x0000000000000000000000000000000000000001',asset:'BTC',window:'15M',expiry:Date.now()/1000+1000,active:true,minQuantity:0.001,bids:[[0.6,1]],asks:[[0.7,1]],noAsks:[[0.4,1]]}
test('deterministic strategy emits a structured intent',()=>assert.equal(new DeterministicStrategy().decide(market).direction,'BUY_YES'))
test('BUY_NO uses the YES-price complement required by DreamDEX',()=>{const noMarket={...market,bids:[[0.2,1]],asks:[[0.3,1]],noAsks:[[0.7,1]]}; const intent=new DeterministicStrategy().decide(noMarket); assert.equal(intent.direction,'BUY_NO'); assert.ok(Math.abs(intent.price-0.3)<1e-12)})
test('risk rejects collateral above cap',()=>{const intent={...new DeterministicStrategy().decide(market),quantity:1}; const result=evaluateIntent(intent,market,{maxCollateral:.001,supportedAssets:['BTC'],supportedWindows:['15M']} as any); assert.equal(result.approved,false)})
