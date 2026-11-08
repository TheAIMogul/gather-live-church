import {ArrowRight,ArrowUpRight,Check,Mic,Monitor,Play,Smartphone,BookOpen} from 'lucide-react';

type Props={sourceLanguage:string;inputMode:'computer'|'phone';busy:boolean;onDirection:()=>void;onInput:(mode:'computer'|'phone')=>void;onStart:()=>void;onDemo:()=>void};

export function Welcome({sourceLanguage,inputMode,busy,onDirection,onInput,onStart,onDemo}:Props){
 const spanish=sourceLanguage==='es';
 return <section className="welcome">
  <div className="welcome-intro"><span className="eyebrow">LIVE TRANSLATION FOR YOUR COMMUNITY</span><h1>Every word.<br/>Everyone <em>belongs.</em></h1><p>Speak in Spanish or English. Gather brings the message to your whole room with beautiful live captions, translation, and summaries.</p></div>
  <div className="welcome-stage" aria-label="Example of the audience display">
   <div className="stage-top"><span><span className="stage-symbol">g.</span> Your community</span><span className="stage-example">EXAMPLE DISPLAY</span></div>
   <div className="stage-words"><span className="eyebrow">{spanish?'SPANISH → ENGLISH':'ENGLISH → SPANISH'}</span><p key={sourceLanguage}>{(spanish?'There is a place for you here.':'Aquí hay un lugar para ti.').split(' ').map((word,i)=><span className="dancing-word" key={i} style={{animationDelay:`${i*90}ms`}}>{word}{' '}</span>)}</p><span className="stage-original">{spanish?'Aquí hay un lugar para ti.':'There is a place for you here.'}</span></div>
   <div className="stage-bottom"><span><BookOpen size={16}/> Scripture gets its own spotlight.</span><span>Made for the big screen <ArrowUpRight size={15}/></span></div>
  </div>
  <div className="welcome-start"><div className="welcome-start-heading"><span className="step-number">01</span><div><h2>Let’s bring everyone together.</h2><p>Choose two things. You’re ready to begin.</p></div></div>
   <div className="welcome-options"><div className="welcome-option"><span className="setup-label">What language is the speaker using?</span><div className="welcome-languages" role="group" aria-label="Speaker language"><button aria-pressed={spanish} disabled={busy} onClick={()=>{if(!spanish)onDirection();}}>Spanish <span>→ English</span>{spanish&&<Check size={16}/>}</button><button aria-pressed={!spanish} disabled={busy} onClick={()=>{if(spanish)onDirection();}}>English <span>→ Spanish</span>{!spanish&&<Check size={16}/>}</button></div></div>
   <div className="welcome-option"><span className="setup-label">Where will the sound come from?</span><div className="welcome-inputs" role="group" aria-label="Microphone source"><button aria-pressed={inputMode==='computer'} disabled={busy} onClick={()=>onInput('computer')}><Monitor size={21}/><span>This device<small>Built-in or connected mic</small></span>{inputMode==='computer'&&<Check size={16}/>}</button><button aria-pressed={inputMode==='phone'} disabled={busy} onClick={()=>onInput('phone')}><Smartphone size={21}/><span>A phone<small>Connect with a QR code</small></span>{inputMode==='phone'&&<Check size={16}/>}</button></div></div></div>
   <div className="welcome-start-actions"><button className="welcome-primary" disabled={busy} onClick={onStart}>{busy?'Getting ready…':'Start a live service'}<ArrowRight size={21}/></button><span>No account. No password.<br/>Your audience simply opens a link.</span></div>
  </div>
  <div className="welcome-how"><div><span className="step-number">02</span><Mic size={24}/><h3>Let the speaker speak.</h3><p>Allow microphone access on this device, or scan the code with a phone near the speaker.</p></div><div><span className="step-number">03</span><Monitor size={24}/><h3>Give the words a screen.</h3><p>Open your display link on a projector, TV, or another browser. Go full screen. Everyone follows along.</p></div><button onClick={onDemo} className="welcome-demo"><span className="demo-play"><Play size={20}/></span><span>See it in action<small>Try the sample sermon. No microphone needed.</small></span><ArrowUpRight size={21}/></button></div>
 </section>;
}
