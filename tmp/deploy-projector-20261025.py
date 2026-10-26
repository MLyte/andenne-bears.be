import argparse
import base64
import difflib
import hashlib
import json
import sys
import urllib.request
from pathlib import Path
from xml.etree import ElementTree

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp' / 'deploy-projector-deps'))
import paramiko

HOST = 'ftp.cluster115.hosting.ovh.net'
USER = 'andennebh'
REMOTE = '/home/andennebh/www'
EXISTING = ['scripts/tournoi.js', 'tournoi.html']
NEW = ['tournoi-public.php', 'scripts/tournoi-ecran.js', 'tournoi-ecran.css', 'tournoi-ecran.html']
ORDER = NEW + EXISTING
BACKUP = ROOT / 'deploy' / 'backup-projector-20261025'
MANIFEST = BACKUP / 'manifest.json'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def credential():
    path = Path.home() / 'AppData' / 'Roaming' / 'FileZilla' / 'sitemanager.xml'
    doc = ElementTree.parse(path)
    for site in doc.findall('.//Server'):
        if site.findtext('Host') == HOST and site.findtext('User') == USER:
            value = site.findtext('Pass')
            if not value or site.find('Pass').get('encoding') != 'base64':
                raise RuntimeError('Mot de passe SFTP enregistré indisponible.')
            return base64.b64decode(value).decode('utf-8')
    raise RuntimeError('Compte OVH attendu absent de FileZilla.')

class HostPolicy(paramiko.MissingHostKeyPolicy):
    def __init__(self, expected=None):
        self.expected = expected
        self.fingerprint = None
    def missing_host_key(self, client, hostname, key):
        self.fingerprint = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
        if self.expected and self.fingerprint != self.expected:
            raise RuntimeError('La clé SSH du serveur a changé : transfert refusé.')

def read_remote(sftp, path):
    with sftp.open(f'{REMOTE}/{path}', 'rb') as stream:
        return stream.read()

def exists(sftp, path):
    try:
        sftp.stat(f'{REMOTE}/{path}')
        return True
    except FileNotFoundError:
        return False

def main(mode):
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if mode == 'upload' else None
    policy = HostPolicy(previous['hostKey'] if previous else None)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(policy)
    client.connect(HOST, port=22, username=USER, password=credential(), look_for_keys=False, allow_agent=False, timeout=15)
    try:
        with client.open_sftp() as sftp:
            sftp.chdir(REMOTE)
            remote_bytes = {path: read_remote(sftp,path) for path in EXISTING}
            for path in NEW:
                if exists(sftp,path):
                    raise RuntimeError(f'Le nouveau fichier distant existe déjà : {path}')
            for path in EXISTING:
                live = urllib.request.urlopen(f'https://www.andenne-bears.be/{path}',timeout=12).read()
                if live != remote_bytes[path]:
                    raise RuntimeError(f'Le fichier distant diffère de la version HTTPS : {path}')
            if mode == 'preflight':
                BACKUP.mkdir(parents=True, exist_ok=True)
                for path, data in remote_bytes.items():
                    destination = BACKUP / path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data)
                    print(f'Sauvegarde {path} {sha(data)}')
                    diff = difflib.unified_diff(data.decode('utf-8').splitlines(),(ROOT/path).read_text(encoding='utf-8').splitlines(),fromfile='en ligne',tofile='local',lineterm='')
                    for line in list(diff)[:35]: print(line)
                MANIFEST.write_text(json.dumps({'hostKey':policy.fingerprint,'existing':{p:sha(b) for p,b in remote_bytes.items()},'new':NEW},indent=2),encoding='utf-8')
                print('Préparation terminée. Aucun fichier distant modifié.')
                return
            for path, data in remote_bytes.items():
                if sha(data) != previous['existing'][path]:
                    raise RuntimeError(f'Le fichier distant a changé depuis la sauvegarde : {path}')
            for path in ORDER:
                source=ROOT/path
                sftp.put(str(source),f'{REMOTE}/{path}',confirm=True)
                if sha(read_remote(sftp,path)) != sha(source.read_bytes()):
                    raise RuntimeError(f'Vérification distante échouée : {path}')
                print(f'Publié et vérifié {path} {sha(source.read_bytes())}')
    finally:
        client.close()

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['preflight','upload'])
    main(parser.parse_args().mode)
