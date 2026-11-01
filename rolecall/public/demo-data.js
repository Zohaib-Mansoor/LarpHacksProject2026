// Authored, public demonstration fixtures. Loaded only when someone opens the demo.
// Live room briefs come from the authenticated server view, never this fixture.
export const demoCharacters = {
  alex: {
    id:'alex',name:'Alex Vega',short:'Alex',role:'Aerospace engineer',employer:'Aster Aerospace',
    context:'Win a strong contract and give your team time to refine the full prototype.',
    background:[{title:'Aster-2',text:'You worked on a communications demonstration. Staged delivery is familiar territory.'},{title:'Your connection',text:'You met Priya, Meridian’s operations lead, at an industry expo.'}],
    cue:'Before I give you a proposal, what do you need to show by your deadline?',
    objectives:['Close a mutually confirmed deal','Agree a price of at least $5.50M','Deliver the full prototype at month 8']
  },
  morgan: {
    id:'morgan',name:'Morgan Reed',short:'Morgan',role:'Venture client',employer:'Meridian Ventures',
    context:'Your investor presentation is at month 6. A convincing demo is enough; the full prototype can come later. Choose when to reveal this.',
    background:[{title:'The partner showcase',text:'You ran a technology showcase. A convincing demonstration can tell a strong story.'},{title:'Your connection',text:'Priya, your operations lead, recommended Aster Aerospace.'}],
    cue:'Our presentation is in six months. What can you put in front of the investors?',
    objectives:['Close a mutually confirmed deal','Agree a price of at most $5.00M','Receive a first deliverable by month 6']
  }
};
export const sampleLines = [
  {speaker:'alex',time:'00:12',kind:'sample speech',text:'Priya mentioned your presentation is at month six. Do you need the full prototype, or would a demonstration work?'},
  {speaker:'morgan',time:'00:29',kind:'sample speech',text:'A convincing demonstration is enough for the investors. We can wait until month eight for the full prototype.'},
  {speaker:'alex',time:'00:48',kind:'sample speech',text:'On Aster-2, we split delivery into stages. A demo at six and the full prototype at eight would give us refinement time. We can offer that for $5.50M.'},
  {speaker:'morgan',time:'01:05',kind:'sample speech',text:'That schedule works. For our showcase budget, I can agree at $5.00M.'},
  {speaker:'alex',time:'01:18',kind:'sample speech',text:'Agreed: $5.00M, demonstration at month six, full prototype at month eight. Can you confirm those terms?'},
  {speaker:'morgan',time:'01:26',kind:'sample speech',text:'Confirmed: $5.00M, demonstration at six and full prototype at eight.'}
];
