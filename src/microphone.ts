import {useCallback,useEffect,useRef,useState} from 'react';
import {post,roomPath} from './api';
import type {RoomState} from './types';
interface RealtimeSession {value:string;expires_at:number;model:string;callUrl:string;}
interface MicrophoneOptions {room:RoomState;token?:string;deviceId:string;onError:(message:string)=>void;}
export function useMicrophone({room,token,deviceId,onError}:MicrophoneOptions){
 const [active,setActive]=useState(false),[connecting,setConnecting]=useState(false),[level,setLevel]=useState(0),[muted,setMuted]=useState(false);
 const mutedRef=useRef(false);
 const resources=useRef<{pc?:RTCPeerConnection;stream?:MediaStream;context?:AudioContext;raf?:number;flush?:ReturnType<typeof setTimeout>;ceiling?:ReturnType<typeof setTimeout>;abort?:AbortController;heartbeat?:ReturnType<typeof setInterval>;clientId?:string;generation:number}>({generation:0});
 const buffer=useRef('');const options=useRef({room,token,deviceId,onError});options.current={room,token,deviceId,onError};
 const stop=useCallback(()=>{
   const res=resources.current;res.generation++;res.abort?.abort();res.stream?.getTracks().forEach(track=>track.stop());res.pc?.close();void res.context?.close();cancelAnimationFrame(res.raf||0);clearTimeout(res.flush);clearTimeout(res.ceiling);clearInterval(res.heartbeat);res.flush=undefined;res.ceiling=undefined;buffer.current='';setActive(false);setConnecting(false);setLevel(0);setMuted(false);mutedRef.current=false;
   const current=options.current;const clientId=res.clientId;res.clientId=undefined;if(current.room.id!=='demo'&&clientId)void post(roomPath(current.room.id,'/presence',current.token),{connected:false,name:'Microphone',clientId}).catch(()=>{});
 },[]);
 useEffect(()=>()=>stop(),[stop]);
 const start=useCallback(async()=>{
   stop();const current=options.current;if(current.room.id==='demo')throw new Error('The demo uses sample text. Create a live service to use a microphone.');
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access needs HTTPS and a supported browser.');
   setConnecting(true);const generation=resources.current.generation;const res=resources.current;const clientId=crypto.randomUUID();res.clientId=clientId;
   const assertCurrent=()=>{if(generation!==resources.current.generation)throw new DOMException('Microphone connection cancelled','AbortError');};
   try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:current.deviceId?{exact:current.deviceId}:undefined,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(generation!==resources.current.generation){stream.getTracks().forEach(track=>track.stop());return;}res.stream=stream;
    const context=new AudioContext();res.context=context;await context.resume();assertCurrent();const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(stream).connect(analyser);const data=new Uint8Array(analyser.frequencyBinCount);
    const meter=()=>{if(generation!==resources.current.generation)return;analyser.getByteFrequencyData(data);setLevel(Math.min(1,data.reduce((a,b)=>a+b,0)/data.length/65));res.raf=requestAnimationFrame(meter);};meter();
    const session=await post<RealtimeSession>(roomPath(current.room.id,'/realtime',current.token),{inputLanguage:current.room.sourceLanguage,clientId});assertCurrent();
    const pc=new RTCPeerConnection();res.pc=pc;for(const track of stream.getTracks()){pc.addTrack(track,stream);track.onended=()=>{if(generation===resources.current.generation){stop();current.onError('The microphone disconnected. Choose an input and reconnect.');}};}
    let queue=Promise.resolve();let pendingPhrases=0;
    const flush=()=>{clearTimeout(res.flush);clearTimeout(res.ceiling);res.flush=undefined;res.ceiling=undefined;const text=buffer.current.trim();buffer.current='';if(!text||generation!==resources.current.generation)return;if(pendingPhrases>=3){stop();current.onError('Translation is falling behind. Audio has paused so old captions do not build up. Reconnect to continue.');return;}pendingPhrases++;const queuedAt=Date.now();queue=queue.then(async()=>{if(generation!==resources.current.generation){pendingPhrases--;return;}if(Date.now()-queuedAt>15000){pendingPhrases--;stop();current.onError('Translation is taking too long. Audio has paused. Reconnect when the connection improves.');return;}try{await post(roomPath(current.room.id,'/phrase',current.token),{text,clientId});}catch(error){current.onError(error instanceof Error?error.message:'A phrase could not be translated.');}finally{pendingPhrases--;}});};
    const channel=pc.createDataChannel('oai-events');
    channel.onmessage=event=>{if(generation!==resources.current.generation||mutedRef.current)return;try{const message=JSON.parse(event.data);if(message.type==='error'){current.onError(message.error?.message||'The audio service reported an error.');return;}if(message.type!=='session.input_transcript.delta'||typeof message.delta!=='string')return;buffer.current+=message.delta;clearTimeout(res.flush);if(!res.ceiling)res.ceiling=setTimeout(flush,12000);const complete=/[.!?…]["'”’]?\s*$/.test(buffer.current);res.flush=setTimeout(flush,complete?400:1800);}catch{/* Ignore non-transcript realtime events. */}};
    pc.onconnectionstatechange=()=>{if(generation!==resources.current.generation)return;if(pc.connectionState==='failed'||pc.connectionState==='disconnected'){stop();current.onError('Audio connection interrupted. Some speech may have been missed. Reconnect to continue.');}};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);assertCurrent();res.abort=new AbortController();
    const answer=await fetch(session.callUrl,{method:'POST',headers:{Authorization:`Bearer ${session.value}`,'Content-Type':'application/sdp'},body:offer.sdp,signal:res.abort.signal});
    if(!answer.ok)throw new Error(`Audio connection could not be established (${answer.status}). Please try again.`);
    await pc.setRemoteDescription({type:'answer',sdp:await answer.text()});assertCurrent();
    await post(roomPath(current.room.id,'/presence',current.token),{connected:true,clientId,name:/iPhone|Android/i.test(navigator.userAgent)?'Phone microphone':stream.getAudioTracks()[0]?.label||'Computer microphone'});assertCurrent();
    res.heartbeat=setInterval(()=>{if(generation!==resources.current.generation)return;void post(roomPath(current.room.id,'/presence',current.token),{connected:true,clientId,name:/iPhone|Android/i.test(navigator.userAgent)?'Phone microphone':stream.getAudioTracks()[0]?.label||'Computer microphone'}).catch(()=>{if(generation!==resources.current.generation)return;stop();current.onError('Microphone connection expired. Reconnect to continue.');});},20000);
    setActive(true);setConnecting(false);
   }catch(error){if(generation===resources.current.generation)stop();if(error instanceof DOMException&&error.name==='AbortError')return;throw error;}
 },[stop]);
 const toggleMute=useCallback(()=>{const next=!mutedRef.current;mutedRef.current=next;setMuted(next);resources.current.stream?.getAudioTracks().forEach(track=>{track.enabled=!next;});buffer.current='';clearTimeout(resources.current.flush);clearTimeout(resources.current.ceiling);resources.current.flush=undefined;resources.current.ceiling=undefined;if(next)setLevel(0);},[]);
 return {active,connecting,level,muted,toggleMute,start,stop};
}
