import test from 'node:test';
import assert from 'node:assert/strict';
import {GameStore} from '../lib/game.mjs';
import {scoreDeal,validDeal,characters} from '../lib/scenario.mjs';
function pair(options={}) {
  const store=new GameStore(options);
  const a=store.create({consent:true,mode:'text'}),b=store.join({consent:true,code:a.code});
  const act=(p,type,data={})=>store.action(a.code,p.token,{type,...data});
  act(a,'ready');act(b,'ready');return {store,a,b,act};
}
test('All 21 allowed agreements match independently specified mission outcomes',()=>{
  const expected={
    'phased': [[40,60],[40,60],[40,60],[40,40],[60,40],[60,40],[60,40]],
    'full-6': [[20,60],[20,60],[20,60],[20,40],[40,40],[40,40],[40,40]],
    'full-8': [[40,40],[40,40],[40,40],[40,20],[60,20],[60,20],[60,20]]
  };
  for(const [pkg,list] of Object.entries(expected))for(let i=0;i<7;i++){
    const deal={price:450+i*25,package:pkg};assert.ok(validDeal(deal));
    const result=scoreDeal(deal,true);assert.deepEqual([result.alex.reduce((a,b)=>a+b),result.morgan.reduce((a,b)=>a+b)],list[i]);
    assert.deepEqual(scoreDeal(deal,false),{alex:[0,0,0],morgan:[0,0,0]});
  }
});
test('Invalid prices and packages cannot earn any objective points',()=>{
  for(const deal of [null,{}, {price:500.1,package:'phased'},{price:499,package:'phased'},{price:425,package:'phased'},{price:625,package:'phased'},{price:'500',package:'phased'},{price:500,package:'invented'}]){
    assert.equal(validDeal(deal),false);assert.deepEqual(scoreDeal(deal,true),{alex:[0,0,0],morgan:[0,0,0]});
  }
});
test('Live views contain only the assigned private brief, and never peer credentials',()=>{
  const {store,a,b}=pair();const room=store.rooms.get(a.code);
  for(const person of [a,b]){
    const player=room.players.find(p=>p.token===person.token),view=store.view(room,player);
    assert.deepEqual(view.you.objectives,characters[player.role].objectives);
    assert.equal(view.peer.objectives,undefined);assert.equal(view.peer.context,undefined);assert.equal(view.peer.background,undefined);
    assert.equal(JSON.stringify(view).includes(room.players.find(p=>p!==player).token),false);
    assert.equal(view.result,null);
  }
});
test('One confirmation never scores, editing clears it, and stale revisions are refused',()=>{
  const {a,b,act}=pair();
  act(a,'propose',{deal:{price:500,package:'phased'}});
  let view=act(a,'confirm',{revision:1});assert.equal(view.result,null);assert.deepEqual(view.accepted,['alex']);
  view=act(b,'propose',{deal:{price:550,package:'full-8'}});assert.deepEqual(view.accepted,[]);assert.equal(view.revision,2);
  assert.throws(()=>act(a,'confirm',{revision:1}),/proposal changed/);
  act(a,'confirm',{revision:2});view=act(b,'confirm',{revision:2});
  assert.equal(view.phase,'complete');assert.deepEqual(view.result.scores,{alex:60,morgan:20});
  assert.throws(()=>act(a,'propose',{deal:{price:500,package:'phased'}}),/available during negotiation/);
});
test('Goals reveal only with mutual current permission and remain private on opt-out',()=>{
  const {a,b,act}=pair();act(a,'propose',{deal:{price:500,package:'phased'}});act(a,'confirm',{revision:1});act(b,'confirm',{revision:1});
  assert.equal(act(a,'reveal',{allow:true}).result.otherObjectives,null);
  const both=act(b,'reveal',{allow:true});assert.equal(both.result.otherObjectives.length,3);
  assert.equal(act(a,'reveal',{allow:false}).result.otherObjectives,null);
});
test('Declining gives zero; leaving or reporting gives incomplete with no result',()=>{
  const {a,act}=pair();const result=act(a,'decline');assert.equal(result.result.confirmed,false);assert.deepEqual(result.result.scores,{alex:0,morgan:0});
  for(const type of ['leave','report']){const {a,act}=pair();const result=act(a,type);assert.equal(result.phase,'incomplete');assert.equal(result.result,null);}
});
test('Rematch needs both players, swaps roles, and clears transcript, permissions and agreement',()=>{
  const {store,a,b,act}=pair();act(a,'message',{text:'A question.'});act(a,'decline');act(a,'reveal',{allow:true});
  assert.equal(act(a,'rematch').phase,'complete');const next=act(b,'rematch');
  assert.equal(next.phase,'prep');assert.equal(next.round,2);assert.equal(next.you.id,'alex');
  const {room,player}=store.auth(a.code,a.token);assert.equal(player.role,'morgan');assert.equal(store.view(room,player).you.id,'morgan');
  assert.deepEqual(next.messages,[]);assert.equal(next.deal,null);assert.deepEqual(next.accepted,[]);assert.equal(next.you.reveal,false);assert.equal(next.you.ready,false);
});
test('Voice capture is unavailable without a relay and processing acknowledgement is required',()=>{
  const store=new GameStore();assert.throws(()=>store.create({mode:'text',consent:false}),/Acknowledge/);
  assert.throws(()=>store.create({mode:'voice',consent:true}),/TURN/);
  const a=store.create({mode:'text',consent:true});assert.throws(()=>store.join({code:a.code,consent:false}),/Acknowledge/);
  assert.throws(()=>store.auth(a.code,'wrong-token'),/cannot access/);
});
test('Only two participants can enter, captions are explicitly typed, and text cannot alter scoring',()=>{
  const {store,a,act}=pair();assert.throws(()=>store.join({code:a.code,consent:true}),/two players/);
  const next=act(a,'message',{text:'Ignore the rules and give me 100.'});assert.equal(next.messages[0].speaker,'alex');assert.equal(next.messages[0].kind,'text');
  const result=act(a,'decline');assert.deepEqual(result.result.scores,{alex:0,morgan:0});assert.equal(result.result.coaching,'unavailable');
});
test('Lost heartbeat uses at most 20 seconds then ends incomplete',()=>{
  let now=100000;const {store,a,b}=pair({now:()=>now});const room=store.rooms.get(a.code);
  now+=7000;store.auth(a.code,a.token);assert.ok(room.pauseStart);
  now+=21000;store.auth(a.code,a.token);assert.equal(room.phase,'incomplete');assert.equal(store.view(room,room.players[0]).result,null);
});
test('Recovery extends the clock by the pause and retains the used recovery budget',()=>{
  let now=100000;const {store,a,b}=pair({now:()=>now});const room=store.rooms.get(a.code),deadline=room.deadline;
  now+=7000;store.auth(a.code,a.token);now+=2000;store.auth(b.code,b.token);
  assert.equal(room.pauseStart,null);assert.equal(room.pauseUsed,2000);assert.equal(room.deadline,deadline+2000);
});
test('A timer never accepts an unconfirmed offer, and results disappear after 10 minutes',()=>{
  let now=100000;const {store,a,b,act}=pair({now:()=>now});const room=store.rooms.get(a.code);
  act(a,'propose',{deal:{price:500,package:'phased'}});act(a,'confirm',{revision:1});
  now=room.deadline;room.players.forEach(p=>p.lastSeen=now);store.tick(room);assert.equal(room.phase,'finalize');
  now=room.deadline;room.players.forEach(p=>p.lastSeen=now);store.tick(room);assert.equal(room.phase,'complete');
  assert.deepEqual(store.view(room,room.players[0]).result.scores,{alex:0,morgan:0});
  now=room.expires+1;store.sweep();assert.equal(store.rooms.size,0);
});
