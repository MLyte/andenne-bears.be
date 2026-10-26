import importlib.util
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('projector_deploy',root/'tmp'/'deploy-projector-20261025.py')
helper=importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
import paramiko

manifest=json.loads((root/'deploy'/'backup-organizer-nav-20261025'/'manifest.json').read_text(encoding='utf-8'))
policy=helper.HostPolicy(manifest['hostKey'])
client=paramiko.SSHClient()
client.set_missing_host_key_policy(policy)
client.connect(helper.HOST,port=22,username=helper.USER,password=helper.credential(),look_for_keys=False,allow_agent=False,timeout=15)
try:
    with client.open_sftp() as sftp:
        sftp.chdir(helper.REMOTE)
        for path,expected in manifest['existing'].items():
            if helper.sha(helper.read_remote(sftp,path))!=expected:
                raise RuntimeError(f'{path} a changé depuis la sauvegarde : transfert annulé.')
        if helper.exists(sftp,'organizer-nav.css'):
            raise RuntimeError('organizer-nav.css existe déjà : transfert annulé.')
        for path in ['organizer-nav.css','tirage-equipes.html','suivi-inscriptions.php']:
            source=root/path
            sftp.put(str(source),f'{helper.REMOTE}/{path}',confirm=True)
            digest=helper.sha(source.read_bytes())
            if helper.sha(helper.read_remote(sftp,path))!=digest:
                raise RuntimeError(f'Vérification distante échouée : {path}')
            print(f'Publié et vérifié {path} {digest}')
finally:
    client.close()
