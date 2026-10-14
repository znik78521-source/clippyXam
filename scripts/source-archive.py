#!/usr/bin/env python3
"""Source-only delivery ZIP. Does not execute npm, compile, or bundle third-party binaries."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
TOP = (
    '.gitignore', 'README.md', 'START-HERE-RU.md', 'THIRD_PARTY_NOTICES.md',
    'START-WINDOWS.cmd', 'CHECK-WINDOWS.cmd', 'package.json', 'package-lock.json',
    'index.html', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts',
)
TREES = ('src', 'electron', 'scripts', 'tests', 'docs')
SUFFIXES = {'.ts', '.tsx', '.css', '.cjs', '.mjs', '.py', '.md'}

def files():
    selected = {ROOT / name for name in TOP}
    for tree in TREES:
        for path in (ROOT / tree).rglob('*'):
            if path.is_symlink():
                raise ValueError(f'Symlinks are not allowed in the source archive: {path}')
            if path.is_file() and path.suffix in SUFFIXES and '__pycache__' not in path.parts:
                selected.add(path)
    # Only our own two icon files. Microsoft sheets are regenerated from npm locally.
    selected.update((ROOT / 'electron/icon.png', ROOT / 'public/favicon.svg'))
    for path in sorted(selected):
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing or unsafe source file: {path}')
        if any(part in {'.git', 'node_modules', 'dist', 'test-results', '.cache'} for part in path.relative_to(ROOT).parts):
            raise ValueError(f'Unexpected generated or private path: {path}')
        yield path

def create(output):
    package = json.loads((ROOT / 'package.json').read_text())
    prefix = f'clippyXam-{package["version"]}-source'
    content = {p.relative_to(ROOT).as_posix(): p.read_bytes() for p in files()}
    manifest = {
        'name': 'clippyXam Windows source test package', 'version': package['version'],
        'compiledApplication': False, 'bundledDependencies': False,
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(content.items())},
    }
    content['SOURCE-MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(content.items()):
            info = zipfile.ZipInfo(f'{prefix}/{name}', date_time=(2026, 10, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity check failed')
        for name, digest in manifest['files'].items():
            if hashlib.sha256(archive.read(f'{prefix}/{name}')).hexdigest() != digest:
                raise ValueError(f'Hash mismatch: {name}')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='ascii')
    print(f'{output}\n{len(content)} entries; {output.stat().st_size} bytes\nSHA-256: {digest}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='Destination ZIP (normally outside the repository)')
    create(parser.parse_args().output.resolve())
