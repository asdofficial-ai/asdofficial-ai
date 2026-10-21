'use strict';
const http = require('node:http');
const {randomUUID, createHash, timingSafeEqual} = require('node:crypto');
const {Pool} = require('pg');
const PORT = Number(process.env.PORT) || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
if(!DATABASE_URL){ console.error('Missing DATABASE_URL'); process.exit(1); }
const pool = new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:5,connectionTimeoutMillis:10000});
const ORIGINS = new Set(['https://asd-forge-v2.onrender.com','https://asd-forge-v2.onrender.com/','https://asd-forge-launchpad.onrender.com','http://localhost:8080','http://127.0.0.1:8080']);
const rate = new Map();
function quota(ip){const now=Date.now();const value=rate.get(ip)||{start:now,count:0};if(now-value.start>3600000){value.start=now;value.count=0}value.count++;rate.set(ip,value);return value.count<=30;}
function hash(value){return createHash('sha256').update(value).digest('hex')}
function eq(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
const schema=`CREATE TABLE IF NOT EXISTS public_services (
 id UUID PRIMARY KEY, owner_key_hash VARCHAR(64) NOT NULL,
 title VARCHAR(100) NOT NULL, description VARCHAR(600) NOT NULL,
 category VARCHAR(40) NOT NULL, price_minor BIGINT NOT NULL CHECK (price_minor>0 AND price_minor<=999999999999),
 currency VARCHAR(3) NOT NULL DEFAULT 'NGN', delivery VARCHAR(50) NOT NULL DEFAULT '',
 seller VARCHAR(100) NOT NULL, phone VARCHAR(16) NOT NULL,
 is_public BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS public_services_updated ON public_services(updated_at DESC);
 CREATE INDEX IF NOT EXISTS public_services_category ON public_services(category);`;
function headers(origin){const ok=ORIGINS.has(origin)?origin:null;return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization',...(ok?{'Access-Control-Allow-Origin':ok,'Vary':'Origin'}:{})};}
function reply(res,code,body,origin){res.writeHead(code,headers(origin));res.end(JSON.stringify(body));}
async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>12000)throw Error('Payload too large');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function sanitize(raw){const data=raw||{};const title=String(data.title||'').trim(),description=String(data.description||'').trim(),category=String(data.category||'').trim(),seller=String(data.seller||'').trim(),delivery=String(data.delivery||'').trim();const phone=String(data.phone||'').replace(/\D/g,'');const price=Number(data.price);const currency=String(data.currency||'NGN').toUpperCase();if(title.length<3||title.length>100||description.length<15||description.length>600||category.length<2||category.length>40||seller.length<2||seller.length>100||delivery.length>50||phone.length<7||phone.length>15||!Number.isFinite(price)||price<=0||price>9999999999||!['NGN','USD','GBP','EUR','GHS','KES','ZAR'].includes(currency))throw Error('Invalid offer fields');return {title,description,category,seller,delivery,phone,currency,priceMinor:Math.round(price*100)};}
function publicOffer(r){return {id:r.id,title:r.title,description:r.description,category:r.category,seller:r.seller,delivery:r.delivery,phone:r.phone,currency:r.currency,price:Number(r.price_minor)/100,created:r.created_at,updated:r.updated_at};}
async function handler(req,res){const origin=req.headers.origin||'';if(req.method==='OPTIONS'){res.writeHead(204,headers(origin));res.end();return}
 const u=new URL(req.url,'http://localhost');if(req.method==='GET'&&u.pathname==='/health'){const result=await pool.query('SELECT 1');return reply(res,200,{ok:!!result.rowCount,service:'asd-forge-marketplace',payments:'disabled'},origin)}
 if(req.method==='GET'&&u.pathname==='/v1/payment/status')return reply(res,200,{enabled:false,message:'Gateway integration is not activated. No deposits, escrow, refunds or payouts available.',proposedAcceptedFeePercent:2,proposedRefundFeePercent:1},origin);
 if(u.pathname.startsWith('/v1/payments/') || u.pathname==='/v1/payments')return reply(res,503,{error:'Payments are disabled until a licensed provider and secure verified webhooks are configured.'},origin);
 if(req.method==='GET'&&u.pathname==='/v1/services'){
 const q=(u.searchParams.get('q')||'').trim().slice(0,90),category=(u.searchParams.get('category')||'').trim().slice(0,40),sort=u.searchParams.get('sort')||'recent';const params=[];let where='is_public = TRUE';if(q){params.push(`%${q}%`);where+=` AND (title ILIKE $${params.length} OR description ILIKE $${params.length} OR category ILIKE $${params.length} OR seller ILIKE $${params.length})`;}if(category&&category!=='All'){params.push(category);where+=` AND category = $${params.length}`}
 const order=sort==='price_asc'?'price_minor ASC,updated_at DESC':sort==='price_desc'?'price_minor DESC,updated_at DESC':'updated_at DESC';
 const result=await pool.query(`SELECT id,title,description,category,price_minor,currency,delivery,seller,phone,created_at,updated_at FROM public_services WHERE ${where} ORDER BY ${order} LIMIT 100`,params);
 return reply(res,200,{services:result.rows.map(publicOffer),count:result.rows.length},origin)}
 const match=u.pathname.match(/^\/v1\/services\/([0-9a-f-]{36})$/i);
 if(req.method==='GET'&&match){const r=await pool.query('SELECT * FROM public_services WHERE id=$1 AND is_public=TRUE',[match[1]]);return r.rowCount?reply(res,200,{service:publicOffer(r.rows[0])},origin):reply(res,404,{error:'Not found'},origin)}
 if(req.method==='POST'&&u.pathname==='/v1/services'){
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0];if(!quota(ip))return reply(res,429,{error:'Rate limit reached. Try again later.'},origin);
 const key=String(req.headers.authorization||'').replace(/^Bearer /i,'');if(!/^[0-9a-f-]{36}$/.test(key))return reply(res,401,{error:'Seller publishing key required.'},origin);
 const b=await body(req);if(b.consent!==true)return reply(res,400,{error:'Confirm you agree to publish your offer and contact information.'},origin);
 const p=sanitize(b);const uuid=randomUUID();const result=await pool.query('INSERT INTO public_services(id,owner_key_hash,title,description,category,price_minor,currency,delivery,seller,phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[uuid,hash(key),p.title,p.description,p.category,p.priceMinor,p.currency,p.delivery,p.seller,p.phone]);return reply(res,201,{service:publicOffer(result.rows[0])},origin)}
 if(match&&['PATCH','DELETE'].includes(req.method)){
 const key=String(req.headers.authorization||'').replace(/^Bearer /i,'');const r=await pool.query('SELECT owner_key_hash FROM public_services WHERE id=$1',[match[1]]);if(!r.rowCount)return reply(res,404,{error:'Not found'},origin);
 if(!/^[0-9a-f-]{36}$/.test(key)||!eq(hash(key),r.rows[0].owner_key_hash))return reply(res,403,{error:'Not authorized to modify listing'},origin);
 if(req.method==='DELETE'){await pool.query('DELETE FROM public_services WHERE id=$1',[match[1]]);return reply(res,200,{deleted:true},origin)}
 const b=await body(req),p=sanitize(b);const out=await pool.query('UPDATE public_services SET title=$1,description=$2,category=$3,price_minor=$4,currency=$5,delivery=$6,seller=$7,phone=$8,updated_at=now() WHERE id=$9 RETURNING *',[p.title,p.description,p.category,p.priceMinor,p.currency,p.delivery,p.seller,p.phone,match[1]]);return reply(res,200,{service:publicOffer(out.rows[0])},origin);
 }
 return reply(res,404,{error:'Unknown route'},origin);
}
const server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(e=>{console.error('API error',e.message);const code=e.message==='Payload too large'?413:e.message==='Invalid offer fields'?400:500;reply(res,code,{error:code===500?'Internal server error':e.message},req.headers.origin||'')}));
if(require.main===module){pool.query(schema).then(()=>server.listen(PORT,'0.0.0.0',()=>console.log('Catalog API listening',PORT))).catch(e=>{console.error('Database unavailable',e.message);process.exit(1)});}
module.exports={handler,sanitize,publicOffer,hash,eq,server,pool};