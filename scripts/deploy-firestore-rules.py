"""Deploy the repository rules with the existing service account; preserve the old ruleset."""
from pathlib import Path
import argparse
import json

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    credentials = service_account.Credentials.from_service_account_file(
        root / 'firebaseadmin.json', scopes=['https://www.googleapis.com/auth/cloud-platform'])
    session = AuthorizedSession(credentials)
    base = 'https://firebaserules.googleapis.com/v1/'
    project = 'projects/' + credentials.project_id
    release = project + '/releases/cloud.firestore'
    response = session.get(base + release, timeout=40)
    response.raise_for_status()
    current = response.json()
    rules = session.get(base + current['rulesetName'], timeout=40)
    rules.raise_for_status()
    backup = root / 'tmp/firestore-rules-before-import.json'
    if not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(json.dumps({'release': current, 'ruleset': rules.json()}, indent=2))
    print('Active ruleset backed up to', backup.relative_to(root))
    content = (root / 'firebase/firestore.rules').read_text()
    if rules.json()['source']['files'][0]['content'] == content:
        print('Rules already current')
        return
    if not args.apply:
        print('Preview only; use --apply to compile and release repository rules')
        return
    compiled = session.post(base + project + '/rulesets', json={'source': {'files': [
        {'name': 'firestore.rules', 'content': content}]}}, timeout=60)
    compiled.raise_for_status()
    result = session.patch(base + release,
        json={'release': {'name': release, 'rulesetName': compiled.json()['name']}, 'updateMask': 'rulesetName'}, timeout=60)
    result.raise_for_status()
    print('Firestore rules deployed:', result.json()['rulesetName'])


if __name__ == '__main__':
    main()
