import {defaultSettings,type RoomState,type Segment} from './types';
const demoKey='gather-demo-room-v1';
export const examples:[string,string,Segment['kind'],string|null,boolean][]=[
 ['No tenemos que caminar solos.',"We don't have to walk alone.",'speech',null,false],
 ['Jehová es mi pastor; nada me faltará.','The LORD is my shepherd; I shall not want.','scripture','Psalm 23:1 · KJV / RV1909',true],
 ['Hay valentía en cuidarnos unos a otros.','There is courage in caring for one another.','speech',null,false],
 ['Que tu bondad sea la respuesta a la oración de alguien.',"Let your kindness become someone’s answered prayer.",'speech',null,false],
 ['Podemos ser una luz para nuestra comunidad.','We can be a light for our community.','paraphrase','Possible reference · Matthew 5:14',false],
];
export function makeDemo():RoomState{return {id:'demo',status:'idle',mode:'demo',sourceLanguage:'es',targetLanguage:'en',settings:{...defaultSettings},segments:[],summary:"God's care gives us courage to care for one another.",blank:false,micConnected:false,micName:'Demo audio',displayToken:'demo',micToken:'demo'};}
export function readDemo():RoomState{
 try{
  const data=JSON.parse(localStorage.getItem(demoKey)||'null');
  if(data?.mode!=='demo')return makeDemo();
  const settings={...defaultSettings,...data.settings};
  if(!data.typographyVersion&&settings.textSize===68)settings.textSize=defaultSettings.textSize;
  const state={...makeDemo(),...data,settings};
  if(!data.typographyVersion)saveDemo(state);
  return state;
 }catch{return makeDemo();}
}
export function saveDemo(state:RoomState){localStorage.setItem(demoKey,JSON.stringify({...state,typographyVersion:2}));}
export function nextDemo(state:RoomState):RoomState{const example=examples[state.segments.length%examples.length];const reversed=state.sourceLanguage==='en';const segment:Segment={id:crypto.randomUUID(),source:example[reversed?1:0],translation:example[reversed?0:1],kind:example[2],reference:example[3],verified:example[4],timestamp:Date.now()};return {...state,segments:[...state.segments.slice(-99),segment],summaryUpdatedAt:Date.now()};}
