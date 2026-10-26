from pathlib import Path
import hashlib,requests
files=['journee-familiale.html','bears.css','scripts/family-day.js','images/family-day-parking-evelette-2026.jpg']
for f in files:
 local=Path(f).read_bytes()
 assert local==Path('tmp/parking-release-20261021/verified',f).read_bytes(), f+' SFTP mismatch'
 r=requests.get('https://www.andenne-bears.be/'+f+'?verify=4f84e93',timeout=30)
 r.raise_for_status()
 assert hashlib.sha256(local).digest()==hashlib.sha256(r.content).digest(), f+' HTTPS mismatch'
 print(f, r.status_code, 'SFTP + HTTPS SHA256 OK')
