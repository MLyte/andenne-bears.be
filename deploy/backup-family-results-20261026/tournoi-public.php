<?php
declare(strict_types=1);

require_once __DIR__.'/tournoi-domain.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

if (($_SERVER['REQUEST_METHOD']??'')!=='GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['error'=>'Méthode non autorisée.'],JSON_UNESCAPED_UNICODE);
    exit;
}

$config=require __DIR__.'/config/family-day-config.php';
$private=realpath($config['storage_dir']??'');
$web=realpath(__DIR__);
if (!$private || !$web || str_starts_with(strtolower($private.DIRECTORY_SEPARATOR),strtolower($web.DIRECTORY_SEPARATOR))) {
    http_response_code(503);
    echo json_encode(['error'=>'Scores indisponibles.'],JSON_UNESCAPED_UNICODE);
    exit;
}

$path=$private.'/family-tournament-2026.json';
if (is_link($path) || is_link($path.'.lock')) {
    http_response_code(503);
    echo json_encode(['error'=>'Scores indisponibles.'],JSON_UNESCAPED_UNICODE);
    exit;
}

$state=null;
$updatedAt=null;
if (is_file($path)) {
    $lock=@fopen($path.'.lock','c+');
    if (!$lock || !flock($lock,LOCK_SH)) {
        http_response_code(503);
        echo json_encode(['error'=>'Scores momentanément indisponibles.'],JSON_UNESCAPED_UNICODE);
        exit;
    }
    $raw=file_get_contents($path);
    $updatedAt=filemtime($path);
    flock($lock,LOCK_UN);
    fclose($lock);
    $state=$raw===false ? null : json_decode($raw,true);
    if (!is_array($state) || !isset($state['teams'],$state['scores'],$state['settings']) || count($state['teams'])!==6 || count($state['scores'])!==18) {
        http_response_code(503);
        echo json_encode(['error'=>'Scores momentanément indisponibles.'],JSON_UNESCAPED_UNICODE);
        exit;
    }
}

echo json_encode([
    'ready'=>$state!==null,
    'updatedAt'=>$updatedAt,
    'teams'=>$state ? array_map(static fn($team)=>['name'=>$team['name']],$state['teams']) : [],
    'scores'=>$state['scores']??array_fill(0,18,null),
    'settings'=>$state['settings']??null,
    'matches'=>tournamentMatches(),
    'standings'=>$state ? tournamentStandings($state['scores']) : [],
    'finals'=>$state ? tournamentFinals($state) : null,
    'tieOrder'=>$state['tieOrder']??null,
],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
