// Sphere API client — Cloudflare Worker / D1 / R2 contract bridge.
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const API_PREFIX = '/api';
const TOKEN_KEY = 'sphere_access_token';
const REFRESH_KEY = 'sphere_refresh_token';

export class ApiError extends Error { status:number; constructor(message:string,status:number){super(message);this.status=status;} }
let refreshing: Promise<unknown>|null=null;

function readToken(key:string){try{return sessionStorage.getItem(key)||''}catch{return ''}}
function writeTokens(token?:string,refreshToken?:string){try{if(token)sessionStorage.setItem(TOKEN_KEY,token);if(refreshToken)sessionStorage.setItem(REFRESH_KEY,refreshToken)}catch{}}
function clearTokens(){try{sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(REFRESH_KEY)}catch{}}

async function raw<T>(path:string,init:RequestInit={}):Promise<T>{
  const headers=new Headers(init.headers);
  if(init.body&&!(init.body instanceof FormData))headers.set('content-type','application/json');
  const token=readToken(TOKEN_KEY);
  if(token)headers.set('Authorization',`Bearer ${token}`);
  const r=await fetch(`${API_BASE}${API_PREFIX}${path}`,{...init,headers,credentials:'include'});
  const type=r.headers.get('content-type')||'';
  const data=type.includes('application/json')?await r.json():await r.text();
  if(!r.ok)throw new ApiError(typeof data==='object'&&data?.error?data.error:'Request failed',r.status);
  return data as T;
}

async function request<T>(path:string,init:RequestInit={},retry=true):Promise<T>{
  try{return await raw<T>(path,init)}catch(e){
    if(retry&&e instanceof ApiError&&e.status===401&&path!=='/auth/refresh'){
      const refreshToken=readToken(REFRESH_KEY);
      if(refreshToken){
        if(!refreshing)refreshing=raw<{success:boolean;data:{token:string}}>("/auth/refresh",{method:'POST',body:JSON.stringify({refreshToken})}).then(r=>{writeTokens(r.data.token);return r}).finally(()=>{refreshing=null});
        try{await refreshing;return await raw<T>(path,init)}catch{clearTokens()}
      }
    }
    throw e;
  }
}

function unwrap<T>(r:{data:T}):T{return r.data}

export const api={
  session:async()=>{try{const r=await request<{success:boolean;data:{user:User}}>("/auth/me");return {user:r.data.user}}catch(e){clearTokens();throw e}},
  signup:async(i:{username:string;email:string;password:string;displayName?:string})=>{const r=await request<{data:{token:string;refreshToken:string;user:User}}>("/auth/register",{method:'POST',body:JSON.stringify({username,email:i.email,password:i.password,displayName:i.displayName})});writeTokens(r.data.token,r.data.refreshToken);return {user:r.data.user}},
  login:async(i:{email?:string;username?:string;password:string})=>{const identifier=i.email||i.username||'';const r=await request<{data:{token:string;refreshToken:string;user:User}}>("/auth/login",{method:'POST',body:JSON.stringify({identifier,password:i.password})});writeTokens(r.data.token,r.data.refreshToken);return {user:r.data.user}},
  logout:async()=>{try{return await request<{ok:true}>("/auth/logout",{method:'POST'})}finally{clearTokens()}},
  forgotPassword:(email:string)=>request<{ok:true}>("/auth/forgot-password",{method:'POST',body:JSON.stringify({email})}),
  resetPassword:(token:string,password:string)=>request<{ok:true}>("/auth/reset-password",{method:'POST',body:JSON.stringify({token,newPassword:password})}),
  me:()=>request<{user:User}>("/auth/me").then(r=>({user:r.data.user})),
  updateProfile:async(input:Partial<Pick<User,'username'|'bio'|'avatar_url'>>)=>{const body:any={};if(input.username!==undefined)body.username=input.username;if(input.bio!==undefined)body.bio=input.bio;if(input.avatar_url!==undefined)body.avatarUrl=input.avatar_url;const r=await request<{data:{user:User}}>("/users/me/profile",{method:'PUT',body:JSON.stringify(body)});return {user:r.data.user}},
  profile:(username:string)=>request<{data:{profile:Profile}}>(`/users/${encodeURIComponent(username)}`).then(r=>r.data),
  posts:(limit=20,offset=0,feed:'forYou'|'following'='forYou')=>request<{data:{posts:Post[];page:number;hasMore:boolean}}>(`/posts?limit=${limit}&page=${Math.floor(offset/Math.max(limit,1))+1}&feed=${encodeURIComponent(feed)}`).then(r=>r.data),
  like:async(id:string)=>{const r=await request<{data:{hasLiked:boolean;likesCount:number}}>(`/posts/${encodeURIComponent(id)}/like`,{method:'POST'});return {liked:r.data.hasLiked,saved:false,likesCount:r.data.likesCount}},
  save:async(id:string)=>{const r=await request<{data:{saved:boolean}}>(`/posts/${encodeURIComponent(id)}/save`,{method:'POST'});return {saved:r.data.saved}},
  deletePost:(id:string)=>request<{ok:true}>(`/posts/${encodeURIComponent(id)}`,{method:'DELETE'}),
  comment:(id:string,content:string,parent_id?:string)=>request<{data:{comment:Comment}}>(`/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:JSON.stringify({content,parent_id})}).then(r=>({comment_id:r.data.comment.id,comment:r.data.comment})),
  comments:(id:string)=>request<{data:{comments:Comment[]}}>(`/posts/${encodeURIComponent(id)}/comments`).then(r=>({comments:r.data.comments})),
  commentLike:(id:string)=>request<{data:{liked:boolean}}>(`/comments/${encodeURIComponent(id)}/like`,{method:'POST'}).then(r=>r.data),
  deleteComment:(id:string)=>request<{ok:true}>(`/comments/${encodeURIComponent(id)}/delete`,{method:'POST'}),
  follow:async(user_id:string)=>{const r=await request<{data:{isFollowing:boolean}}>(`/users/${encodeURIComponent(user_id)}/follow`,{method:'POST'});return {following:r.data.isFollowing}},
  notifications:()=>Promise.resolve({notifications:[] as unknown[]}),
  readNotification:async(id:string)=>({ok:true as const}),
  readAllNotifications:async()=>({ok:true as const}),
  search:async(q:string,limit=20)=>{const r=await request<{data:{users:User[];posts:Post[]}}>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);return r.data},
  settings:async()=>{const r=await request<{data:{settings:Record<string,unknown>}}>("/users/me/settings");return r.data},
  updateSettings:async(settings:Record<string,unknown>)=>{const r=await request<{data:{settings:Record<string,unknown>}}>("/users/me/settings",{method:'PUT',body:JSON.stringify(settings)});return {ok:true as const,settings:r.data.settings}},
  block:(user_id:string)=>request<{data:{active:boolean}}>("/blocks",{method:'POST',body:JSON.stringify({user_id})}).then(r=>r.data),
  mute:(user_id:string)=>request<{data:{active:boolean}}>("/mutes",{method:'POST',body:JSON.stringify({user_id})}).then(r=>r.data),
  uploadImage:async(file:File)=>{const f=new FormData();f.append('file',file);const r=await request<{data:{url:string;key:string}}>("/upload",{method:'POST',body:f});return r.data},
  createPost:async(i:{caption:string;music?:Music;imageKey:string})=>{const r=await request<{data:{post:Post}}>("/posts",{method:'POST',body:JSON.stringify({caption:i.caption,imageUrl:i.imageKey,song:i.music})});return {post_id:r.data.post.id,post:r.data.post}},
  musicSearch:(q:string)=>request<{data:{tracks:Music[]}}>(`/music/search?q=${encodeURIComponent(q)}`).then(r=>r.data),
  messages:(conversation_id:string)=>request<{data:{messages:Message[]}}>(`/messages?conversation_id=${encodeURIComponent(conversation_id)}`).then(r=>r.data),
  conversationWith:(user_id:string)=>request<{data:{conversation_id:string|null}}>(`/messages/with?user_id=${encodeURIComponent(user_id)}`).then(r=>r.data),
  sendMessage:(recipient_id:string,content:string)=>request<{data:{conversation_id:string;message_id:string}}>("/messages",{method:'POST',body:JSON.stringify({recipient_id,content})}).then(r=>r.data),
  editMessage:(message_id:string,content:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(message_id)}`,{method:'PATCH',body:JSON.stringify({content})}),
  readMessages:(conversation_id:string)=>request<{ok:true}>(`/messages/${encodeURIComponent(conversation_id)}/read`,{method:'POST'}),
  wallet:async()=>{const r=await request<{data:{wallet:Record<string,unknown>|null;transactions:unknown[]}}>("/wallet");return r.data},
  withdraw:(input:{amount:number;provider:'paystack'|'paypal';destination:string})=>request<{status:string}>("/withdrawals",{method:'POST',body:JSON.stringify({amount:input.amount,payoutMethod:input.provider,destinationAccount:input.destination})}),
  earn:async()=>({offers:[] as unknown[]}),
};

export type User={id:string;username:string;email:string;displayName?:string;bio?:string|null;avatar_url?:string|null;avatarUrl?:string|null;status?:string|null;createdAt?:number};
export type Profile={id:string;username:string;displayName?:string;bio?:string;avatarUrl?:string;postsCount:number;followersCount:number;followingCount:number;totalLikesReceived:number;isFollowing?:boolean};
export type Music={provider?:string;id?:string;title?:string;artist?:string;album?:string;artwork_url?:string;duration_ms?:number;external_url?:string;audio_url?:string;source_url?:string;license?:string;license_url?:string;creator?:string};
export type Post=Record<string,any>&{id?:string;post_id?:string;caption?:string;author?:User;media?:Record<string,any>|null;imageUrl?:string;image_url?:string;likesCount?:number;like_count?:number;commentsCount?:number;comment_count?:number;hasLiked?:boolean;liked?:boolean;saved?:boolean;createdAt?:number;created_at?:number};
export type Comment=Record<string,any>&{id:string;postId?:string;userId?:string;author?:User;content?:string;createdAt?:number;created_at?:number;liked?:boolean;like_count?:number};
export type Message=Record<string,any>&{id?:string;message_id?:string;content?:string;body?:string;sender_id?:string;sender_username?:string;created_at?:number};
