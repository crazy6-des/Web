export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  FRONTEND_ORIGIN?: string;
}

type Row = Record<string, unknown>;
type User = { id: string; username: string; email: string; avatar_url?: string | null; bio?: string | null; status?: string | null };

const TABLES = new Set(['users','user_sessions','password_reset_tokens','security_events','user_settings','notification_preferences','follows','blocks','mutes','posts','post_media','post_likes','saved_posts','comments','comment_likes','mentions','notifications','reward_offers','offerwall_events','reward_transactions','wallets','wallet_transactions','payment_providers','payment_transactions','withdrawals','withdrawal_attempts','admin_users','reports','moderation_actions','conversations','conversation_participants','messages']);
const encoder = new TextEncoder();

function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
}
function now() { return Math.floor(Date.now() / 1000); }
function id() { return crypto.randomUUID(); }
function randomToken(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2,'0')).join(''); }
function b64url(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
async function sha256(value: string) { return b64url(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function pbkdf2(password: string, salt: string, iterations = 210000) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt: encoder.encode(salt), iterations, hash:'SHA-256' }, key, 256);
  return `${iterations}$${salt}$${b64url(bits)}`;
}
async function verifyPassword(password: string, stored: string) {
  const p = stored.split('$');
  if (p.length !== 3) return false;
  const derived = await pbkdf2(password, p[1], Number(p[0]));
  return derived === stored;
}
function cookie(name: string, value: string, maxAge: number) { return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function clearCookie(name: string) { return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }
function ident(s: string) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error('unsafe identifier'); return `"${s}"`; }
function text(v: unknown) { return typeof v === 'string' ? v : v == null ? '' : String(v); }
function firstColumn(cols: Set<string>, names: string[]) { return names.find(n => cols.has(n)); }

async function schema(db: D1Database, table: string) {
  if (!TABLES.has(table)) throw new Error('unknown table');
  const r = await db.prepare(`PRAGMA table_info(${ident(table)})`).all<Row>();
  return new Set((r.results ?? []).map(x => text(x.name)));
}
async function insertDynamic(db: D1Database, table: string, values: Record<string, unknown>) {
  const cols = await schema(db, table);
  const entries = Object.entries(values).filter(([k,v]) => cols.has(k) && v !== undefined);
  if (!entries.length) throw new Error(`No compatible columns for ${table}`);
  const q = `INSERT INTO ${ident(table)} (${entries.map(([k])=>ident(k)).join(',')}) VALUES (${entries.map(()=>'?').join(',')})`;
  return db.prepare(q).bind(...entries.map(([,v])=>v)).run();
}
async function updateDynamic(db: D1Database, table: string, where: string, binds: unknown[], values: Record<string, unknown>) {
  const cols = await schema(db, table);
  const entries = Object.entries(values).filter(([k,v]) => cols.has(k) && v !== undefined);
  if (!entries.length) throw new Error(`No compatible columns for ${table}`);
  const q = `UPDATE ${ident(table)} SET ${entries.map(([k])=>`${ident(k)}=?`).join(',')} WHERE ${where}`;
  return db.prepare(q).bind(...entries.map(([,v])=>v), ...binds).run();
}
async function getUser(db: D1Database, userId: string): Promise<User | null> {
  const cols = await schema(db,'users');
  const idc = firstColumn(cols,['id','user_id']); if (!idc) throw new Error('users.id missing');
  const username = firstColumn(cols,['username','handle','name']);
  const email = firstColumn(cols,['email','email_address']);
  const select = [`${ident(idc)} AS id`, username ? `${ident(username)} AS username` : `'' AS username`, email ? `${ident(email)} AS email` : `'' AS email`];
  for (const [alias,names] of Object.entries({avatar_url:['avatar_url','avatar','profile_image_url'],bio:['bio','about'],status:['status','account_status']})) { const c=firstColumn(cols,names); if(c) select.push(`${ident(c)} AS ${ident(alias)}`); }
  return (await db.prepare(`SELECT ${select.join(',')} FROM ${ident('users')} WHERE ${ident(idc)}=? LIMIT 1`).bind(userId).first<User>()) ?? null;
}
async function findUser(db: D1Database, value: string): Promise<Row | null> {
  const cols = await schema(db,'users');
  const idc=firstColumn(cols,['id','user_id']), email=firstColumn(cols,['email','email_address']), username=firstColumn(cols,['username','handle']);
  const select = ['*'];
  if (email && username) return db.prepare(`SELECT ${select.join(',')} FROM users WHERE lower(${ident(email)})=lower(?) OR lower(${ident(username)})=lower(?) LIMIT 1`).bind(value,value).first<Row>();
  if (email) return db.prepare(`SELECT * FROM users WHERE lower(${ident(email)})=lower(?) LIMIT 1`).bind(value).first<Row>();
  if (username) return db.prepare(`SELECT * FROM users WHERE lower(${ident(username)})=lower(?) LIMIT 1`).bind(value).first<Row>();
  if (idc) return db.prepare(`SELECT * FROM users WHERE ${ident(idc)}=? LIMIT 1`).bind(value).first<Row>();
  return null;
}
function userPassword(row: Row) { return text(row.password_hash ?? row.password_digest ?? row.password ?? ''); }
function rowId(row: Row) { return text(row.id ?? row.user_id); }
function parseCookie(request: Request, name: string) { const raw=request.headers.get('cookie')||''; return raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1) || null; }

async function createSession(db: D1Database, userId: string) {
  const token=randomToken(32), hash=await sha256(token), sid=id(), expires=now()+60*60*24*30;
  await insertDynamic(db,'user_sessions',{id:sid,user_id:userId,token_hash:hash,session_token_hash:hash,expires_at:expires,created_at:now(),revoked_at:null,refresh_token_hash:hash});
  return { token, sid, expires };
}
async function auth(db: D1Database, request: Request) {
  const token=parseCookie(request,'sphere_session'); if(!token) return null;
  const hash=await sha256(token); const cols=await schema(db,'user_sessions');
  const userCol=firstColumn(cols,['user_id']); const tokenCol=firstColumn(cols,['token_hash','session_token_hash','token']); const exp=firstColumn(cols,['expires_at','expires']); const revoked=firstColumn(cols,['revoked_at','revoked','invalidated_at']);
  if(!userCol || !tokenCol) return null;
  const conditions=[`${ident(tokenCol)}=?`]; const binds=[hash];
  if(exp) { conditions.push(`(${ident(exp)} IS NULL OR ${ident(exp)}>?)`); binds.push(now()); }
  if(revoked) conditions.push(`(${ident(revoked)} IS NULL OR ${ident(revoked)}=0)`);
  const s=await db.prepare(`SELECT ${ident(userCol)} AS user_id FROM user_sessions WHERE ${conditions.join(' AND ')} LIMIT 1`).bind(...binds).first<{user_id:string}>();
  if(!s) return null;
  const user=await getUser(db,text(s.user_id)); if(!user) return null;
  if(user.status && ['banned','disabled','suspended'].includes(user.status.toLowerCase())) return null;
  return { user, token, hash };
}
function requireAuth(a: Awaited<ReturnType<typeof auth>>): asserts a { if(!a) throw Object.assign(new Error('Authentication required'),{status:401}); }

async function notify(db:D1Database, userId:string, type:string, actorId:string, entityId?:string, message?:string) {
  try { await insertDynamic(db,'notifications',{id:id(),user_id:userId,recipient_id:userId,actor_id:actorId,type,entity_id:entityId,reference_id:entityId,message,created_at:now(),read_at:null,is_read:0}); } catch {}
}
async function relation(db:D1Database, table:string, a:string,b:string, on:boolean) {
  const cols=await schema(db,table); const ac=firstColumn(cols,['follower_id','from_user_id','user_id','actor_id']); const bc=firstColumn(cols,['following_id','to_user_id','target_user_id','post_id']);
  if(!ac||!bc) throw new Error(`Cannot map ${table}`);
  if(on) await insertDynamic(db,table,{id:id(),follower_id:a,from_user_id:a,user_id:a,actor_id:a,following_id:b,to_user_id:b,target_user_id:b,post_id:b,created_at:now()});
  else await db.prepare(`DELETE FROM ${ident(table)} WHERE ${ident(ac)}=? AND ${ident(bc)}=?`).bind(a,b).run();
}

async function sendBrevo(env:Env,email:string,token:string) {
  if(!env.BREVO_API_KEY || !env.BREVO_FROM_EMAIL) return false;
  const origin=env.FRONTEND_ORIGIN || 'https://sphere-social.netlify.app';
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'content-type':'application/json','api-key':env.BREVO_API_KEY},body:JSON.stringify({sender:{email:env.BREVO_FROM_EMAIL},to:[{email}],subject:'Reset your Sphere password',htmlContent:`<p>Use this link to reset your Sphere password:</p><p><a href="${origin}/reset-password?token=${encodeURIComponent(token)}">Reset password</a></p><p>This link expires soon and can only be used once.</p>`})});
  return r.ok;
}

async function handle(env:Env,request:Request):Promise<Response> {
  const url=new URL(request.url), path=url.pathname.replace(/\/+$/,'')||'/';
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors(env,request)});
  if(path==='/health') return json({ok:true,service:'sphere-api',database:'D1',storage:'R2',time:new Date().toISOString()},200,cors(env,request));
  if(path==='/schema') {
    const tables=['users','user_sessions','password_reset_tokens','posts','post_media','post_likes','comments','follows','notifications','conversations','conversation_participants','messages','reward_offers','wallets'];
    const out:Record<string,string[]|string>={}; for(const t of tables){try{out[t]=[...(await schema(env.DB,t))]}catch(e){out[t]=String(e)}}
    return json({tables:out},200,cors(env,request));
  }
  const body=async()=>request.headers.get('content-type')?.includes('application/json') ? await request.json<Record<string,unknown>>() : {};
  const a=await auth(env.DB,request);

  if(path==='/auth/signup' && request.method==='POST') {
    const b=await body(), username=text(b.username).trim().toLowerCase(), email=text(b.email).trim().toLowerCase(), password=text(b.password);
    if(!/^[a-z0-9_\.]{3,30}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||password.length<8) return json({error:'Invalid signup details'},400,cors(env,request));
    if(await findUser(env.DB,username)||await findUser(env.DB,email)) return json({error:'Unable to create account with those details'},409,cors(env,request));
    const salt=randomToken(16), hash=await pbkdf2(password,salt); const uid=id();
    await insertDynamic(env.DB,'users',{id:uid,user_id:uid,username,email,password_hash:hash,password_digest:hash,created_at:now(),updated_at:now(),status:'active'});
    const s=await createSession(env.DB,uid);
    return json({user:await getUser(env.DB,uid),session:{expires_at:s.expires}},201,{...cors(env,request),'set-cookie':cookie('sphere_session',s.token,60*60*24*30)});
  }
  if(path==='/auth/login' && request.method==='POST') {
    const b=await body(), value=text(b.email||b.username).trim().toLowerCase(), password=text(b.password), row=await findUser(env.DB,value);
    if(!row || !(await verifyPassword(password,userPassword(row)))) return json({error:'Invalid email/username or password'},401,cors(env,request));
    const s=await createSession(env.DB,rowId(row)); return json({user:await getUser(env.DB,rowId(row)),session:{expires_at:s.expires}},200,{...cors(env,request),'set-cookie':cookie('sphere_session',s.token,60*60*24*30)});
  }
  if(path==='/auth/session' && request.method==='GET') return a ? json({user:a.user},200,cors(env,request)) : json({user:null},200,cors(env,request));
  if(path==='/auth/logout' && request.method==='POST') {
    if(a){const cols=await schema(env.DB,'user_sessions'), tc=firstColumn(cols,['token_hash','session_token_hash','token']), rc=firstColumn(cols,['revoked_at','revoked','invalidated_at']); if(tc&&rc) await updateDynamic(env.DB,'user_sessions',`${ident(tc)}=?`,[a.hash],{[rc]:now()});}
    return json({ok:true},200,{...cors(env,request),'set-cookie':clearCookie('sphere_session')});
  }
  if(path==='/auth/refresh' && request.method==='POST') {
    requireAuth(a); const s=await createSession(env.DB,a.user.id); return json({user:a.user,expires_at:s.expires},200,{...cors(env,request),'set-cookie':cookie('sphere_session',s.token,60*60*24*30)});
  }
  if(path==='/auth/forgot-password' && request.method==='POST') {
    const b=await body(), email=text(b.email).trim().toLowerCase(), row=await findUser(env.DB,email); if(row){const token=randomToken(32), hash=await sha256(token); await insertDynamic(env.DB,'password_reset_tokens',{id:id(),user_id:rowId(row),token_hash:hash,token_digest:hash,expires_at:now()+3600,created_at:now(),used_at:null}); await sendBrevo(env,email,token);} return json({ok:true,message:'If that account exists, a reset email has been sent.'},200,cors(env,request));
  }
  if(path==='/auth/reset-password' && request.method==='POST') {
    const b=await body(), token=text(b.token), password=text(b.password); if(token.length<20||password.length<8) return json({error:'Invalid reset request'},400,cors(env,request));
    const hash=await sha256(token), cols=await schema(env.DB,'password_reset_tokens'), tc=firstColumn(cols,['token_hash','token_digest','token']), uc=firstColumn(cols,['user_id']), ec=firstColumn(cols,['expires_at','expires']), used=firstColumn(cols,['used_at','used']); if(!tc||!uc) return json({error:'Reset unavailable'},503,cors(env,request));
    const cond=[`${ident(tc)}=?`]; const binds:[unknown,...unknown[]]=[hash]; if(ec){cond.push(`${ident(ec)}> ?`);binds.push(now())} if(used)cond.push(`(${ident(used)} IS NULL OR ${ident(used)}=0)`);
    const r=await env.DB.prepare(`SELECT ${ident(uc)} AS user_id FROM password_reset_tokens WHERE ${cond.join(' AND ')} LIMIT 1`).bind(...binds).first<{user_id:string}>(); if(!r)return json({error:'Invalid or expired reset token'},400,cors(env,request));
    const ph=await pbkdf2(password,randomToken(16)); const ucols=await schema(env.DB,'users'), pc=firstColumn(ucols,['password_hash','password_digest','password']); if(!pc)return json({error:'Password storage unavailable'},503,cors(env,request)); await updateDynamic(env.DB,'users',`${ident(firstColumn(ucols,['id','user_id'])!)}=?`,[r.user_id],{[pc]:ph,updated_at:now()}); if(used)await updateDynamic(env.DB,'password_reset_tokens',`${ident(tc)}=?`,[hash],{[used]:now()}); return json({ok:true},200,cors(env,request));
  }

  requireAuth(a);
  if(path==='/me' && request.method==='GET') return json({user:a.user},200,cors(env,request));
  if(path==='/me' && request.method==='PATCH') { const b=await body(), cols=await schema(env.DB,'users'), idc=firstColumn(cols,['id','user_id'])!; const values:Record<string,unknown>={}; const map:{[k:string]:string[]}={username:['username','handle'],bio:['bio','about'],avatar_url:['avatar_url','avatar','profile_image_url']}; for(const [k,n] of Object.entries(map)){const c=firstColumn(cols,n);if(c&&b[k]!==undefined)values[c]=text(b[k]).trim();} values.updated_at=now(); await updateDynamic(env.DB,'users',`${ident(idc)}=?`,[a.user.id],values); return json({user:await getUser(env.DB,a.user.id)},200,cors(env,request)); }

  if(path==='/posts' && request.method==='GET') {
    const limit=Math.min(Number(url.searchParams.get('limit')||20),50), offset=Math.max(Number(url.searchParams.get('offset')||0),0), pc=await schema(env.DB,'posts'), idc=firstColumn(pc,['id','post_id']), uc=firstColumn(pc,['user_id','author_id','creator_id']), created=firstColumn(pc,['created_at','published_at']); if(!idc||!uc)return json({posts:[]},200,cors(env,request));
    const rows=await env.DB.prepare(`SELECT * FROM posts ORDER BY ${ident(created||idc)} DESC LIMIT ? OFFSET ?`).bind(limit,offset).all<Row>();
    const posts=[]; for(const r of rows.results??[]){const pid=text(r[idc]), owner=text(r[uc]); const media=await env.DB.prepare(`SELECT * FROM post_media WHERE post_id=? ORDER BY created_at DESC LIMIT 1`).bind(pid).first<Row>(); const likes=await env.DB.prepare(`SELECT COUNT(*) AS n FROM post_likes WHERE post_id=?`).bind(pid).first<{n:number}>(); posts.push({...r,author:await getUser(env.DB,owner),media,like_count:Number(likes?.n||0)});} return json({posts},200,cors(env,request));
  }
  if(path==='/posts' && request.method==='POST') {
    const b=await body(), caption=text(b.caption).trim(), music=b.music as Row|undefined; if(caption.length>2200)return json({error:'Caption too long'},400,cors(env,request));
    const pid=id(); const cols=await schema(env.DB,'posts'), idc=firstColumn(cols,['id','post_id']); if(!idc)return json({error:'posts schema is incompatible'},503,cors(env,request));
    await insertDynamic(env.DB,'posts',{id:pid,post_id:pid,user_id:a.user.id,author_id:a.user.id,creator_id:a.user.id,caption,created_at:now(),updated_at:now(),music_provider:music?.provider,music_id:music?.id||music?.music_id,song_title:music?.title||music?.song_title,artist_name:music?.artist||music?.artist_name,album_name:music?.album||music?.album_name,artwork_url:music?.artwork_url,duration_ms:music?.duration_ms,external_url:music?.external_url});
    return json({post_id:pid},201,cors(env,request));
  }
  if(path.startsWith('/posts/') && path.endsWith('/like') && request.method==='POST') { const pid=path.split('/')[2]; const existing=await env.DB.prepare('SELECT 1 FROM post_likes WHERE post_id=? AND user_id=? LIMIT 1').bind(pid,a.user.id).first(); if(existing){await env.DB.prepare('DELETE FROM post_likes WHERE post_id=? AND user_id=?').bind(pid,a.user.id).run();return json({liked:false},200,cors(env,request));} await insertDynamic(env.DB,'post_likes',{id:id(),post_id:pid,user_id:a.user.id,created_at:now()}); const post=await env.DB.prepare('SELECT user_id,author_id,creator_id FROM posts WHERE id=? OR post_id=? LIMIT 1').bind(pid,pid).first<Row>(); const owner=text(post?.user_id||post?.author_id||post?.creator_id); if(owner&&owner!==a.user.id)await notify(env.DB,owner,'post_like',a.user.id,pid); return json({liked:true},200,cors(env,request)); }
  if(path.startsWith('/posts/') && path.endsWith('/save') && request.method==='POST') { const pid=path.split('/')[2]; const e=await env.DB.prepare('SELECT 1 FROM saved_posts WHERE post_id=? AND user_id=? LIMIT 1').bind(pid,a.user.id).first(); if(e){await env.DB.prepare('DELETE FROM saved_posts WHERE post_id=? AND user_id=?').bind(pid,a.user.id).run();return json({saved:false},200,cors(env,request));} await insertDynamic(env.DB,'saved_posts',{id:id(),post_id:pid,user_id:a.user.id,created_at:now()});return json({saved:true},200,cors(env,request)); }
  if(path.startsWith('/posts/') && path.endsWith('/comments') && request.method==='POST') { const pid=path.split('/')[2], b=await body(), content=text(b.content).trim(); if(!content||content.length>2000)return json({error:'Invalid comment'},400,cors(env,request)); const cid=id(); await insertDynamic(env.DB,'comments',{id:cid,comment_id:cid,post_id:pid,user_id:a.user.id,author_id:a.user.id,parent_id:b.parent_id||b.parent_comment_id,content,created_at:now(),updated_at:now()}); const post=await env.DB.prepare('SELECT user_id,author_id,creator_id FROM posts WHERE id=? OR post_id=? LIMIT 1').bind(pid,pid).first<Row>(); const owner=text(post?.user_id||post?.author_id||post?.creator_id); if(owner&&owner!==a.user.id)await notify(env.DB,owner,'post_comment',a.user.id,pid); for(const m of content.matchAll(/@([a-zA-Z0-9_.]{3,30})/g)){const u=await findUser(env.DB,m[1]);if(u&&rowId(u)!==a.user.id)await notify(env.DB,rowId(u),'mention',a.user.id,pid);} return json({comment_id:cid},201,cors(env,request)); }

  if(path==='/search' && request.method==='GET') { const q=(url.searchParams.get('q')||'').trim(); if(q.length<2)return json({users:[],posts:[]},200,cors(env,request)); const ucols=await schema(env.DB,'users'), un=firstColumn(ucols,['username','handle']), em=firstColumn(ucols,['email','email_address']); const users=un?await env.DB.prepare(`SELECT * FROM users WHERE lower(${ident(un)}) LIKE lower(?) LIMIT 20`).bind(`%${q}%`).all<Row>():{results:Row[]} as any; const pcols=await schema(env.DB,'posts'), cap=firstColumn(pcols,['caption','content']); const posts=cap?await env.DB.prepare(`SELECT * FROM posts WHERE ${ident(cap)} LIKE ? ORDER BY created_at DESC LIMIT 20`).bind(`%${q}%`).all<Row>():{results:Row[]} as any; return json({users:users.results||[],posts:posts.results||[]},200,cors(env,request)); }

  if(path==='/follows' && request.method==='POST') { const b=await body(), target=text(b.user_id||b.username); const u=await findUser(env.DB,target); if(!u||rowId(u)===a.user.id)return json({error:'Invalid target'},400,cors(env,request)); const targetId=rowId(u); const cols=await schema(env.DB,'follows'), ac=firstColumn(cols,['follower_id','from_user_id']), bc=firstColumn(cols,['following_id','to_user_id']); if(!ac||!bc)return json({error:'Follow schema incompatible'},503,cors(env,request)); const e=await env.DB.prepare(`SELECT 1 FROM follows WHERE ${ident(ac)}=? AND ${ident(bc)}=? LIMIT 1`).bind(a.user.id,targetId).first(); if(e){await relation(env.DB,'follows',a.user.id,targetId,false);return json({following:false},200,cors(env,request));} await relation(env.DB,'follows',a.user.id,targetId,true); await notify(env.DB,targetId,'follow',a.user.id);return json({following:true},201,cors(env,request)); }

  if(path==='/notifications' && request.method==='GET') { const cols=await schema(env.DB,'notifications'), uc=firstColumn(cols,['user_id','recipient_id']); if(!uc)return json({notifications:[]},200,cors(env,request)); const rows=await env.DB.prepare(`SELECT * FROM notifications WHERE ${ident(uc)}=? ORDER BY created_at DESC LIMIT 50`).bind(a.user.id).all<Row>();return json({notifications:rows.results||[]},200,cors(env,request)); }

  if(path==='/upload/image' && request.method==='POST') { const ct=request.headers.get('content-type')||''; if(!ct.startsWith('multipart/form-data'))return json({error:'multipart/form-data required'},415,cors(env,request)); const form=await request.formData(), file=form.get('file'); if(!(file instanceof File))return json({error:'Image file required'},400,cors(env,request)); const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif']); if(!allowed.has(file.type)||file.size>10*1024*1024)return json({error:'Unsupported image or size exceeds 10MB'},400,cors(env,request)); const ext=file.type.split('/')[1].replace('jpeg','jpg'); const key=`users/${a.user.id}/images/${crypto.randomUUID()}.${ext}`; await env.R2.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'private, max-age=31536000'}}); return json({key},201,cors(env,request)); }
  if(path.startsWith('/media/') && request.method==='GET') { const key=decodeURIComponent(path.slice(7)); if(!key.startsWith(`users/${a.user.id}/`) && !key.startsWith('posts/'))return json({error:'Forbidden'},403,cors(env,request)); const object=await env.R2.get(key);if(!object)return new Response('Not found',{status:404,headers:cors(env,request)});const h=new Headers(cors(env,request));object.writeHttpMetadata(h);h.set('etag',object.httpEtag);return new Response(object.body,{headers:h}); }

  if(path==='/messages' && request.method==='POST') { const b=await body(), recipient=text(b.recipient_id), content=text(b.content).trim(); if(!recipient||!content||content.length>5000)return json({error:'Invalid message'},400,cors(env,request)); const u=await getUser(env.DB,recipient);if(!u||u.id===a.user.id)return json({error:'Invalid recipient'},400,cors(env,request)); const settings=await env.DB.prepare('SELECT * FROM user_settings WHERE user_id=? LIMIT 1').bind(u.id).first<Row>(); if(settings && (settings.allow_messages===0 || settings.allow_messages===false))return json({error:'Messages are disabled for this user'},403,cors(env,request)); const blocked=await env.DB.prepare('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1').bind(a.user.id,u.id,u.id,a.user.id).first();if(blocked)return json({error:'Messaging unavailable'},403,cors(env,request));
    const cp=await schema(env.DB,'conversation_participants'), cpc=firstColumn(cp,['conversation_id','conversation_id']), puc=firstColumn(cp,['user_id','participant_id']); let conv:Row|null=null; if(cpc&&puc){conv=await env.DB.prepare(`SELECT ${ident(cpc)} AS conversation_id FROM conversation_participants WHERE ${ident(puc)}=? AND ${ident(cpc)} IN (SELECT ${ident(cpc)} FROM conversation_participants WHERE ${ident(puc)}=?) GROUP BY ${ident(cpc)} HAVING COUNT(DISTINCT ${ident(puc)})=2 LIMIT 1`).bind(a.user.id,u.id).first<Row>();}
    const cid=text(conv?.conversation_id)||id(); if(!conv) {await insertDynamic(env.DB,'conversations',{id:cid,conversation_id:cid,created_at:now(),updated_at:now()});await insertDynamic(env.DB,'conversation_participants',{id:id(),conversation_id:cid,user_id:a.user.id,participant_id:a.user.id,created_at:now()});await insertDynamic(env.DB,'conversation_participants',{id:id(),conversation_id:cid,user_id:u.id,participant_id:u.id,created_at:now()});}
    const mid=id(); await insertDynamic(env.DB,'messages',{id:mid,message_id:mid,conversation_id:cid,sender_id:a.user.id,user_id:a.user.id,content,body:content,created_at:now(),read_at:null,is_read:0}); await notify(env.DB,u.id,'message',a.user.id,cid);return json({conversation_id:cid,message_id:mid},201,cors(env,request)); }
  if(path.startsWith('/messages/') && request.method==='GET') { const cid=path.split('/')[2], member=await env.DB.prepare('SELECT 1 FROM conversation_participants WHERE conversation_id=? AND user_id=? LIMIT 1').bind(cid,a.user.id).first();if(!member)return json({error:'Forbidden'},403,cors(env,request));const rows=await env.DB.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 200').bind(cid).all<Row>();return json({messages:rows.results||[]},200,cors(env,request)); }

  if(path==='/earn/offers' && request.method==='GET') { const cols=await schema(env.DB,'reward_offers'), sc=firstColumn(cols,['status','active']); const rows=sc?await env.DB.prepare(`SELECT * FROM reward_offers WHERE ${ident(sc)} IN ('active','enabled',1) ORDER BY created_at DESC LIMIT 50`).all<Row>():await env.DB.prepare('SELECT * FROM reward_offers LIMIT 50').all<Row>();return json({offers:rows.results||[]},200,cors(env,request)); }
  if(path==='/wallet' && request.method==='GET') { const rows=await env.DB.prepare('SELECT * FROM wallets WHERE user_id=? LIMIT 1').bind(a.user.id).all<Row>(); const tx=await env.DB.prepare('SELECT * FROM wallet_transactions WHERE user_id=? OR wallet_id IN (SELECT id FROM wallets WHERE user_id=?) ORDER BY created_at DESC LIMIT 50').bind(a.user.id,a.user.id).all<Row>();return json({wallet:rows.results?.[0]||null,transactions:tx.results||[]},200,cors(env,request)); }
  if(path==='/admin/reports' && request.method==='POST') { const b=await body(); await insertDynamic(env.DB,'reports',{id:id(),reporter_id:a.user.id,user_id:b.user_id,post_id:b.post_id,comment_id:b.comment_id,reason:text(b.reason).slice(0,500),details:text(b.details).slice(0,2000),status:'open',created_at:now()});return json({ok:true},201,cors(env,request)); }

  return json({error:'Not found'},404,cors(env,request));
}
function cors(env:Env,request:Request):HeadersInit { const origin=request.headers.get('origin'); const allowed=env.FRONTEND_ORIGIN||origin||'https://sphere-social.netlify.app'; return {'access-control-allow-origin':allowed,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','vary':'Origin'}; }

export default { async fetch(request:Request,env:Env){try{return await handle(env,request)}catch(e){const status=Number((e as any)?.status)||500;return json({error:status===500?'Internal server error':text((e as any)?.message)},status,cors(env,request));}} };
