import { Post, User } from './api';

export const ago=(v:any)=>{const n=Number(v),d=Number.isFinite(n)?new Date(n<1e12?n*1000:n):new Date(String(v||'').replace(' ','T')+(String(v||'').includes('Z')?'':'Z'));if(isNaN(d.getTime()))return '';const s=Math.max(0,(Date.now()-d.getTime())/1000);return s<60?'now':s<3600?`${Math.floor(s/60)}m`:s<86400?`${Math.floor(s/3600)}h`:s<604800?`${Math.floor(s/86400)}d`:d.toLocaleDateString([],{month:'short',day:'numeric'})};
export const key=(p:Post)=>{const m=p.media||{};return m.object_key||m.r2_key||m.storage_key||m.key};
export const image=(p:Post)=>{const k=key(p);return k?`${import.meta.env.VITE_API_BASE_URL||'https://sphere-api.binancecompany274.workers.dev'}/media/${encodeURIComponent(String(k))}`:(p.image_url||p.imageUrl||'')};
export function A({u,s='m'}:{u?:User|null;s?:'s'|'m'|'l'}){const src=u?.avatar_url||u?.avatarUrl;return src?<img className={`av ${s}`} src={src} alt=""/>:<span className={`av ${s}`}>{u?.username?.[0]?.toUpperCase()||'S'}</span>}
export function Empty({title,text}:{title:string;text:string}){return <div className="empty"><b>S</b><h2>{title}</h2><p>{text}</p></div>}
