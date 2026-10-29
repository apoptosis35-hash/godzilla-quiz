# Writes the model table of README.md from models.json (between the MODELS markers).
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ms = json.load(open(os.path.join(ROOT, 'models.json')))
rows = ['| 名前 | ファイル | 分類 | 幅 × 高さ × 奥行 (m) | 三角形 (LOD0 / LOD1) | 部品ノード |', '|---|---|---|---|---|---|']
for m in ms:
    parts = ', '.join(p for p in m['parts'] if not p.endswith('_body')) or '—'
    lod = f"{m['tris']} / {m['lod1_tris']}" if m['lod1_tris'] else f"{m['tris']} / —"
    rows.append(f"| {m['jp']} | `{m['name']}.glb` | {m['category']} | {' × '.join(str(v) for v in m['size_m'])} | {lod} | {parts} |")
p = os.path.join(ROOT, 'README.md'); s = open(p, encoding='utf-8').read()
a, b = s.index('<!-- MODELS -->') + len('<!-- MODELS -->'), s.index('<!-- /MODELS -->')
open(p, 'w', encoding='utf-8').write(s[:a] + '\n' + '\n'.join(rows) + '\n' + s[b:])
print(len(ms), 'models')
