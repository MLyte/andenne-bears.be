// Optional browser suite: set BEARS_PLAYWRIGHT_MODULE to an installed Playwright index.mjs.
// Uses an isolated PHP server and synthetic registrations; never calls the live website.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
let chromium;
try { ({chromium}=await import(process.env.BEARS_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.BEARS_PLAYWRIGHT_MODULE)).href : 'playwright')); } catch {}

test('dashboard laptop : vue sans défilement, compositions, brouillons, scores et finales', { skip: !chromium, timeout: 120000 }, async()=>{
  const root=await mkdtemp(join(tmpdir(),'bears-dashboard-'));
  const web=join(root,'web'), storage=join(root,'storage');
  for(const dir of ['config','scripts','fonts','images']) await mkdir(join(web,dir),{recursive:true});
  await mkdir(storage);
    for(const file of ['tournoi.html','tournoi.css','tournoi-api.php','tournoi-public.php','tournoi-domain.php','tournoi-ecran.html','tournoi-ecran.css','tirage-equipes.php','bears-storage.php','private-backup.php','scripts/tournoi.js','scripts/tournoi-ecran.js','scripts/tournoi-schedule.js','fonts/Montserrat-400.ttf','fonts/Montserrat-700.ttf','images/logoBears.png','images/favicon.png']) await copyFile(file,join(web,file));
  await writeFile(join(web,'config/family-day-config.php'),"<?php return ['storage_dir'=>__DIR__.'/../../storage'];");
  await writeFile(join(web,'login.php'),"<?php session_start(); $_SESSION['family_dashboard_until']=time()+3600; $_SESSION['family_dashboard_csrf']='ui-test'; echo 'ok';");
  const socket=createServer(); await new Promise(r=>socket.listen(0,'127.0.0.1',r)); const port=socket.address().port; await new Promise(r=>socket.close(r));
  const origin=`http://127.0.0.1:${port}`;
  const server=spawn('php',['-S',`127.0.0.1:${port}`,'-t',web],{stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<60;i++) { try { await fetch(origin+'/login.php'); break; } catch { await new Promise(r=>setTimeout(r,50)); } }
    browser=await chromium.launch({headless:true,executablePath:process.env.BEARS_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const context=await browser.newContext({viewport:{width:1536,height:734}});
    await context.request.get(origin+'/login.php');
    const given=['Camille','Alexandre','Sarah','Nicolas','Rémy','Aurélie'], family=['Martin','Dubois','Lambert','Leclerc','Moreau','Laurent'];
    const roster=Array.from({length:34},(_,i)=>({id:`sur-place-${i+1}`,name:`${given[i%6]} ${family[Math.floor(i/6)]}`,present:true,bears:i%6!==2,woman:i%6===0,minor:i%6===1}));
    const teams=[roster.slice(0,6),roster.slice(6,12),roster.slice(12,18),roster.slice(18,24),roster.slice(24,29),roster.slice(29)].map(t=>t.map(p=>p.id));
    roster[1].minor=false; roster[2].bears=true;
    const draw=await context.request.post(origin+'/tirage-equipes.php',{data:{csrf:'ui-test',version:'',state:{roster,teams,waiting:[],links:[],seed:42,teamCount:6,revision:1}}});
    assert.equal(draw.status(),200,await draw.text());
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/tournoi.html');
    await page.locator('#content').waitFor({state:'visible'});
    assert.match(await page.locator('#action-title').innerText(),/validation/);
    const checkLayout=async()=>{
      const result=await page.evaluate(()=>{
        const main=document.querySelector('.dashboard');
        const overflow=[...main.querySelectorAll('button,input,.panel,.team-section,.statusbar')].filter(e=>e.getClientRects().length).filter(e=>{
          const r=e.getBoundingClientRect(); return r.bottom>innerHeight+1 || r.right>innerWidth+1 || r.left < -1 || r.top < -1;
        }).map(e=>({id:e.id,text:e.textContent.slice(0,30)}));
        const clipped=[...main.querySelectorAll('.panel,.match,.score-line,.team-strip')].filter(e=>e.scrollHeight>e.clientHeight+2 || e.scrollWidth>e.clientWidth+2).map(e=>e.className);
        return {body:document.documentElement.scrollHeight,viewport:innerHeight,overflow,clipped};
      });
      assert.deepEqual(result.overflow,[],JSON.stringify(result)); assert.deepEqual(result.clipped,[],JSON.stringify(result)); assert.ok(result.body<=result.viewport+1,JSON.stringify(result));
    };
    await checkLayout();
    await page.locator('#action-button').click();
    await page.locator('#accept').check();
    await page.locator('#validate').click();
    await page.locator('#review-dialog').waitFor({state:'hidden'});
    assert.match(await page.locator('#action-title').innerText(),/capitaine/);
    await mkdir('tmp/tournament-dashboard-20261022',{recursive:true});
    for(const [width,height] of [[1920,948],[1536,734],[1366,650],[1100,620]]) {
      await page.setViewportSize({width,height}); await checkLayout();
      await page.screenshot({path:`tmp/tournament-dashboard-20261022/dashboard-${width}.png`});
    }
    await page.setViewportSize({width:1536,height:734});
    await page.locator('#teams button').last().hover();
    await page.locator('#team-popover').waitFor({state:'visible'});
    assert.match(await page.locator('#team-title').innerText(),/Équipe 6/);
    const popup=await page.locator('#team-popover').boundingBox(); assert.ok(popup.x>=0 && popup.x+popup.width<=1536 && popup.y+popup.height<=734);
    await page.screenshot({path:'tmp/tournament-dashboard-20261022/composition.png'});
    await page.keyboard.press('Escape');
    await page.locator('#teams button').first().focus(); await page.locator('#team-popover').waitFor({state:'visible'});
    await page.keyboard.press('Escape'); await page.locator('#team-popover').waitFor({state:'hidden'});
    assert.equal(await page.locator('#teams button').first().getAttribute('aria-expanded'),'false');
    await page.locator('#names-open').click();
    assert.ok(await page.locator('#names-dialog').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Choix des capitaines sans scroll sur laptop');
    await page.locator('#names input[name=team0]').fill('Les Oursons très très déterminés');
    for(let i=0;i<6;i++) await page.locator(`#names select[name=captain${i}]`).selectOption({index:1});
    await page.locator('#names button[type=submit]').click();
    await page.locator('#names-dialog').waitFor({state:'hidden'});
    assert.match(await page.locator('#teams button').first().innerText(),/Les Oursons/);
    assert.match(await page.locator('#match-0').innerText(),/Les Oursons/);
    assert.match(await page.locator('#standings').innerText(),/Les Oursons/);
    assert.doesNotMatch(await page.locator('#action-title').innerText(),/tirage a changé/);
    assert.match(await page.locator('#match-0 .captain-caption').first().innerText(),/♛ Camille Martin/);
    const projectorStart=await context.newPage();
    await projectorStart.setViewportSize({width:1920,height:1080});
    await projectorStart.goto(origin+'/tournoi-ecran.html');
    await projectorStart.locator('#current-title').getByText('Tour 1 sur 5').waitFor();
    assert.equal(await projectorStart.locator('#current-matches .large-match').count(),3);
    assert.equal(await projectorStart.locator('#standings .standing').count(),6);
    await projectorStart.screenshot({path:'tmp/tournament-dashboard-20261022/projector-start-1920.png'});
    await page.locator('#teams button').first().hover();
    await page.locator('#team-players .captain-player').waitFor({state:'visible'});
    assert.match(await page.locator('#team-players .captain-player').innerText(),/Camille Martin/);
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:1100,height:620}); await checkLayout();
    await page.setViewportSize({width:1536,height:734});
    await page.locator('#match-0 input[name=score0]').fill('6'); await page.locator('#match-0 input[name=score1]').fill('0');
    await page.locator('#match-0 button[type=submit]').click(); await page.locator('#match-0 .saved-label').waitFor();
    await projectorStart.locator('#progress').getByText('1 / 18 scores').waitFor({timeout:12000});
    await projectorStart.close();
    await page.locator('#match-1 input[name=score0]').fill('12');
    await page.locator('#rounds button').nth(1).click();
    await page.locator('#match-3 input[name=score0]').fill('7'); await page.locator('#match-3 input[name=score1]').fill('13');
    await page.locator('#match-3 button[type=submit]').click(); await page.locator('#match-3 .saved-label').waitFor();
    await page.locator('#rounds button').first().click();
    assert.equal(await page.locator('#match-1 input[name=score0]').inputValue(),'12','Brouillon conservé après changement de tour et sauvegarde d’un autre match');
    let state=await (await context.request.get(origin+'/tournoi-api.php')).json();
    const external=await context.request.post(origin+'/tournoi-api.php',{data:{csrf:state.csrf,version:state.version,action:'score',match:2,score:[0,0]}}); assert.equal(external.status(),200);
    await page.locator('#match-1 input[name=score1]').fill('6'); await page.locator('#match-1 button[type=submit]').click();
    await page.waitForFunction(()=>document.getElementById('status').classList.contains('error'));
    assert.match(await page.locator('#action-title').innerText(),/refusé/); assert.equal(await page.locator('#match-1 input[name=score0]').inputValue(),'12');
    page.once('dialog',dialog=>dialog.accept()); await page.locator('#reload').click();
    await page.waitForFunction(()=>!document.getElementById('status').classList.contains('error'));
    for(let id=0;id<15;id++) {
      state=await (await context.request.get(origin+'/tournoi-api.php')).json();
      const result=await context.request.post(origin+'/tournoi-api.php',{data:{csrf:state.csrf,version:state.version,action:'score',match:id,score:[0,0]}}); assert.equal(result.status(),200);
    }
    await page.locator('#reload').click();
    await page.waitForFunction(()=>document.getElementById('action-title').textContent.includes('Égalité'));
    await page.locator('#action-button').click();
    await page.locator('#ties input').fill('1,1,3,4,5,6'); await page.locator('#ties button').click();
    await page.locator('#ties-dialog .dialog-feedback.error').waitFor({state:'visible'});
    assert.equal(await page.locator('#ties input').inputValue(),'1,1,3,4,5,6');
    await page.locator('#ties input').fill('1,2,3,4,5,6'); await page.locator('#ties button').click();
    await page.locator('#ties-dialog').waitFor({state:'hidden'});
    await page.locator('#match-15 input[name=score0]').fill('9');
    await page.locator('#match-16 input[name=score0]').fill('7');
    await page.locator('#rounds button').first().click();
    await page.locator('#match-0 input[name=score0]').fill('6');
    await page.locator('#match-0 button[type=submit]').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('brouillons des matchs de classement ont été effacés'));
    assert.match(await page.locator('#status').innerText(),/brouillons des matchs de classement ont été effacés/);
    await page.locator('#action-button').click();
    await page.locator('#ties input').fill('1,2,3,4,5,6'); await page.locator('#ties button').click();
    await page.locator('#ties-dialog').waitFor({state:'hidden'});
    await page.locator('#rounds button').last().click();
    assert.equal(await page.locator('#match-15 input[name=score0]').inputValue(),'');
    assert.equal(await page.locator('#match-16 input[name=score0]').inputValue(),'');
    for(let id=15;id<18;id++) {
      await page.locator(`#match-${id} input[name=score0]`).fill('6'); await page.locator(`#match-${id} input[name=score1]`).fill('0');
      await page.locator(`#match-${id} button[type=submit]`).click(); await page.locator(`#match-${id} .saved-label`).waitFor();
    }
    await page.locator('#final-view').click(); assert.equal(await page.locator('#standings-title').innerText(),'Résultat final'); await checkLayout();
    const projector=await context.newPage();
    await projector.setViewportSize({width:1920,height:1080});
    await projector.goto(origin+'/tournoi-ecran.html');
    await projector.locator('#standings-title').getByText('Résultat final').waitFor();
    const projectorLayout=await projector.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,viewportWidth:innerWidth,viewportHeight:innerHeight,cards:document.querySelectorAll('#current-matches .large-match').length,rows:document.querySelectorAll('#standings .standing').length}));
    assert.ok(projectorLayout.width<=1921 && projectorLayout.height<=1081,JSON.stringify(projectorLayout));
    assert.equal(projectorLayout.cards,3); assert.equal(projectorLayout.rows,6);
    await projector.screenshot({path:'tmp/tournament-dashboard-20261022/projector-1920.png'});
    await projector.close();
    await page.evaluate(()=>{window.print=()=>{};}); await page.locator('#print').click(); assert.equal(await page.locator('#print-sheet tr').count(),19);
    assert.match(await page.locator('#print-sheet').innerText(),/Les Oursons très très déterminés/);
    await page.locator('#settings-open').click(); await page.locator('#settings input[name=minutes]').fill('21'); await page.locator('#settings button[type=submit]').click();
    await page.locator('#settings-dialog').waitFor({state:'hidden'}); assert.match(await page.locator('#timing').innerText(),/21 min/);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Pas de débordement horizontal mobile');
    await page.screenshot({path:'tmp/tournament-dashboard-20261022/mobile.png',fullPage:true});
    assert.deepEqual(errors,[],'Pas d’erreur JavaScript');
  } finally {
    await browser?.close(); server.kill(); await new Promise(r=>server.once('exit',r));
    assert.ok(root.startsWith(join(tmpdir(),'bears-dashboard-'))); await rm(root,{recursive:true,force:true});
  }
});
