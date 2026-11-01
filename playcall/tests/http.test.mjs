import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
test('HTTP rooms: consent, isolation, input validation, same-revision agreement, relay gating, expiry headers',async()=>{
  const {server}=createApp({});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const root=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,data,token,origin)=>fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
  try{
    let res=await fetch(root+'/');assert.equal(res.status,200);assert.match(res.headers.get('permissions-policy'),/camera=\(\)/);assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(root+'/lib/scenario.mjs')).status,404);
    assert.equal((await fetch(root+'/.env')).status,404);
    assert.equal((await post('/api/rooms',{consent:true,mode:'text'},null,'https://evil.example')).status,403);
    assert.equal((await post('/api/rooms',{consent:false,mode:'text'})).status,400);
    assert.equal((await post('/api/rooms',{consent:true,mode:'voice'})).status,503);
    const a=await (await post('/api/rooms',{consent:true,mode:'text'})).json();
    const b=await (await post('/api/join',{consent:true,code:a.code})).json();
    assert.notEqual(a.token,b.token);assert.equal(b.peer.objectives,undefined);assert.equal(b.you.id,'morgan');
    assert.equal((await fetch(root+`/api/room?code=${a.code}`)).status,401);
    assert.equal((await fetch(root+`/api/relay?code=${a.code}`,{headers:{Authorization:`Bearer ${a.token}`}})).status,503);
    const action=async(who,type,data={})=>post('/api/action',{code:a.code,type,...data},who.token);
    await action(a,'ready');await action(b,'ready');
    assert.equal((await action(a,'propose',{deal:{price:1,package:'phased'}})).status,400);
    await action(a,'message',{text:'<img src=x onerror=alert(1)>'});
    await action(a,'propose',{deal:{price:500,package:'phased'}});await action(a,'confirm',{revision:1});
    res=await action(b,'confirm',{revision:0});assert.equal(res.status,409);
    const result=await (await action(b,'confirm',{revision:1})).json();
    assert.deepEqual(result.result.scores,{alex:40,morgan:60});assert.equal(result.result.otherObjectives,null);assert.equal(result.result.coaching,'unavailable');
  }finally{await new Promise(r=>server.close(r));}
});
