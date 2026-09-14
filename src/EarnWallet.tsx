import {useEffect,useMemo,useState} from 'react';
import {api,API_BASE} from './api';

type WalletData={wallet:Record<string,any>|null;transactions:Record<string,any>[]};
type Provider={id:string;name:string;isConfigured:boolean;offerwall?:boolean;rewarding?:boolean;apiConfigured?:boolean};
const money=(v:any,currency='NGN')=>new Intl.NumberFormat('en-NG',{style:'currency',currency,maximumFractionDigits:2}).format(Number(v||0));
const label=(v:any)=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());

export function EarnWallet(){
 const [wallet,setWallet]=useState<WalletData|null>(null),[providers,setProviders]=useState<Provider[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[withdrawAmount,setWithdrawAmount]=useState(''),[destination,setDestination]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[offerwall,setOfferwall]=useState('');
 const load=async()=>{setError('');try{const w=await api.wallet();setWallet(w);try{const r=await fetch(`${API_BASE}/api/earn/providers`,{credentials:'include'});const d=await r.json();setProviders(d.providers||[]);}catch{setProviders([]);}}catch(e){setError(e instanceof Error?e.message:'Unable to load wallet');}finally{setLoading(false);}};
 useEffect(()=>{load();},[]);
 const balance=useMemo(()=>Number(wallet?.wallet?.available_balance??wallet?.wallet?.balance_available??wallet?.wallet?.balance??0),[wallet]);
 const pending=Number(wallet?.wallet?.pending_balance??wallet?.wallet?.balance_pending??0);
 const cpalead=providers.find(p=>p.id==='cpalead');
 const openCpalead=async()=>{if(!cpalead?.isConfigured){setOfferwall('Offers are temporarily unavailable.');return;}setOfferwall('');const popup=window.open('about:blank','_blank');try{const r=await fetch(`${API_BASE}/api/earn/cpalead/offerwall`,{credentials:'include'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Offerwall is unavailable');if(!d.data?.url)throw new Error('Offerwall URL was not returned');if(popup&&!popup.closed){popup.location.href=d.data.url;}else{window.location.href=d.data.url;}}catch(e){if(popup&&!popup.closed)popup.close();setOfferwall(e instanceof Error?e.message:'Offerwall is unavailable.');}};
 const withdraw=async()=>{const n=Number(withdrawAmount);if(!Number.isInteger(n)||n<=0){setNotice('Enter a valid whole-number amount.');return;}if(n>balance){setNotice('Amount exceeds your available balance.');return;}if(!destination.trim()){setNotice('Enter your Paystack recipient code.');return;}setBusy(true);setNotice('');try{await api.withdraw({amount:n,provider:'paystack',destination:destination.trim()});setWithdrawAmount('');setDestination('');setNotice('Withdrawal submitted.');await load();}catch(e){setNotice(e instanceof Error?e.message:'Withdrawal could not be submitted.');}finally{setBusy(false);}};
 if(loading)return <section className="earn-page"><div className="skeleton"/></section>;
 return <section className="earn-page">
  <div className="title"><div><small>Wallet</small><h1>Earn</h1></div></div>
  {error&&<div className="earn-alert">{error}</div>}
  <section className="wallet-card"><div><small>Balance</small><strong>{money(balance)}</strong></div><div className="wallet-mini"><span>Pending</span><b>{money(pending)}</b></div></section>
  <section className="earn-panel"><div className="panel-head"><div><small>Earn</small><h2>Earn rewards</h2></div></div><p className="earn-note">Complete available offers and eligible rewards will be tracked to your account.</p><button className="primary" disabled={!cpalead?.isConfigured} onClick={openCpalead}>{cpalead?.isConfigured?'Earn now':'Offers unavailable'}</button>{offerwall&&<p className="earn-note">{offerwall}</p>}</section>
  <section className="earn-panel"><div className="panel-head"><div><small>Withdraw</small><h2>Withdraw</h2></div></div><div className="withdraw-grid"><input inputMode="numeric" value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)} placeholder="Amount in NGN"/><input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Paystack recipient code"/><button className="primary" disabled={busy} onClick={withdraw}>{busy?'Submitting…':'Withdraw'}</button></div>{notice&&<p className="earn-note">{notice}</p>}</section>
  <section className="earn-panel"><div className="panel-head"><div><small>History</small><h2>History</h2></div></div><div className="history-scroll">{wallet?.transactions?.length?wallet.transactions.map((t,i)=><div className="history-row" key={String(t.id??t.transaction_id??i)}><span><b>{label(t.type??t.transaction_type??t.status)}</b><small>{t.created_at?new Date(Number(t.created_at)*1000).toLocaleString():label(t.state??t.status)}</small></span><strong className={String(t.direction||'credit').toLowerCase()==='debit'?'debit':''}>{String(t.direction||'credit').toLowerCase()==='debit'?'-':'+'}{money(t.amount)}</strong></div>):<div className="empty compact"><h2>No activity yet</h2><p>Your completed rewards and withdrawals will appear here.</p></div>}</div></section>
 </section>;
}
