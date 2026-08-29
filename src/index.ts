import {createExchange,findActiveMarkets} from './market-data'
import {loadConfig,walletAddress} from './config'
import {DeterministicStrategy} from './strategy'
import {evaluateIntent} from './risk'
import {createPrivateKeyWallet} from './wallet'
import {EventStore} from './persistence'
import {notifyClash} from './clash'
import {authorizeIntent,loadExecutionPolicy} from './policy'

const config=loadConfig(),wallet=createPrivateKeyWallet(config.privateKey),address=walletAddress(config),execute=process.argv.includes('--execute'),confirmApproval=process.argv.includes('--confirm-approval'),confirmOrder=process.argv.includes('--confirm-order'),store=new EventStore(),policy=loadExecutionPolicy()
const argument=(name:string)=>{const prefix=`--${name}=`;return process.argv.find(value=>value.startsWith(prefix))?.slice(prefix.length)}
const exchange=createExchange(config.privateKey)
try {
  const registration={name:config.name,description:config.description,builder:config.builder,markets:config.supportedAssets,windows:config.supportedWindows,integration:config.integrationUrl,walletAddress:address}
  let clashStatus='unavailable'
  try { const response=await fetch(`${config.clashApiUrl}/api/agents`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(registration)});const body=await response.json() as {error?:string};if(!response.ok&&!body.error?.includes('already'))throw new Error(`CLASH registration failed: ${JSON.stringify(body)}`);clashStatus='registered' } catch(error) { if(error instanceof Error&&error.message.startsWith('CLASH registration failed'))throw error }
  const market=(await findActiveMarkets(exchange))[0]
  if(!market)throw new Error('No active BTC/ETH 15m/1h market found')
  const intent=new DeterministicStrategy().decide(market),risk=evaluateIntent(intent,market,config),policyDecision=authorizeIntent(intent,policy,config,await store.all())
  if(!risk.approved){console.log(JSON.stringify({mode:'rejected',agent:address,market,intent,risk},null,2));process.exit(0)}
  const tokenState=await wallet.tokenState(intent.pool),nativeBalance=await wallet.balance(),rawPrice=BigInt(Math.round(intent.price*1e6)),rawQuantity=BigInt(Math.round(intent.quantity*1e6)),escrow=(rawQuantity*rawPrice+1_000_000n-1n)/1_000_000n,approvalAmount=escrow+(escrow+9n)/10n
  const approval=await wallet.buildFiniteApproval(intent.pool,approvalAmount)
  if(execute&&!policy.enabled){const expectedPool=argument('expected-pool')?.toLowerCase(),expectedMarket=argument('expected-market'),expectedAmount=argument('expected-approval-amount');if(!expectedPool||!expectedMarket||!expectedAmount)throw new Error('Execution requires exact expected transaction guards');if(expectedPool!==intent.pool.toLowerCase()||expectedMarket!==intent.marketId||BigInt(expectedAmount)!==approvalAmount)throw new Error('Live proposal no longer matches the explicitly approved transaction; refusing to broadcast')}
  const trader=exchange.client.createTrader({privateKey:config.privateKey})
  const built=await trader.buildPlaceOrder({pool:intent.pool,side:intent.direction as 'BUY_YES'|'BUY_NO',price:rawPrice,quantity:rawQuantity,orderType:2,autoApprove:false})
  const approvalSimulation=await wallet.simulate(approval)
  const orderSimulation=tokenState.allowance>=approvalAmount?await wallet.simulate(built.order):{ok:false as const,error:'blocked_by_allowance'}
  const preview={mode:execute?'execution-requested':'preview',clashStatus,agent:address,policy:policyDecision,intent,risk,wallet:{nativeBalance:nativeBalance.toString(),tokenBalance:tokenState.balance.toString(),allowance:tokenState.allowance.toString(),tokenDecimals:tokenState.decimals},approval:{to:approval.to,amount:approval.amount.toString(),gas:approval.gas.toString(),simulation:approvalSimulation,data:approval.data},order:{to:built.order.to,data:built.order.data,simulation:orderSimulation}}
  await store.append({type:'preview',at:new Date().toISOString(),wallet:address,...preview})
  if(!execute||!policyDecision.approved){console.log(JSON.stringify(preview,null,2));process.exit(0)}
  if(!confirmApproval) throw new Error('Refusing to broadcast: add --confirm-approval after reviewing the exact finite approval transaction')
  if(tokenState.allowance<approvalAmount){if(!approvalSimulation.ok)throw new Error(`Approval simulation failed: ${approvalSimulation.error}`); const hash=await wallet.send(approval); await store.append({type:'approval_submitted',at:new Date().toISOString(),wallet:address,hash,amount:approvalAmount.toString(),token:approval.to}); await wallet.receipt(hash);}
  const refreshed=await wallet.tokenState(intent.pool)
  if(refreshed.allowance<approvalAmount)throw new Error('Approval receipt confirmed but allowance is still insufficient')
  const finalSimulation=await wallet.simulate(built.order); if(!finalSimulation.ok)throw new Error(`Order simulation failed: ${finalSimulation.error}`)
  if(!confirmOrder)throw new Error('Approval may be sent, but order is blocked: add --confirm-order after reviewing the exact order transaction')
  const orderHash=await wallet.send(built.order); const receipt=await wallet.receipt(orderHash); await store.append({type:'order_submitted',at:new Date().toISOString(),wallet:address,hash:orderHash,receiptStatus:receipt.status,marketId:intent.marketId,direction:intent.direction,quantity:intent.quantity,price:intent.price}); const clashActivity=await notifyClash(config,{walletAddress:address,txHash:orderHash,marketId:intent.marketId,marketSymbol:intent.marketSymbol}); console.log(JSON.stringify({mode:'submitted',orderHash,receiptStatus:receipt.status,clashActivity},null,2))
} finally {await exchange.close()}
