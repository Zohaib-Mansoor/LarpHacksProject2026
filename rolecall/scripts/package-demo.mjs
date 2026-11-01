import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const [html,css,app,fixtures,refinement]=await Promise.all(['public/index.html','public/style.css','public/app.js','public/demo-data.js','public/refinement.css'].map(p=>readFile(new URL(p,root),'utf8')));
const data=fixtures.replace('export const demoCharacters','const fixtureCharacters').replace('export const sampleLines','const fixtureLines');
const script=data+'\n'+app.replace("const data=await import('/demo-data.js');demoCharacters=data.demoCharacters;sampleLines=data.sampleLines;",'demoCharacters=fixtureCharacters;sampleLines=fixtureLines;');
new vm.Script(script);
const packed=html.replace('<html lang="en">','<html lang="en" data-standalone="true">')
  .replace('<link rel="stylesheet" href="/style.css">',`<style>${css}</style>`)
  .replace('<link rel="stylesheet" href="/refinement.css">',`<style>${refinement}</style>`)
  .replace('<script type="module" src="/app.js"></script>','')
  .replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">','')
  .replace('</body>',`<script type="module">${script.replaceAll('</script','<\\/script')}</script></body>`);
await mkdir(new URL('artifacts/',root),{recursive:true});
await writeFile(new URL('artifacts/rolecall-demo.html',root),packed);
console.log(`Packaged standalone interactive demo: artifacts/rolecall-demo.html (${Buffer.byteLength(packed)} bytes). No network or microphone needed.`);
