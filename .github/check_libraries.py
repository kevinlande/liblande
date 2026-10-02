#!/usr/bin/env python3
"""LibLande on GitHub Pages: are its libraries out of date, or unsafe?

    python3 check_libraries.py vendor/versions.json [--markdown]

For each library in versions.json (written by vendor.py): the newest
version on cdnjs, and any security advisory GitHub lists for the version
in use (npm package). Prints what it finds (or, with --markdown, a report
for a GitHub issue) and exits 1 if there's anything; 0 if all's current;
2 if it couldn't check. Used by build.py on every build, and once a month
by the liblande repo's GitHub Action, which opens an issue.
"""
import hashlib
import json
import os
import subprocess
import sys


def get(url):
    # (curl: some Pythons here have no certificates for https.)
    cmd = ['curl', '-fsSL', '--max-time', '20', '-H', 'Accept: application/json', url]
    if os.environ.get('GH_TOKEN') and 'api.github.com' in url:
        cmd[1:1] = ['-H', 'Authorization: Bearer ' + os.environ['GH_TOKEN']]
    return json.loads(subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout)


def check(versions):
    """[(library, kind, text, link)] for each finding."""
    found = []
    for lib in versions:
        name, cur = lib['cdnjs'], lib['version']
        latest = get('https://api.cdnjs.com/libraries/' + name + '?fields=version').get('version')
        if latest and latest != cur:
            found.append((name, 'update', 'version ' + latest + ' is out (LibLande uses ' + cur + ')',
                          'https://cdnjs.com/libraries/' + name))
        advisories = get('https://api.github.com/advisories?ecosystem=npm&affects=' + lib['npm'] + '@' + cur)
        for a in advisories:
            fixed = ', '.join(str(v.get('first_patched_version') or v.get('patched_versions') or '?')
                              for v in a.get('vulnerabilities', []) if (v.get('package') or {}).get('name') == lib['npm'])
            found.append((name, 'security', (a.get('severity') or '?') + ': ' + a.get('summary', '') +
                          (' (fixed in ' + fixed + ')' if fixed else ''), a.get('html_url', '')))
    return found


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'vendor/versions.json'
    with open(path) as f:
        versions = json.load(f)
    try:
        found = check(versions)
    except Exception as e:
        print("Couldn't check the libraries for updates:", e)
        return 2
    if '--markdown' in sys.argv:
        if found:
            print('LibLande\'s libraries (in `vendor/`, from vendor.py) have news:\n')
            for name, kind, text, link in sorted(found, key=lambda x: x[1] != 'security'):
                print('- **' + name + '** ' + ('(security) ' if kind == 'security' else '') + text + ' ' + link)
            print('\nTo update: change the version in index.html, run `python3 pages/vendor.py`, '
                  'run the tests, then build and publish.')
            # (So the monthly check can tell if this news was reported already.)
            key = hashlib.sha1(json.dumps(sorted(found)).encode()).hexdigest()[:12]
            print('\n<!-- liblande-report: ' + key + ' -->')
    else:
        for name, kind, text, link in found:
            print(('Security advisory for ' if kind == 'security' else 'Newer ') + name + ': ' + text)
        if not found:
            print('Libraries up to date: ' + ', '.join(l['cdnjs'] + ' ' + l['version'] for l in versions))
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
