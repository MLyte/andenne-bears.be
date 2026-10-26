import { schedule } from './tournoi-schedule.js?v=1';

const $ = id => document.getElementById(id);
const defaults = { start: '09:15', minutes: 20, transition: 10, fields: 3, break: 15 };
const finalLabels = ['5e / 6e place', '3e / 4e place', 'Finale'];
const drafts = new Map();
let data, busy = false, selectedRound = 0, finalView = false, settingsDirty = false, tiesDirty = false;
let popoverTrigger = null, popoverPinned = false, hideTimer, actionError = null;
const node = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const scores = () => data?.state?.scores || Array(18).fill(null);
const teams = () => data?.state?.teams || data?.preview || [];
const hasDrafts = () => drafts.size > 0 || settingsDirty || tiesDirty;
const completed = () => !!data?.finals && scores().slice(15).every(s => s !== null);
const firstMissing = () => scores().findIndex(s => s === null);
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function openDialog(id) {
  hideTeam();
  const feedback=$(id).querySelector('.dialog-feedback'); if(feedback) feedback.remove();
  if (!$(id).open) $(id).showModal();
}
function dialogFeedback(id,text,error=false) {
  if(!id) return;
  let feedback=$(id).querySelector('.dialog-feedback');
  if(!feedback) { feedback=node('p',undefined,'dialog-feedback notice'); feedback.setAttribute('role','alert'); $(id).querySelector('form').before(feedback); }
  feedback.textContent=text; feedback.classList.toggle('error',error);
}

async function request(payload) {
  const response = await fetch('tournoi-api.php', {
    credentials: 'same-origin', cache: 'no-store',
    ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, csrf: data.csrf, version: data.version, sourceVersion: data.source.version }) } : {}),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Réponse du serveur illisible. Les saisies sont conservées ; réessaie.'); }
  if (!response.ok) { const error = new Error(result.error || 'Enregistrement impossible.'); error.code = response.status; throw error; }
  return result;
}

async function save(payload, dialogId) {
  if (busy) return;
  busy = true; hideTeam();
  const disabled = [...document.querySelectorAll('button,input,select')].map(e => [e, e.disabled]);
  disabled.forEach(([e]) => { e.disabled = true; });
  status('Enregistrement en cours…');
  dialogFeedback(dialogId,'Enregistrement en cours…');
  try {
    data = await request(payload);
    if (payload.action === 'score') drafts.delete(payload.match);
    if (payload.action === 'settings') settingsDirty = false;
    if (payload.action === 'ties') tiesDirty = false;
    actionError = null;
    busy = false;
    disabled.forEach(([e, was]) => { if (e.isConnected) e.disabled = was; });
    if (dialogId) $(dialogId).close();
    render();
    if (payload.action === 'score') document.querySelector(`#match-${payload.match} button[type="submit"]`)?.focus({ preventScroll: true });
    status(`Enregistré dans l’espace organisateur.${hasDrafts() ? ' D’autres saisies restent à enregistrer.' : ''}`);
  } catch (error) {
    busy = false;
    disabled.forEach(([e, was]) => { if (e.isConnected) e.disabled = was; });
    actionError = error;
    status(`${error.message} Les saisies locales sont conservées.`, true);
    dialogFeedback(dialogId,`${error.message}${error.code===409?' Ferme cette fenêtre, puis clique sur Actualiser.':''}`,true);
    updateAction();
  }
}

function action(title, description, label, handler) {
  $('action-title').textContent = title; $('action-description').textContent = description;
  $('action-button').hidden = !label; $('action-button').textContent = label || '';
  $('action-button').onclick = handler || null;
}
function goToMatch(id) {
  if (id < 0) return;
  selectedRound = Math.floor(id / 3); hideTeam(); renderMatches();
  document.querySelector(`#match-${id} input:not(:disabled)`)?.focus({ preventScroll: true });
}
function updateAction() {
  if (!data) return;
  if (actionError) {
    action('Enregistrement refusé', actionError.message, actionError.code === 409 ? 'Actualiser' : 'Vérifier la saisie', () => {
      if (actionError.code === 409) reload();
      else { actionError = null; updateAction(); document.querySelector('.match input:not(:disabled)')?.focus(); }
    }); return;
  }
  if (!data.state) {
    action(data.source.error ? 'Tirage à préparer' : 'Les équipes attendent ta validation', data.source.error || `${teams().reduce((n,t) => n+t.players.length, 0)} joueurs répartis en six équipes. Vérifie les compositions et les dérogations avant le premier match.`, data.source.error ? 'Ouvrir le tirage' : 'Vérifier et valider', () => data.source.error ? window.location.assign('tirage-equipes.html') : openReview()); return;
  }
  if (scores().slice(0,15).every(s => s !== null) && !data.finals) {
    action('Égalité à départager', 'Le championnat est terminé. Le départage est nécessaire pour attribuer les matchs de classement.', 'Départager', () => openDialog('ties-dialog')); return;
  }
  if (drafts.size) {
    action(`${drafts.size} score${drafts.size > 1 ? 's' : ''} à enregistrer`, 'Ces saisies restent locales. Les changements de tour les conservent ; clique sur Enregistrer pour les confirmer.', 'Reprendre la saisie', () => goToMatch(drafts.keys().next().value)); return;
  }
  if (settingsDirty || tiesDirty) {
    action('Modifications à enregistrer', 'Un formulaire contient des changements non enregistrés.', 'Reprendre', () => openDialog(settingsDirty ? 'settings-dialog' : 'ties-dialog')); return;
  }
  if (data.sourceChanged) {
    const started = scores().some(s => s !== null);
    action('Le tirage a changé', started ? 'Les équipes du tournoi restent figées : des scores ont déjà été enregistrés.' : 'Un autre tirage est sauvegardé. Vérifie-le avant de remplacer les compositions du tournoi.', 'Comparer les équipes', () => openReview()); return;
  }
  const missing = firstMissing();
  if (missing < 0) { action('Tournoi terminé', 'Les 18 scores sont enregistrés. Le résultat final est disponible.', 'Voir le résultat final', () => { finalView = true; renderStandings(); }); return; }
  const round = Math.floor(missing / 3);
  action(round < 5 ? `Tour ${round+1} · scores à saisir` : 'Matchs de classement · scores à saisir', `${18-scores().filter(s => s !== null).length} résultat(s) encore attendu(s). Saisis le score final de chaque rencontre, puis enregistre.`, 'Ouvrir les matchs', () => goToMatch(missing));
}

function hideTeam(restore = false) {
  clearTimeout(hideTimer);
  const trigger = popoverTrigger;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  $('team-popover').hidden = true; popoverTrigger = null; popoverPinned = false;
  if (restore && trigger?.isConnected) { trigger.focus({ preventScroll: true }); trigger.setAttribute('aria-expanded','false'); $('team-popover').hidden = true; popoverTrigger=null; popoverPinned=false; }
}
function queueHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!popoverPinned && !$('team-popover').matches(':hover') && !$('team-popover').contains(document.activeElement) && document.activeElement !== popoverTrigger) hideTeam();
  }, 180);
}
function showTeam(id, trigger, pin = false) {
  const team = teams()[id]; if (!team || busy) return;
  clearTimeout(hideTimer);
  if (popoverPinned && !pin && trigger !== popoverTrigger) return;
  if (popoverTrigger && trigger !== popoverTrigger) popoverTrigger.setAttribute('aria-expanded', 'false');
  popoverTrigger = trigger; popoverPinned = pin || popoverPinned;
  trigger.setAttribute('aria-expanded', 'true');
  $('team-title').textContent = `${team.name} · ${team.players.length} joueurs`;
  const record = data.standings.find(r => r.id === id);
  $('team-record').textContent = record ? `${record.wins} victoire(s) · ${record.draws} nul(s) · ${record.losses} défaite(s) · ${record.for} marqués / ${record.against} encaissés` : 'Composition du dernier tirage sauvegardé';
  $('team-players').replaceChildren(...team.players.map(p => node('li',p.name)));
  $('team-exceptions').replaceChildren(...(team.exceptions.length ? team.exceptions.map(e => node('p',e,'exception')) : [node('p','Les trois critères sont couverts par des personnes différentes.')]));
  const popup = $('team-popover'); popup.hidden = false;
  const rect = trigger.getBoundingClientRect(), box = popup.getBoundingClientRect();
  const left = Math.max(12,Math.min(rect.left,window.innerWidth-box.width-12));
  const below = rect.bottom+8;
  const top = below+box.height <= window.innerHeight-12 ? below : Math.max(12,rect.top-box.height-8);
  popup.style.left = `${left}px`; popup.style.top = `${top}px`;
}
function teamButton(id, { card = false, away = false, badge = false } = {}) {
  const team = teams()[id], button = node('button',undefined,card ? 'team-card' : `team-link${away ? ' away' : ''}`);
  button.type = 'button'; button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-label', `${team?.name || `Équipe ${id+1}`} : voir la composition`);
  if (card) {
    button.append(node('strong',team.name),node('span',`${team.players.length}/6 joueurs · ${team.exceptions.length ? `${team.exceptions.length} dérogation(s)` : '3 critères couverts'}`,team.exceptions.length ? 'exception-count' : ''));
  } else {
    if (badge && !away) button.append(node('span',id+1,'team-number'));
    button.append(node('span',team?.name || `Équipe ${id+1}`));
    if (badge && away) button.append(node('span',id+1,'team-number'));
  }
  button.addEventListener('mouseenter', () => showTeam(id,button));
  button.addEventListener('mouseleave',queueHide);
  button.addEventListener('focus', () => showTeam(id,button));
  button.addEventListener('blur',queueHide);
  button.addEventListener('click', () => { if (popoverTrigger===button && popoverPinned) hideTeam(); else showTeam(id,button,true); });
  return button;
}

function planning() { return schedule(data.state?.settings || defaults,data.matches); }
function matchPairs() { return [...data.matches,...(data.finals || [null,null,null])]; }
function renderMatches() {
  const plan = planning(), allScores = scores(), pairs = matchPairs();
  $('round-title').textContent = selectedRound < 5 ? `Tour ${selectedRound+1} sur 5` : 'Matchs de classement';
  $('rounds').replaceChildren(...Array.from({length:6},(_,round) => {
    const done = allScores.slice(round*3,round*3+3).filter(s=>s!==null).length;
    const button=node('button'); button.type='button';
    button.append(node('strong',round<5 ? `Tour ${round+1}` : 'Classement'),node('span',`${clock(plan.slots[round*3].time)} · ${done}/3 ${done===3 ? '✓' : ''}`));
    if(round===selectedRound) button.setAttribute('aria-current','step');
    button.addEventListener('click',()=>{ hideTeam(); selectedRound=round; renderMatches(); }); return button;
  }));
  $('matches').replaceChildren(...Array.from({length:3},(_,offset) => {
    const id=selectedRound*3+offset, pair=pairs[id], saved=allScores[id], slot=plan.slots[id], title=id<15?`Match ${id+1}`:finalLabels[id-15];
    const form=node('form',undefined,`match${saved ? ' saved' : ' pending'}`); form.id=`match-${id}`;
    const head=node('div',undefined,'match-head'); head.append(node('strong',`${clock(slot.time)} · Terrain ${slot.field} · ${title}`));
    const meta=node('div',undefined,'match-meta');
    const label=node('span',drafts.has(id) ? 'Non enregistré' : saved ? `Enregistré : ${saved[0]}–${saved[1]}` : data.state ? 'À saisir' : 'À valider',saved ? 'saved-label' : '');
    meta.append(label);
    if(saved) {
      const clear=node('button','Effacer','erase'); clear.type='button'; clear.setAttribute('aria-label',`Effacer le score de ${title}`);
      clear.addEventListener('click',()=>{ if(confirm(`Effacer le résultat de ${title} ?`)) save({action:'score',match:id,score:null}); }); meta.append(clear);
    }
    head.append(meta); form.append(head);
    if(!pair) { form.append(node('p',id<17 ? 'Affiche disponible après les 15 résultats et leur départage.' : 'Les deux premiers du championnat se rencontreront ici.','locked-match')); return form; }
    const line=node('div',undefined,'score-line');
    const values=drafts.get(id) || (saved ? saved.map(String) : ['','']);
    const inputs=pair.map((team,side)=>{
      const input=node('input'); Object.assign(input,{type:'number',min:'0',max:'200',step:'1',name:`score${side}`,required:true,value:values[side],disabled:!data.state});
      input.setAttribute('aria-label',`${title}, score ${teams()[team]?.name || `équipe ${team+1}`}`); input.inputMode='numeric'; return input;
    });
    const submit=node('button',saved?'Mettre à jour':'Enregistrer',saved?'':'primary'); submit.type='submit'; submit.disabled=!data.state;
    line.append(teamButton(pair[0],{badge:true}),inputs[0],node('span','–'),inputs[1],teamButton(pair[1],{badge:true,away:true}),submit);
    inputs.forEach(input=>input.addEventListener('input',()=>{
      const values=inputs.map(e=>e.value), baseline=saved?saved.map(String):['',''];
      if(values.every((v,i)=>v===baseline[i])) drafts.delete(id); else drafts.set(id,values);
      label.textContent=drafts.has(id)?'Non enregistré':saved?`Enregistré : ${saved[0]}–${saved[1]}`:'À saisir';
      actionError=null; updateAction(); status(hasDrafts()?'Saisie locale · clique sur Enregistrer pour confirmer.':'Tous les scores affichés sont enregistrés.');
    }));
    form.append(line);
    form.addEventListener('submit',event=>{ event.preventDefault(); save({action:'score',match:id,score:inputs.map(e=>Number(e.value))}); });
    return form;
  }));
  $('round-hint').textContent = !data.state ? 'Aperçu du planning · valide les équipes pour saisir les scores.' : 'Horaires prévisionnels · un champ vide n’est pas un zéro.';
  $('next-action').hidden = !data.state || firstMissing()<0;
}

function renderStandings() {
  const rows=[...data.standings];
  if(data.state?.tieOrder) rows.sort((a,b)=>b.points-a.points || (b.for-b.against)-(a.for-a.against) || b.for-a.for || data.state.tieOrder.indexOf(a.id)-data.state.tieOrder.indexOf(b.id));
  if(!rows.length) teams().forEach((_,id)=>rows.push({id,played:0,for:0,against:0,points:0}));
  const finished=completed(); if(!finished) finalView=false;
  $('league-view').setAttribute('aria-pressed',String(!finalView)); $('final-view').setAttribute('aria-pressed',String(finalView)); $('final-view').disabled=!finished;
  $('standings-title').textContent=finalView?'Résultat final':'Classement';
  $('progress').textContent=`${scores().filter(s=>s!==null).length}/18`;
  let order=rows.map(r=>r.id);
  if(finalView) {
    order=[];
    for(const i of [2,1,0]) { const pair=data.finals[i], score=scores()[15+i], winner=score[0]>score[1]?0:1; order.push(pair[winner],pair[1-winner]); }
  }
  $('standings').replaceChildren(...order.map((id,rank)=>{
    const r=rows.find(row=>row.id===id), tr=node('tr');
    const teamCell=node('td'); teamCell.append(teamButton(id));
    tr.append(node('td',rank+1),teamCell,node('td',r.played),node('td',(r.for-r.against>0?'+':'')+(r.for-r.against)),node('td',r.points)); return tr;
  }));
  $('ranking-note').textContent=finalView?'Rangs finaux · statistiques du championnat.':!data.state?'Aperçu avant validation · aucun résultat.':data.finals?'Départage effectué · victoire 3 pts, nul 1 pt.':'Provisoire · victoire 3 pts, nul 1 pt. Détails au survol des équipes.';
}

function render() {
  hideTeam(); $('content').hidden=false; $('team-section').hidden=false;
  $('settings-open').disabled=!data.state; $('print').disabled=false;
  const settings=data.state?.settings || defaults, plan=planning();
  $('timing').textContent=`${settings.fields} terrain${settings.fields>1?'s':''} · ${settings.minutes} min / match`;
  $('format').textContent=`${settings.start} → ${clock(plan.end)} · ${settings.transition} min de pause`;
  $('end-time').textContent=clock(plan.end); $('meal-margin').textContent=`${780-plan.end} min`;
  document.querySelector('.meal').classList.toggle('late',plan.end>780);
  if(!settingsDirty) for(const [key,value] of Object.entries(settings)) $('settings').elements[key].value=value;
  $('teams').replaceChildren(...teams().map((_,id)=>teamButton(id,{card:true})));
  renderMatches(); renderStandings(); updateAction();
}

function openReview() {
  const replacing=!!data.state, started=scores().some(s=>s!==null), allowed=!data.source.error && (!replacing || !started);
  $('review-title').textContent=replacing?'Comparer avec le tirage sauvegardé':'Valider les six équipes';
  $('review-description').textContent=replacing?'Le tableau de bord conserve les équipes validées. Ci-dessous : le nouveau tirage sauvegardé, avec les entrées et sorties par équipe.':'Ces compositions viennent du dernier tirage sauvegardé. La validation les fixe pour le tournoi.';
  $('source-status').textContent=(data.source.error || (started?'Des scores existent : le remplacement des équipes est bloqué.':'Vérifie les présences et les dérogations avant de confirmer.'))+(data.source.waiting.length?` En attente, hors des équipes : ${data.source.waiting.join(', ')}.`:'');
  $('review-teams').replaceChildren(...data.preview.map((team,id)=>{
    const article=node('article'); article.append(node('h3',`${team.name} · ${team.players.length} joueurs`));
    const list=node('ul'); list.append(...team.players.map(p=>node('li',p.name))); article.append(list);
    for(const exception of team.exceptions) article.append(node('p',exception,'exception'));
    if(replacing) {
      const previous=data.state.teams[id]?.players || [], incoming=team.players.filter(p=>!previous.some(old=>old.id===p.id)), outgoing=previous.filter(p=>!team.players.some(current=>current.id===p.id));
      if(incoming.length) article.append(node('p',`Entrées : ${incoming.map(p=>p.name).join(', ')}`,'exception'));
      if(outgoing.length) article.append(node('p',`Sorties : ${outgoing.map(p=>p.name).join(', ')}`,'exception'));
    }
    return article;
  }));
  $('review-form').hidden=!allowed; $('accept').checked=false; $('validate').disabled=true;
  $('validate').textContent=replacing?'Reprendre et valider ce tirage':'VALIDER les équipes';
  openDialog('review-dialog');
}

async function reload() {
  if(busy) return;
  if(hasDrafts() && !confirm('Actualiser abandonnera les saisies non enregistrées. Continuer ?')) return;
  busy=true; $('reload').disabled=true;
  try {
    const result=await request(); data=result; drafts.clear(); settingsDirty=false; tiesDirty=false; actionError=null;
    selectedRound=Math.floor(Math.max(0,firstMissing())/3); if(completed()) selectedRound=5;
    render(); status('Données enregistrées chargées.');
  } catch(error) {
    status(error.message,true);
    if(!data) action('Connexion organisateur requise',error.message,'Ouvrir les inscriptions',()=>window.location.assign('suivi-inscriptions.php'));
  } finally { busy=false; $('reload').disabled=false; }
}

function printSheet() {
  const sheet=$('print-sheet'), plan=planning(), pairs=matchPairs();
  sheet.replaceChildren(node('h1','Tournoi de flag · 25 octobre 2026'),node('p',`${data.state?'Équipes validées':'Aperçu avant validation'} · ${data.state?.settings.fields || 3} terrain(s) · fin prévue ${clock(plan.end)}. Scores enregistrés uniquement.`));
  const table=node('table'), header=node('tr');
  header.append(...['Match','Heure','Terrain','Rencontre','Score'].map(s=>node('th',s))); table.append(header);
  pairs.forEach((pair,id)=>{
    const row=node('tr'), score=scores()[id];
    row.append(...[id<15?`M${id+1}`:finalLabels[id-15],clock(plan.slots[id].time),plan.slots[id].field,pair?pair.map(i=>teams()[i]?.name || `Équipe ${i+1}`).join(' / '):'Après classement et départage',score?score.join(' – '):'___ – ___'].map(v=>node('td',v))); table.append(row);
  });
  sheet.append(table);
  teams().forEach(team=>sheet.append(node('p',`${team.name} : ${team.players.map(p=>p.name).join(', ')}${team.exceptions.length?` · Dérogations : ${team.exceptions.join(' ; ')}`:''}`)));
  window.print();
}

document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('rules-open').addEventListener('click',()=>openDialog('rules-dialog'));
$('settings-open').addEventListener('click',()=>openDialog('settings-dialog'));
$('reload').addEventListener('click',reload);
$('next-action').addEventListener('click',()=>goToMatch(firstMissing()));
$('league-view').addEventListener('click',()=>{ finalView=false; renderStandings(); });
$('final-view').addEventListener('click',()=>{ finalView=true; renderStandings(); });
$('accept').addEventListener('change',()=>{ $('validate').disabled=!$('accept').checked || busy; });
$('review-form').addEventListener('submit',event=>{ event.preventDefault(); save({action:data.state?'replace-teams':'validate',acceptExceptions:$('accept').checked},'review-dialog'); });
$('settings').addEventListener('input',()=>{ settingsDirty=true; actionError=null; updateAction(); });
$('settings').addEventListener('submit',event=>{
  event.preventDefault(); const settings=Object.fromEntries(new FormData(event.currentTarget));
  for(const key of ['minutes','transition','fields','break']) settings[key]=Number(settings[key]);
  save({action:'settings',settings},'settings-dialog');
});
$('three-fields').addEventListener('click',()=>{ for(const [key,value] of Object.entries(defaults)) $('settings').elements[key].value=value; settingsDirty=true; updateAction(); });
$('ties').addEventListener('input',()=>{ tiesDirty=true; actionError=null; updateAction(); });
$('ties').addEventListener('submit',event=>{ event.preventDefault(); save({action:'ties',order:event.currentTarget.elements.order.value.split(',').map(v=>Number(v.trim())-1)},'ties-dialog'); });
$('team-close').addEventListener('click',()=>hideTeam(true));
$('team-popover').addEventListener('mouseenter',()=>clearTimeout(hideTimer));
$('team-popover').addEventListener('mouseleave',queueHide);
$('team-popover').addEventListener('focusout',queueHide);
document.addEventListener('pointerdown',event=>{ if(!$('team-popover').contains(event.target) && !popoverTrigger?.contains(event.target)) hideTeam(); });
document.addEventListener('keydown',event=>{ if(event.key==='Escape' && !$('team-popover').hidden) { event.preventDefault(); hideTeam(true); } });
window.addEventListener('resize',()=>hideTeam());
$('fullscreen').addEventListener('click',async()=>{
  try { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { status('Le plein écran est indisponible. Tu peux utiliser la touche F11.',true); }
});
document.addEventListener('fullscreenchange',()=>{ $('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Quitter le plein écran':'Passer en plein écran'); });
$('print').addEventListener('click',printSheet);
window.addEventListener('beforeunload',event=>{ if(hasDrafts() || busy) { event.preventDefault(); event.returnValue=''; } });
await reload();
