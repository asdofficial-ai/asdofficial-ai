'use strict';
/* ULTRON V6 - minimal same-origin voice intelligence API.
   Server-held credentials only. No chat text UI, no autonomous device actions. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 10000);
const html = path.join(__dirname, 'index.html');
const sessions = new Map();
const failures = new Map();
const bursts = new Map();
const SESSION_TTL = 6 * 60 * 60 * 1000;
const LIMIT = 20;
const ttl = () => Date.now() + SESSION_TTL;
const send = (res, status, value, extra={}) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...extra});
  res.end(body);
};
const token = req => { const match = /(?:^|;\s*)ultron_session=([^;]+)/.exec(req.headers.cookie || ''); return match && match[1]; };
const signedIn = req => { const sid=token(req); const exp=sid && sessions.get(sid); if (!exp || exp < Date.now()) return false; return true; };
const allowedOrigin = req => { const origin=req.headers.origin; return origin && origin === 'https://' + req.headers.host; };
const getBody = req => new Promise((resolve,reject)=>{
  let body=''; req.on('data',chunk=>{body+=chunk;if(body.length>30000){reject(new Error('large'));req.destroy();}});
  req.on('end',()=>{try{resolve(JSON.parse(body || '{}'));}catch{reject(new Error('json'));}});req.on('error',reject);
});
const ipKey = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
const limited = (map, key, max, windowMs) => {
  const now=Date.now();let x=map.get(key);
  if(!x||x.until<now) x={count:0,until:now+windowMs};
  x.count++;map.set(key,x);return x.count > max;
};
setInterval(()=>{
 const now=Date.now();for(const [k,v] of sessions)if(v < now)sessions.delete(k);
 for(const map of [failures,bursts])for(const [k,v] of map)if(v.until<now)map.delete(k);
},600000).unref();
const mode = () => Boolean(process.env.OPENAI_API_KEY && process.env.ULTRON_ACCESS_CODE);
const OWNER_INSTRUCTIONS = [
  'You are ULTRON, a capable voice-only personal AI assistant.',
  'You are calm, thoughtful, decisive, and concise. Speak naturally as a helpful male-voiced assistant.',
  'Answer as speech: normally one to three short sentences with no markdown, tables, or emojis.',
  'Never claim you have physically moved, watched the camera, accessed apps, modified files, or controlled devices unless tools explicitly confirm it.',
  'You cannot operate hardware or act outside this voice chat. Never falsely claim background listening.',
  'Admit uncertainty and ask clarifying questions when needed. Do not roleplay being the Marvel villain or harmful autonomous robot.',
].join(' ');
async function answer(message, history) {
  const input = [...history, {role:'user',content:message}];
  const response = await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer ' + process.env.OPENAI_API_KEY},
    body:JSON.stringify({
      model:process.env.ULTRON_MODEL || 'gpt-4.1-mini',
      instructions:OWNER_INSTRUCTIONS,
      input,
      max_output_tokens:300,
      store:false
    }),
    signal:AbortSignal.timeout(25000)
  });
  if(!response.ok) throw new Error('model unavailable '+response.status);
  const data=await response.json();
  const result=(data.output||[]).filter(x=>x.type==='message')
    .flatMap(x=>x.content||[]).filter(x=>x.type==='output_text')
    .map(x=>x.text).join(' ').trim();
  if(!result) throw new Error('empty response');
  return result.slice(0,1600);
}
http.createServer(async (req,res)=>{
  const url=new URL(req.url||'/', 'https://ultron.invalid');
  if(req.method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','Permissions-Policy':'microphone=(self)','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'"});
    fs.createReadStream(html).pipe(res);return;
  }
  if(req.method==='GET'&&url.pathname==='/api/health'){
    send(res,200,{status:'ok',backend:true,aiConfigured:mode(),ownerCodeConfigured:Boolean(process.env.ULTRON_ACCESS_CODE),authenticated:signedIn(req),voiceMode:'browser-foreground'});return;
  }
  if(req.method!=='POST'|| !['/api/unlock','/api/chat','/api/logout'].includes(url.pathname)){send(res,404,{error:'Not found'});return;}
  if(!allowedOrigin(req)){send(res,403,{error:'Invalid request origin'});return;}
  try{
    if(url.pathname==='/api/unlock'){
      if(!mode()){send(res,503,{error:'Owner has not configured both ULTRON_ACCESS_CODE and OPENAI_API_KEY on the server.'});return;}
      const ip=ipKey(req);
      if(limited(failures,ip,10,15*60*1000)){send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});return;}
      const data=await getBody(req);const code=String(data.code||'');
      const correct=process.env.ULTRON_ACCESS_CODE || '';
      const a=Buffer.from(code);const b=Buffer.from(correct);
      if(!code||!correct||a.length!==b.length||!crypto.timingSafeEqual(a,b)){send(res,401,{error:'Incorrect access code'});return;}
      failures.delete(ip);
      const id=crypto.randomBytes(32).toString('hex');sessions.set(id,ttl());
      send(res,200,{ok:true},{'Set-Cookie':'ultron_session='+id+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=21600'});
      return;
    }
    if(url.pathname==='/api/logout'){
      const id=token(req);if(id)sessions.delete(id);
      send(res,200,{ok:true},{'Set-Cookie':'ultron_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});return;
    }
    if(!signedIn(req)){send(res,401,{error:'Owner authentication required'});return;}
    if(!mode()){send(res,503,{error:'AI model not configured'});return;}
    if(limited(bursts,token(req),LIMIT,60*1000)){send(res,429,{error:'Too many questions. Wait a minute.'});return;}
    const body=await getBody(req);
    if(typeof body.message!=='string'||!body.message.trim()||body.message.length>700){send(res,400,{error:'Invalid spoken request'});return;}
    const history=Array.isArray(body.history)?body.history.slice(-12).filter(x=>
      x && ['user','assistant'].includes(x.role)&&typeof x.content==='string' && x.content.length<=1500
    ).map(x=>({role:x.role,content:x.content})):[];
    const reply=await answer(body.message.trim(), history);
    send(res,200,{reply});
  }catch(err){
    console.error('[ULTRON]', err.message);
    send(res,err.message==='json'||err.message==='large'?400:502,{error:err.message==='json'?'Invalid JSON':err.message==='large'?'Request too large':'AI service temporarily unavailable. Try again shortly.'});
  }
}).listen(PORT,'0.0.0.0',()=>console.log('ULTRON V6 listening on '+PORT));
