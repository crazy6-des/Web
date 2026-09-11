const BASE=import.meta.env.VITE_API_BASE_URL||'';
async function request<T>(path:string,init:RequestInit={}){const r=await fetch(`${BASE}${path}`,{...init,credentials:'include',headers:{...(init.body instanceof FormData?{}:{'content-type':'application/json'}),...(init.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d as T;}
export const api={
 uploadImage:async(file:File)=>{const f=new FormData();f.append('file',file);return await request<{key:string}>("/upload/image",{method:'POST',body:f})},
 createPost:async(i:{caption:string;music?:Music;imageKey?:string})=>{const r=await request<{post_id:string}>("/posts",{method:'POST',body:JSON.stringify({caption:i.caption,music:i.music,imageKey:i.imageKey})});return {post_id:r.post_id,post:{id:r.post_id} as Post}},
 musicSearch:(q:string)=>request<{tracks:Music[]}>(`/music/search?q=${encodeURIComponent(q)}`),
 messages:(conversation_id:string)=>request<{messages:Message[]}>(`/messages?conversation_id=${encodeURIComponent(conversation_id)}`),
 inbox:()=>request<{conversations:ConversationSummary[]}>("/messages/inbox"),
 conversationWith:(user_id:string)=>request<{conversation_id:string|null}>(`/messages/with?user_id=${encodeURIComponent(user_id)}`),
 sendMessage:(recipient_id:string,content:string)=>request<{conversation_id:string;message_id:string}>("/messages",{method:'POST',body:JSON.stringify({recipient_id,content})}),
 editMessage:(message_id:string,content:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(message_id)}`,{method:'PATCH',body:JSON.stringify({content})}),
 readMessages:(conversation_id:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(conversation_id)}/read`,{method:'POST'}),
 wallet:async()=>request<{wallet:Record<string,any>|null;transactions:any[]}>("/wallet"),
 withdraw:(input:{amount:number;provider:'paystack'|'stripe';destination:string;idempotencyKey?:string})=>request<{status:string;reference?:string}>("/withdrawals",{method:'POST',headers:{'idempotency-key':input.idempotencyKey||crypto.randomUUID()},body:JSON.stringify({amount:input.amount,provider:input.provider,destination:input.destination})}),
 earn:async()=>request<{offers:unknown[]}>("/earn/offers"),
};
export type User={id:string;username:string;email:string;displayName?:string;bio?:string|null;avatar_url?:string|null;avatarUrl?:string|null;status?:string|null;createdAt?:number};
export type Profile={id:string;username:string;displayName?:string;bio?:string|null;avatar_url?:string|null;avatarUrl?:string;postsCount:number;followersCount:number;followingCount:number;totalLikesReceived:number;isFollowing?:boolean};
export type Music={provider?:string;id?:string;title?:string;artist?:string;album?:string;artwork_url?:string;duration_ms?:number;external_url?:string;audio_url?:string;source_url?:string;license?:string;license_url?:string;creator?:string};
export type Post=Record<string,any>&{id?:string;post_id?:string;caption?:string;author?:User;media?:Record<string,any>|null;imageUrl?:string;image_url?:string;likesCount?:number;like_count?:number;commentsCount?:number;comment_count?:number;hasLiked?:boolean;liked?:boolean;saved?:boolean;createdAt?:number;created_at?:number};
export type Comment=Record<string,any>&{id:string;postId?:string;userId?:string;author?:User;content?:string;createdAt?:number;created_at?:number;liked?:boolean;like_count?:number};
export type ConversationSummary={conversation_id:string;user:User;lastMessage:string;lastAt:number;unread:number};