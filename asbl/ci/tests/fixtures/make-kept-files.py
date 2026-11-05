"""Kept release files for the tests: a folder as asbl/ci/release-keep.sh keeps it, whose files pass its `inside` check (the
files checked from inside) for a commit and a version, made small from that commit. The tests that need such a folder call
it: test-inside-check.sh (and, with --break, each refusal), test-step-model.sh (upload-kept's dry runs).

  python3 -I asbl/ci/tests/fixtures/make-kept-files.py --release-commit <repository> <commit> <version> <objects folder>
  python3 -I asbl/ci/tests/fixtures/make-kept-files.py <folder> <repository> <commit> <version> [--break <what>=<name>]...

--release-commit prints a commit whose CHANGELOG's first heading is "## <version> - ", as the commit of step 0 has it
(a release packs only such a commit; between a CHANGELOG commit and step 0 the checkout's is not one): <commit> itself
when it is one, else a scratch commit on it whose only change is that heading put first in db-template/CHANGELOG.md,
written into <objects folder> (created), never into the repository. The caller exports
GIT_ALTERNATE_OBJECT_DIRECTORIES=<objects folder>, so that every git command of the test can read it.

Writes into <folder> (created), for a commit whose CHANGELOG's first heading is this version's (else exit 1):
  datapallas.zip, datapallas-server.zip  DataPallas/CHANGELOG.md (the commit's), DataPallas/lib/burst/
                                         rb-common-<version>.jar and rb-reporting.jar (a few bytes each), and copies of a
                                         few of the commit's db-template files: one with its line endings flipped, and the
                                         plugin's single-paystub.php as NoExeAssembler writes it (the webportal sample)
  datapallas-src.zip                     git archive --format=zip --prefix=DataPallas/ <commit> (MAKE_KEPT_SRC_ZIP, a source
                                         zip this fixture made of the same commit: linked instead, faster)
  datapallas-server-docker.zip           DataPallas/docker-compose.yml pinning <RELEASE_IMAGE_REPO>:<version> (and :latest
                                         in a comment), the same copies, settings.xml with the runtime docker
  datapallas-server-image.tar            a docker save file holding only a config whose label version is <version>
  release-files-windows.txt              the pack's list: commit, version, the three Windows zips' sha256 and size
  MANIFEST.txt                           version, commit, each file's size and sha256, the image's id (its config's
                                         sha256) and build tag; no result line (the caller's)
--break makes one thing wrong, for a refusal:
  jar=<name>          DataPallas/lib/burst/<name> added to datapallas.zip
  source=<path>       that file of the commit changed in datapallas-src.zip
  template=<path>     that db-template copy (its path below db-template/) changed in datapallas.zip
  compose=<tag>       the docker zip's compose pins <RELEASE_IMAGE_REPO>:<tag> instead
Prints the image id (sha256:...). Exit 0, or 1 with the reason when the commit or a file it needs cannot be read.
"""
import hashlib, io, json, os, re, subprocess, sys, tarfile, zipfile

TEMPLATE = 'asbl/src/main/external-resources/db-template/'
CHANGELOG = TEMPLATE + 'CHANGELOG.md'
FIRST_HEADING = re.compile(rb'^## (\S+) - ', re.M)

def release_commit(repo, commit, version, objects):
    def git(*args, data=None, env=None):
        r = subprocess.run(['git', '-C', repo] + list(args), input=data, capture_output=True, env=env)
        if r.returncode != 0:
            sys.exit('make-kept-files: git %s failed: %s' % (args[0], r.stderr.decode(errors='replace').strip()))
        return r.stdout
    full = git('rev-parse', '--verify', commit + '^{commit}').decode().strip()
    text = git('show', '%s:%s' % (full, CHANGELOG))
    first = FIRST_HEADING.search(text)
    if first and first.group(1).decode() == version:
        print(full)
        return
    eol = b'\r\n' if b'\r\n' in text else b'\n'
    heading = (b'## ' + version.encode() + b' - 2026-11-05' + eol + eol +
               b'- a scratch commit of make-kept-files.py: this version first, as the commit of step 0 has it' + eol + eol)
    at = first.start() if first else len(text)
    common = git('rev-parse', '--git-common-dir').decode().strip()
    objects = os.path.abspath(objects)
    os.makedirs(objects, exist_ok=True)
    env = dict(os.environ, GIT_OBJECT_DIRECTORY=objects, GIT_INDEX_FILE=os.path.join(objects, 'scratch-index'),
               GIT_ALTERNATE_OBJECT_DIRECTORIES=os.path.join(os.path.abspath(os.path.join(repo, common)), 'objects'),
               GIT_AUTHOR_NAME='make-kept-files', GIT_AUTHOR_EMAIL='tests@example.com',
               GIT_COMMITTER_NAME='make-kept-files', GIT_COMMITTER_EMAIL='tests@example.com')
    mode = git('ls-tree', full, CHANGELOG).split()[0].decode()
    blob = git('hash-object', '-w', '--stdin', data=text[:at] + heading + text[at:], env=env).decode().strip()
    git('read-tree', full, env=env)
    git('update-index', '--cacheinfo', '%s,%s,%s' % (mode, blob, CHANGELOG), env=env)
    tree = git('write-tree', env=env).decode().strip()
    os.remove(os.path.join(objects, 'scratch-index'))
    print(git('commit-tree', tree, '-p', full, env=env,
              data=b'scratch: CHANGELOG headed by ' + version.encode() + b' (make-kept-files.py)').decode().strip())

if sys.argv[1:2] == ['--release-commit']:
    if len(sys.argv) != 6:
        sys.exit('make-kept-files: --release-commit <repository> <commit> <version> <objects folder>')
    release_commit(*sys.argv[2:6])
    sys.exit(0)

folder, repo, commit, version = sys.argv[1:5]
breaks, rest = {}, sys.argv[5:]
while rest:
    if rest[0] != '--break' or len(rest) < 2 or '=' not in rest[1]:
        sys.exit('make-kept-files: unknown argument %s (only --break <what>=<name>)' % rest[0])
    what, name = rest[1].split('=', 1); breaks[what] = name; rest = rest[2:]
REPO_NAME = os.environ.get('RELEASE_IMAGE_REPO', 'flowkraft/datapallas-server')
SAMPLE = 'bkend/reporting/src/main/external-resources/template/samples/webportal/single-paystub.php'
PAYSTUB = '_apps/cms-webportal-playground/wp-plugins/datapallas-portal/resources/views/single-paystub.php'
SETTINGS = 'config/_internal/settings.xml'
TOP = 'DataPallas/'
os.makedirs(folder, exist_ok=True)

def git_show(path):
    r = subprocess.run(['git', '-C', repo, 'show', '%s:%s' % (commit, path)], capture_output=True)
    if r.returncode != 0:
        sys.exit('make-kept-files: git cannot read %s at %s' % (path, commit[:8]))
    return r.stdout
def changed(data):
    return data + b'\nchanged by make-kept-files.py --break\n'

# the db-template copies: CHANGELOG.md, settings.xml, the plugin's single-paystub.php (the sample, as NoExeAssembler
# writes it over), and the first two other text files of the commit's db-template, the first of them with its line
# endings flipped (CRLF to LF, LF to CRLF: a copy that differs by line endings only)
changelog = git_show(CHANGELOG)
first = FIRST_HEADING.search(changelog)
if not first or first.group(1).decode() != version:
    sys.exit('make-kept-files: the CHANGELOG of %s is headed by %s, not %s: no release packs it as %s '
             '(--release-commit gives one that is)' % (commit[:8], first.group(1).decode() if first else 'nothing',
                                                       version, version))
tracked = subprocess.run(['git', '-C', repo, 'ls-tree', '-r', '--name-only', commit, TEMPLATE],
                         capture_output=True, text=True).stdout.splitlines()
texts = [p for p in tracked if p.endswith(('.txt', '.md', '.yml', '.properties'))
         and p != CHANGELOG and not p.endswith((SETTINGS, PAYSTUB))][:2]
if len(texts) < 2:
    sys.exit('make-kept-files: fewer than two db-template text files at %s' % commit[:8])
copies = {'CHANGELOG.md': changelog, SETTINGS: git_show(TEMPLATE + SETTINGS), PAYSTUB: git_show(SAMPLE)}
for i, p in enumerate(texts):
    data = git_show(p)
    if i == 0:
        data = data.replace(b'\r\n', b'\n') if b'\r\n' in data else data.replace(b'\n', b'\r\n')
    copies[p[len(TEMPLATE):]] = data

def write_zip(name, entries):
    with zipfile.ZipFile(os.path.join(folder, name), 'w', zipfile.ZIP_DEFLATED) as z:
        for path, data in entries.items():
            z.writestr(TOP + path, data)

for name in ('datapallas.zip', 'datapallas-server.zip'):
    entries = {'lib/burst/rb-common-%s.jar' % version: b'not a jar', 'lib/burst/rb-reporting.jar': b'not a jar'}
    entries.update(copies)
    if name == 'datapallas.zip':   # the breaks of the Windows zips: datapallas.zip's only
        if 'template' in breaks:
            rel = breaks['template']
            entries[rel] = changed(copies[rel] if rel in copies else git_show(TEMPLATE + rel))
        if 'jar' in breaks:
            entries['lib/burst/' + breaks['jar']] = b'not a jar'
    write_zip(name, entries)

docker_copies = dict(copies)
docker_copies[SETTINGS] = re.sub(rb'(?is)<runtime\b[^>]*>\s*windows\s*</runtime>', b'<runtime>docker</runtime>',
                                 git_show(TEMPLATE + SETTINGS))
compose = ('services:\n  datapallas-server:\n    image: %s:%s\n    # unpinned: image: %s:latest\n'
           % (REPO_NAME, breaks.get('compose', version), REPO_NAME)).encode()
write_zip('datapallas-server-docker.zip', dict(docker_copies, **{'docker-compose.yml': compose}))

# the source zip: git archive, as DataPallasSourceAssembler makes it (one file changed for source=)
src = os.path.join(folder, 'datapallas-src.zip')
if 'source' not in breaks and os.environ.get('MAKE_KEPT_SRC_ZIP'):
    if os.path.exists(src):
        os.remove(src)
    os.link(os.environ['MAKE_KEPT_SRC_ZIP'], src)
elif 'source' not in breaks:
    if subprocess.run(['git', '-C', repo, 'archive', '--format=zip', '--prefix=' + TOP, commit, '-o', src]).returncode != 0:
        sys.exit('make-kept-files: git archive %s failed' % commit[:8])
else:
    p = subprocess.Popen(['git', '-C', repo, 'archive', '--format=tar', '--prefix=' + TOP, commit], stdout=subprocess.PIPE)
    with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as z, tarfile.open(fileobj=p.stdout, mode='r|') as t:
        for m in t:
            if m.isfile():
                data = t.extractfile(m).read()
                z.writestr(m.name, changed(data) if m.name == TOP + breaks['source'] else data)
    p.wait()

# the image as a file: a docker save holding its config only; the id is the config's sha256
config = json.dumps({'config': {'Labels': {'version': version}}}).encode()
image_id = 'sha256:' + hashlib.sha256(config).hexdigest()
with tarfile.open(os.path.join(folder, 'datapallas-server-image.tar'), 'w') as t:
    for name, data in (('blobs/sha256/' + image_id[7:], config),
                       ('manifest.json', json.dumps([{'Config': 'blobs/sha256/' + image_id[7:],
                                                      'RepoTags': ['%s:%s-%s' % (REPO_NAME, version, commit[:8])]}]).encode())):
        info = tarfile.TarInfo(name); info.size = len(data); t.addfile(info, io.BytesIO(data))

def size_sha(name):
    data = open(os.path.join(folder, name), 'rb').read()
    return len(data), hashlib.sha256(data).hexdigest()
with open(os.path.join(folder, 'release-files-windows.txt'), 'w') as f:
    f.write('commit   %s\nversion  %s\n' % (commit, version))
    for name in ('datapallas.zip', 'datapallas-server.zip', 'datapallas-src.zip'):
        size, sha = size_sha(name)
        f.write('sha256   %s  %d  %s\n' % (sha, size, name))
with open(os.path.join(folder, 'MANIFEST.txt'), 'w') as f:
    f.write('# kept release files for a test: made by asbl/ci/tests/fixtures/make-kept-files.py\n')
    f.write('version=%s\ncommit=%s\n' % (version, commit))
    size, sha = size_sha('datapallas-server-docker.zip')
    f.write('docker.file=datapallas-server-docker.zip size=%d sha256=%s\n' % (size, sha))
    f.write('docker.image=%s:%s id=%s built_as=%s:%s-%s\n' % (REPO_NAME, version, image_id, REPO_NAME, version, commit[:8]))
    for name in ('datapallas.zip', 'datapallas-server.zip', 'datapallas-src.zip'):
        size, sha = size_sha(name)
        f.write('windows.file=%s size=%d sha256=%s\n' % (name, size, sha))
print(image_id)
