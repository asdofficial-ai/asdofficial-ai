'use strict';
// ASD Forge V5 - controlled payment workflow. TEST-ONLY connector.
// A normal PSP payment is NOT escrow. No merchant/seller transfers implemented.
const { randomUUID, createHash, createHmac, timingSafeEqual } = require('node:crypto');
const PAYSTACK_URL='https://api.paystack.co';
const MAX_JSON=12000;
const orderLimits=new Map();
function limitOrder(req){const now=Date.now(),ip=String(req.socket?.remoteAddress||'unknown');let key=ip+':orders',row=orderLimits.get(key);if(!row||row.until<now)row={until:now+3600000,count:0};row.count++;orderLimits.set(key,row);if(orderLimits.size>10000)for(const [k,v] of orderLimits)if(v.until<now)orderLimits.delete(k);return row.count<=20;}
const fee2 = n => Math.round(n*2/100);  // kobo (integer inputs)
const fee1 = n => Math.round(n/100);
const calculate = amount => ({grossMinor:amount, currency:'NGN', platformFeeMinor:fee2(amount), sellerProposedMinor:amount-fee2(amount), refundFeeMinor:fee1(amount), eligibleRefundMinor:amount-fee1(amount), note:'Amounts exclude third-party gateway charges; not a funds-holding guarantee.'});
const digest = value=>createHash('sha256').update(String(value)).digest('hex');
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)}
function er(msg,status=400){let e=Error(msg);e.status=status;return e}
async function body(req,limit=MAX_JSON){let parts=[],size=0;for await(const part of req){size+=part.length;if(size>limit)throw er('Request too large',413);parts.push(part)}let raw=Buffer.concat(parts);let data;try{data=JSON.parse(raw.toString('utf8')||'{}')}catch{throw er('Invalid JSON')}return {raw,data};}
function validEmail(email){return typeof email==='string'&&email.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function checkBuyer(req,row){let token=String(req.headers.authorization||'').replace(/^Bearer /i,'');if(!/^[0-9a-f-]{36}$/i.test(token)||!equal(digest(token),row.buyer_token_hash))throw er('Buyer authorization required',403)}
function checkSeller(req,row){let token=String(req.headers.authorization||'').replace(/^Bearer /i,'');if(!/^[0-9a-f-]{36}$/i.test(token)||!equal(digest(token),row.owner_hash))throw er('Seller authorization required',403)}
function checkAdmin(req){let key=process.env.FORGE_ADMIN_API_KEY||'';let token=String(req.headers['x-admin-key']||'');if(key.length<32||!equal(token,key))throw er('Admin review unavailable',403)}
function testConfigured(){return process.env.PAYMENT_MODE==='test'&&/^sk_test_/.test(process.env.PAYSTACK_SECRET_KEY||'')&&process.env.PAYSTACK_SECRET_KEY.length>15}
async function paystack(method,path,data){if(!testConfigured())throw er('Paystack TEST key not configured',503);
 let controller=new AbortController();let timer=setTimeout(()=>controller.abort(),9500);
 try{const response=await fetch(PAYSTACK_URL+path,{method,headers:{'Authorization':'Bearer '+process.env.PAYSTACK_SECRET_KEY,'Content-Type':'application/json','Accept':'application/json'},body:data?JSON.stringify(data):undefined,signal:controller.signal});let result=await response.json();if(!response.ok||result.status!==true)throw er('Provider operation failed; review provider dashboard before retrying',502);return result.data;}catch(e){if(e.status)throw e;throw er('Provider temporarily unreachable; verify status before retrying',503)}finally{clearTimeout(timer)}
}
const ddl=`
CREATE TABLE IF NOT EXISTS forge_orders (
 id UUID PRIMARY KEY,
 service_id UUID NOT NULL REFERENCES public_services(id) ON DELETE RESTRICT,
 owner_hash CHAR(64) NOT NULL,
 buyer_email VARCHAR(200) NOT NULL,
 buyer_name VARCHAR(100) NOT NULL,
 buyer_token_hash CHAR(64) NOT NULL,
 request_key_hash CHAR(64) NOT NULL,
 amount_minor BIGINT NOT NULL CHECK (amount_minor>0),
 currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 payment_reference VARCHAR(80) UNIQUE NOT NULL,
 provider_tx_id VARCHAR(40),
 checkout_url TEXT,
 status VARCHAR(40) NOT NULL DEFAULT 'awaiting_payment',
 delivery_note TEXT,
 rejection_reason TEXT,
 resolution_note TEXT,
 refund_minor BIGINT,
 refund_provider_id VARCHAR(40),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (buyer_email, service_id, request_key_hash)
);
CREATE INDEX IF NOT EXISTS forge_orders_service_idx ON forge_orders(service_id,created_at DESC);
CREATE INDEX IF NOT EXISTS forge_orders_status_idx ON forge_orders(status);
CREATE TABLE IF NOT EXISTS forge_order_events(
 id UUID PRIMARY KEY, order_id UUID NOT NULL REFERENCES forge_orders(id), event VARCHAR(64) NOT NULL,
 detail JSONB DEFAULT '{}'::jsonb, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
function view(row){return {id:row.id,serviceId:row.service_id,amountMinor:Number(row.amount_minor),currency:row.currency,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,terms:calculate(Number(row.amount_minor)),checkoutUrl:row.checkout_url||null,deliveryNote:row.delivery_note||null,rejectionReason:row.rejection_reason||null,resolutionNote:row.resolution_note||null,refundMinor:row.refund_minor===null?null:Number(row.refund_minor)};}
function configure({pool,send}){
 async function event(orderId,event,detail={}){await pool.query('INSERT INTO forge_order_events (id,order_id,event,detail) VALUES ($1,$2,$3,$4::jsonb)',[randomUUID(),orderId,event,JSON.stringify(detail)]);}
 async function getOrder(id){const r=await pool.query('SELECT * FROM forge_orders WHERE id=$1',[id]);if(!r.rowCount)throw er('Order not found',404);return r.rows[0]}
 async function reply(req,res,status,payload){return send(res,status,payload,req.headers.origin||'')}
 async function handle(req,res,url){let p=url.pathname,m=req.method;
  if(m==='GET'&&p==='/v1/payment/status')return reply(req,res,200,{provider:'paystack',mode:'test-only',testCheckoutEnabled:testConfigured(),livePaymentsEnabled:false,escrow:false,settlementControlApproved:false,automaticRefundsEnabled:false,payoutsEnabled:false,feeOnCompletedOrders:2,feeOnEligibleRefunds:1});
  if(m==='GET'&&p==='/v1/payments/health')return reply(req,res,200,{ok:true,provider:'paystack',mode:'test-only',testCheckoutEnabled:testConfigured(),escrow:false});
  if(m==='POST'&&p==='/v1/payments/webhook/paystack'){
    if(!testConfigured())throw er('Webhook inactive until TEST key provided',503);
    const {raw,data}=await body(req,64000);const signature=String(req.headers['x-paystack-signature']||'');
    const mac=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
    if(!equal(mac,signature))throw er('Invalid webhook signature',401);
    if(data.event==='charge.success'&&typeof data.data?.reference==='string'){
      const r=await pool.query('SELECT * FROM forge_orders WHERE payment_reference=$1',[data.data.reference]);
      if(!r.rowCount)return reply(req,res,200,{received:true});
      const order=r.rows[0];const tx=await paystack('GET','/transaction/verify/'+encodeURIComponent(order.payment_reference));
      if(tx.status==='success'&&tx.reference===order.payment_reference&&tx.currency==='NGN'&&Number(tx.amount)===Number(order.amount_minor)&&tx.domain==='test'&&String(tx.customer?.email||'').toLowerCase()===order.buyer_email.toLowerCase()){
        const result=await pool.query("UPDATE forge_orders SET status='funded_test',provider_tx_id=$1,updated_at=NOW() WHERE id=$2 AND status IN ('awaiting_payment','checkout_pending') RETURNING id",[String(tx.id),order.id]);
        if(result.rowCount)await event(order.id,'test_payment_verified',{provider:'paystack',reference:order.payment_reference});
      }
    }
    return reply(req,res,200,{received:true});
  }
  if(m==='GET'&&p==='/v1/seller/orders'){
    const id=url.searchParams.get('serviceId')||'';
    if(!/^[0-9a-f-]{36}$/i.test(id))throw er('Valid service ID required');
    const service=(await pool.query('SELECT owner_hash FROM public_services WHERE id=$1',[id])).rows[0];
    if(!service)throw er('Service not found',404);
    checkSeller(req,service);
    const result=await pool.query('SELECT * FROM forge_orders WHERE service_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
    return reply(req,res,200,{orders:result.rows.map(row=>({...view(row),buyerName:row.buyer_name,buyerEmail:row.buyer_email}))});
  }
  if(m==='POST'&&p==='/v1/orders'){
   if(!limitOrder(req))throw er('Order creation rate limit reached',429);
   const {data}=await body(req);const email=String(data.buyerEmail||'').trim().toLowerCase();const buyerName=String(data.buyerName||'').trim();const k=String(data.idempotencyKey||'');const sid=String(data.serviceId||'');
   if(!validEmail(email)||buyerName.length<2||buyerName.length>100||!/^[0-9a-f-]{36}$/i.test(sid)||k.length<16||k.length>100)throw er('Valid customer, service ID, and idempotency key required');
   const service=(await pool.query('SELECT * FROM public_services WHERE id=$1',[sid])).rows[0];if(!service)throw er('Service not found',404);
   if(service.currency!=='NGN'||!Number.isSafeInteger(Number(service.price_minor))||Number(service.price_minor)<100)throw er('Only NGN services of at least ₦1 are supported');
   // Client does not supply price. Offer price frozen in the database at order creation.
   const keyHash=digest(k),previous=await pool.query('SELECT id FROM forge_orders WHERE buyer_email=$1 AND service_id=$2 AND request_key_hash=$3',[email,sid,keyHash]);
   if(previous.rowCount)return reply(req,res,409,{error:'Order already created for this idempotency key; use the original order link (buyer token cannot be reissued)'});
   const buyerToken=randomUUID(),id=randomUUID(),ref='asd_'+randomUUID().replace(/-/g,'');
   const result=await pool.query(`INSERT INTO forge_orders (id,service_id,owner_hash,buyer_email,buyer_name,buyer_token_hash,request_key_hash,amount_minor,currency,payment_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NGN',$9) ON CONFLICT (buyer_email,service_id,request_key_hash) DO NOTHING RETURNING *`,[id,sid,service.owner_hash,email,buyerName,digest(buyerToken),keyHash,service.price_minor,ref]);
   if(!result.rowCount)return reply(req,res,409,{error:'Duplicate request'});await event(id,'order_created',{currency:'NGN'});
   return reply(req,res,201,{order:view(result.rows[0]),buyerToken,warning:'Keep this token private. No checkout or funds are live.'});
  }
  const matched=p.match(/^\/v1\/orders\/([0-9a-f-]{36})(?:\/(checkout|verify|deliver|decision|resolve|refund|refund-check))?$/i);if(!matched)return false;
  const id=matched[1],action=matched[2]||'',order=await getOrder(id);
  if(m==='GET'&&!action){const bearer=String(req.headers.authorization||'').replace(/^Bearer /i,'');if(!equal(digest(bearer),order.buyer_token_hash)&&!equal(digest(bearer),order.owner_hash))throw er('Not authorized',403);return reply(req,res,200,{order:view(order)});}
  if(m!=='POST')throw er('Method not allowed',405);
  if(action==='checkout'){
    checkBuyer(req,order);
    if(!testConfigured())throw er('Checkout is not enabled. No live funds are accepted.',503);
    if(order.status==='checkout_pending'&&order.checkout_url)return reply(req,res,200,{url:order.checkout_url,order:view(order),testOnly:true});
    if(order.status!=='awaiting_payment')throw er('Checkout unavailable in current state',409);
    // Claim first. A provider timeout leaves checkout_pending for manual reconciliation, no duplicate charge.
    const c=await pool.query("UPDATE forge_orders SET status='checkout_pending',updated_at=NOW() WHERE id=$1 AND status='awaiting_payment' RETURNING id",[id]);if(!c.rowCount)throw er('Checkout already started',409);
    let checkout=await paystack('POST','/transaction/initialize',{email:order.buyer_email,amount:String(order.amount_minor),currency:'NGN',reference:order.payment_reference,channels:['card','bank_transfer'],metadata:JSON.stringify({asd_forge_order_id:id,environment:'test'})});
    if(typeof checkout.authorization_url!=='string'||!checkout.authorization_url.startsWith('https://checkout.paystack.com/'))throw er('Unexpected checkout response',502);
    await pool.query("UPDATE forge_orders SET checkout_url=$1,updated_at=NOW() WHERE id=$2 AND status='checkout_pending'",[checkout.authorization_url,id]);
    await event(id,'test_checkout_created');return reply(req,res,200,{url:checkout.authorization_url,order:view({...order,status:'checkout_pending',checkout_url:checkout.authorization_url}),testOnly:true});
  }
  if(action==='verify'){
    checkBuyer(req,order);if(!testConfigured())throw er('Test payment verification unavailable',503);
    const tx=await paystack('GET','/transaction/verify/'+encodeURIComponent(order.payment_reference));
    if(tx.status==='success'&&tx.reference===order.payment_reference&&tx.currency==='NGN'&&Number(tx.amount)===Number(order.amount_minor)&&tx.domain==='test'&&String(tx.customer?.email||'').toLowerCase()===order.buyer_email.toLowerCase()){
      const updated=await pool.query("UPDATE forge_orders SET status='funded_test',provider_tx_id=$1,updated_at=NOW() WHERE id=$2 AND status IN ('awaiting_payment','checkout_pending') RETURNING id",[String(tx.id),id]);if(updated.rowCount)await event(id,'test_payment_verified',{provider:'paystack'});
    }
    return reply(req,res,200,{order:view(await getOrder(id))});
  }
  if(action==='deliver'){
    checkSeller(req,order);let {data}=await body(req);const note=String(data.deliveryNote||'').trim();if(note.length<10||note.length>1500)throw er('Delivery details must be 10-1500 characters');
    const updated=await pool.query("UPDATE forge_orders SET status='delivered_test',delivery_note=$1,updated_at=NOW() WHERE id=$2 AND status='funded_test' RETURNING *",[note,id]);
    if(!updated.rowCount)throw er('Service can only be delivered after a verified TEST payment',409);await event(id,'seller_delivered');return reply(req,res,200,{order:view(updated.rows[0])});
  }
  if(action==='decision'){
    checkBuyer(req,order);const {data}=await body(req);const decision=String(data.decision||'');const reason=String(data.reason||'').trim();if(!['accept','reject'].includes(decision)||(decision==='reject'&&(reason.length<10||reason.length>1000)))throw er('Choose accept or provide a detailed rejection reason');
    const next=decision==='accept'?'approved_test':'disputed_test';const r=await pool.query('UPDATE forge_orders SET status=$1,rejection_reason=$2,updated_at=NOW() WHERE id=$3 AND status=$4 RETURNING *',[next,decision==='reject'?reason:null,id,'delivered_test']);if(!r.rowCount)throw er('Already decided or not delivered',409);await event(id,'buyer_'+decision,{reason:decision==='reject'?reason:undefined});return reply(req,res,200,{order:view(r.rows[0]),warning:'No actual payout or refund has occurred.'});
  }
  if(action==='resolve'){
    checkAdmin(req);const {data}=await body(req);const decision=String(data.decision||''),note=String(data.note||'').trim();if(!['approve_refund','deny_refund'].includes(decision)||note.length<10||note.length>500)throw er('Valid dispute resolution and rationale required');const next=decision==='approve_refund'?'refund_authorized_test':'approved_test';const r=await pool.query("UPDATE forge_orders SET status=$1,resolution_note=$2,refund_minor=$3,updated_at=NOW() WHERE id=$4 AND status='disputed_test' RETURNING *",[next,note,decision==='approve_refund'?Number(order.amount_minor)-fee1(Number(order.amount_minor)):null,id]);if(!r.rowCount)throw er('No open dispute to resolve',409);await event(id,'admin_'+decision,{note});return reply(req,res,200,{order:view(r.rows[0])});
  }
  if(action==='refund'){
    checkAdmin(req);if(!testConfigured())throw er('TEST refunds unavailable until Paystack configured',503);
    const allowed=await pool.query("UPDATE forge_orders SET status='refund_processing_test',updated_at=NOW() WHERE id=$1 AND status='refund_authorized_test' RETURNING *",[id]);if(!allowed.rowCount)throw er('Refund not authorized or already submitted',409);
    // One submission only. On timeout, reconcile with provider before any further action.
    const refund=await paystack('POST','/refund',{transaction:order.payment_reference,amount:Number(order.refund_minor),currency:'NGN',merchant_note:'ASD Forge adjudicated service dispute, TEST ONLY'});
    await pool.query('UPDATE forge_orders SET refund_provider_id=$1,updated_at=NOW() WHERE id=$2',[String(refund.id||''),id]);await event(id,'test_refund_submitted',{refundId:String(refund.id||'')});return reply(req,res,202,{order:view(await getOrder(id)),providerStatus:refund.status,warning:'Submitted does not mean settled.'});
  }
  if(action==='refund-check'){
    checkAdmin(req);if(!testConfigured()||!order.refund_provider_id)throw er('No TEST refund to query',409);
    const result=await paystack('GET','/refund/'+encodeURIComponent(order.refund_provider_id));if(result.status==='processed'){
      const updated=await pool.query("UPDATE forge_orders SET status='refunded_test',updated_at=NOW() WHERE id=$1 AND status='refund_processing_test' RETURNING id",[id]);if(updated.rowCount)await event(id,'test_refund_confirmed');
    }
    return reply(req,res,200,{order:view(await getOrder(id)),providerStatus:result.status});
  }
  throw er('Unknown order action',404);
 }
 return {handle,ddl,calculate,testConfigured};
}
module.exports={configure,calculate,ddl,testConfigured};