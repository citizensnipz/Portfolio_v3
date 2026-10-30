"""Generate a synthetic cross-language fixture with the upstream encoder."""
import base64
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path('.artifacts/codec/src').resolve()))
import numpy as np
from gpc_codec import encode, decode
from large_io import ply_layout

count = 7
a = np.zeros((count, 62), np.float32)
for i in range(count):
    a[i, :3] = [i / 10, np.sin(i), -i / 7]
    a[i, 6:54] = np.sin(np.arange(48) * .13 + i) * .7
    a[i, 54] = (i - 3) * 5
    a[i, 55:58] = [-3 + i / 10, -4, -5]
    a[i, 58:62] = [1, i / 20, -.15, .04]
cfg = {'family': 'scalar', 'geometry': 'q16', 'posbits': 20, 'dc_bits': 12,
       'shape_bits': 12, 'rotation_format': 'fp16', 'step': .004,
       'compressor': 'zstd', 'level': 19}
blob = encode(a, cfg)
decoded = decode(blob)
columns = list(range(3)) + list(range(6, 62))
fixture = {'count': count, 'degree': 3, 'base64': base64.b64encode(blob).decode(),
           'expected': decoded[:, columns].ravel().tolist()}
Path('tests/gpc-fixture.json').write_text(json.dumps(fixture) + '\n')
print('Wrote synthetic GPC fixture and independent Python reference')

compact_cfg = dict(cfg, posbits=8, dc_bits=8, shape_bits=8, rot_bits=4, step=.512)
del compact_cfg['rotation_format']
blob = encode(a, compact_cfg)
decoded = decode(blob)
fixture = {'count': count, 'degree': 3, 'base64': base64.b64encode(blob).decode(),
           'expected': decoded[:, columns].ravel().tolist()}
Path('tests/gpc-fixture-compact.json').write_text(json.dumps(fixture) + '\n')
print('Wrote compact rotation/8-bit attribute fixture')
