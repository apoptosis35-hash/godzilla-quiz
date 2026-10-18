#!/bin/sh
# Compress the Blender exports in glb/ in place: meshopt geometry compression + quantised attributes
# (EXT_meshopt_compression, KHR_mesh_quantization). Node/material names and part nodes are kept.
#   npm i -g @gltf-transform/cli@4   (or set GLTF_TRANSFORM=/path/to/gltf-transform)
G=${GLTF_TRANSFORM:-gltf-transform}
cd "$(dirname "$0")/../glb" || exit 1
for f in ${@:-*.glb}; do
  "$G" optimize "$f" "$f.tmp" --compress meshopt --texture-compress false --simplify false --join false \
    --flatten false --instance false --palette false --prune-attributes false >/dev/null && mv "$f.tmp" "$f" && echo "$f $(du -k "$f" | cut -f1) KB"
done
