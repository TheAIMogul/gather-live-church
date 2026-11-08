import {afterEach,describe,expect,it,vi} from 'vitest';
import {makeDemo,readDemo,saveDemo} from '../src/demo';

function storedDemo(textSize:number){
 let value=JSON.stringify({...makeDemo(),settings:{...makeDemo().settings,textSize}});
 vi.stubGlobal('localStorage',{getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}});
}
afterEach(()=>vi.unstubAllGlobals());
describe('larger presentation defaults',()=>{
 it('migrates the legacy default once but preserves a later explicit choice',()=>{
  storedDemo(68);
  const upgraded=readDemo();
  expect(upgraded.settings.textSize).toBe(110);
  saveDemo({...upgraded,settings:{...upgraded.settings,textSize:68}});
  expect(readDemo().settings.textSize).toBe(68);
 });
 it('preserves an existing custom presentation size',()=>{
  storedDemo(84);
  expect(readDemo().settings.textSize).toBe(84);
 });
});
