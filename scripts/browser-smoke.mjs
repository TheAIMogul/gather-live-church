import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.GATHER_TEST_URL || 'http://127.0.0.1:8787';
const live=process.argv.includes('--live');
await fs.mkdir('output/playwright',{recursive:true});
const args=live?['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${path.resolve('output/sermon-test.wav')}`]:[];
const browser=await chromium.launch({headless:true,channel:'chrome',args});
const failures=[];
let operator,room;
const captureErrors=page=>page.on('pageerror',error=>failures.push(error.message));
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
try{
 const demo=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 const page=await demo.newPage();captureErrors(page);
 await page.goto(base);await page.getByRole('heading',{name:/Sunday, together/}).waitFor();await page.getByRole('button',{name:'Play the demo',exact:true}).click();
 await page.screenshot({path:'output/playwright/operator.png',fullPage:true});await noOverflow(page);
 await page.getByRole('button',{name:'Pause translation'}).click();
 await page.getByRole('button',{name:'Next sample phrase'}).click();
 await expect(page.locator('.caption-target')).toContainText('Psalm 23:1');
 await page.getByRole('button',{name:'Display',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Make it feel like home.'})).toBeVisible();
 await page.getByRole('button',{name:'Evening',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('button',{name:'Changes saved'})).toBeVisible();
 await page.screenshot({path:'output/playwright/branding.png',fullPage:true});
 await page.reload();await expect(page.getByRole('heading',{name:'Make it feel like home.'})).toBeVisible();
 const display=await demo.newPage();captureErrors(display);await display.goto(base+'/display/demo?token=demo');
 await expect(display.locator('.projection')).toHaveClass(/theme-night/);
 await expect(display.locator('.caption')).toContainText('The LORD is my shepherd');
 await display.screenshot({path:'output/playwright/projector.png',fullPage:true});await noOverflow(display);
 await page.getByRole('button',{name:'Live',exact:true}).click();
 await page.getByRole('button',{name:'Blank display'}).click();
 await expect(display.locator('.projection')).toHaveClass(/is-blank/);
 await page.getByRole('button',{name:'Show display'}).click();
 await expect(display.locator('.projection')).not.toHaveClass(/is-blank/);
 await page.setViewportSize({width:390,height:844});await noOverflow(page);
 await page.screenshot({path:'output/playwright/operator-mobile.png',fullPage:true});
 await page.goto(base+'/mic/demo?token=demo');await expect(page.getByRole('button',{name:'Connect microphone'})).toBeVisible();await noOverflow(page);
 await page.screenshot({path:'output/playwright/phone.png',fullPage:true});
 console.log('PASS: demo, scripture styling, branding save/reload, separate projector updates, blanking, phone and mobile layouts.');
 await demo.close();
 if(live){
  operator=await browser.newContext({viewport:{width:1440,height:1000}});
  const setup=await operator.request.get(base+'/api/config');expect(setup.ok()).toBe(true);
  const created=await operator.request.post(base+'/api/rooms',{data:{}});expect(created.status()).toBe(201);room=await created.json();
  await operator.addInitScript(id=>localStorage.setItem('gather-room-id',id),room.id);
  const op=await operator.newPage();captureErrors(op);await op.goto(base);await expect(op.getByRole('button',{name:'Start translation',exact:true})).toBeVisible();
  await op.getByRole('button',{name:'Phone',exact:true}).click();
  await op.getByRole('button',{name:'Start translation',exact:true}).click();
  const audience=await browser.newContext({viewport:{width:1280,height:720}});
  const projection=await audience.newPage();captureErrors(projection);await projection.goto(`${base}/display/${room.id}?token=${room.displayToken}`);
  const phone=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});
  const mic=await phone.newPage();captureErrors(mic);await mic.goto(`${base}/mic/${room.id}?token=${room.micToken}`);
  await mic.getByRole('button',{name:'Connect microphone',exact:true}).click();
  await expect(mic.getByRole('button',{name:'Mute microphone'})).toBeVisible({timeout:30000});
  console.log('PASS: separate phone browser connected to actual OpenAI WebRTC session.');
  await expect.poll(async()=>{const res=await operator.request.get(base+'/api/rooms/'+room.id);const state=await res.json();return state.segments.some(segment=>/Dios|Señor|pastor/i.test(segment.source)&&/God|Lord|shepherd/i.test(segment.translation));},{timeout:50000,intervals:[1000]}).toBe(true);
  await expect(projection.locator('.caption')).not.toContainText('Every voice.');
  await projection.screenshot({path:'output/playwright/live-projector.png',fullPage:true,animations:'disabled'});
  console.log('PASS: synthetic Spanish speech became contextual English captions on a separate audience browser.');
  await mic.getByRole('button',{name:'Mute microphone',exact:true}).click();
  await expect(mic.getByRole('button',{name:'Resume microphone',exact:true})).toBeVisible();
  expect((await (await operator.request.get(base+'/api/rooms/'+room.id)).json()).status).toBe('live');
  await mic.getByRole('button',{name:'Resume microphone',exact:true}).click();
  await expect(mic.getByRole('button',{name:'Mute microphone',exact:true})).toBeVisible();
  console.log('PASS: phone mute/resume preserves the active service.');
  await op.getByRole('button',{name:'Pause translation'}).click();
  await expect(mic.getByRole('button',{name:'Connect microphone',exact:true})).toBeVisible({timeout:10000});
  const state=await (await operator.request.get(base+'/api/rooms/'+room.id)).json();expect(state.status).toBe('paused');expect(state.micConnected).toBe(false);
  await op.getByRole('button',{name:'Computer',exact:true}).click();
  await operator.grantPermissions(['microphone']);
  await op.getByRole('button',{name:'Resume translation',exact:true}).click();
  await expect(op.locator('.input-status')).toContainText('Connected and listening',{timeout:30000});
  await op.getByRole('button',{name:'Pause translation',exact:true}).click();
  console.log('PASS: computer microphone also connects and pauses.');
  await operator.request.post(base+'/api/rooms/'+room.id+'/control',{data:{action:'clear'}});
  const cleared=await (await operator.request.get(base+'/api/rooms/'+room.id)).json();expect(cleared.segments).toEqual([]);expect(cleared.summary).toBe('');
  console.log('PASS: operator pause stopped phone capture; clear removed nonempty transcript and summary.');
  await phone.close();await audience.close();
 }
 expect(failures).toEqual([]);
 console.log('PASS: no browser runtime exceptions.');
}finally{
 if(operator&&room){await operator.request.post(base+'/api/rooms/'+room.id+'/control',{data:{action:'stop'}}).catch(()=>{});await operator.request.post(base+'/api/rooms/'+room.id+'/control',{data:{action:'clear'}}).catch(()=>{});}
 await browser.close();
}
