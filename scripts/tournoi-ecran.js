import { schedule } from './tournoi-schedule.js?v=1';

const $ = id => document.getElementById(id);
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
};
const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
const clockFormat = new Intl.DateTimeFormat('fr-BE',{timeZone:'Europe/Brussels',hour:'2-digit',minute:'2-digit'});
const defaults = { start:'09:15', minutes:20, transition:10, fields:3, break:15 };
const finalLabels = ['5e–6e place','3e–4e place','Finale'];
let latest, loading=false, lastSuccess=0;

function matchPair(data,id) {
  return id<15 ? data.matches[id] : data.finals?.[id-15] || null;
}
function teamName(data,id) { return data.teams[id]?.name || `Équipe ${id+1}`; }
function finalPlaceholder(id,side) {
  return [['5e du championnat','6e du championnat'],['3e du championnat','4e du championnat'],['1er du championnat','2e du championnat']][id-15][side];
}
function matchName(data,id,side) {
  const pair=matchPair(data,id);
  return pair ? teamName(data,pair[side]) : finalPlaceholder(id,side);
}
function matchTitle(id) { return id<15 ? `Match ${id+1}` : finalLabels[id-15]; }
function standings(data,finished) {
  const rows=[...data.standings];
  if (data.tieOrder) rows.sort((a,b)=>b.points-a.points || (b.for-b.against)-(a.for-a.against) || b.for-a.for || data.tieOrder.indexOf(a.id)-data.tieOrder.indexOf(b.id));
  if (!finished) return rows;
  const order=[];
  for (const i of [2,1,0]) {
    const pair=data.finals[i], score=data.scores[15+i], winner=score[0]>score[1]?0:1;
    order.push(pair[winner],pair[1-winner]);
  }
  return order.map(id=>rows.find(row=>row.id===id));
}
function largeMatch(data,plan,id) {
  const pair=matchPair(data,id), score=data.scores[id], card=node('article',undefined,`large-match${score?' complete':''}`);
  const top=node('div',undefined,'match-top');
  top.append(node('span',matchTitle(id)),node('span',`${time(plan.slots[id].time)} · Terrain ${plan.slots[id].field}`));
  card.append(top);
  for (const side of [0,1]) {
    const row=node('div',undefined,'large-team');
    row.append(node('span',pair?String(pair[side]+1).padStart(2,'0'):'—','team-number'),node('strong',matchName(data,id,side)),node('b',score?String(score[side]):'–','large-score'));
    card.append(row);
  }
  card.append(node('p',score?'Score enregistré':pair?'Score à venir':'Affiche après le classement','match-state'));
  return card;
}
function compactMatch(data,plan,id,withScore=false) {
  const row=node('div',undefined,'compact-match');
  const detail=node('span',`${time(plan.slots[id].time)} · ${id<15?`T${plan.slots[id].field}`:matchTitle(id)}`,'compact-detail');
  const names=node('strong',`${matchName(data,id,0)}  ·  ${matchName(data,id,1)}`,'compact-names');
  const score=data.scores[id];
  row.append(detail,names,node('b',withScore && score ? `${score[0]}–${score[1]}`:'À venir','compact-score'));
  return row;
}
function render(data) {
  const ready=data.ready && data.teams.length===6;
  $('notice').hidden=ready;
  if (!ready) {
    $('notice').textContent='Les équipes et les matchs apparaîtront dès que l’organisation aura validé le tirage.';
    $('current-title').textContent='Tournoi en préparation';
    $('progress').textContent='0 / 18 scores';
    $('current-matches').replaceChildren(); $('next-matches').replaceChildren(); $('recent-results').replaceChildren(); $('standings').replaceChildren();
    $('current-note').textContent='En attente de la validation des équipes.';
    return;
  }
  const plan=schedule(data.settings || defaults,data.matches);
  const completed=data.scores.filter(score=>score!==null).length;
  const finished=completed===18 && !!data.finals;
  const firstMissing=data.scores.findIndex(score=>score===null);
  const round=finished?5:Math.floor(Math.max(0,firstMissing)/3);
  $('progress').textContent=`${completed} / 18 scores`;
  $('current-title').textContent=finished?'Tournoi terminé':round<5?`Tour ${round+1} sur 5`:'Matchs de classement';
  $('current-note').textContent=finished?'Les rangs finaux sont affichés dans le classement.':!data.finals && round===5?'Les affiches seront connues après les quinze scores et le départage éventuel.':'Les scores apparaissent dès leur enregistrement à la table de marque.';
  $('current-matches').replaceChildren(...Array.from({length:3},(_,i)=>largeMatch(data,plan,round*3+i)));

  const nextIds=round<5 ? Array.from({length:3},(_,i)=>(round+1)*3+i) : [];
  $('next-matches').replaceChildren(...(nextIds.length?nextIds.map(id=>compactMatch(data,plan,id)): [node('p',finished?'Merci à toutes les équipes !':'Dernière série de matchs en cours.','empty')]));
  const recentIds=data.scores.map((score,id)=>score!==null?id:null).filter(id=>id!==null).slice(-3).reverse();
  $('recent-results').replaceChildren(...(recentIds.length?recentIds.map(id=>compactMatch(data,plan,id,true)):[node('p','Les premiers scores apparaîtront ici.','empty')]));

  const rows=standings(data,finished);
  $('standings-title').textContent=finished?'Résultat final':'Classement';
  $('standings-phase').textContent=finished?'Final':'Championnat';
  $('standings-note').textContent=finished?'Rangs finaux · statistiques du championnat':data.finals?'Classement du championnat · matchs de placement à suivre':'Victoire 3 pts · Nul 1 pt · Défaite 0 pt';
  $('standings').replaceChildren(...rows.map((row,index)=>{
    const item=node('div',undefined,`standing${index===0?' first':''}`);
    const diff=row.for-row.against;
    item.append(node('span',String(index+1),'rank'),node('strong',teamName(data,row.id),'standing-name'),node('span',String(row.played),'stat'),node('span',diff>0?`+${diff}`:String(diff),'stat'),node('b',String(row.points),'points'));
    return item;
  }));
}

async function refresh() {
  if (loading) return;
  loading=true;
  try {
    const response=await fetch('tournoi-public.php',{cache:'no-store'});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error || 'Scores indisponibles.');
    latest=data; lastSuccess=Date.now(); render(data);
    $('sync').textContent=`Scores synchronisés · ${clockFormat.format(new Date())}`;
    document.body.classList.remove('offline');
  } catch(error) {
    $('sync').textContent=latest?`Connexion interrompue · dernière lecture ${clockFormat.format(new Date(lastSuccess))}`:'Connexion aux scores indisponible';
    document.body.classList.add('offline');
    if (!latest) { $('notice').hidden=false; $('notice').textContent='Impossible de charger les scores. Une nouvelle tentative aura lieu automatiquement.'; }
  } finally { loading=false; }
}

function tick() { $('clock').textContent=clockFormat.format(new Date()); }
tick();
setInterval(tick,1000);
refresh();
setInterval(refresh,10000);
