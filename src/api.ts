import type { RoomState } from './types';
export interface Config { configured:boolean; authenticated:boolean; development:boolean; openaiConfigured:boolean; operatorConfigured:boolean; }
export class ApiError extends Error { constructor(public status:number, message:string){super(message);} }
export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
  const body=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok) throw new ApiError(response.status,String(body.error || body.message || 'Something went wrong. Please try again.'));
  return body as T;
}
export const roomPath=(room:string,endpoint='',token?:string)=>`/api/rooms/${encodeURIComponent(room)}${endpoint}${token?`?token=${encodeURIComponent(token)}`:''}`;
export const post=<T>(path:string,body:unknown={})=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export function connectRoom(id:string,token:string|undefined,onState:(state:RoomState)=>void,onConnection:(connected:boolean)=>void){
  let socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false,attempt=0;
  function connect(){
    socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${roomPath(id,'/ws',token)}`);
    socket.onopen=()=>{attempt=0;onConnection(true);};
    socket.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='state')onState(data.state);}catch{/* Ignore malformed network messages. */}};
    socket.onclose=()=>{onConnection(false);if(!closed)timer=setTimeout(connect,Math.min(1000*2**attempt++,15000));};
    socket.onerror=()=>socket?.close();
  }
  connect();return()=>{closed=true;clearTimeout(timer);socket?.close();};
}
