"""Experimental shared SH palette + smallest-three profile; upstream left unchanged.

Uses the pinned upstream GPC packer and geometry quantizer. All profile additions
are isolated here and in the browser adapter, not claimed upstream-compatible.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
os.environ.setdefault('OMP_NUM_THREADS', '2')
import argparse, base64, hashlib, importlib.util, json, struct, sys, time, warnings
from pathlib import Path
import numpy as np
from scipy.cluster.vq import kmeans2, vq
import zstandard as zstd
sys.path.insert(0, str(Path('.artifacts/codec/src').resolve()))
from gpc_codec import encode, unpack, pack, decode, morton
from large_io import PlySource, atomic_output, sha256_file

PROFILE = 'sh-palette-smallest3-v1'
STEP = np.float32(.004)

def train(source, destination):
    rng = np.random.default_rng(20261030)
    ids = np.sort(rng.choice(source.count, min(source.count,131072), replace=False))
    sample = np.zeros((len(ids),45),np.float32)
    for column,target in source.mapping:
        if 9 <= target < 54: sample[:,target-9] = source.raw[ids,column]
    levels=[]; current=[np.arange(len(sample))]; palette=[]
    for depth in range(3):
        centers=[]; following=[]
        for indices in current:
            data = sample[indices]
            if len(data) >= 32:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    center, labels = kmeans2(data,16,iter=8,minit='points',seed=rng)
            else:
                center=np.repeat((data.mean(axis=0) if len(data) else np.zeros(45,np.float32))[None,:],16,axis=0)
                labels=np.zeros(len(data),np.int32)
            centers.append(center)
            if depth < 2:
                for i in range(16): following.append(indices[labels==i])
        levels.append(np.asarray(centers,dtype=np.float32))
        current=following
        print(f'Palette tree level {depth+1}: {len(centers)*16} centroids',flush=True)
    np.savez(destination,**{f'level{i}':x for i,x in enumerate(levels)})
    return levels

def assign(sh,levels):
    node=np.zeros(len(sh),np.int32)
    for centers in levels:
        next_node=np.empty_like(node)
        for parent in np.unique(node):
            ids=np.flatnonzero(node==parent)
            labels,_=vq(np.ascontiguousarray(sh[ids]),centers[parent])
            next_node[ids]=parent*16+labels
        node=next_node
    return node.astype('<u2')

def pack_rotation(q):
    q=q.astype(np.float64);q/=np.linalg.norm(q,axis=1,keepdims=True)
    mode=np.argmax(np.abs(q),axis=1)
    q*=np.where(q[np.arange(len(q)),mode]<0,-1,1)[:,None]
    kept=q[np.arange(4)[None,:]!=mode[:,None]].reshape(-1,3)
    values=np.rint((kept*np.sqrt(2)+1)*127.5).clip(0,255).astype(np.uint8)
    return np.column_stack((values,mode.astype(np.uint8)))

def unpack_rotation(packed):
    kept=(packed[:,:3].astype(np.float32)/np.float32(255)*np.float32(2)-np.float32(1))/np.float32(np.sqrt(2))
    q=np.empty((len(packed),4),np.float32)
    missing=np.sqrt(np.maximum(np.float32(0),np.float32(1)-np.sum(kept*kept,axis=1,dtype=np.float32)))
    for mode in range(4):
        mask=packed[:,3]==mode
        q[np.ix_(mask,np.arange(4)!=mode)]=kept[mask]
        q[mask,mode]=missing[mask]
    return q

def encode_chunk(a,levels):
    cfg=dict(family='scalar',geometry='q16',posbits=20,dc_bits=12,shape_bits=12,rotation_format='fp16',step=.004,compressor='zstd',level=19)
    m,s=unpack(encode(a,cfg))
    order=morton(a)
    labels=assign(a[order,9:54],levels)
    q=pack_rotation(a[order,58:62])
    streams=[(name,array,'raw' if name.endswith('_lo') or name.endswith('_step') or name in ('normals_constant','alpha') else 'shuffle') for name,array in s.items() if name not in ('sh_q','rotation_fp16')]
    streams.extend([('sh_labels',labels,'shuffle'),('rotation_smallest3',q,'shuffle')])
    m['cfg']=dict(cfg,family='palette',profile=PROFILE,rotation_format='smallest3-8')
    return pack(streams,m,'zstd',19)

def decode_chunk(blob,palette):
    m,s=unpack(blob)
    if m['cfg'].get('profile')!=PROFILE: raise ValueError('Unsupported palette profile')
    labels=s.pop('sh_labels'); packed=s.pop('rotation_smallest3')
    if np.any(labels>=len(palette)) or np.any(packed[:,3]>3): raise ValueError('Invalid palette/rotation index')
    # Reuse the independent upstream scalar decoder for geometry and SH expansion.
    s['sh_q']=palette[labels]
    s['rotation_fp16']=np.zeros((m['n'],4),dtype='<f2');s['rotation_fp16'][:,0]=1
    m['cfg']=dict(m['cfg'],family='scalar')
    a=decode(pack([(n,x,'raw') for n,x in s.items()],m,'zstd',1))
    a[:,58:62]=unpack_rotation(packed)
    return a

def main():
    p=argparse.ArgumentParser();p.add_argument('--fixture',action='store_true');args=p.parse_args()
    root=Path('.artifacts/palette-experiment');root.mkdir(parents=True,exist_ok=True)
    source=PlySource(Path('D:/Personal/Projects/Radegast statue in autumn/scene.ply'))
    cache=root/'tree.npz'
    levels=[np.load(cache)[f'level{i}'] for i in range(3)] if cache.exists() else train(source,cache)
    centroids=levels[-1].reshape(-1,45)
    rounded=np.rint(centroids/STEP)
    if np.abs(rounded).max()>32767: raise ValueError('Palette exceeds int16 precision')
    palette=rounded.astype('<i2')
    packed_palette=zstd.ZstdCompressor(level=19,write_checksum=True).compress(palette.tobytes())
    descriptor=dict(encoding='i16-zstd-base64',count=len(palette),width=45,step=float(STEP),data=base64.b64encode(packed_palette).decode())
    if args.fixture:
        a=source.read(0,64);blob=encode_chunk(a,levels);decoded=decode_chunk(blob,palette)
        fixture=dict(count=len(a),degree=3,palette=descriptor,base64=base64.b64encode(blob).decode(),expected=decoded[:,list(range(3))+list(range(6,62))].ravel().tolist())
        Path('tests/gpc-fixture-palette.json').write_text(json.dumps(fixture)+'\n');print('Fixture generated',flush=True);return
    out=Path('public/scenes/radegast-palette.gpc')
    if out.exists(): raise SystemExit('Output already exists; not overwriting')
    t=time.perf_counter();chunk_size=131072
    head=dict(version=2,count=source.count,degree=source.degree,chunk_size=chunk_size,chunks=(source.count+chunk_size-1)//chunk_size,profile=PROFILE,palette=descriptor)
    header=json.dumps(head,separators=(',',':')).encode()
    errors=[];rotation_errors=[];streams={}
    with atomic_output(out) as temporary, temporary.open('wb') as f:
        f.write(b'GPC2'+struct.pack('<I',len(header))+header)
        for start,a in source.chunks(chunk_size):
            blob=encode_chunk(a,levels)
            check=decode_chunk(blob,palette)
            if not np.isfinite(check).all() or len(check)!=len(a):raise ValueError('Invalid decoded chunk')
            x=a[morton(a)]
            errors.append([float(np.sum((check[:,9:54]-x[:,9:54]).astype(np.float64)**2)),len(a)*45])
            q0=x[:,58:62].astype(np.float64);q0/=np.linalg.norm(q0,axis=1,keepdims=True)
            q1=check[:,58:62].astype(np.float64);q1/=np.linalg.norm(q1,axis=1,keepdims=True)
            rotation_errors.append(float(np.max(2*np.arccos(np.clip(np.abs(np.sum(q0*q1,axis=1)),0,1)))*180/np.pi))
            _,raw=unpack(blob)
            # Directory bytes are the actual compressed per-stream costs.
            directory=json.loads(blob[8:8+struct.unpack('<I',blob[4:8])[0]])
            for d in directory['streams']:streams[d['name']]=streams.get(d['name'],0)+d['bytes']
            f.write(struct.pack('<Q',len(blob)));f.write(blob)
            print(f'Encoded and independently checked {start+len(a):,}/{source.count:,}',flush=True)
    manifest=json.loads(Path('public/scenes/radegast.json').read_text(encoding='utf-8-sig'))
    manifest.update(url=out.name,bytes=out.stat().st_size,sha256=sha256_file(out),profile=PROFILE,config=dict(family='palette',profile=PROFILE,posbits=20,dc_bits=12,shape_bits=12,rotation_format='smallest3-8',step=.004,paletteSize=len(palette)),paletteBytes=len(packed_palette),streamBytes=streams,shCoefficientRMSE=np.sqrt(sum(e[0] for e in errors)/sum(e[1] for e in errors)),maxRotationAngleErrorDegrees=max(rotation_errors),elapsedSeconds=time.perf_counter()-t,encodingSeconds=time.perf_counter()-t,trainingSampleCount=131072,trainingSeed=20261030)
    out.with_suffix('.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:v for k,v in manifest.items() if k not in ('bounds','camera')},indent=2),flush=True)

if __name__=='__main__':main()
