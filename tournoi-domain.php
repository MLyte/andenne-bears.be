<?php
declare(strict_types=1);

/** Same distinct-person matching, in the same role order, as family-teams.js. */
function tournamentExceptions(array $players): array
{
    $roles = array_fill(0, count($players), -1);
    $assign = function(int $role, array &$visited) use (&$assign, &$roles, $players): bool {
        foreach ($players as $i => $player) {
            if (isset($visited[$i]) || ![$player['woman'], $player['minor'], !$player['bears']][$role]) continue;
            $visited[$i] = true;
            if ($roles[$i] === -1 || $assign($roles[$i], $visited)) { $roles[$i] = $role; return true; }
        }
        return false;
    };
    for ($role=0; $role<3; $role++) { $visited=[]; $assign($role,$visited); }
    $exceptions=[];
    foreach (['Femme','Moins de 18 ans','Hors Bears'] as $role=>$label) {
        if (!in_array($role,$roles,true)) $exceptions[]=$label.' : aucun représentant distinct disponible';
    }
    return $exceptions;
}

/** Read through the existing storage layer: SQL after migration, CSV otherwise. */
function tournamentDrawSource(string $private): array
{
    $rows=bearsReadRows($private,'teams');
    if ($rows===null) return ['teams'=>[], 'waiting'=>[], 'version'=>'', 'error'=>'Aucun tirage sauvegardé. Ouvre le tirage, puis clique sur « Sauver et ouvrir le tournoi ».'];
    $teams=[]; $waiting=[];
    foreach ($rows as $row) {
        [$kind,$team,$order,$id,$name,$bears,$woman,$minor,$present]=$row;
        if ($kind!=='joueur' || $present!=='oui') continue;
        if ($team==='attente') { $waiting[]=$name; continue; }
        if (!ctype_digit((string)$team) || (int)$team<1) continue;
        $teams[(int)$team][(int)$order]=['id'=>$id,'name'=>$name,'bears'=>$bears==='oui','woman'=>$woman==='oui','minor'=>$minor==='oui'];
    }
    ksort($teams);
    $result=[];
    foreach ($teams as $number=>$players) {
        ksort($players); $players=array_values($players);
        $result[]=['name'=>'Équipe '.$number,'players'=>array_map(static fn($p)=>['id'=>$p['id'],'name'=>$p['name']],$players),'exceptions'=>tournamentExceptions($players)];
    }
    $error=count($result)!==6 ? 'Ce planning demande six équipes. Corrige et sauvegarde le tirage avant validation.' : null;
    foreach ($result as $team) if(count($team['players'])<1 || count($team['players'])>6) $error='Chaque équipe doit compter de un à six joueurs.';
    return ['teams'=>$result,'waiting'=>$waiting,'version'=>hash('sha256',json_encode([$result,$waiting],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)),'error'=>$error];
}

function tournamentMatches(): array
{
    // Five rounds, one meeting per pair. Order avoids back-to-back games on one field.
    return [[0,5],[1,4],[2,3], [0,4],[5,3],[1,2], [0,3],[4,2],[5,1], [0,2],[3,1],[4,5], [0,1],[2,5],[3,4]];
}

function tournamentStandings(array $scores): array
{
    $rows = array_map(static fn($id) => ['id'=>$id, 'played'=>0, 'points'=>0, 'for'=>0, 'against'=>0, 'wins'=>0, 'draws'=>0, 'losses'=>0], range(0,5));
    foreach (tournamentMatches() as $i => [$a,$b]) {
        if (!isset($scores[$i])) continue;
        [$x,$y] = $scores[$i];
        foreach ([[$a,$x,$y],[$b,$y,$x]] as [$id,$own,$other]) {
            $rows[$id]['played']++;
            $rows[$id]['for'] += $own;
            $rows[$id]['against'] += $other;
            $rows[$id]['points'] += $own > $other ? 3 : ($own === $other ? 1 : 0);
            $rows[$id][$own > $other ? 'wins' : ($own === $other ? 'draws' : 'losses')]++;
        }
    }
    usort($rows, static fn($a,$b) => ($b['points'] <=> $a['points']) ?: (($b['for']-$b['against']) <=> ($a['for']-$a['against'])) ?: ($b['for'] <=> $a['for']) ?: ($a['id'] <=> $b['id']));
    return $rows;
}

function tournamentFinals(array $state): ?array
{
    for ($i=0;$i<15;$i++) if (!isset($state['scores'][$i])) return null;
    $rows = tournamentStandings($state['scores']);
    $order = $state['tieOrder'] ?? array_column($rows,'id');
    usort($rows, static fn($a,$b) => ($b['points'] <=> $a['points']) ?: (($b['for']-$b['against']) <=> ($a['for']-$a['against'])) ?: ($b['for'] <=> $a['for']) ?: (array_search($a['id'],$order,true) <=> array_search($b['id'],$order,true)));
    for ($i=1;$i<6;$i++) {
        $a=$rows[$i-1]; $b=$rows[$i];
        if ($a['points']===$b['points'] && $a['for']-$a['against']===$b['for']-$b['against'] && $a['for']===$b['for'] && !isset($state['tieOrder'])) return null;
    }
    $ids=array_column($rows,'id');
    return [[$ids[4],$ids[5]],[$ids[2],$ids[3]],[$ids[0],$ids[1]]];
}
