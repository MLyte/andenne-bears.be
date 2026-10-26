<?php
declare(strict_types=1);

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
