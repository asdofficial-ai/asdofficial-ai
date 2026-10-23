'use strict';
const {randomUUID,createHash,timingSafeEqual,randomBytes,createHmac}=require('node:crypto');
const roles=Object.freeze({SENTINEL:'Security and suspicious requests',ATLAS:'Uptime and backend health',CIPHER:'Payment anomalies (observation only)',VORTEX:'Application error triage',ECHO:'Customer-support metrics',NEXUS:'Incident coordination'});
const ddl=`CREATE TABLE IF NOT EXISTS forge_security_incidents(id UUID PRIMARY KEY,agent VARCHAR(20) NOT NULL,severity VARCHAR(12) NOT NULL,summary VARCHAR(280) NOT NULL,source VARCHAR(40) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ);CREATE INDEX IF NOT EXISTS forge_security_incidents_time_idx ON forge_security_incidents(created_at DESC);CREATE TABLE IF NOT EXISTS forge_security_audit(id UUID PRIMARY KEY,action VARCHAR(70) NOT NULL,incident_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
const sha=s=>createHash('sha256').update(s).digest();
const eq=(a,b)=>{const x=sha(a),y=sha(b);return timingSafeEqual(x,y)};
const sessions=new Map(),attempts=new Map();
function totp(secret,now=Date.now()){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const clean=String(secret||'').toUpperCase().replace(/\s|=/g,'');
 if(clean.length<16||/[^A-Z2-7]/.test(clean))return null;
 let bits=0,value=0,bytes=[];for(const c of clean){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>bits)&255)}}
 const step=Math.floor(now/30000);return [-1,0,1].map(offset=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step+offset));const h=createHmac('sha1',Buffer.from(bytes)).update(b).digest();const n=h[h.length-1]&15;return String((h.readUInt32BE(n)&0x7fffffff)%1000000).padStart(6,'0')});
}
const authReady=()=>String(process.env.FORGE_FOUNDER_SECRET||'').length>=24&&!!totp(process.env.FORGE_FOUNDER_TOTP_SECRET);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'https://asd-forge-v2.onrender.com','Vary':'Origin'});res.end(JSON.stringify(data))};
const getIp=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0];
function configure({pool}){
 let lastHealth=true,lastCheck=0;
 const incident=async(agent,severity,summary,source)=>{const recent=await pool.query("SELECT id FROM forge_security_incidents WHERE agent=$1 AND summary=$2 AND created_at>NOW()-INTERVAL '15 minutes' LIMIT 1",[agent,summary]);if(recent.rowCount)return;await pool.query('INSERT INTO forge_security_incidents(id,agent,severity,summary,source) VALUES($1,$2,$3,$4,$5)',[randomUUID(),agent,severity,summary,source])};
 async function observe(){
  const started=Date.now();
  try{await pool.query('SELECT 1');if(!lastHealth)await incident('ATLAS','low','Database connection recovered','database');lastHealth=true;lastCheck=Date.now();return {database:'ok',latencyMs:Date.now()-started,lastCheck}}
  catch(e){lastHealth=false;lastCheck=Date.now();throw e}
 }
 const tick=setInterval(async()=>{try{await observe()}catch(e){console.error('Command center health check failed',e.message)}},60000);tick.unref?.();
 async function handle(req,res,u,origin){
  if(origin&&origin!=='https://asd-forge-v2.onrender.com')return json(res,403,{error:'Origin not allowed'});
  if(req.method==='POST'&&u.pathname==='/v1/command/login'){
   const ip=getIp(req),now=Date.now();if(attempts.size>5000)for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);let row=attempts.get(ip)||{count:0,until:now+900000};if(row.until<now)row={count:0,until:now+900000};row.count++;attempts.set(ip,row);
   if(row.count>5){await incident('SENTINEL','medium','Founder login rate limit exceeded','authentication');return json(res,429,{error:'Too many attempts. Try again later.'})}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2000)return json(res,413,{error:'Too large'})}
   let body={};try{body=JSON.parse(raw)}catch{return json(res,400,{error:'Invalid JSON'})}
   const secret=process.env.FORGE_FOUNDER_SECRET;
   if(!authReady())return json(res,503,{error:'Founder authentication and MFA must be configured'});
   if(!eq(String(body.secret||''),secret)||!totp(process.env.FORGE_FOUNDER_TOTP_SECRET).some(code=>eq(String(body.code||''),code))){await incident('SENTINEL','low','Rejected founder login attempt','authentication');return json(res,401,{error:'Invalid credentials'})}
   attempts.delete(ip);
   const token=randomBytes(32).toString('hex');sessions.set(token,{expires:now+900000});
   await pool.query('INSERT INTO forge_security_audit(id,action) VALUES($1,$2)',[randomUUID(),'founder_login']);
   return json(res,200,{token,expiresInSeconds:900});
  }
  const token=String(req.headers.authorization||'').replace(/^Bearer /i,'');
  const session=sessions.get(token);if(!token||!session||session.expires<Date.now()){sessions.delete(token);return json(res,401,{error:'Founder authentication required'})}
  if(req.method==='GET'&&u.pathname==='/v1/command/status'){
   const health=await observe();
   const counts=await pool.query("SELECT (SELECT COUNT(*)::int FROM forge_security_incidents WHERE status='open') AS open_incidents,(SELECT COUNT(*)::int FROM public_services) AS services,(SELECT COUNT(*)::int FROM forge_orders) AS orders");
   return json(res,200,{mode:'protected monitoring',health,metrics:counts.rows[0],agents:Object.entries(roles).map(([name,duty])=>({name,duty,mode:'rules / read-only'})),automations:['health checks','incident deduplication','login throttling']});
  }
  if(req.method==='GET'&&u.pathname==='/v1/command/incidents'){
   const result=await pool.query('SELECT id,agent,severity,summary,source,status,created_at,resolved_at FROM forge_security_incidents ORDER BY created_at DESC LIMIT 100');return json(res,200,{incidents:result.rows});
  }
  if(req.method==='POST'&&u.pathname==='/v1/command/logout'){sessions.delete(token);return json(res,200,{ok:true})}
  if(req.method==='POST'&&u.pathname.match(/^\/v1\/command\/incidents\/[0-9a-f-]{36}\/resolve$/i)){
   const id=u.pathname.split('/')[4];const result=await pool.query("UPDATE forge_security_incidents SET status='resolved',resolved_at=NOW() WHERE id=$1 AND status='open' RETURNING id",[id]);if(!result.rowCount)return json(res,404,{error:'Open incident not found'});
   await pool.query('INSERT INTO forge_security_audit(id,action,incident_id) VALUES($1,$2,$3)',[randomUUID(),'founder_resolved_incident',id]);return json(res,200,{ok:true});
  }
  return json(res,404,{error:'Not found'});
 }
 return {ddl,handle,incident};
}
module.exports={configure};
