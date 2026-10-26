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
if ($_SERVER['REQUEST_METHOD']==='POST') {
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>10000) tournamentFail(413,'Requête trop grande.');
    $input=json_decode(file_get_contents('php://input'),true);
    if (!is_array($input) || !is_string($input['csrf']??null) || !hash_equals($_SESSION['family_dashboard_csrf'],$input['csrf'])) tournamentFail(403,'Session expirée. Recharge la page.');
    if (!is_string($input['version']??null) || !hash_equals($version,$input['version'])) tournamentFail(409,'Le tournoi a changé sur un autre écran. Recharge avant de réessayer.');
    $action=$input['action']??'';
    if ($action==='validate') {
        if ($state!==null) tournamentFail(409,'Les équipes sont déjà validées.');
        if (($input['acceptExceptions']??false)!==true) tournamentFail(422,'Confirme les compositions et les dérogations.');
        $state=['teams'=>require __DIR__.'/tournoi-seed.php','validatedAt'=>gmdate('c'),'scores'=>array_fill(0,18,null),'settings'=>['start'=>'09:00','minutes'=>10,'transition'=>2,'fields'=>1,'break'=>10]];
    } else {
        if ($state===null) tournamentFail(422,'Valide d’abord les équipes.');
        if ($action==='score') {
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
            foreach (['minutes'=>[5,30],'transition'=>[1,15],'fields'=>[1,2],'break'=>[5,30]] as $key=>[$min,$max]) if(!is_int($s[$key]??null) || $s[$key]<$min || $s[$key]>$max) tournamentFail(422,'Paramètres horaires invalides.');
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
if ($_SERVER['REQUEST_METHOD']==='POST') bearsBackupAfterWrite($private);
echo json_encode(['csrf'=>$_SESSION['family_dashboard_csrf'],'version'=>$version,'state'=>$state,'preview'=>$state===null?require __DIR__.'/tournoi-seed.php':null,'matches'=>tournamentMatches(),'standings'=>$state?tournamentStandings($state['scores']):[],'finals'=>$state?tournamentFinals($state):null],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
