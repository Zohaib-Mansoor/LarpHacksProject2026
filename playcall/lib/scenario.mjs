export const scenarioVersion = 'satellite-1.0';
export const rubricVersion = 'personal-1.0';
export const packages = [
  { id: 'phased', name: 'Staged delivery', detail: 'Demo at month 6 · Full prototype at month 8', first: 6, full: 8 },
  { id: 'full-6', name: 'Full prototype · month 6', detail: 'One complete delivery at month 6', first: 6, full: 6 },
  { id: 'full-8', name: 'Full prototype · month 8', detail: 'One complete delivery at month 8', first: 8, full: 8 }
];
export const characters = {
  alex: {
    id: 'alex', name: 'Alex Vega', short: 'Alex', role: 'Aerospace engineer', employer: 'Aster Aerospace',
    context: 'Win a strong contract and give your team time to refine the full prototype.',
    background: [
      { title: 'Aster-2', text: 'You worked on a communications demonstration. Staged delivery is familiar territory.' },
      { title: 'Your connection', text: 'You met Priya, Meridian’s operations lead, at an industry expo.' }
    ],
    cue: 'Before I give you a proposal, what do you need to show by your deadline?',
    objectives: ['Close a mutually confirmed deal', 'Agree a price of at least $5.50M', 'Deliver the full prototype at month 8']
  },
  morgan: {
    id: 'morgan', name: 'Morgan Reed', short: 'Morgan', role: 'Venture client', employer: 'Meridian Ventures',
    context: 'Your investor presentation is at month 6. A convincing demo is enough; the full prototype can come later. Choose when to reveal this.',
    background: [
      { title: 'The partner showcase', text: 'You ran a public technology showcase. You know a convincing demonstration can tell a strong story.' },
      { title: 'Your connection', text: 'Priya, your operations lead, recommended Aster Aerospace.' }
    ],
    cue: 'Our presentation is in six months. What can you put in front of the investors?',
    objectives: ['Close a mutually confirmed deal', 'Agree a price of at most $5.00M', 'Receive a first deliverable by month 6']
  }
};
export function validDeal(deal) {
  return !!deal && Number.isInteger(deal.price) && deal.price >= 450 && deal.price <= 600 && deal.price % 25 === 0 && packages.some(p => p.id === deal.package);
}
export function scoreDeal(deal, confirmed = false) {
  if (!confirmed || !validDeal(deal)) return { alex: [0, 0, 0], morgan: [0, 0, 0] };
  const pkg = packages.find(p => p.id === deal.package);
  return { alex: [20, deal.price >= 550 ? 20 : 0, pkg.full === 8 ? 20 : 0], morgan: [20, deal.price <= 500 ? 20 : 0, pkg.first <= 6 ? 20 : 0] };
}
export const publicCharacter = id => {
  const { name, short, role, employer } = characters[id];
  return { id, name, short, role, employer };
};
