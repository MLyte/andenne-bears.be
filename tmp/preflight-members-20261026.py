import difflib
import hashlib
import json
import sys
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp'))
from importlib.machinery import SourceFileLoader

projector = SourceFileLoader('projector', str(ROOT / 'tmp' / 'deploy-projector-20261025.py')).load_module()
import paramiko

FILES = ['index.html', 'bears.css', 'membres.php', 'membres.css', 'scripts/membres-tournoi.js']
EXISTING = FILES[:-1]
BACKUP = ROOT / 'deploy' / 'backup-members-archive-20261026'
MANIFEST = BACKUP / 'manifest.json'
parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['preflight', 'upload'])
mode = parser.parse_args().mode
previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if mode == 'upload' else None
client = paramiko.SSHClient()
policy = projector.HostPolicy(previous['hostKey'] if previous else None)
client.set_missing_host_key_policy(policy)
client.connect(projector.HOST, port=22, username=projector.USER, password=projector.credential(), look_for_keys=False, allow_agent=False, timeout=15)
try:
    with client.open_sftp() as sftp:
        if mode == 'preflight':
            BACKUP.mkdir(parents=True, exist_ok=True)
            hashes = {}
            for name in EXISTING:
                remote = projector.read_remote(sftp, name)
                dest = BACKUP / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(remote)
                hashes[name] = hashlib.sha256(remote).hexdigest()
                print(f'Backed up {name}: {hashes[name]}')
            if projector.exists(sftp, FILES[-1]):
                raise RuntimeError('New script already exists remotely')
            MANIFEST.write_text(json.dumps({'hostKey':policy.fingerprint, 'existing':hashes, 'new':FILES[-1]}, indent=2), encoding='utf-8')
        else:
            for name in EXISTING:
                actual = hashlib.sha256(projector.read_remote(sftp, name)).hexdigest()
                if actual != previous['existing'][name]:
                    raise RuntimeError(f'Remote changed after preflight: {name}')
            if projector.exists(sftp, FILES[-1]):
                raise RuntimeError('New script already exists remotely')
            for name in ['scripts/membres-tournoi.js', 'membres.css', 'bears.css', 'membres.php', 'index.html']:
                source = ROOT / name
                sftp.put(str(source), f'{projector.REMOTE}/{name}', confirm=True)
                local_hash = hashlib.sha256(source.read_bytes()).hexdigest()
                remote_hash = hashlib.sha256(projector.read_remote(sftp, name)).hexdigest()
                if local_hash != remote_hash:
                    raise RuntimeError(f'Upload verification failed: {name}')
                print(f'Published and verified {name}: {local_hash}')
finally:
    client.close()
