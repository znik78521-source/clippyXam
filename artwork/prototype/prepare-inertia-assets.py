"""Chroma-key the newly generated neutral/impact drawings; no original sprite assets."""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image
root=Path(__file__).parent
for name in ('neutral','impact-left','impact-right','curious'):
    rgb=np.asarray(Image.open(root/f'clippy-{name}.png').convert('RGB'),dtype=float)/255
    spill=np.maximum(0,np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1])
    alpha=1-np.clip((spill-.10)/.44,0,1)
    alpha[spill>.5]=0
    rgb[:,:,0]=np.maximum(0,rgb[:,:,0]-spill*(1-alpha))
    rgb[:,:,2]=np.maximum(0,rgb[:,:,2]-spill*(1-alpha))
    image=Image.fromarray(np.uint8(np.clip(np.dstack([rgb,alpha]),0,1)*255),'RGBA')
    image=image.crop(image.getbbox())
    image.thumbnail((420,600),Image.Resampling.LANCZOS)
    image.save(root/f'{name}-rgba.png')

public=root.parent.parent/'public'/'authored'/'clippy'
public.mkdir(parents=True,exist_ok=True)
for name in ('neutral','impact-left','impact-right','curious'):
    Image.open(root/f'{name}-rgba.png').save(public/f'{name}.png')

manifest = {"version": 1, "kind": "AI-generated reference-based drawings, not original Agent frames", "character": "clippy", "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(public.glob("*.png"))}, "rendering": "New drawings with procedural local deformation and velocity-driven spring physics. Not individually redrawn in-between frames. Vertical collisions currently squash the neutral drawing."}
(public/"manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
