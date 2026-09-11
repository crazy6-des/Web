// Sphere API client — Cloudflare Worker / D1 / R2 contract bridge.
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error { status:number; constructor(message:string,status:number){super(message);this.status=status;} }
let refreshing: Promise<unknown>|null=null;

async function raw<T>(path:string,init:RequestInit={}):Promise<T>{
  const headers=new Headers(init.headers);
  if(init.body&&!(init.body instanceof FormData))headers.set('content-type','application/json');
  const r=await fetch(`${API_BASE}${path}`,{...init,headers,credentials:'include'});
  const type=r.headers.get('content-type')||'';
  const data=type.includes('application/json')?await r.json():await r.text();
  if(!r.ok)throw new ApiError(typeof data==='object'&&data?.error?data.error:'Request failed',r.status);
  return data as T;
}

async function request<T>(path:string,init:RequestInit={},retry=true):Promise<T>{
  try{return await raw<T>(path,init)}catch(e){
    if(retry&&e instanceof ApiError&&e.status===401&&path!=='/auth/refresh'){
      if(!refreshing)refreshing=raw<{user:User|null}>("/auth/refresh",{method:'POST'}).finally(()=>{refreshing=null});
      try{await refreshing;return await raw<T>(path,init)}catch{}
    }
    throw e;
  }
}

function normalizePost(p:Post):Post{return {...p,liked:Boolean(p.hasLiked??p.liked),like_count:Number(p.likesCount??p.like_count??0),comment_count:Number(p.commentsCount??p.comment_count??0),created_at:Number(p.createdAt??p.created_at??Date.now()),image_url:p.imageUrl??p.image_url}}

export const api={
  session:async()=>{const r=await request<{user:User|null}>("/auth/session");if(!r.user)throw new ApiError('Not authenticated',401);return {user:r.user}},
  signup:async(i:{username:string;email:string;password:string;displayName?:string})=>{const r=await request<{user:User}>("/auth/signup",{method:'POST',body:JSON.stringify({username:i.username,email:i.email,password:i.password,displayName:i.displayName})});return {user:r.user}},
  login:async(i:{email?:string;username?:string;password:string})=>{const identifier=i.email||i.username||'';const r=await request<{user:User}>("/auth/login",{method:'POST',body:JSON.stringify({email:identifier,password:i.password})});return {user:r.user}},
  logout:async()=>{try{return await request<{ok:true}>("/auth/logout",{method:'POST'})}catch(e){if(e instanceof ApiError&&e.status===401)return {ok:true};throw e}},
  forgotPassword:(email:string)=>request<{ok:true}>("/auth/forgot-password",{method:'POST',body:JSON.stringify({email})}),
  resetPassword:(token:string,password:string)=>request<{ok:true}>("/auth/reset-password",{method:'POST',body:JSON.stringify({token,password})}),
  me:()=>request<{user:User}>("/me").then(r=>({user:r.user})),
  updateProfile:async(input:Partial<Pick<User,'username'|'bio'|'avatar_url'>>)=>{const body:any={};if(input.username!==undefined)body.username=input.username;if(input.bio!==undefined)body.bio=input.bio;if(input.avatar_url!==undefined)body.avatar_url=input.avatar_url;const r=await request<{user:User}>("/me",{method:'PATCH',body:JSON.stringify(body)});return {user:r.user}},
  profile:(username:string)=>request<{profile:Profile}>(`/users/${encodeURIComponent(username)}`).then(r=>r),
  posts:async(limit=20,offset=0,feed:'forYou'|'following'='forYou')=>{const r=await request<{posts:Post[];page:number;hasMore:boolean}>(`/posts?limit=${limit}&offset=${offset}&feed=${encodeURIComponent(feed)}`);return {...r,posts:r.posts.map(normalizePost)}},
  like:async(id:string)=>{const r=await request<{liked:boolean;likesCount?:number}>(`/posts/${encodeURIComponent(id)}/like`,{method:'POST'});return {liked:Boolean(r.liked),saved:false,likesCount:Number(r.likesCount||0)}},
  save:async(id:string)=>{const r=await request<{saved:boolean}>(`/posts/${encodeURIComponent(id)}/save`,{method:'POST'});return {saved:Boolean(r.saved),liked:false}},
  deletePost:(id:string)=>request<{ok:true}>(`/posts/${encodeURIComponent(id)}`,{method:'DELETE'}),
  comment:(id:string,content:string,parent_id?:string)=>request<{comment_id:string}>(`/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:JSON.stringify({content,parent_id})}).then(r=>({comment_id:r.comment_id,comment:{id:r.comment_id,content}} as any)),
  comments:(id:string)=>request<{comments:Comment[]}>(`/posts/${encodeURIComponent(id)}/comments`),
  commentLike:(id:string)=>request<{liked:boolean}>(`/comments/${encodeURIComponent(id)}/like`,{method:'POST'}),
  deleteComment:(id:string)=>request<{ok:true}>(`/comments/${encodeURIComponent(id)}/delete`,{method:'POST'}),
  follow:async(user_id:string)=>{const r=await request<{following:boolean;pending?:boolean}>(`/follows`,{method:'POST',body:JSON.stringify({user_id})});return {following:Boolean(r.following),pending:Boolean(r.pending)}},
  notifications:async()=>{const r=await request<{notifications:NotificationItem[];unreadCount?:number}>("/notifications");return {notifications:r.notifications||[],unreadCount:Number(r.unreadCount||0)}},
  readNotification:(id:string)=>request<{ok:true}>(`/notifications/${encodeURIComponent(id)}/read`,{method:'POST'}),
  readAllNotifications:()=>request<{ok:true}>("/notifications/read-all",{method:'POST'}),
  search:async(q:string,limit=20)=>{const r=await request<{users:User[];posts:Post[]}>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);return {...r,posts:(r.posts||[]).map(normalizePost)}},
  settings:async()=>request<{settings:Record<string,unknown>}>("/settings"),
  updateSettings:async(settings:Record<string,unknown>)=>{const r=await request<{ok:true}>("/settings",{method:'PATCH',body:JSON.stringify(settings)});return {ok:r.ok,settings}},
  block:(user_id:string)=>request<{active:boolean}>("/blocks",{method:'POST',body:JSON.stringify({user_id})}),
  mute:(user_id:string)=>request<{active:boolean}>("/mutes",{method:'POST',body:JSON.stringify({user_id})}),
  uploadImage:async(file:File)=>{const f=new FormData();f.append('file',file);return await request<{key:string}>("/upload/image",{method:'POST',body:f})},
  createPost:async(i:{caption:string;music?:Music;imageKey:string})=>{const r=await request<{post_id:string}>("/posts",{method:'POST',body:JSON.stringify({caption:i.caption,music:i.music,imageKey:i.imageKey})});return {post_id:r.post_id,post:{id:r.post_id} as Post}},
  musicSearch:(q:string)=>request<{tracks:Music[]}>(`/music/search?q=${encodeURIComponent(q)}`),
  messages:(conversation_id:string)=>request<{messages:Message[]}>(`/messages?conversation_id=${encodeURIComponent(conversation_id)}`),
  conversationWith:(user_id:string)=>request<{conversation_id:string|null}>(`/messages/with?user_id=${encodeURIComponent(user_id)}`),
  sendMessage:(recipient_id:string,content:string)=>request<{conversation_id:string;message_id:string}>("/messages",{method:'POST',body:JSON.stringify({recipient_id,content})}),
  editMessage:(message_id:string,content:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(message_id)}`,{method:'PATCH',body:JSON.stringify({content})}),
  readMessages:(conversation_id:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(conversation_id)}/read`,{method:'POST'}),
  wallet:async()=>request<{wallet:Record<string,any>|null;transactions:any[]}>("/wallet"),
  withdraw:(input:{amount:number;provider:'paystack'|'paypal';destination:string})=>request<{status:string}>("/withdrawals",{method:'POST',body:JSON.stringify({amount:input.amount,provider:input.provider,destination:input.destination})}),
  earn:async()=>request<{offers:unknown[]}>("/earn/offers"),
};
export type User={id:string;username:string;email:string;displayName?:string;bio?:string|null;avatar_url?:string|null;avatarUrl?:string|null;status?:string|null;createdAt?:number};
export type Profile={id:string;username:string;displayName?:string;bio?:string;avatarUrl?:string;postsCount:number;followersCount:number;followingCount:number;totalLikesReceived:number;isFollowing?:boolean};
export type Music={provider?:string;id?:string;title?:string;artist?:string;album?:string;artwork_url?:string;duration_ms?:number;external_url?:string;audio_url?:string;source_url?:string;license?:string;license_url?:string;creator?:string};
export type Post=Record<string,any>&{id?:string;post_id?:string;caption?:string;author?:User;media?:Record<string,any>|null;imageUrl?:string;image_url?:string;likesCount?:number;like_count?:number;commentsCount?:number;comment_count?:number;hasLiked?:boolean;liked?:boolean;saved?:boolean;createdAt?:number;created_at?:number};
export type Comment=Record<string,any>&{id:string;postId?:string;userId?:string;author?:User;content?:string;createdAt?:number;created_at?:number;liked?:boolean;like_count?:number};
export type NotificationItem={id:string;type:string;read:boolean;createdAt:number;actor:User;postId?:string|null;commentId?:string|null;post?:{caption:string;imageUrl:string}|null};
export type Message=Record<string,any>&{id?:string;message_id?:string;content?:string;body?:string;sender_id?:string;sender_username?:string;created_at?:number};
