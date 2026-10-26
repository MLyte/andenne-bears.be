import json
import sys
from pathlib import Path
from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parents[1]
projector = SourceFileLoader('projector', str(ROOT / 'tmp' / 'deploy-projector-20261025.py')).load_module()
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(projector.HostPolicy())
client.connect(projector.HOST, port=22, username=projector.USER, password=projector.credential(), look_for_keys=False, allow_agent=False, timeout=15)
try:
    with client.open_sftp() as sftp:
        with sftp.open('/home/andennebh/bears-family-day-private/family-tournament-2026.json', 'rb') as stream:
            state = json.load(stream)
        print('sourceVersion', state.get('sourceVersion'))
        for team in state['teams']:
            print(json.dumps({'team': team['name'], 'players': [player['name'] for player in team['players']]}, ensure_ascii=False))
finally:
    client.close()
