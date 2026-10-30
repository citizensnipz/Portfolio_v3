"""Read-only-source compression trials; outputs stay separate from the live asset."""
import argparse, json, sys, time, struct
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path('.artifacts/codec/src').resolve()))
from large_io import PlySource, write_gpc, decode_gpc, sha256_file
from gpc_codec import encode

p = argparse.ArgumentParser()
p.add_argument('--full', help='configuration name to encode in full')
p.add_argument('--spatial', action='store_true', help='Group globally neighboring splats before chunking; no removal')
p.add_argument('--only', nargs='+', help='Screen only named configurations')
args = p.parse_args()
root = Path('.artifacts/compression-trials'); root.mkdir(parents=True, exist_ok=True)
source = PlySource(Path('D:/Personal/Projects/Radegast statue in autumn/scene.ply'))
if args.spatial:
    class SpatialSource(PlySource):
        def read(self, start, stop):
            raw = self.raw[self.order[start:stop]]
            a = np.zeros((stop-start,62),np.float32)
            for column,target in self.mapping: a[:,target]=raw[:,column]
            return a
    source.__class__ = SpatialSource
    index_path = root/'spatial-order.npy'
    if index_path.exists(): source.order = np.load(index_path, mmap_mode='r')
    else:
        print('Computing global spatial ordering without removing any splats',flush=True)
        columns = [next(s for s,t in source.mapping if t==axis) for axis in range(3)]
        positions = source.raw[:,columns].copy()
        q = np.clip((positions-positions.min(axis=0))/np.maximum(np.ptp(positions,axis=0),1e-20)*1023,0,1023).astype(np.uint64)
        key = np.zeros(source.count,np.uint64)
        for bit in range(10):
            for axis in range(3): key |= ((q[:,axis] >> bit) & 1) << (3*bit+axis)
        source.order = np.argsort(key,kind='stable')
        np.save(index_path,source.order)
        del positions,q,key
base = dict(family='scalar', geometry='q16', posbits=20, dc_bits=8, shape_bits=8, rotation_format='fp16', compressor='zstd', level=19)
configs = {}
for step in [.016, .032, .064, .128, .256, .512, 1.0, 2.0, 4.0]:
    configs[f'color8-sh{step}'] = dict(base, step=step)
for posbits, rotbits in [(16,8),(14,8),(12,8),(14,6),(12,6),(10,6),(12,4),(10,4),(8,6),(8,4)]:
    for step in [.064,.128,.256,.512,.64,1.0,2.0,4.0]:
        cfg = dict(base, posbits=posbits, rot_bits=rotbits, step=step)
        del cfg['rotation_format']
        configs[f'p{posbits}-r{rotbits}-sh{step}'] = cfg
if args.full:
    cfg = configs[args.full]
    out = root / (('spatial-' if args.spatial else '')+args.full+'.gpc')
    if out.exists(): raise SystemExit('Output already exists')
    t = time.perf_counter()
    write_gpc(out, source, cfg, 131072, lambda s: print(s,flush=True))
    decode_gpc(out, progress=lambda s: print(s,flush=True))
    result = dict(name=args.full, spatialOrdering=args.spatial, bytes=out.stat().st_size, config=cfg, count=source.count, sha256=sha256_file(out), seconds=time.perf_counter()-t)
    out.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2),flush=True)
else:
    samples = [source.read(start,start+131072) for start in [0, 2_359_296, 4_718_592]]
    results = []
    for name,cfg in configs.items():
        if args.only and name not in args.only: continue
        t=time.perf_counter()
        sizes = [len(encode(a,dict(cfg,level=9))) for a in samples]
        result = dict(name=name, estimatedMB=sum(sizes)/sum(len(a) for a in samples)*source.count/1e6, sampleBytes=sizes, config=cfg, seconds=time.perf_counter()-t)
        results.append(result)
        print(json.dumps({k:v for k,v in result.items() if k!='config'}),flush=True)
        (root/(('screening-selected' if args.only else 'screening')+('-spatial' if args.spatial else '')+'.json')).write_text(json.dumps(results,indent=2)+'\n')
