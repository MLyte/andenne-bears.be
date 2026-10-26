<?php
declare(strict_types=1);
require_once __DIR__.'/tournoi-domain.php';
require_once __DIR__.'/private-backup.php';
ini_set('session.use_strict_mode','1');
$https=!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off';
if (!$https && !in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true)) { http_response_code(403); exit; }
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$https,'httponly'=>true,'samesite'=>'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
function tournamentFail(int $code,string $message): never { http_response_code($code); echo json_encode(['error'=>$message],JSON_UNESCAPED_UNICODE); exit; }
if (($_SESSION['family_dashboard_until']??0)<=time()) tournamentFail(401,'Connecte-toi à l’espace organisateur, puis recharge cette page.');
$_SESSION['family_dashboard_csrf']??=bin2hex(random_bytes(32));
$config=require __DIR__.'/config/family-day-config.php';
$private=realpath($config['storage_dir']??'');
$web=realpath(__DIR__);
if (!$private || !$web || str_starts_with(strtolower($private.DIRECTORY_SEPARATOR),strtolower($web.DIRECTORY_SEPARATOR))) tournamentFail(503,'Stockage privé indisponible.');
$path=$private.'/family-tournament-2026.json';
if (is_link($path) || is_link($path.'.lock')) tournamentFail(503,'Stockage indisponible.');
$lock=@fopen($path.'.lock','c+');
if (!$lock || !flock($lock,LOCK_EX)) tournamentFail(503,'Stockage occupé. Réessaie.');
$raw=is_file($path)?file_get_contents($path):null;
if ($raw===false) tournamentFail(503,'Lecture impossible.');
$version=$raw===null?'':hash('sha256',$raw);
$state=$raw===null?null:json_decode($raw,true);
if ($raw!==null && !is_array($state)) tournamentFail(503,'Fichier tournoi invalide.');
// Hold the draw lock through validation, so the reviewed source cannot change mid-write.
$drawLockPath=$private.'/family-teams-2026.lock';
if (is_link($drawLockPath)) tournamentFail(503,'Stockage du tirage indisponible.');
$drawLock=@fopen($drawLockPath,'c+');
if (!$drawLock || !flock($drawLock,LOCK_SH)) tournamentFail(503,'Tirage occupé. Réessaie.');
$source=bearsStorageWeb(static fn()=>tournamentDrawSource($private));
if ($_SERVER['REQUEST_METHOD']==='POST') {
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>10000) tournamentFail(413,'Requête trop grande.');
    $input=json_decode(file_get_contents('php://input'),true);
    if (!is_array($input) || !is_string($input['csrf']??null) || !hash_equals($_SESSION['family_dashboard_csrf'],$input['csrf'])) tournamentFail(403,'Session expirée. Recharge la page.');
    if (!is_string($input['version']??null) || !hash_equals($version,$input['version'])) tournamentFail(409,'Le tournoi a changé sur un autre écran. Recharge avant de réessayer.');
    $action=$input['action']??'';
    if ($action==='validate' || $action==='replace-teams') {
        if ($action==='validate' && $state!==null) tournamentFail(409,'Les équipes sont déjà validées.');
        if ($action==='replace-teams' && ($state===null || count(array_filter($state['scores'],static fn($s)=>$s!==null)))) tournamentFail(409,'Les compositions ne peuvent être remplacées qu’avant le premier score.');
        if (($input['acceptExceptions']??false)!==true) tournamentFail(422,'Confirme les compositions et les dérogations.');
        if ($source['error']!==null) tournamentFail(422,$source['error']);
        if (!is_string($input['sourceVersion']??null) || !hash_equals($source['version'],$input['sourceVersion'])) tournamentFail(409,'Le tirage a changé depuis cet aperçu. Recharge pour vérifier les nouvelles compositions.');
        $newTeams=$source['teams'];
        foreach ($newTeams as $i=>&$team) {
            $team['name']=$state['teams'][$i]['name']??$team['name'];
            $captain=$state['teams'][$i]['captainId']??null;
            $team['captainId']=in_array($captain,array_column($team['players'],'id'),true)?$captain:null;
        }
        unset($team);
        $state=['teams'=>$newTeams,'sourceVersion'=>$source['version'],'validatedAt'=>gmdate('c'),'scores'=>array_fill(0,18,null),'settings'=>$state['settings']??['start'=>'09:15','minutes'=>20,'transition'=>10,'fields'=>3,'break'=>15]];
    } else {
        if ($state===null) tournamentFail(422,'Valide d’abord les équipes.');
        if ($action==='names') {
            $names=$input['names']??null;
            if (!is_array($names) || !array_is_list($names) || count($names)!==6) tournamentFail(422,'Indique un nom pour chacune des six équipes.');
            $clean=[];
            foreach ($names as $name) {
                if (!is_string($name) || !preg_match('//u',$name) || preg_match('/[\x00-\x1F\x7F]/u',$name)) tournamentFail(422,'Nom d’équipe invalide.');
                $name=trim(preg_replace('/\s+/u',' ',$name));
                if (!preg_match('/^.{1,32}$/u',$name)) tournamentFail(422,'Chaque nom doit contenir de 1 à 32 caractères.');
                foreach ($clean as $other) if (preg_match('/^'.preg_quote($other,'/').'$/iu',$name)) tournamentFail(422,'Choisis un nom différent pour chaque équipe.');
                $clean[]=$name;
            }
            if (array_key_exists('captains',$input)) {
                $captains=$input['captains'];
                if (!is_array($captains) || !array_is_list($captains) || count($captains)!==6) tournamentFail(422,'Indique un choix de capitaine pour chacune des six équipes.');
                foreach ($captains as $i=>$captain) {
                    if ($captain!==null && (!is_string($captain) || !in_array($captain,array_column($state['teams'][$i]['players'],'id'),true))) tournamentFail(422,'Le capitaine doit être un joueur de son équipe.');
                }
                foreach ($captains as $i=>$captain) $state['teams'][$i]['captainId']=$captain;
            }
            foreach ($clean as $i=>$name) $state['teams'][$i]['name']=$name;
        } elseif ($action==='score') {
            $id=$input['match']??null; $score=$input['score']??null;
            if (!is_int($id) || $id<0 || $id>17) tournamentFail(422,'Match invalide.');
            if ($score!==null && (!is_array($score) || !array_is_list($score) || count($score)!==2 || !is_int($score[0]) || !is_int($score[1]) || min($score)<0 || max($score)>200)) tournamentFail(422,'Saisis deux scores entiers entre 0 et 200.');
            if ($id>=15 && tournamentFinals($state)===null) tournamentFail(422,'Termine le championnat et départage les égalités avant les finales.');
            if ($id>=15 && $score!==null && $score[0]===$score[1]) tournamentFail(422,'Un match de classement doit avoir un vainqueur après départage sur le terrain.');
            if ($id<15 && $score!==$state['scores'][$id]) {
                if (count(array_filter(array_slice($state['scores'],15),static fn($s)=>$s!==null))) tournamentFail(409,'Les matchs de classement ont commencé. Efface leurs scores avant de corriger le championnat.');
                unset($state['tieOrder']);
            }
            $state['scores'][$id]=$score;
        } elseif ($action==='ties') {
            for ($i=0;$i<15;$i++) if ($state['scores'][$i]===null) tournamentFail(422,'Termine les quinze rencontres.');
            if (count(array_filter(array_slice($state['scores'],15),static fn($s)=>$s!==null))) tournamentFail(409,'Efface les scores de classement avant de modifier le départage.');
            $order=$input['order']??[]; $sorted=$order; if(is_array($sorted)) sort($sorted);
            if ($sorted!==range(0,5)) tournamentFail(422,'Indique chaque équipe une seule fois.');
            $state['tieOrder']=$order;
        } elseif ($action==='settings') {
            $s=$input['settings']??[];
            if (!is_string($s['start']??null) || !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/',$s['start'])) tournamentFail(422,'Heure invalide.');
            foreach (['minutes'=>[5,30],'transition'=>[1,15],'fields'=>[1,3],'break'=>[5,30]] as $key=>[$min,$max]) if(!is_int($s[$key]??null) || $s[$key]<$min || $s[$key]>$max) tournamentFail(422,'Paramètres horaires invalides.');
            $state['settings']=array_intersect_key($s,array_flip(['start','minutes','transition','fields','break']));
        } else tournamentFail(422,'Action inconnue.');
    }
    $raw=json_encode($state,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    $temp=tempnam($private,'tournament-');
    if (!$temp || file_put_contents($temp,$raw,LOCK_EX)!==strlen($raw)) tournamentFail(503,'Enregistrement impossible.');
    chmod($temp,0600);
    if (!rename($temp,$path)) { @unlink($temp); tournamentFail(503,'Enregistrement impossible.'); }
    $version=hash('sha256',$raw);
} elseif ($_SERVER['REQUEST_METHOD']!=='GET') tournamentFail(405,'Méthode non autorisée.');
flock($lock,LOCK_UN); fclose($lock);
flock($drawLock,LOCK_UN); fclose($drawLock);
if ($_SERVER['REQUEST_METHOD']==='POST') bearsBackupAfterWrite($private);
$compositions=static fn(array $teams)=>array_map(static fn($team)=>['players'=>$team['players'],'exceptions'=>$team['exceptions']],$teams);
echo json_encode(['csrf'=>$_SESSION['family_dashboard_csrf'],'version'=>$version,'state'=>$state,'preview'=>$source['teams'],'source'=>$source,'sourceChanged'=>$state!==null && $compositions($state['teams'])!==$compositions($source['teams']),'matches'=>tournamentMatches(),'standings'=>$state?tournamentStandings($state['scores']):[],'finals'=>$state?tournamentFinals($state):null],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
