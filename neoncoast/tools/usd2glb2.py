# usd -> glb keeping each mesh prim as its own (deduplicated) mesh with a node matrix
import sys, json, struct, os, re, hashlib, numpy as np
from pxr import Usd, UsdGeom, UsdShade
src, out, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
skip = re.compile(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else None
st = Usd.Stage.Open(src); mpu = UsdGeom.GetStageMetersPerUnit(st) * scale
base = os.path.dirname(src); xc = UsdGeom.XformCache()
mats = {}; matlist = []
def matinfo(p):
    m = UsdShade.MaterialBindingAPI(p).ComputeBoundMaterial()[0]
    k = str(m.GetPath()) if m else '_default'
    if k in mats: return mats[k]
    info = {'name': m.GetPath().name if m else 'default', 'color':[.8,.8,.8], 'tex':None, 'alpha':False, 'emissive':False}
    if m:
        for sp in m.GetPrim().GetChildren():
            sh = UsdShade.Shader(sp); sid = sh.GetIdAttr().Get()
            if sid == 'UsdPreviewSurface':
                dc = sh.GetInput('diffuseColor')
                if dc and dc.Get() is not None: info['color'] = list(dc.Get())
                if sh.GetInput('opacity') and sh.GetInput('opacity').HasConnectedSource(): info['alpha'] = True
            if sid == 'UsdUVTexture' and sp.GetName() == 'tex_base': info['tex'] = sh.GetInput('file').Get().path
    matlist.append(info); mats[k] = len(matlist)-1; return mats[k]
bin_parts=[]; bufviews=[]; accessors=[]; meshes=[]; nodes=[]
def add_view(b, target=None):
    off = sum(len(x) for x in bin_parts); pad = (-len(b)) % 4
    bin_parts.append(b + b'\0'*pad); v={'buffer':0,'byteOffset':off,'byteLength':len(b)}
    if target: v['target']=target
    bufviews.append(v); return len(bufviews)-1
def add_acc(arr, typ, minmax=False):
    arr = np.ascontiguousarray(arr.astype(np.float32))
    a = {'bufferView': add_view(arr.tobytes(), 34962), 'componentType': 5126, 'count': len(arr), 'type': typ}
    if minmax: a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
    accessors.append(a); return len(accessors)-1
cache = {}
S = np.diag([mpu, mpu, mpu, 1.0])
for p in st.Traverse():
    if not p.IsA(UsdGeom.Mesh): continue
    path = str(p.GetPath())
    if skip and skip.search(path): continue
    if UsdGeom.Imageable(p).ComputeVisibility() == 'invisible': continue
    g = UsdGeom.Mesh(p)
    pts = np.array(g.GetPointsAttr().Get() or [], dtype=np.float64)
    if len(pts) == 0: continue
    cnt = np.array(g.GetFaceVertexCountsAttr().Get()); idx = np.array(g.GetFaceVertexIndicesAttr().Get())
    mi = matinfo(p)
    h = hashlib.md5(pts.tobytes() + idx.tobytes() + str(mi).encode()).hexdigest()
    if h not in cache:
        nrm = g.GetNormalsAttr().Get(); ninterp = g.GetNormalsInterpolation()
        pv = UsdGeom.PrimvarsAPI(p).GetPrimvar('st0'); UV=None; uvinterp=None; uvidx=None
        if pv and pv.HasValue():
            UV = np.array(pv.Get(), dtype=np.float64); uvinterp = pv.GetInterpolation()
            if pv.IsIndexed(): uvidx = np.array(pv.GetIndices())
        starts = np.r_[0, np.cumsum(cnt)[:-1]]; tri_c = []
        for k in range(int(cnt.max())-2):
            s = starts[cnt > k+2]; tri_c.append(np.stack([s, s+k+1, s+k+2], 1))
        tri_c = np.concatenate(tri_c).reshape(-1); vi = idx[tri_c]
        def pick(arr, interp, ix=None):
            if arr is None or len(arr)==0: return None
            j = tri_c if interp == 'faceVarying' else vi if interp in ('vertex','varying') else None
            if j is None: return None
            if ix is not None: j = ix[j]
            return arr[j]
        pos = pts[vi]; nor = pick(None if nrm is None else np.array(nrm,dtype=np.float64), ninterp); uv = pick(UV, uvinterp, uvidx)
        if g.GetOrientationAttr().Get() == 'leftHanded':
            pos = pos.reshape(-1,3,3)[:,::-1].reshape(-1,3)
            if nor is not None: nor = nor.reshape(-1,3,3)[:,::-1].reshape(-1,3)
            if uv is not None: uv = uv.reshape(-1,3,2)[:,::-1].reshape(-1,2)
        attrs = {'POSITION': add_acc(pos, 'VEC3', True)}
        if nor is not None: attrs['NORMAL'] = add_acc(nor / np.maximum(np.linalg.norm(nor,axis=1,keepdims=True),1e-9), 'VEC3')
        if uv is not None: uv = uv.copy(); uv[:,1] = 1-uv[:,1]; attrs['TEXCOORD_0'] = add_acc(uv, 'VEC2')
        meshes.append({'name': p.GetName(), 'primitives':[{'attributes': attrs, 'material': mi}]}); cache[h] = len(meshes)-1
    M = np.array(xc.GetLocalToWorldTransform(p), dtype=np.float64) @ S   # row-vector convention == column-major flat
    nodes.append({'name': p.GetParent().GetParent().GetName(), 'mesh': cache[h], 'matrix': M.reshape(-1).tolist()})
images=[]; textures=[]; materials=[]; imgmap={}
for info in matlist:
    m = {'name': info['name'], 'pbrMetallicRoughness': {'baseColorFactor': info['color'][:3]+[1], 'metallicFactor':0, 'roughnessFactor':0.9}}
    if info['tex']:
        tp = os.path.join(base, info['tex'])
        if tp not in imgmap:
            images.append({'bufferView': add_view(open(tp,'rb').read()), 'mimeType': 'image/png' if tp.endswith('.png') else 'image/jpeg', 'name': os.path.basename(tp)})
            textures.append({'source': len(images)-1}); imgmap[tp]=len(textures)-1
        m['pbrMetallicRoughness']['baseColorTexture']={'index': imgmap[tp]}; m['pbrMetallicRoughness']['baseColorFactor']=[1,1,1,1]
        if info['alpha']:
            mc = re.search(r'cutoff(\d+)', info['tex']); m['alphaMode']='MASK'; m['alphaCutoff']=max(0.2, int(mc.group(1))/255) if mc else 0.5; m['doubleSided']=True
    materials.append(m)
print(len(nodes), 'nodes', len(meshes), 'unique meshes')
gltf = {'asset':{'version':'2.0'}, 'scene':0, 'scenes':[{'nodes': list(range(len(nodes)))}], 'nodes':nodes, 'meshes':meshes, 'materials':materials, 'accessors':accessors, 'bufferViews':bufviews, 'buffers':[{'byteLength': sum(len(x) for x in bin_parts)}]}
if images: gltf['images']=images; gltf['textures']=textures
js = json.dumps(gltf).encode(); js += b' '*((-len(js))%4); bn = b''.join(bin_parts)
with open(out,'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 28+len(js)+len(bn))); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(bn), 0x004E4942)); f.write(bn)
