from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'membres.php'
source = path.read_text(encoding='utf-8')
source = source.replace('<script src="scripts/membres-tournoi.js?v=<?= substr(hash_file(\'sha256\', __DIR__ . \'/scripts/membres-tournoi.js\'), 0, 16) ?>" defer></script>', '')
start = source.index('<section class="members-tournament-results"')
end = source.index('</section>', start) + len('</section>')
source = source[:start] + source[end:]
source = source.replace('<section class="members-feed" aria-labelledby="members-archived-title">', '<section class="members-feed" aria-labelledby="members-archived-title">')
path.write_text(source, encoding='utf-8')

path = root / 'membres.css'
lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
lines = [line for line in lines if not line.startswith(('.members-tournament-results', '.members-tournament-ranking', '@media (max-width: 760px) { .members-tournament-results'))]
path.write_text(''.join(lines), encoding='utf-8')
