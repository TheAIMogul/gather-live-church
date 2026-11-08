import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUpRight,Check,ChevronDown,Copy,Expand,Headphones,Link,Mic,MicOff,Monitor,Pause,Play,Plus,Radio,RefreshCw,Settings,ShieldCheck,Smartphone,Square,Upload,Volume2,X,AlignLeft,AlignCenter,AlignRight,Sun,Moon,Leaf,LogOut,BookOpen,EyeOff} from 'lucide-react';
import QRCode from 'qrcode';
import {api,post,roomPath,connectRoom,type Config} from './api';
import {makeDemo,nextDemo,readDemo,saveDemo} from './demo';
import {defaultSettings,type DisplaySettings,type RoomState,type Segment} from './types';
import {useMicrophone} from './microphone';

const params=new URLSearchParams(location.search);
const route=location.pathname.split('/').filter(Boolean);
const routeRole=route[0]==='display'&&route[1]?'display':route[0]==='mic'?'mic':'operator';
const routeId=route[1]||'demo';
const routeToken=params.get('token')||undefined;
const isDemoRoute=routeId==='demo';
const initialConfig:Config={configured:false,authenticated:false,development:false,openaiConfigured:false,operatorConfigured:false};
const languageLabel=(code:string)=>code==='es'?'Español':'English';
const messageOf=(error:unknown)=>error instanceof Error?error.message:'Please try again.';

function useRoom(){
 const [room,setRoom]=useState<RoomState>(()=>readDemo());
 const [config,setConfig]=useState<Config>(initialConfig);
 const [loading,setLoading]=useState(true);
 const [connected,setConnected]=useState(false);
 const [error,setError]=useState('');
 const channel=useRef<BroadcastChannel|null>(null);
 const roomRef=useRef(room);roomRef.current=room;
 useEffect(()=>{
   const bus=new BroadcastChannel('gather-demo');channel.current=bus;
   bus.onmessage=e=>{if(e.data?.mode==='demo'&&roomRef.current.id==='demo')setRoom(e.data);};
   const onStorage=(e:StorageEvent)=>{if(e.key==='gather-demo-room-v1'&&roomRef.current.id==='demo')setRoom(readDemo());};
   window.addEventListener('storage',onStorage);return()=>{bus.close();window.removeEventListener('storage',onStorage);};
 },[]);
 const updateDemo=useCallback((change:(state:RoomState)=>RoomState)=>{const next=change(roomRef.current);roomRef.current=next;setRoom(next);saveDemo(next);channel.current?.postMessage(next);},[]);
 const refresh=useCallback(async()=>{
   try{
    const next=await api<Config>('/api/config');setConfig(next);
    if(routeRole!=='operator'&&!isDemoRoute){setRoom(await api<RoomState>(roomPath(routeId,'',routeToken)));}
    else if(routeRole==='operator'&&next.authenticated){const id=localStorage.getItem('gather-room-id');if(id){try{setRoom(await api<RoomState>(roomPath(id)));}catch{localStorage.removeItem('gather-room-id');}}}
   }catch(error){if(routeRole!=='operator'&&!isDemoRoute)setError(messageOf(error));}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(room.id==='demo'){setConnected(true);return;}return connectRoom(room.id,routeRole==='operator'?undefined:routeToken,setRoom,setConnected);},[room.id]);
 useEffect(()=>{
  if(routeRole!=='operator'||room.mode!=='demo'||room.status!=='live')return;
  const timer=setInterval(()=>updateDemo(state=>nextDemo(state)),8000);return()=>clearInterval(timer);
 },[room.mode,room.status,updateDemo]);
 const control=async(action:string)=>{
  setError('');
  if(room.id==='demo'){updateDemo(state=>{
   if(action==='clear')return {...state,segments:[],summary:'',status:'idle',blank:false};
   if(action==='blank'||action==='unblank')return {...state,blank:action==='blank'};
   const status=action==='pause'?'paused':action==='stop'?'ended':'live';
   let next={...state,status,startedAt:state.startedAt||Date.now()} as RoomState;
   if(status==='live'&&!state.segments.length)next=nextDemo(next);return next;
  });return;}
  try{setRoom(await post<RoomState>(roomPath(room.id,'/control'),{action}));}catch(error){setError(messageOf(error));}
 };
 const saveSettings=async(settings:DisplaySettings)=>{
  if(room.id==='demo'){updateDemo(state=>({...state,settings}));return;}
  await api(roomPath(room.id,'/settings'),{method:'PATCH',body:JSON.stringify({settings})});
 };
 const switchLanguage=async()=>{
  if(room.id==='demo'){updateDemo(state=>({...state,sourceLanguage:state.targetLanguage,targetLanguage:state.sourceLanguage,segments:[]}));return;}
  await api(roomPath(room.id,'/settings'),{method:'PATCH',body:JSON.stringify({sourceLanguage:room.targetLanguage,targetLanguage:room.sourceLanguage})});
 };
 const createRoom=async()=>{const previous=roomRef.current;const created=await post<RoomState>('/api/rooms',{sourceLanguage:previous.sourceLanguage});const branded=await api<RoomState>(roomPath(created.id,'/settings'),{method:'PATCH',body:JSON.stringify({settings:previous.settings})});localStorage.setItem('gather-room-id',branded.id);setRoom(branded);return branded;};
 const demo=()=>{const next=makeDemo();next.settings=room.settings;updateDemo(()=>next);setRoom(next);};
 return {room,setRoom,config,setConfig,loading,connected,error,setError,refresh,control,saveSettings,switchLanguage,createRoom,demo,updateDemo};
}

function Brand({small=false}:{small?:boolean}){return <div className={`brand ${small?'small':''}`}><span className="brand-mark"><i/><i/></span><span>Gather<span className="brand-period">.</span></span></div>;}
function Action({children,icon,onClick,secondary=false,disabled=false}:{children:ReactNode;icon?:ReactNode;onClick?:()=>void;secondary?:boolean;disabled?:boolean}){return <button disabled={disabled} className={`action ${secondary?'secondary':''}`} onClick={onClick}>{children}{icon&&<span className="action-icon">{icon}</span>}</button>;}
function Notice({children,onClose}:{children:ReactNode;onClose?:()=>void}){return <div className="notice" role="alert"><span>{children}</span>{onClose&&<button aria-label="Dismiss message" onClick={onClose}><X size={16}/></button>}</div>;}
function useClock(startedAt?:number){const [now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);const seconds=startedAt?Math.max(0,Math.floor((now-startedAt)/1000)):0;return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
function Meter({level=0,active=false}:{level?:number;active?:boolean}){return <div className={`meter ${active?'active':''}`} aria-label={active?'Microphone active':'Microphone inactive'}>{Array.from({length:26},(_,i)=><i key={i} style={{height:`${6+Math.sin(i*.48)**2*24}px`,opacity:active?(i/26<level?.95:.2):.23}}/>)}</div>;}

export function Projection({room,preview=false,connected=true}:{room:RoomState;preview?:boolean;connected?:boolean}){
 const segment=room.segments.at(-1);
 const prior=room.segments.at(-2);
 const [full,setFull]=useState(false);
 const outer=useRef<HTMLDivElement>(null);
 const settings=room.settings;
 const scripture=segment?.kind==='scripture';
 const fontScale=Math.min(1,Math.sqrt(160/Math.max(segment?.translation.length||1,1)));
 const captionSize=Math.max(28,settings.textSize*fontScale);
 const reference=segment?.reference;
 useLayoutEffect(()=>{
  if(preview||!outer.current)return;
  const element=outer.current;
  const fit=()=>{
   const caption=element.querySelector<HTMLElement>('.caption');
   const source=element.querySelector<HTMLElement>('.original-caption');
   const message=element.querySelector<HTMLElement>('.projection-message');
   const history=element.querySelector<HTMLElement>('.previous-phrase');
   if(!caption||!message)return;
   let size=Math.min(captionSize,window.innerWidth<640?52:captionSize);
   caption.style.fontSize=size+'px';
   if(source)source.style.fontSize=Math.min(36,Math.max(17,size*.42))+'px';
   if(history)history.style.display='';
   const overflowing=()=>element.scrollHeight>element.clientHeight+2||message.scrollHeight>message.clientHeight+2;
   if(overflowing()&&history)history.style.display='none';
   while(overflowing()&&size>26){size-=2;caption.style.fontSize=size+'px';if(source)source.style.fontSize=Math.max(15,size*.42)+'px';}
  };
  fit();const observer=new ResizeObserver(fit);observer.observe(element);
  void document.fonts.ready.then(fit);
  return()=>observer.disconnect();
 },[segment?.id,settings.textSize,settings.showOriginal,settings.showSummary,settings.logoSize,settings.logo,preview,captionSize,room.summary,room.blank]);
 const status=!connected?'Connection lost':room.mode==='demo'?'Demo':room.status==='live'?'Live':room.status==='paused'?'Paused':room.status==='ended'?'Service ended':'Ready';
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await outer.current?.requestFullscreen();setFull(Boolean(document.fullscreenElement));}catch{/* Browser may not support fullscreen. */}}
 return <div ref={outer} className={`projection theme-${settings.theme} ${preview?'preview':''} ${room.blank?'is-blank':''} motion-${settings.motion}`} style={{'--caption-size':`${captionSize}px`,'--brand-accent':settings.accentColor} as React.CSSProperties}>
  {!room.blank&&<>
   <header className={`projection-header logo-${settings.logoPosition}`}>
    <div className="church-identity">{settings.logo?<img src={settings.logo} alt={`${settings.churchName} logo`} style={{height:preview?settings.logoSize*.55:settings.logoSize}}/>:<span className="church-monogram">{settings.churchName.split(' ').slice(0,2).map(w=>w[0]).join('')}</span>}<span>{settings.churchName}</span></div>
    <span className={`projection-status ${room.status==='live'&&connected?'live':''}`}><i/>{status}</span>
   </header>
   <div className={`projection-message ${scripture?'scripture':''}`}>
    {prior&&(segment?.translation.length||0)<220&&<p className="previous-phrase" aria-hidden="true">{prior.translation}</p>}
    <div className="phrase-eyebrow">{scripture?<BookOpen size={14}/>:<span className="little-dot"/>}<span>{scripture?(segment.verified?'Scripture':'Scripture reference'):segment?.kind==='paraphrase'?'Paraphrase':languageLabel(room.targetLanguage)}</span>{reference&&<span className="verse-reference">{reference}{scripture&&!segment.verified?' · Unverified':''}</span>}</div>
    <div className="caption" aria-live={preview?'off':'polite'} lang={room.targetLanguage}>
     {segment?<span key={segment.id} className="phrase">{segment.translation.split(' ').map((word,i)=><span className="dancing-word" key={`${segment.id}-${i}`} style={{animationDelay:`${i*(scripture?95:65)}ms`}}>{word}{' '}</span>)}</span>:<span className="waiting-caption">Every voice.<br/><span>Together.</span></span>}
    </div>
    {settings.showOriginal&&<p className="original-caption" lang={room.sourceLanguage}>{segment?.source||(room.status==='live'?'Listening for the next phrase…':'A place for everyone to follow along.')}</p>}
   </div>
   {settings.showSummary&&room.summary&&<div className="projection-summary"><span className="eyebrow">The message so far <small>AI summary{room.mode==='demo'?' · Sample text':''}{room.summaryStale?' · Update delayed':''}</small></span><p>{room.summary}</p></div>}
  </>}
  {!preview&&<button className="fullscreen-button" onClick={fullscreen} aria-label={full?'Exit fullscreen':'Enter fullscreen'}><Expand size={20}/></button>}
 </div>;
}

function Login({config,onComplete,onClose}:{config:Config;onComplete:()=>Promise<void>;onClose:()=>void}){
 const [password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await post('/api/login',{password});await onComplete();onClose();}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
 return <Modal title="Welcome back." subtitle="A quiet space to bring every voice together." onClose={onClose}><form onSubmit={submit}><label className="field-label">Operator password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required autoFocus placeholder="Enter your password"/></label>{!config.operatorConfigured&&<Notice>Set the operator password in your Cloudflare deployment to enable live services. The design demo is ready to explore.</Notice>}{error&&<Notice>{error}</Notice>}<button type="submit" className="action full" disabled={busy||!config.operatorConfigured}>Sign in<span className="action-icon">{busy?<RefreshCw className="spin" size={18}/>:<ArrowRight size={18}/>}</span></button><p className="form-footnote"><ShieldCheck size={14}/> Your projector audience never needs to sign in.</p></form></Modal>;
}
function Modal({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog className="modal" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button><h2>{title}</h2>{subtitle&&<p className="modal-subtitle">{subtitle}</p>}{children}</dialog>;
}

function Pairing({room,onClose}:{room:RoomState;onClose:()=>void}){
 const [qr,setQr]=useState(''),[copied,setCopied]=useState(false);
 const url=`${location.origin}/mic/${room.id}?token=${encodeURIComponent(room.micToken||'')}`;
 useEffect(()=>{QRCode.toDataURL(url,{margin:1,width:220,color:{dark:'#233529',light:'#fffef9'}}).then(setQr);},[url]);
 return <Modal title="Your phone. Your microphone." subtitle="Scan this code on the phone near your speaker." onClose={onClose}><div className="pairing-qr">{qr&&<img src={qr} alt="QR code to connect the microphone"/>}</div><div className="pairing-steps"><p><span>1</span> Open the link and allow microphone access.</p><p><span>2</span> Keep the phone close to the speaker.</p><p><span>3</span> Keep the microphone page open.</p></div>{room.id==='demo'&&<Notice>This demo connects tabs on this browser. Sign in and create a live service to pair a separate phone.</Notice>}<button className="copy-link" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);}catch{setCopied(false);}}}><Link size={16}/><span>{url}</span>{copied?<Check size={16}/>:<Copy size={16}/>}</button></Modal>;
}

function Branding({room,onSave}:{room:RoomState;onSave:(settings:DisplaySettings)=>Promise<void>}){
 const [draft,setDraft]=useState<DisplaySettings>(room.settings),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
 const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{setDraft(room.settings);},[room.id]);
 const update=<K extends keyof DisplaySettings,>(key:K,value:DisplaySettings[K])=>{setDraft(s=>({...s,[key]:value}));setSaved(false);};
 async function uploadLogo(event:React.ChangeEvent<HTMLInputElement>){const selected=event.target.files?.[0];if(!selected)return;setError('');if(!['image/png','image/jpeg','image/webp'].includes(selected.type)){setError('Choose a PNG, JPG, or WebP image.');return;}if(selected.size>5*1024*1024){setError('Choose a logo smaller than 5 MB.');return;}try{const bitmap=await createImageBitmap(selected);const canvas=document.createElement('canvas');const scale=Math.min(1,500/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');bitmap.close();if(data.length>500000){setError('This logo has too much detail. Try a smaller image.');return;}update('logo',data);}catch{setError('We could not read that image. Please try another logo.');}}
 async function save(){setSaving(true);setError('');try{await onSave(draft);setSaved(true);}catch(e){setError(messageOf(e));}finally{setSaving(false);}}
 return <><div className="page-title"><div><span className="eyebrow">Your space, your voice</span><h1>Make it feel like home.</h1><p>A familiar welcome, in every language.</p></div><div className="title-detail"><span className="mini-orb sage"/><span>Made for your community.</span></div></div>
 <div className="branding-layout"><section className="branding-form">
 <label className="field-label">Church name<input value={draft.churchName} maxLength={70} onChange={e=>update('churchName',e.target.value)}/></label>
 <label className="field-label">Service name<input value={draft.serviceName} maxLength={70} onChange={e=>update('serviceName',e.target.value)}/></label>
 <div className="field-label">Your logo<div className="logo-control"><div className="logo-thumb">{draft.logo?<img src={draft.logo} alt="Current logo"/>:<span>GC</span>}</div><button className="text-button" onClick={()=>file.current?.click()}><Upload size={15}/>Upload logo</button>{draft.logo&&<button className="quiet-button" onClick={()=>update('logo',null)}>Remove</button>}<input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadLogo}/></div></div>
 <div className="two-fields"><div className="field-label">Logo placement<div className="segmented alignments">{(['left','center','right'] as const).map((position,i)=><button key={position} aria-label={`${position} logo`} aria-pressed={draft.logoPosition===position} onClick={()=>update('logoPosition',position)}>{i===0?<AlignLeft size={17}/>:i===1?<AlignCenter size={17}/>:<AlignRight size={17}/>}</button>)}</div></div><label className="field-label">Logo size<span className="range-value">{draft.logoSize}px</span><input type="range" min="24" max="100" value={draft.logoSize} onChange={e=>update('logoSize',Number(e.target.value))}/></label></div>
 <div className="field-label">Atmosphere<div className="theme-picker">{(['frost','sage','night'] as const).map(theme=><button key={theme} aria-pressed={draft.theme===theme} onClick={()=>update('theme',theme)}><span className={`theme-swatch ${theme}`}>{draft.theme===theme&&<Check size={16}/>}</span>{theme==='night'?'Evening':theme[0].toUpperCase()+theme.slice(1)}</button>)}</div></div>
 <label className="field-label range-label">Text size<span>{draft.textSize}px</span><input type="range" min="36" max="110" value={draft.textSize} onChange={e=>update('textSize',Number(e.target.value))}/></label>
 <label className="field-label">Word movement<select value={draft.motion} onChange={e=>update('motion',e.target.value as DisplaySettings['motion'])}><option value="fluid">Fluid — words arrive gently</option><option value="gentle">Gentle — a quieter entrance</option><option value="none">Still — no animation</option></select></label>
 <label className="toggle-row"><span>Show original language</span><input type="checkbox" role="switch" checked={draft.showOriginal} onChange={e=>update('showOriginal',e.target.checked)}/></label>
 <label className="toggle-row"><span>Show AI summary</span><input type="checkbox" role="switch" checked={draft.showSummary} onChange={e=>update('showSummary',e.target.checked)}/></label>
 <label className="color-row"><span>Accent color</span><input aria-label="Accent color" type="color" value={draft.accentColor} onChange={e=>update('accentColor',e.target.value)}/></label>
 {error&&<Notice>{error}</Notice>}<div className="save-row"><Action disabled={saving||!draft.churchName.trim()} onClick={save} icon={saved?<Check size={18}/>:<ArrowRight size={18}/>}>{saving?'Saving…':saved?'Changes saved':'Save changes'}</Action><button className="quiet-button" onClick={()=>{setDraft({...defaultSettings});setSaved(false);}}>Reset</button></div>
 </section><section className="branding-preview"><div className="preview-wrap"><Projection room={{...room,settings:draft,blank:false}} preview/></div><div className="preview-meta"><span><i/> Live preview</span><span>Projector · 16:9</span></div><div className="design-note"><span className="note-icon"><BookOpen size={20}/></span><div><h3>Let the words lead.</h3><p>Scripture carries a warm gold accent and its reference. Every phrase arrives with room to breathe.</p></div></div></section></div></>;
}

export default function App(){
 const session=useRoom();const {room,config,connected,loading,error,setError}=session;
 const [tab,setTab]=useState(location.pathname==='/settings'?'settings':location.pathname==='/display'?'display':'live');
 const [login,setLogin]=useState(false),[pairing,setPairing]=useState(false),[copied,setCopied]=useState(false),[busy,setBusy]=useState(false);
 const [input,setInput]=useState(''),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[inputMode,setInputMode]=useState<'computer'|'phone'>('computer');
 const timer=useClock(room.startedAt);
 const microphone=useMicrophone({room,token:routeRole==='mic'?routeToken:undefined,deviceId:input,onError:setError});
 useEffect(()=>{document.title=routeRole==='display'?`${room.settings.churchName} · Gather`:routeRole==='mic'?'Your microphone · Gather':'Gather — Every voice, together.';},[room.settings.churchName]);
 useEffect(()=>{if((room.status!=='live'||!connected)&&(microphone.active||microphone.connecting))microphone.stop();},[room.status,connected,microphone.active,microphone.connecting]);
 useEffect(()=>{microphone.stop();},[input,inputMode]);
 const displayUrl=`${location.origin}/display/${room.id}?token=${encodeURIComponent(room.displayToken||'')}`;
 async function listInputs(){try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());setDevices((await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput'));}catch(e){setError(messageOf(e));}}
 async function begin(){setError('');setBusy(true);try{if(room.mode==='demo'){await session.control(room.status==='live'?'pause':'start');return;}if(room.status==='live'){microphone.stop();await session.control('pause');return;}await session.control('start');if(inputMode==='computer')await microphone.start();}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
 async function liveService(){if(!config.authenticated){setLogin(true);return;}setBusy(true);try{microphone.stop();if(room.mode==='live'&&room.status==='live')await post(roomPath(room.id,'/control'),{action:'stop'});await session.createRoom();setTab('live');}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
 async function copyDisplay(){try{await navigator.clipboard.writeText(displayUrl);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError('Clipboard access is unavailable. Open the display and copy its address.');}}
 async function direction(){microphone.stop();if(room.status==='live')await session.control('pause');try{await session.switchLanguage();}catch(e){setError(messageOf(e));}}
 if(routeRole==='display')return <main className="display-route">{loading&&!isDemoRoute?<div className="display-error"><Brand/><h1>Finding your service…</h1></div>:error?<div className="display-error"><Brand/><h1>This display couldn’t connect.</h1><p>{error}</p><button onClick={()=>location.reload()}>Try again</button></div>:<Projection room={room} connected={connected}/>}</main>;
 if(routeRole==='mic')return <PhoneMicrophone room={room} connected={connected} microphone={microphone} error={error} loading={loading}/>;
 return <div className="app-shell"><header className="app-header"><a href="/" className="brand-link" aria-label="Gather home"><Brand/></a><nav aria-label="Main navigation">{[['live','Live'],['display','Display'],['settings','Settings']].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>{setTab(id);history.replaceState({},'',id==='live'?'/':`/${id}`);}}>{label}</button>)}</nav><div className="header-right"><span className="header-name">{room.settings.churchName}</span><button className="avatar" onClick={()=>config.authenticated?setTab('settings'):setLogin(true)} aria-label={config.authenticated?'Open settings':'Operator sign in'}>GC</button></div></header>
 <main className="main-content">{error&&<Notice onClose={()=>setError('')}>{error}</Notice>}
 {tab==='display'?<Branding room={room} onSave={session.saveSettings}/>:tab==='settings'?<><div className="page-title"><div><span className="eyebrow">Behind the moments</span><h1>Ready for Sunday.</h1><p>A few simple things. A room full of possibility.</p></div></div><div className="settings-layout"><section className="settings-section"><h2><Mic size={20}/> Audio & language</h2><p>Choose the voice your community will hear.</p><InputControls inputMode={inputMode} setInputMode={setInputMode} input={input} setInput={setInput} devices={devices} listInputs={listInputs} openPairing={()=>setPairing(true)} room={room}/><div className="setting-divider"/><div className="setting-line"><div><h3>Translation direction</h3><p>{languageLabel(room.sourceLanguage)} to {languageLabel(room.targetLanguage)}</p></div><button className="soft-button" onClick={direction}><RefreshCw size={15}/>Switch direction</button></div></section><section className="settings-section"><h2><ShieldCheck size={20}/> Your service</h2><p>Private controls. An open welcome.</p><div className="setting-line"><div><h3>Hosting</h3><p>Cloudflare Workers</p></div><span className="subtle-chip">Web app</span></div><div className="setting-line"><div><h3>OpenAI connection</h3><p>{config.openaiConfigured?'Server credentials configured':'API key needed for live translation'}</p></div><span className={`status-dot ${config.openaiConfigured?'green':''}`}/></div><div className="setting-line"><div><h3>Operator access</h3><p>{config.authenticated?'Signed in securely':'Explore the demo or sign in'}</p></div><button className="text-button" onClick={async()=>{if(config.authenticated){microphone.stop();await post('/api/logout');localStorage.removeItem('gather-room-id');session.demo();await session.refresh();}else setLogin(true);}}>{config.authenticated?'Sign out':'Sign in'}<ArrowUpRight size={14}/></button></div><div className="setting-divider"/><p className="privacy-note">Audio is streamed for transcription, not recorded by Gather. Clear the service to remove its current captions and summary.</p><div className="settings-service-actions"><button className="soft-button" onClick={async()=>{microphone.stop();await session.control('stop');}}><Square size={13}/>End service</button><button className="danger-button" onClick={async()=>{microphone.stop();await session.control('stop');await session.control('clear');}}>Clear service text</button>{room.id!=='demo'&&<button className="quiet-button" onClick={async()=>{try{microphone.stop();await post(roomPath(room.id,'/rotate'));session.setRoom(await api<RoomState>(roomPath(room.id)));}catch(e){setError(messageOf(e));}}}>Regenerate display & microphone links</button>}</div></section></div></>:<>
 <div className="page-title"><div><span className="eyebrow">A place for every voice</span><h1>Sunday, together<span className="accent-dot">.</span></h1><div className="service-meta"><span>{room.settings.serviceName}</span><i/><span className={`live-status ${room.status==='live'?'active':''}`}>{room.mode==='demo'?'Demo preview':room.status==='live'?'Live service':'Your next service'}{room.status==='live'&&` · ${timer}`}</span></div></div><div className="header-actions"><button className="soft-button" onClick={liveService} disabled={busy}><Plus size={16}/>{config.authenticated?'New live service':'Start a live service'}</button><span className="supporting-caption">Powered by OpenAI. Built for belonging.</span></div></div>
 <div className="studio-layout"><section className="live-workspace"><div className="workspace-toolbar"><span><i className={`status-dot ${room.status==='live'?'green':''}`}/>{room.mode==='demo'?'Sample sermon':microphone.active?'Listening to your microphone':room.micConnected?'Phone microphone connected':'Ready when you are'}</span><span className="subtle-chip">{room.mode==='demo'?'Design demo':'Live translation'}</span></div><div className="live-caption-area"><div className="caption-source"><span className="eyebrow">{languageLabel(room.sourceLanguage)} <span>· Original</span></span><p lang={room.sourceLanguage}>{room.segments.at(-1)?.source||(room.mode==='demo'?'No tenemos que caminar solos.':'Your original captions will appear here.')}</p></div><div className={`caption-target ${room.segments.at(-1)?.kind==='scripture'?'is-scripture':''}`}><span className="eyebrow">{room.segments.at(-1)?.kind==='scripture'?<><BookOpen size={13}/> Scripture · {room.segments.at(-1)?.reference}{!room.segments.at(-1)?.verified?' · Unverified':''}</>:languageLabel(room.targetLanguage)}</span><p key={room.segments.at(-1)?.id||'welcome'} lang={room.targetLanguage}>{(room.segments.at(-1)?.translation||(room.mode==='demo'?"We don't have to walk alone.":'Ready for your first words.')).split(' ').map((word,i)=><span className="dancing-word" key={i} style={{animationDelay:`${i*55}ms`}}>{word}{' '}</span>)}</p></div><div className="workspace-summary"><span className="eyebrow">The message so far <small>AI summary{room.mode==='demo'?' · Sample':''}{room.summaryStale?' · Update delayed':''}</small></span><p>{room.summary||'Your service summary will appear here as the message unfolds.'}</p></div></div><div className="command-dock"><Action onClick={begin} disabled={busy} icon={busy?<RefreshCw className="spin" size={19}/>:room.status==='live'?<Pause size={18}/>:<Play size={18}/>} >{room.status==='live'?'Pause translation':room.status==='paused'?'Resume translation':room.mode==='demo'?'Play the demo':'Start translation'}</Action><button className={`blank-button ${room.blank?'is-active':''}`} onClick={()=>session.control(room.blank?'unblank':'blank')}><EyeOff size={15}/>{room.blank?'Show display':'Blank display'}</button><a href={displayUrl} target="_blank" rel="noreferrer" className="open-display">Open display<ArrowUpRight size={17}/></a></div></section>
 <aside className="input-panel"><div className="input-heading"><span className="input-icon">{inputMode==='phone'?<Smartphone size={24}/>:<Mic size={24}/>}</span><div><h2>Your microphone</h2><p>{room.mode==='demo'?'A little rehearsal. A warm welcome.':inputMode==='phone'?room.micName||'Phone microphone':'This computer'}</p></div></div><div className="input-status"><i className={`status-dot ${microphone.active||room.micConnected?'green':''}`}/>{room.mode==='demo'?'Sample text · no microphone':microphone.active?'Connected and listening':room.micConnected?'Phone connected':'Not connected yet'}</div><Meter level={microphone.level} active={microphone.active}/><InputControls inputMode={inputMode} setInputMode={setInputMode} input={input} setInput={setInput} devices={devices} listInputs={listInputs} openPairing={()=>setPairing(true)} room={room} compact/><div className="input-divider"/><span className="eyebrow">Speaking to everyone</span><div className="language-direction"><span>{room.sourceLanguage==='es'?'Spanish':'English'}</span><ArrowRight size={17}/><span>{room.targetLanguage==='es'?'Spanish':'English'}</span></div><button className="switch-button" onClick={direction}><RefreshCw size={14}/>Switch direction</button><p className="input-footnote">{room.mode==='demo'?'Explore the experience. No audio is being captured.':'Changing direction pauses audio. Start again when you’re ready.'}</p></aside></div>
 <div className="lower-studio"><section className="display-card"><div className="section-heading"><div><span className="eyebrow">The room sees this</span><h2>A shared understanding.</h2></div><button className="text-button" onClick={()=>setTab('display')}>Personalize<ArrowUpRight size={15}/></button></div><div className="small-projection"><Projection room={room} preview connected={connected}/></div><div className="display-link"><Link size={15}/><span>{location.host}/display/{room.id}</span><button onClick={copyDisplay} aria-label="Copy display link">{copied?<Check size={16}/>:<Copy size={16}/>}</button></div></section><section className="moments-panel"><div className="section-heading"><div><span className="eyebrow">As the message unfolds</span><h2>Recent moments.</h2></div><span className="moment-count">{room.segments.length.toString().padStart(2,'0')}</span></div>{room.segments.length?<div className="moments-list">{room.segments.slice(-3).reverse().map(segment=><div className="moment" key={segment.id}><span className={`moment-icon ${segment.kind==='scripture'?'gold':''}`}>{segment.kind==='scripture'?<BookOpen size={15}/>:<span/>}</span><div><p>{segment.translation}</p><small>{segment.kind==='scripture'?segment.reference:new Date(segment.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></div></div>)}</div>:<div className="empty-moments"><div className="speech-sculpture"><i/><i/></div><p>Every word has a place here.</p><span>Start the demo to see the message unfold.</span></div>}{room.mode==='demo'&&<button className="text-button next-phrase" onClick={()=>session.updateDemo(nextDemo)}>Next sample phrase<ArrowRight size={15}/></button>}</section></div>
 </>}
 <footer className="app-footer"><Brand small/><span>Every voice, together.</span><span className="footer-end">Open source. Open hearts.</span></footer></main>
 {login&&<Login config={config} onComplete={session.refresh} onClose={()=>setLogin(false)}/>} {pairing&&<Pairing room={room} onClose={()=>setPairing(false)}/>} </div>;
}

function InputControls({inputMode,setInputMode,input,setInput,devices,listInputs,openPairing,room,compact=false}:{inputMode:'computer'|'phone';setInputMode:(mode:'computer'|'phone')=>void;input:string;setInput:(input:string)=>void;devices:MediaDeviceInfo[];listInputs:()=>void;openPairing:()=>void;room:RoomState;compact?:boolean}){
 return <div className={`input-controls ${compact?'compact':''}`}><div className="input-mode segmented"><button aria-pressed={inputMode==='computer'} onClick={()=>setInputMode('computer')}><Monitor size={14}/>Computer</button><button aria-pressed={inputMode==='phone'} onClick={()=>setInputMode('phone')}><Smartphone size={14}/>Phone</button></div>{inputMode==='phone'?<button className="soft-button full" onClick={openPairing}><Link size={15}/>Connect a phone<ArrowUpRight size={14}/></button>:<>{devices.length>0?<label className="sr-only-label"><span>Microphone input</span><select aria-label="Microphone input" value={input} onChange={e=>setInput(e.target.value)}><option value="">Default microphone</option>{devices.map(device=><option key={device.deviceId} value={device.deviceId}>{device.label||'Microphone'}</option>)}</select></label>:<button className="quiet-button choose-input" onClick={listInputs}>Choose audio input<ChevronDown size={14}/></button>}</>}</div>;
}

function PhoneMicrophone({room,connected,microphone,error,loading}:{room:RoomState;connected:boolean;microphone:ReturnType<typeof useMicrophone>;error:string;loading:boolean}){
 const timer=useClock(room.startedAt);const [localError,setLocalError]=useState('');
 async function toggle(){if(microphone.active){microphone.toggleMute();return;}if(room.id==='demo'){setLocalError('This is a microphone preview. Create a live service from the operator screen to stream audio.');return;}try{setLocalError('');await microphone.start();}catch(e){setLocalError(messageOf(e));}}
 return <main className="phone-route"><div className="phone-shell"><header><Brand/><span className="subtle-chip">Microphone</span></header><div className="phone-title"><span className="eyebrow">Your voice belongs here</span><h1>{microphone.active?"You're connected.":'Bring your voice.'}</h1><p>{room.settings.churchName}</p></div><div className="phone-sculpture speech-sculpture"><i/><i/></div><div className="phone-status"><span className={`status-dot ${microphone.active?'green':''}`}/>{loading?'Connecting…':microphone.active?microphone.muted?'Microphone is muted':'Microphone is live':connected?room.status==='live'?'Ready to connect':'Waiting for the operator to start':'Waiting for a connection'}</div><Meter active={microphone.active&&!microphone.muted} level={microphone.level}/><div className="phone-timer">{timer}</div><p className="phone-helper">Keep this page open and your phone<br/>close to the speaker.</p>{(error||localError)&&<Notice>{error||localError}</Notice>}<Action onClick={toggle} disabled={loading||!connected||microphone.connecting||(room.id!=='demo'&&room.status!=='live')} icon={microphone.connecting?<RefreshCw className="spin" size={20}/>:microphone.active&&!microphone.muted?<MicOff size={20}/>:<Mic size={20}/>}>{microphone.connecting?'Connecting…':microphone.active?microphone.muted?'Resume microphone':'Mute microphone':'Connect microphone'}</Action><p className="phone-privacy"><ShieldCheck size={13}/> Audio is streamed, not recorded by Gather.</p></div></main>;
}
