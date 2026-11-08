// Explicit integration check. Uses the local ignored secret file; never logs credentials.
import fs from 'node:fs/promises';
import { transform } from 'esbuild';
const env = Object.fromEntries((await fs.readFile('.dev.vars', 'utf8')).split('\n').filter(line => line.includes('=')).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const source = await fs.readFile('worker/openai.ts','utf8');
await fs.mkdir('output', {recursive:true});
await fs.writeFile('output/openai-smoke-module.mjs',(await transform(source,{loader:'ts',target:'es2022',format:'esm'})).code);
const {createRealtimeSession,interpretPhrase,summarize}=await import('../output/openai-smoke-module.mjs');
try {
  const session=await createRealtimeSession(env,{sourceLanguage:'es',targetLanguage:'en'});
  if (!session.value || !session.callUrl.endsWith('/translations/calls')) throw new Error('Invalid realtime session');
  console.log('PASS: live ephemeral Realtime translation session minted.');
  const start=Date.now();
  const phrase=await interpretPhrase(env,{text:'No tenemos que caminar solos. Dios está con nosotros.',sourceLanguage:'es',targetLanguage:'en',context:[]});
  if (!phrase.translation || phrase.verified!==false) throw new Error('Invalid interpretation');
  console.log('PASS: Spanish phrase interpreted in '+(Date.now()-start)+'ms; kind='+phrase.kind+'.');
  const scripture=await interpretPhrase(env,{text:'El Señor es mi pastor; nada me faltará.',sourceLanguage:'es',targetLanguage:'en',context:[]});
  if(scripture.verified!==false) throw new Error('Unverified reference marked verified');
  console.log('PASS: scripture interpretation returned '+scripture.kind+'; reference='+scripture.reference+'; verification remains false.');
  const result=await summarize(env,{segments:[{source:'No tenemos que caminar solos. Dios está con nosotros.',translation:phrase.translation}],language:'en'});
  if(!result.summary)throw new Error('Missing summary');
  console.log('PASS: rolling summary generated.');
} catch(error) {
  console.error('OpenAI smoke check failed:',error.code || error.name,error.message);
  process.exitCode=1;
}
