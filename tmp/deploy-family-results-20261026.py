import argparse
import difflib
import hashlib
import json
import sys
from pathlib import Path
from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parents[1]
projector = SourceFileLoader('projector', str(ROOT / 'tmp' / 'deploy-projector-20261025.py')).load_module()
import paramiko

EXISTING = ['journee-familiale.html', 'membres.php', 'membres.css', 'tournoi-public.php']
NEW = ['family-results.css', 'scripts/family-results.js']
BACKUP = ROOT / 'deploy' / 'backup-family-results-20261026'
MANIFEST = BACKUP / 'manifest.json'

def sha(data):
    return hashlib.sha256(data).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['preflight', 'upload'])
mode = parser.parse_args().mode
manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if mode == 'upload' else None
policy = projector.HostPolicy(manifest['hostKey'] if manifest else None)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(policy)
client.connect(projector.HOST, port=22, username=projector.USER, password=projector.credential(), look_for_keys=False, allow_agent=False, timeout=15)
try:
    with client.open_sftp() as sftp:
        if mode == 'preflight':
            BACKUP.mkdir(parents=True, exist_ok=True)
            hashes = {}
            for name in EXISTING:
                remote = projector.read_remote(sftp, name)
                local = (ROOT / name).read_bytes()
                dest = BACKUP / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(remote)
                hashes[name] = sha(remote)
                print(json.dumps({'file': name, 'remote_sha': sha(remote), 'local_sha': sha(local), 'equal': remote == local}))
                if remote != local:
                    diff = list(difflib.unified_diff(remote.decode('utf-8').splitlines(), local.decode('utf-8').splitlines(), fromfile='OVH', tofile='local', lineterm=''))
                    print('\n'.join(diff[:80]))
            for name in NEW:
                if projector.exists(sftp, name):
                    raise RuntimeError(f'Expected new remote file already exists: {name}')
            MANIFEST.write_text(json.dumps({'hostKey': policy.fingerprint, 'existing': hashes, 'new': NEW}, indent=2), encoding='utf-8')
        else:
            for name in EXISTING:
                if sha(projector.read_remote(sftp, name)) != manifest['existing'][name]:
                    raise RuntimeError(f'Remote changed since preflight: {name}')
            for name in NEW:
                if projector.exists(sftp, name):
                    raise RuntimeError(f'New file appeared remotely: {name}')
            for name in ['family-results.css', 'scripts/family-results.js', 'tournoi-public.php', 'journee-familiale.html', 'membres.css', 'membres.php']:
                source = ROOT / name
                sftp.put(str(source), f'{projector.REMOTE}/{name}', confirm=True)
                if sha(projector.read_remote(sftp, name)) != sha(source.read_bytes()):
                    raise RuntimeError(f'Upload verification failed: {name}')
                print(f'Published and verified {name}: {sha(source.read_bytes())}')
finally:
    client.close()
