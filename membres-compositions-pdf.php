<?php
declare(strict_types=1);
require __DIR__ . '/membres-data.php';
memberSession();
if (!memberStaff()) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Connexion staff requise.');
}

try {
    $data = memberData(memberConfig());
} catch (Throwable $exception) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Export indisponible. Réessaie plus tard.');
}

// A small, self-contained PDF writer keeps the private roster on this server.
function compositionPdfString(string $text): string
{
    $encoded = iconv('UTF-8', 'Windows-1252//TRANSLIT', $text);
    if ($encoded === false) $encoded = iconv('UTF-8', 'ASCII//TRANSLIT', $text) ?: '';
    $encoded = preg_replace('/[^\x20-\xff]/', '?', $encoded) ?? '';
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $encoded);
}

function compositionPdfText(float $x, float $top, string $text, float $size = 9, bool $bold = false): string
{
    return sprintf("BT /F%d %.1F Tf %.1F %.1F Td (%s) Tj ET\n", $bold ? 2 : 1, $size, $x, 595 - $top, compositionPdfString($text));
}

function compositionPdfLine(float $x1, float $top1, float $x2, float $top2): string
{
    return sprintf("%.1F %.1F m %.1F %.1F l S\n", $x1, 595 - $top1, $x2, 595 - $top2);
}

function compositionPdfRect(float $x, float $top, float $width, float $height): string
{
    return sprintf("%.1F %.1F %.1F %.1F re S\n", $x, 595 - $top - $height, $width, $height);
}

function compositionPdfShort(string $text, int $limit): string
{
    $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    return count($chars) <= $limit ? $text : implode('', array_slice($chars, 0, $limit - 1)) . '…';
}

function compositionPdfLines(string $text, int $limit = 40): array
{
    $words = preg_split('/\s+/u', trim($text)) ?: [];
    $lines = [];
    $line = '';
    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if (count(preg_split('//u', $candidate, -1, PREG_SPLIT_NO_EMPTY) ?: []) <= $limit) { $line = $candidate; continue; }
        if ($line !== '') $lines[] = $line;
        $line = $word;
    }
    if ($line !== '') $lines[] = $line;
    if (count($lines) > 2) {
        $lines = array_slice($lines, 0, 2);
        $lines[1] = compositionPdfShort($lines[1], $limit - 1) . '…';
    }
    return array_map(static fn (string $value): string => compositionPdfShort($value, $limit), $lines);
}

function compositionPdfPlayer(?array $player): string
{
    if (!$player) return '—';
    return trim((string) ($player['name'] ?? '')) . (empty($player['number']) ? '' : '  #' . $player['number']);
}

function compositionPdfPosition(string $unit, string $position): string
{
    $labels = [
        'attaque' => ['WR1' => 'X · WR1', 'WR2' => 'Z · WR2', 'WR3' => 'H · WR3', 'TE' => 'Y · TE'],
        'defense' => ['DT1' => 'T · DT1', 'DT2' => 'N · DT2', 'DE2' => 'E · DE2', 'DE1' => 'SAM · LB',
            'LB1' => 'MIKE · LB', 'LB2' => 'WILL · LB', 'LB3' => 'BEAR · LB', 'CB1' => 'C · CB1', 'CB2' => 'C · CB2'],
        'kick_return' => ['L1' => 'LT', 'L2' => 'LG', 'FB' => 'C', 'R2' => 'RG', 'R1' => 'RT',
            'L4' => 'Wing gauche', 'R4' => 'Wing droit', 'L3' => 'Shield gauche', 'R3' => 'Shield droit',
            'KR1' => 'Returner gauche', 'KR2' => 'Returner droit'],
        'punt_return' => ['L3' => 'T · DL', 'L4' => 'N · DL', 'R3' => 'E · DL', 'L2' => 'SAM · LB',
            'L5' => 'MIKE · LB', 'R5' => 'WILL · LB', 'R2' => 'BEAR · LB', 'L1' => 'C · CB1',
            'R1' => 'C · CB2', 'PR' => 'PR · Returner'],
        'punt' => ['L1' => 'G · WR', 'R1' => 'G · WR', 'L2' => 'LT', 'L3' => 'LG',
            'R3' => 'RG', 'R2' => 'RT', 'L4' => 'W', 'R4' => 'W'],
        'field_goal' => ['L' => 'X · WR', 'R' => 'Z · WR', 'C' => 'F', 'B' => 'Y'],
    ];
    return $labels[$unit][$position] ?? $position;
}

function compositionPdfWishes(array $player, string $unit): string
{
    $key = $unit === 'attaque' ? 'offense' : ($unit === 'defense' ? 'defense' : 'special_teams');
    $choices = $player[$key] ?? [];
    return is_array($choices) && $choices ? implode(', ', $choices) : 'Non indiqués';
}

$names = ['attaque' => 'Attaque', 'defense' => 'Défense', 'kickoff' => 'Kickoff',
    'kick_return' => 'Kick return', 'punt' => 'Punt', 'punt_return' => 'Punt return',
    'field_goal' => 'Field goal / PAT'];
// Row and column positions mirror the seven formations shown in membres.css.
$formation = [
    'attaque' => ['WR1' => [1, 1], 'LT' => [1, 3], 'LG' => [1, 4], 'C' => [1, 5], 'RG' => [1, 6], 'RT' => [1, 7], 'WR2' => [1, 9],
        'WR3' => [2, 2], 'TE' => [2, 8], 'QB' => [2, 5], 'RB' => [3, 5]],
    'defense' => ['DT1' => [1, 3], 'DT2' => [1, 5], 'DE2' => [1, 7], 'DE1' => [2, 2], 'LB1' => [2, 4], 'LB2' => [2, 6],
        'LB3' => [2, 8], 'CB1' => [3, 1], 'CB2' => [3, 9], 'SS' => [4, 3], 'FS' => [4, 7]],
    'kickoff' => ['L1' => [1, 1], 'L2' => [1, 2], 'L3' => [1, 3], 'L4' => [1, 4], 'L5' => [1, 5],
        'R5' => [1, 7], 'R4' => [1, 8], 'R3' => [1, 9], 'R2' => [1, 10], 'R1' => [1, 11], 'K' => [2, 6]],
    'kick_return' => ['L1' => [1, 3], 'L2' => [1, 4], 'L3' => [3, 4], 'R3' => [3, 6], 'R2' => [1, 6], 'R1' => [1, 7],
        'L4' => [2, 2], 'R4' => [2, 8], 'FB' => [1, 5], 'KR1' => [4, 4], 'KR2' => [4, 6]],
    'punt' => ['L1' => [1, 1], 'L2' => [1, 3], 'L3' => [1, 4], 'LS' => [1, 5], 'R3' => [1, 6], 'R2' => [1, 7],
        'R1' => [1, 9], 'L4' => [2, 2], 'R4' => [2, 8], 'PP' => [3, 5], 'P' => [4, 5]],
    'punt_return' => ['L1' => [3, 1], 'L2' => [2, 2], 'L3' => [1, 3], 'L4' => [1, 5], 'R4' => [4, 3],
        'R3' => [1, 7], 'R2' => [2, 8], 'R1' => [3, 9], 'L5' => [2, 4], 'R5' => [2, 6], 'PR' => [5, 5]],
    'field_goal' => ['L' => [1, 1], 'LT' => [1, 3], 'LG' => [1, 4], 'LS' => [1, 5], 'RG' => [1, 6], 'RT' => [1, 7],
        'R' => [1, 9], 'C' => [2, 2], 'B' => [2, 8], 'H' => [3, 5], 'K' => [4, 4]],
];
$players = [];
foreach ($data['players'] as $player) if (!empty($player['approved'])) $players[$player['id']] = $player;
$pages = [];
$totalPages = count(MEMBER_UNITS);
$pageNumber = 0;
foreach (MEMBER_UNITS as $unit => $positions) {
    $pageNumber++;
    $board = $data['boards'][$unit] ?? [];
    $used = [];
    $potential = [];
    $stream = "0 g 0 G 0.7 w\n";
    $stream .= compositionPdfText(24, 30, 'ANDENNE BEARS  /  SENIORS TACKLE', 9, true);
    $stream .= compositionPdfText(24, 61, $names[$unit], 19, true);
    $stream .= compositionPdfText(690, 61, 'Composition de travail', 8);
    $stream .= "0.25 G\n" . compositionPdfLine(24, 73, 818, 73);
    $stream .= "0 G\n" . compositionPdfText(24, 91, 'FORMATION · STARTER ET BACKUP', 8.5, true);
    $stream .= compositionPdfText(690, 91, 'JOUEURS POTENTIELS', 8.5, true);
    $columns = $unit === 'kickoff' ? 11 : 9;
    $pitch = 650 / $columns;
    $cardWidth = $pitch - 3;
    $maxChars = $columns === 11 ? 13 : 17;
    foreach ($positions as $position) {
        [$row, $column] = $formation[$unit][$position];
        $x = 24 + ($column - 1) * $pitch;
        $top = 103 + ($row - 1) * 86;
        $slot = $board[$position] ?? [];
        $stream .= "0.55 G\n" . compositionPdfRect($x, $top, $cardWidth, 80);
        $stream .= compositionPdfLine($x, $top + 16, $x + $cardWidth, $top + 16);
        $stream .= compositionPdfLine($x, $top + 48, $x + $cardWidth, $top + 48);
        $stream .= "0 G\n" . compositionPdfText($x + 3, $top + 11, compositionPdfShort(compositionPdfPosition($unit, $position), $maxChars), 7.3, true);
        foreach (['starter' => 17, 'backup' => 49] as $role => $offset) {
            $id = $slot[$role] ?? null;
            $player = is_string($id) ? ($players[$id] ?? null) : null;
            if ($player) $used[$id] = true;
            $roleLabel = strtoupper($role) . ($player && !empty($player['number']) ? ' · #' . $player['number'] : '');
            $stream .= compositionPdfText($x + 3, $top + $offset + 8, $roleLabel, 6.5, true);
            $playerName = $player ? (string) ($player['name'] ?? '') : '—';
            foreach (compositionPdfLines($playerName, $maxChars) as $lineNumber => $line) {
                $stream .= compositionPdfText($x + 3, $top + $offset + 18 + $lineNumber * 8, $line, $columns === 11 ? 7.0 : 7.5);
            }
        }
        $id = $slot['potential'] ?? null;
        if (is_string($id) && isset($players[$id])) {
            $used[$id] = true;
            $potential[] = [$position, $players[$id]];
        }
    }
    if (!$potential) $stream .= compositionPdfText(690, 112, 'Aucun joueur potentiel placé.', 7.5);
    foreach ($potential as $index => [$position, $player]) {
        $top = 103 + $index * 39;
        $stream .= "0.78 G\n" . compositionPdfLine(690, $top + 36, 818, $top + 36);
        $stream .= "0 G\n" . compositionPdfText(690, $top + 8, compositionPdfShort(compositionPdfPosition($unit, $position), 23), 7.6, true);
        $potentialName = (empty($player['number']) ? '' : '#' . $player['number'] . ' · ') . (string) ($player['name'] ?? '');
        $stream .= compositionPdfText(690, $top + 19, compositionPdfShort($potentialName, 27), 7.4);
        $stream .= compositionPdfText(690, $top + 30, 'Souhaits : ' . compositionPdfShort(compositionPdfWishes($player, $unit), 19), 6.8);
    }
    $sideline = array_filter($players, static fn (array $player): bool => !isset($used[$player['id']]));
    $stream .= "0.25 G\n" . compositionPdfLine(24, 546, 818, 546);
    $stream .= "0 G\n" . compositionPdfText(24, 561, 'SIDELINE · ' . count($sideline) . ' joueur(s) disponibles dans l’espace staff', 8);
    $stream .= "0.25 G\n" . compositionPdfLine(24, 568, 818, 568);
    $stream .= "0 G\n" . compositionPdfText(24, 584, 'Document privé · Staff', 7.5);
    $stream .= compositionPdfText(790, 584, $pageNumber . ' / ' . $totalPages, 7.5);
    $pages[] = $stream;
}

$objects = [
    1 => '<< /Type /Catalog /Pages 2 0 R >>',
];
$unicodeObject = 5 + count($pages) * 2;
$objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode ' . $unicodeObject . ' 0 R >>';
$objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding /ToUnicode ' . $unicodeObject . ' 0 R >>';
$unicode = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n"
    . "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
    . "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n"
    . "1 begincodespacerange\n<00> <FF>\nendcodespacerange\n"
    . "1 beginbfrange\n<20> <7E> <0020>\nendbfrange\n";
$unicodePairs = [];
foreach (range(0x80, 0xff) as $code) {
    $value = @iconv('Windows-1252', 'UTF-16BE', chr($code));
    if ($value !== false) $unicodePairs[] = sprintf('<%02X> <%s>', $code, strtoupper(bin2hex($value)));
}
foreach (array_chunk($unicodePairs, 100) as $chunk) {
    $unicode .= count($chunk) . " beginbfchar\n" . implode("\n", $chunk) . "\nendbfchar\n";
}
$unicode .= "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
$objects[$unicodeObject] = '<< /Length ' . strlen($unicode) . ">>\nstream\n" . $unicode . "endstream";
$kids = [];
foreach ($pages as $index => $stream) {
    $pageObject = 5 + $index * 2;
    $contentObject = $pageObject + 1;
    $kids[] = $pageObject . ' 0 R';
    $objects[$pageObject] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' . $contentObject . ' 0 R >>';
    $objects[$contentObject] = '<< /Length ' . strlen($stream) . ">>\nstream\n" . $stream . "endstream";
}
$objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . $totalPages . ' >>';
ksort($objects);
$pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
$offsets = [0 => 0];
foreach ($objects as $number => $object) {
    $offsets[$number] = strlen($pdf);
    $pdf .= $number . " 0 obj\n" . $object . "\nendobj\n";
}
$xref = strlen($pdf);
$pdf .= 'xref' . "\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
foreach ($objects as $number => $_) $pdf .= sprintf("%010d 00000 n \n", $offsets[$number]);
$pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF\n";
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="compositions-andenne-bears.pdf"');
header('Content-Length: ' . strlen($pdf));
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
echo $pdf;
