import argparse
import hashlib
import json
from pathlib import Path
from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parents[1]
projector = SourceFileLoader('projector', str(ROOT / 'tmp' / 'deploy-projector-20261025.py')).load_module()
import paramiko

FILES = ['family-results.css', 'journee-familiale.html']
BACKUP = ROOT / 'deploy' / 'backup-family-heading-20261026'
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
            for name in FILES:
                remote = projector.read_remote(sftp, name)
                (BACKUP / name).write_bytes(remote)
                hashes[name] = sha(remote)
                print(f'Backed up {name}: {hashes[name]}')
            MANIFEST.write_text(json.dumps({'hostKey': policy.fingerprint, 'existing': hashes}, indent=2), encoding='utf-8')
        else:
            for name in FILES:
                if sha(projector.read_remote(sftp, name)) != manifest['existing'][name]:
                    raise RuntimeError(f'Remote changed since preflight: {name}')
            for name in FILES:
                source = ROOT / name
                sftp.put(str(source), f'{projector.REMOTE}/{name}', confirm=True)
                if sha(projector.read_remote(sftp, name)) != sha(source.read_bytes()):
                    raise RuntimeError(f'Upload verification failed: {name}')
                print(f'Published and verified {name}: {sha(source.read_bytes())}')
finally:
    client.close()
