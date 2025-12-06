1. The "Silver Bullet": Reduce Draw Calls
You need to get your draw calls down from 22,000 to under 1,000 (ideally under 100).

A. Use THREE.InstancedMesh (If objects are identical) If your scene consists of many identical geometries (e.g., 5,000 screws, 1,000 trees, or repeated UI elements), do not use THREE.Mesh for each one.

The Fix: Use THREE.InstancedMesh. This allows you to render thousands of copies of a single geometry with different positions, rotations, and scales in a single draw call.

Impact: This could potentially drop your draw calls from 22,000 to <50.

B. Merge Geometries (If objects are unique but static) If you have a complex CAD model or building composed of thousands of unique parts that do not move relative to each other, merge them.

The Fix: Use BufferGeometryUtils.mergeGeometries. Take a bucket of meshes that share the same material, merge their geometries into one massive geometry, and create a single Mesh.

Trade-off: Culling becomes less effective (if you look at one corner of the merged mesh, the GPU processes the whole thing), but the reduction in CPU overhead usually outweighs this.

2. Optimize Materials (Texture Atlasing)
You cannot merge geometries or use instancing if the objects use different Materials (specifically different textures).

The Problem: If you have 100 objects with 100 different image textures, Three.js requires 100 draw calls (switching textures is a state change).

The Fix: Create a Texture Atlas. Combine those 100 images into one large image. Update the UV mapping of your geometries to look at the correct patch of the large image. Now all 100 objects share one material and can be merged or instanced.

3. Triangle Reduction (LODs)
Once you fix the draw calls, the 8.8 million triangles might still tax the GPU's rasterizer.

The Fix: Implement LOD (Level of Detail).

Close: Render the high-res mesh.

Far: Render a low-poly version or a billboard (sprite).

Three.js has a built-in THREE.LOD helper for this.

4. Scene Graph Optimization
matrixAutoUpdate = false: If those 22,000 objects are static, Three.js is still calculating their world matrices every single frame. Set object.matrixAutoUpdate = false and manually call object.updateMatrix() only when you actually move them.

Frustum Culling: Ensure frustum culling is working. If you merged everything into one giant ball, the GPU draws everything even if the camera is inside the ball looking at a blank wall. Split merged chunks spatially (e.g., using an Octree).

5. Quick "Band-Aid" Fixes
These won't fix the CPU bottleneck (draw calls), but they ease the GPU load immediately:

Limit Pixel Ratio: Do not render at the device's native pixel ratio on high-DPI (Retina) screens for heavy 3D scenes.

JavaScript

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x
Disable Anti-aliasing: If you are using FXAA or SMAA, turn it off temporarily to see if FPS improves.