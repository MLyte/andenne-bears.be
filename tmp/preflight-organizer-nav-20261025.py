import difflib
import importlib.util
import json
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('projector_deploy',root/'tmp'/'deploy-projector-20261025.py')
helper=importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
import paramiko

sys.stdout.reconfigure(encoding='utf-8',errors='replace')
backup=root/'deploy'/'backup-organizer-nav-20261025'
manifest=backup/'manifest.json'
old=json.loads((root/'deploy'/'backup-projector-20261025'/'manifest.json').read_text(encoding='utf-8'))
policy=helper.HostPolicy(old['hostKey'])
client=paramiko.SSHClient()
client.set_missing_host_key_policy(policy)
client.connect(helper.HOST,port=22,username=helper.USER,password=helper.credential(),look_for_keys=False,allow_agent=False,timeout=15)
try:
    with client.open_sftp() as sftp:
        sftp.chdir(helper.REMOTE)
        if helper.exists(sftp,'organizer-nav.css'):
            raise RuntimeError('organizer-nav.css existe déjà en ligne.')
        backup.mkdir(parents=True,exist_ok=True)
        hashes={}
        for path in ['suivi-inscriptions.php','tirage-equipes.html']:
            remote=helper.read_remote(sftp,path)
            (backup/path).write_bytes(remote)
            hashes[path]=helper.sha(remote)
            local=(root/path).read_bytes()
            changes=list(difflib.unified_diff(remote.decode('utf-8').splitlines(),local.decode('utf-8').splitlines(),fromfile='en ligne',tofile='local',lineterm=''))
            print(path,'remote_sha256',hashes[path],'diff_lines',len(changes))
            print('\n'.join(changes[:95]))
        manifest.write_text(json.dumps({'hostKey':policy.fingerprint,'existing':hashes},indent=2),encoding='utf-8')
        print('Préparation terminée, aucun fichier distant modifié.')
finally:
    client.close()
