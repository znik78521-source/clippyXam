"""Prepare new AI-generated scene key drawings; keep a shared canvas for alignment."""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image
root = Path(__file__).parent
out = root.parents[1] / 'public' / 'authored' / 'clippy'
for name in ('windows-armed', 'windows-punchline', 'bat-windup', 'bat-strike'):
    rgb = np.asarray(Image.open(root / f'{name}.png').convert('RGB'), dtype=float) / 255
    spill = np.maximum(0, np.minimum(rgb[:,:,0], rgb[:,:,2]) - rgb[:,:,1])
    alpha = 1 - np.clip((spill - .10) / .44, 0, 1)
    alpha[spill > .5] = 0
    rgb[:,:,0] = np.maximum(0, rgb[:,:,0] - spill * (1-alpha))
    rgb[:,:,2] = np.maximum(0, rgb[:,:,2] - spill * (1-alpha))
    image = Image.fromarray(np.uint8(np.clip(np.dstack([rgb,alpha]),0,1)*255), 'RGBA')
    image.thumbnail((640,480), Image.Resampling.LANCZOS)
    image.save(out / f'{name}.png')
p = out / 'manifest.json'
data = json.loads(p.read_text())
data['files'] = {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.glob('*.png'))}
data['scenes'] = 'New generated key poses, timed pose transitions, local bending and canvas-only comic effects. No system actions.'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
