export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export class ApiError extends Error { status:number; constructor(message:string,status:number){super(message);this.status=status;} }
let refreshing: Promise<unknown>|null=null;
async function raw<T>(path:string,init:RequestInit={}):Promise<T>{const headers=new Headers(init.headers);if(init.body&&!(init.body instanceof FormData))headers.set('content-type','application/json');const r=await fetch(`${API_BASE}${path}`,{...init,headers,credentials:'include'});const type=r.headers.get('content-type')||'';const data=type.includes('application/json')?await r.json():await r.text();if(!r.ok)throw new ApiError(typeof data==='object'&&data?.error?data.error:'Request failed',r.status);return data as T;}
async function request<T>(path:string,init:RequestInit={},retry=true):Promise<T>{try{return await raw<T>(path,init);}catch(e){if(retry&&e instanceof ApiError&&e.status===401&&path!=='/auth/refresh'&&path!=='/auth/session'){if(!refreshing)refreshing=raw('/auth/refresh',{method:'POST'}).finally(()=>{refreshing=null});try{await refreshing;return await raw<T>(path,init);}catch{}}throw e;}}
export const api={
 session:()=>request<{user:User|null}>('/auth/session'),
 signup:(i:{username:string;email:string;password:string})=>request<{user:User}>('/auth/signup',{method:'POST',body:JSON.stringify(i)}),
 login:(i:{email?:string;username?:string;password:string})=>request<{user:User}>('/auth/login',{method:'POST',body:JSON.stringify(i)}),
 logout:()=>request<{ok:true}>('/auth/logout',{method:'POST'}),
 forgotPassword:(email:string)=>request<{ok:true}>("/auth/forgot-password",{method:'POST',body:JSON.stringify({email})}),
 resetPassword:(token:string,password:string)=>request<{ok:true}>('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})}),
 me:()=>request<{user:User}>('/me'),
 updateProfile:(input:Partial<Pick<User,'username'|'bio'|'avatar_url'>>)=>request<{user:User}>('/me',{method:'PATCH',body:JSON.stringify(input)}),
 posts:(limit=20,offset=0)=>request<{posts:Post[]}>(`/posts?limit=${limit}&offset=${offset}`),
 like:(id:string)=>request<{liked?:boolean;saved?:boolean}>(`/posts/${encodeURIComponent(id)}/like`,{method:'POST'}),
 save:(id:string)=>request<{liked?:boolean;saved?:boolean}>(`/posts/${encodeURIComponent(id)}/save`,{method:'POST'}), deletePost:(id:string)=>request<{ok:true}>(`/posts/${encodeURIComponent(id)}`,{method:'DELETE'}),
 comment:(id:string,content:string,parent_id?:string)=>request<{comment_id:string}>(`/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:JSON.stringify({content,parent_id})}),comments:(id:string)=>request<{comments:any[]}>(`/posts/${encodeURIComponent(id)}/comments`),
 commentLike:(id:string)=>request<{liked:boolean}>(`/comments/${encodeURIComponent(id)}/like`,{method:'POST'}),
 deleteComment:(id:string)=>request<{ok:true}>(`/comments/${encodeURIComponent(id)}/delete`,{method:'POST'}),
 follow:(user_id:string)=>request<{following:boolean;pending?:boolean}>('/follows',{method:'POST',body:JSON.stringify({user_id})}),
 notifications:()=>request<{notifications:unknown[]}>('/notifications'),
 readNotification:(id:string)=>request<{ok:true}>(`/notifications/${encodeURIComponent(id)}/read`,{method:'POST'}),
 readAllNotifications:()=>request<{ok:true}>('/notifications/read-all',{method:'POST'}),
 search:(q:string,limit=20)=>request<{users:User[];posts:Post[]}>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
 settings:()=>request<{settings:Record<string,unknown>}>('/settings'),
 updateSettings:(settings:Record<string,unknown>)=>request<{ok:true}>('/settings',{method:'PATCH',body:JSON.stringify(settings)}),
 block:(user_id:string)=>request<{active:boolean}>('/blocks',{method:'POST',body:JSON.stringify({user_id})}),
 mute:(user_id:string)=>request<{active:boolean}>('/mutes',{method:'POST',body:JSON.stringify({user_id})}),
 uploadImage:(file:File)=>{const f=new FormData();f.append('file',file);return request<{key:string}>('/upload/image',{method:'POST',body:f});},
 createPost:(i:{caption:string;music?:Music;imageKey:string})=>request<{post_id:string}>('/posts',{method:'POST',body:JSON.stringify(i)}), musicSearch:(q:string)=>request<{tracks:Music[]}>(`/music/search?q=${encodeURIComponent(q)}`),
 messages:(conversation_id:string)=>request<{messages:Message[]}>(`/messages?conversation_id=${encodeURIComponent(conversation_id)}`),
 sendMessage:(recipient_id:string,content:string)=>request<{conversation_id:string;message_id:string}>('/messages',{method:'POST',body:JSON.stringify({recipient_id,content})}),
 readMessages:(conversation_id:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(conversation_id)}/read`,{method:'POST'}),
 wallet:()=>request<{wallet:Record<string,unknown>|null;transactions:unknown[]}>('/wallet'),
 withdraw:(input:{amount:number;provider:'paystack'|'paypal';destination:string})=>request<{status:string}>('/withdrawals',{method:'POST',body:JSON.stringify(input)}),
 earn:()=>request<{offers:unknown[]}>('/earn/offers')
};
export type User={id:string;username:string;email:string;avatar_url?:string|null;bio?:string|null;status?:string|null};
export type Music={provider?:string;id?:string;title?:string;artist?:string;album?:string;artwork_url?:string;duration_ms?:number;external_url?:string};
export type Post=Record<string,any>&{id?:string;post_id?:string;caption?:string;author?:User;media?:Record<string,any>|null;like_count?:number};
export type Message=Record<string,any>&{id?:string;message_id?:string;content?:string;body?:string;sender_id?:string;created_at?:number};
