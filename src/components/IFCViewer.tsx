import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import * as WebIFC from 'web-ifc'
import type { CameraState, ElementCategory, IFCMetadata, StoreyInfo } from '../types'
import './IFCViewer.css'

interface IFCViewerProps {
  ifcData: ArrayBuffer
  categories: ElementCategory[]
  onCategoriesLoaded: (categories: ElementCategory[]) => void
  onCameraChange: (state: CameraState) => void
  onMetadataLoaded: (metadata: IFCMetadata) => void
  selectedStorey: number | null
  storeys: StoreyInfo[]
}

export function IFCViewer({
  ifcData,
  categories,
  onCategoriesLoaded,
  onCameraChange,
  onMetadataLoaded,
  selectedStorey,
  storeys
}: IFCViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const ifcApiRef = useRef<WebIFC.IfcAPI | null>(null)
  const animationIdRef = useRef<number>(0)
  const pivotMarkerRef = useRef<THREE.Mesh | null>(null)
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const lastFrameTimeRef = useRef<number>(performance.now())
  const frameCountRef = useRef<number>(0)
  const fpsUpdateIntervalRef = useRef<number>(0)


  // High performance mode
  const [performanceMode, setPerformanceMode] = useState(true)
  const performanceModeRef = useRef(true)
  const categoriesRef = useRef<ElementCategory[]>([])
  const selectedStoreyRef = useRef<number | null>(null)
  const storeysRef = useRef<StoreyInfo[]>([])
  const storeyElementSetRef = useRef<Set<number>>(new Set())
  const mergedGroupRef = useRef<THREE.Group | null>(null)
  const originalPixelRatioRef = useRef<number>(1)
  const modelSizeRef = useRef<number>(100) // Store model max dimension for zoom limits

  // Bounding box helper
  const boundingBoxHelperRef = useRef<THREE.LineSegments | null>(null)
  const cornerLabelsRef = useRef<THREE.Sprite[]>([])
  const [showBoundingBox, setShowBoundingBox] = useState(true)

  // Drawing planes state
  interface DrawingPlane {
    id: string
    name: string
    mesh: THREE.Mesh
    visible: boolean
  }
  const [drawings, setDrawings] = useState<DrawingPlane[]>([])
  const drawingInputRef = useRef<HTMLInputElement>(null)

  // Alignment mode state
  const [aligningDrawingId, setAligningDrawingId] = useState<string | null>(null)
  const [alignmentPoints, setAlignmentPoints] = useState<THREE.Vector3[]>([])
  const alignmentMarkersRef = useRef<THREE.Mesh[]>([])
  const alignmentLinesRef = useRef<THREE.Line | null>(null)
  const alignmentConnectingLinesRef = useRef<THREE.Line[]>([])

  // Fisheye/360 mode state
  const [fisheyeMode, setFisheyeMode] = useState<'off' | 'selecting' | 'viewing'>('off')
  const [fisheyeImage, setFisheyeImage] = useState<string | null>(null)
  const cubeRenderTargetRef = useRef<THREE.WebGLCubeRenderTarget | null>(null)
  const cubeCameraRef = useRef<THREE.CubeCamera | null>(null)

  // Function to rebuild merged meshes based on current visibility
  const rebuildMergedMeshes = useCallback(() => {
    if (!modelGroupRef.current || !mergedGroupRef.current || !sceneRef.current) return

    const mergedGroup = mergedGroupRef.current
    const modelGroup = modelGroupRef.current

    // Clear existing merged meshes
    while (mergedGroup.children.length > 0) {
      const child = mergedGroup.children[0]
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
      mergedGroup.remove(child)
    }

    // Build visibility maps
    const categoryVisibility = new Map(
      categoriesRef.current.map(c => [c.id, c.visible])
    )
    const hasStoreyFilter = selectedStoreyRef.current !== null
    const storeyElements = storeyElementSetRef.current

    // Group visible geometries by color
    const colorGroups = new Map<string, { geometries: THREE.BufferGeometry[], color: THREE.Color, opacity: number }>()

    modelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry && obj.userData.expressID !== undefined) {
        // Check storey visibility
        if (hasStoreyFilter && !storeyElements.has(obj.userData.expressID)) {
          return
        }

        // Check category visibility
        const categoryId = obj.userData.categoryId
        if (categoryId !== undefined && categoryVisibility.get(categoryId) === false) {
          return
        }

        // This mesh is visible - add to merge groups
        const mat = obj.material as THREE.MeshPhongMaterial
        const colorKey = `${mat.color.r.toFixed(3)},${mat.color.g.toFixed(3)},${mat.color.b.toFixed(3)},${mat.opacity}`

        if (!colorGroups.has(colorKey)) {
          colorGroups.set(colorKey, {
            geometries: [],
            color: mat.color.clone(),
            opacity: mat.opacity
          })
        }
        colorGroups.get(colorKey)!.geometries.push(obj.geometry.clone())
      }
    })

    // Merge geometries for each color group
    let mergedCount = 0
    colorGroups.forEach(({ geometries, color, opacity }) => {
      if (geometries.length > 0) {
        try {
          const merged = mergeGeometries(geometries, false)
          if (merged) {
            const material = new THREE.MeshPhongMaterial({
              color,
              opacity,
              transparent: opacity < 1,
              side: THREE.DoubleSide
            })
            const mergedMesh = new THREE.Mesh(merged, material)
            mergedMesh.matrixAutoUpdate = false
            mergedGroup.add(mergedMesh)
            mergedCount++
          }
          // Dispose cloned geometries after merging
          geometries.forEach(g => g.dispose())
        } catch (e) {
          console.warn('Failed to merge geometries:', e)
          geometries.forEach(g => g.dispose())
        }
      }
    })

    console.log(`Rebuilt ${mergedCount} merged meshes for current visibility`)
  }, [])

  // Keep refs in sync with state and handle perf mode changes
  useEffect(() => {
    performanceModeRef.current = performanceMode

    // Toggle pixel ratio for performance
    if (rendererRef.current) {
      if (performanceMode) {
        // Store original and lower pixel ratio
        originalPixelRatioRef.current = rendererRef.current.getPixelRatio()
        rendererRef.current.setPixelRatio(1) // Lower for performance
      } else {
        // Restore original pixel ratio
        rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        // Reset visibility - show individual meshes, hide merged
        if (modelGroupRef.current) modelGroupRef.current.visible = true
        if (mergedGroupRef.current) mergedGroupRef.current.visible = false
      }
    }
  }, [performanceMode])

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  useEffect(() => {
    selectedStoreyRef.current = selectedStorey
    // Build set of element IDs for selected storey
    if (selectedStorey !== null) {
      const storey = storeys.find(s => s.id === selectedStorey)
      storeyElementSetRef.current = new Set(storey?.elementIds || [])
    } else {
      storeyElementSetRef.current = new Set()
    }
  }, [selectedStorey, storeys])

  useEffect(() => {
    storeysRef.current = storeys
  }, [storeys])

  // Rebuild merged meshes when visibility changes and perf mode is on
  useEffect(() => {
    if (performanceMode && mergedGroupRef.current) {
      rebuildMergedMeshes()
    }
  }, [performanceMode, categories, selectedStorey, rebuildMergedMeshes])

  // Sync bounding box visibility
  useEffect(() => {
    if (boundingBoxHelperRef.current) {
      boundingBoxHelperRef.current.visible = showBoundingBox
    }
    cornerLabelsRef.current.forEach(label => {
      label.visible = showBoundingBox
    })
  }, [showBoundingBox])

  // Loading state
  const [loadingState, setLoadingState] = useState<{
    loading: boolean
    stage: string
    meshCount: number
    totalMeshes: number
  }>({ loading: true, stage: 'Initializing...', meshCount: 0, totalMeshes: 0 })

  // Add drawing plane from image file
  const handleAddDrawing = useCallback((file: File) => {
    if (!sceneRef.current || !modelGroupRef.current) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const texture = new THREE.TextureLoader().load(dataUrl, (tex) => {
        // Get model bounds to size the plane appropriately
        const box = new THREE.Box3().setFromObject(modelGroupRef.current!)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const minY = box.min.y

        // Create plane geometry sized to model footprint
        const planeSize = Math.max(size.x, size.z) * 1.2
        const aspectRatio = tex.image.width / tex.image.height
        const geometry = new THREE.PlaneGeometry(
          planeSize,
          planeSize / aspectRatio
        )

        // Create material with the texture
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        })

        // Create mesh and position it below the model
        const plane = new THREE.Mesh(geometry, material)
        plane.rotation.x = -Math.PI / 2 // Rotate to be horizontal
        plane.position.set(center.x, minY - 1, center.z)

        sceneRef.current!.add(plane)

        const drawing: DrawingPlane = {
          id: crypto.randomUUID(),
          name: file.name,
          mesh: plane,
          visible: true
        }

        setDrawings(prev => [...prev, drawing])
      })
    }
    reader.readAsDataURL(file)
  }, [])

  // Remove drawing plane
  const handleRemoveDrawing = useCallback((id: string) => {
    setDrawings(prev => {
      const drawing = prev.find(d => d.id === id)
      if (drawing && sceneRef.current) {
        sceneRef.current.remove(drawing.mesh)
        drawing.mesh.geometry.dispose()
        if (drawing.mesh.material instanceof THREE.Material) {
          drawing.mesh.material.dispose()
        }
      }
      return prev.filter(d => d.id !== id)
    })
  }, [])

  // Toggle drawing visibility
  const handleToggleDrawing = useCallback((id: string) => {
    setDrawings(prev => prev.map(d => {
      if (d.id === id) {
        d.mesh.visible = !d.visible
        return { ...d, visible: !d.visible }
      }
      return d
    }))
  }, [])

  // Start alignment mode for a drawing
  const handleStartAlign = useCallback((id: string) => {
    setAligningDrawingId(id)
    setAlignmentPoints([])
    // Clear any existing markers
    alignmentMarkersRef.current.forEach(marker => {
      sceneRef.current?.remove(marker)
      marker.geometry.dispose()
      if (marker.material instanceof THREE.Material) marker.material.dispose()
    })
    alignmentMarkersRef.current = []
    if (alignmentLinesRef.current) {
      sceneRef.current?.remove(alignmentLinesRef.current)
      alignmentLinesRef.current.geometry.dispose()
      alignmentLinesRef.current = null
    }
  }, [])

  // Cancel alignment mode
  const handleCancelAlign = useCallback(() => {
    setAligningDrawingId(null)
    setAlignmentPoints([])
    // Clear markers
    alignmentMarkersRef.current.forEach(marker => {
      sceneRef.current?.remove(marker)
      marker.geometry.dispose()
      if (marker.material instanceof THREE.Material) marker.material.dispose()
    })
    alignmentMarkersRef.current = []
    if (alignmentLinesRef.current) {
      sceneRef.current?.remove(alignmentLinesRef.current)
      alignmentLinesRef.current.geometry.dispose()
      alignmentLinesRef.current = null
    }
    // Clear connecting lines
    alignmentConnectingLinesRef.current.forEach(line => {
      sceneRef.current?.remove(line)
      line.geometry.dispose()
      if (line.material instanceof THREE.Material) line.material.dispose()
    })
    alignmentConnectingLinesRef.current = []
  }, [])

  // Create numbered sprite for alignment markers
  const createNumberedSprite = useCallback((number: number, color: string = '#00ff00'): THREE.Sprite => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    // Draw number with outline for visibility (transparent background)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 6
    ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText(String(number), 32, 32)
    ctx.fillStyle = color
    ctx.fillText(String(number), 32, 32)
    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,  // Always render in front
      depthWrite: false
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(modelSizeRef.current * 0.05, modelSizeRef.current * 0.05, 1)
    sprite.renderOrder = 999  // Render on top of everything
    return sprite
  }, [])

  // Add alignment point when clicking on drawing
  const handleAlignmentClick = useCallback((point: THREE.Vector3) => {
    if (!aligningDrawingId || alignmentPoints.length >= 4 || !modelGroupRef.current) return

    const newPoints = [...alignmentPoints, point]
    setAlignmentPoints(newPoints)

    // Add numbered billboard sprite marker
    const sprite = createNumberedSprite(newPoints.length, '#4a9eff')
    sprite.position.copy(point)
    sprite.position.y += modelSizeRef.current * 0.03 // Slightly above the surface
    sceneRef.current?.add(sprite)
    alignmentMarkersRef.current.push(sprite as unknown as THREE.Mesh)

    // Get model bounding box bottom corners
    const modelBox = new THREE.Box3().setFromObject(modelGroupRef.current)
    const minY = modelBox.min.y
    const modelCorners = [
      new THREE.Vector3(modelBox.min.x, minY, modelBox.min.z), // 1
      new THREE.Vector3(modelBox.max.x, minY, modelBox.min.z), // 2
      new THREE.Vector3(modelBox.max.x, minY, modelBox.max.z), // 3
      new THREE.Vector3(modelBox.min.x, minY, modelBox.max.z), // 4
    ]

    // Draw connecting line from model corner to clicked point
    const cornerIndex = newPoints.length - 1
    const modelCorner = modelCorners[cornerIndex]
    const connectingLineGeom = new THREE.BufferGeometry().setFromPoints([modelCorner, point])
    const connectingLineMat = new THREE.LineBasicMaterial({ color: 0xffff00 }) // Yellow
    const connectingLine = new THREE.Line(connectingLineGeom, connectingLineMat)
    sceneRef.current?.add(connectingLine)
    alignmentConnectingLinesRef.current.push(connectingLine)

    // Update lines connecting points on drawing
    if (alignmentLinesRef.current) {
      sceneRef.current?.remove(alignmentLinesRef.current)
      alignmentLinesRef.current.geometry.dispose()
    }
    if (newPoints.length > 1) {
      const linePoints = [...newPoints]
      if (newPoints.length === 4) linePoints.push(newPoints[0]) // Close the shape
      const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints)
      const lineMat = new THREE.LineBasicMaterial({ color: 0x4a9eff })
      const line = new THREE.Line(lineGeom, lineMat)
      sceneRef.current?.add(line)
      alignmentLinesRef.current = line
    }

    // If we have 4 points, apply the alignment
    if (newPoints.length === 4) {
      applyAlignment(newPoints)
    }
  }, [aligningDrawingId, alignmentPoints, createNumberedSprite])

  // Apply alignment transformation - transform the MODEL to align with the drawing
  const applyAlignment = useCallback((drawingPoints: THREE.Vector3[]) => {
    if (!aligningDrawingId || !modelGroupRef.current || !mergedGroupRef.current) return

    const drawing = drawings.find(d => d.id === aligningDrawingId)
    if (!drawing) return

    // Get model bounding box bottom corners (matching the red numbered labels)
    const modelBox = new THREE.Box3().setFromObject(modelGroupRef.current)
    const minY = modelBox.min.y
    const modelCorners = [
      new THREE.Vector3(modelBox.min.x, minY, modelBox.min.z), // 1
      new THREE.Vector3(modelBox.max.x, minY, modelBox.min.z), // 2
      new THREE.Vector3(modelBox.max.x, minY, modelBox.max.z), // 3
      new THREE.Vector3(modelBox.min.x, minY, modelBox.max.z), // 4
    ]

    // Calculate centroids (in XZ plane)
    const drawingCentroid = new THREE.Vector3()
    drawingPoints.forEach(p => drawingCentroid.add(p))
    drawingCentroid.divideScalar(4)

    const modelCentroid = new THREE.Vector3()
    modelCorners.forEach(p => modelCentroid.add(p))
    modelCentroid.divideScalar(4)

    // Calculate scale using edge lengths (average of corresponding edges)
    // Scale factor: drawing / model (we're scaling the model to fit the drawing)
    const drawingEdge12 = new THREE.Vector2(
      drawingPoints[1].x - drawingPoints[0].x,
      drawingPoints[1].z - drawingPoints[0].z
    ).length()
    const drawingEdge34 = new THREE.Vector2(
      drawingPoints[3].x - drawingPoints[2].x,
      drawingPoints[3].z - drawingPoints[2].z
    ).length()
    const modelEdge12 = new THREE.Vector2(
      modelCorners[1].x - modelCorners[0].x,
      modelCorners[1].z - modelCorners[0].z
    ).length()
    const modelEdge34 = new THREE.Vector2(
      modelCorners[3].x - modelCorners[2].x,
      modelCorners[3].z - modelCorners[2].z
    ).length()

    const drawingEdge23 = new THREE.Vector2(
      drawingPoints[2].x - drawingPoints[1].x,
      drawingPoints[2].z - drawingPoints[1].z
    ).length()
    const drawingEdge41 = new THREE.Vector2(
      drawingPoints[0].x - drawingPoints[3].x,
      drawingPoints[0].z - drawingPoints[3].z
    ).length()
    const modelEdge23 = new THREE.Vector2(
      modelCorners[2].x - modelCorners[1].x,
      modelCorners[2].z - modelCorners[1].z
    ).length()
    const modelEdge41 = new THREE.Vector2(
      modelCorners[0].x - modelCorners[3].x,
      modelCorners[0].z - modelCorners[3].z
    ).length()

    const drawingAvgEdge = (drawingEdge12 + drawingEdge34 + drawingEdge23 + drawingEdge41) / 4
    const modelAvgEdge = (modelEdge12 + modelEdge34 + modelEdge23 + modelEdge41) / 4
    const scale = drawingAvgEdge / modelAvgEdge  // Inverted: scale model to match drawing

    // Calculate rotation using the edge from point 1 to point 2
    const drawingVec = new THREE.Vector2(
      drawingPoints[1].x - drawingPoints[0].x,
      drawingPoints[1].z - drawingPoints[0].z
    ).normalize()
    const modelVec = new THREE.Vector2(
      modelCorners[1].x - modelCorners[0].x,
      modelCorners[1].z - modelCorners[0].z
    ).normalize()

    // Angle to rotate model to match drawing orientation
    const angle = Math.atan2(drawingVec.y, drawingVec.x) - Math.atan2(modelVec.y, modelVec.x)

    // Create a parent group to apply transformations to both model groups
    const modelGroup = modelGroupRef.current
    const mergedGroup = mergedGroupRef.current

    // Apply scale to both groups
    modelGroup.scale.multiplyScalar(scale)
    mergedGroup.scale.multiplyScalar(scale)

    // Apply rotation around Y axis, pivoting around model centroid
    // First translate to origin, rotate, then translate back
    modelGroup.position.sub(modelCentroid)
    modelGroup.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    modelGroup.position.add(modelCentroid)
    modelGroup.rotation.y += angle

    mergedGroup.position.sub(modelCentroid)
    mergedGroup.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    mergedGroup.position.add(modelCentroid)
    mergedGroup.rotation.y += angle

    // After rotation and scale, recalculate where the model centroid ends up
    // The model centroid after scale (relative to origin) and rotation
    const scaledModelCentroid = modelCentroid.clone().multiplyScalar(scale)
    const rotatedScaledModelCentroid = scaledModelCentroid.clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)

    // Translate model so its centroid aligns with drawing centroid
    const translation = new THREE.Vector3(
      drawingCentroid.x - rotatedScaledModelCentroid.x,
      0,
      drawingCentroid.z - rotatedScaledModelCentroid.z
    )
    modelGroup.position.add(translation)
    mergedGroup.position.add(translation)

    // Adjust Y position so model sits on the drawing
    const drawingY = drawing.mesh.position.y
    const newModelBox = new THREE.Box3().setFromObject(modelGroup)
    const yOffset = drawingY - newModelBox.min.y + 0.01
    modelGroup.position.y += yOffset
    mergedGroup.position.y += yOffset

    // Update bounding box helper and corner labels
    if (boundingBoxHelperRef.current) {
      sceneRef.current?.remove(boundingBoxHelperRef.current)
      boundingBoxHelperRef.current.geometry.dispose()
    }
    cornerLabelsRef.current.forEach(label => {
      sceneRef.current?.remove(label)
      label.material.dispose()
    })
    cornerLabelsRef.current = []

    // Recreate bounding box and labels at new position
    const newBox = new THREE.Box3().setFromObject(modelGroup)
    const newCenter = newBox.getCenter(new THREE.Vector3())
    const newSize = newBox.getSize(new THREE.Vector3())
    const maxDim = Math.max(newSize.x, newSize.y, newSize.z)

    const boxGeometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z)
    const edges = new THREE.EdgesGeometry(boxGeometry)
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
    const boundingBoxHelper = new THREE.LineSegments(edges, lineMaterial)
    boundingBoxHelper.position.copy(newCenter)
    boundingBoxHelper.visible = showBoundingBox
    sceneRef.current?.add(boundingBoxHelper)
    boundingBoxHelperRef.current = boundingBoxHelper

    // Recreate corner labels
    const newMinY = newBox.min.y
    const newCorners = [
      new THREE.Vector3(newBox.min.x, newMinY, newBox.min.z),
      new THREE.Vector3(newBox.max.x, newMinY, newBox.min.z),
      new THREE.Vector3(newBox.max.x, newMinY, newBox.max.z),
      new THREE.Vector3(newBox.min.x, newMinY, newBox.max.z),
    ]

    const createTextSprite = (text: string): THREE.Sprite => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')!
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 6
      ctx.font = 'bold 48px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeText(text, 32, 32)
      ctx.fillStyle = '#ff0000'
      ctx.fillText(text, 32, 32)
      const texture = new THREE.CanvasTexture(canvas)
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
      })
      const sprite = new THREE.Sprite(material)
      sprite.scale.set(maxDim * 0.05, maxDim * 0.05, 1)
      sprite.renderOrder = 999
      return sprite
    }

    newCorners.forEach((corner, index) => {
      const sprite = createTextSprite(String(index + 1))
      sprite.position.copy(corner)
      sprite.visible = showBoundingBox
      sceneRef.current?.add(sprite)
      cornerLabelsRef.current.push(sprite)
    })

    // Update model size reference for zoom limits
    modelSizeRef.current = maxDim

    // Clean up alignment mode
    handleCancelAlign()
  }, [aligningDrawingId, drawings, handleCancelAlign, showBoundingBox])

  // Capture 360 view from a point and convert to equirectangular
  const captureFisheyeView = useCallback((point: THREE.Vector3) => {
    if (!sceneRef.current || !rendererRef.current) return

    const scene = sceneRef.current
    const renderer = rendererRef.current

    // Create cube render target if not exists
    const cubeSize = 1024
    if (!cubeRenderTargetRef.current) {
      cubeRenderTargetRef.current = new THREE.WebGLCubeRenderTarget(cubeSize, {
        format: THREE.RGBAFormat,
        generateMipmaps: false
      })
    }

    // Create cube camera
    const cubeCamera = new THREE.CubeCamera(0.1, 10000, cubeRenderTargetRef.current)
    cubeCamera.position.copy(point)
    cubeCameraRef.current = cubeCamera

    // Temporarily show model group for rendering (in case perf mode has it hidden)
    const wasModelHidden = modelGroupRef.current?.visible === false
    const wasMergedVisible = mergedGroupRef.current?.visible === true
    if (modelGroupRef.current) modelGroupRef.current.visible = true
    if (mergedGroupRef.current) mergedGroupRef.current.visible = false

    // Update cube camera to capture all 6 faces
    cubeCamera.update(renderer, scene)

    // Restore visibility
    if (wasModelHidden && modelGroupRef.current) modelGroupRef.current.visible = false
    if (wasMergedVisible && mergedGroupRef.current) mergedGroupRef.current.visible = true

    // Convert cubemap to equirectangular
    const equiWidth = 2048
    const equiHeight = 1024

    // Create a canvas to draw the equirectangular image
    const canvas = document.createElement('canvas')
    canvas.width = equiWidth
    canvas.height = equiHeight
    const ctx = canvas.getContext('2d')!

    // Read each cube face
    const faces: ImageData[] = []

    // We need to read pixels from each face
    const readBuffer = new Uint8Array(cubeSize * cubeSize * 4)

    for (let face = 0; face < 6; face++) {
      // Create a temporary render target for reading
      const tempTarget = new THREE.WebGLRenderTarget(cubeSize, cubeSize)

      // Create a scene with a cube face
      const tempScene = new THREE.Scene()
      const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

      // Create material using the cubemap texture
      const material = new THREE.ShaderMaterial({
        uniforms: {
          cubemap: { value: cubeRenderTargetRef.current!.texture },
          face: { value: face }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform samplerCube cubemap;
          uniform int face;
          varying vec2 vUv;
          void main() {
            vec2 uv = vUv * 2.0 - 1.0;
            vec3 dir;
            if (face == 0) dir = vec3(1.0, -uv.y, -uv.x);      // +X
            else if (face == 1) dir = vec3(-1.0, -uv.y, uv.x); // -X
            else if (face == 2) dir = vec3(uv.x, 1.0, uv.y);   // +Y
            else if (face == 3) dir = vec3(uv.x, -1.0, -uv.y); // -Y
            else if (face == 4) dir = vec3(uv.x, -uv.y, 1.0);  // +Z
            else dir = vec3(-uv.x, -uv.y, -1.0);               // -Z
            gl_FragColor = textureCube(cubemap, normalize(dir));
          }
        `
      })

      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      tempScene.add(quad)

      renderer.setRenderTarget(tempTarget)
      renderer.render(tempScene, tempCamera)

      renderer.readRenderTargetPixels(tempTarget, 0, 0, cubeSize, cubeSize, readBuffer)
      faces.push(new ImageData(new Uint8ClampedArray(readBuffer), cubeSize, cubeSize))

      tempTarget.dispose()
      material.dispose()
      quad.geometry.dispose()
    }

    renderer.setRenderTarget(null)

    // Convert cubemap faces to equirectangular
    const equiData = ctx.createImageData(equiWidth, equiHeight)

    for (let y = 0; y < equiHeight; y++) {
      for (let x = 0; x < equiWidth; x++) {
        // Convert pixel to spherical coordinates
        const theta = (x / equiWidth) * 2 * Math.PI - Math.PI // -PI to PI (longitude)
        const phi = (y / equiHeight) * Math.PI // 0 to PI (latitude from top)

        // Convert to 3D direction
        const dirX = Math.sin(phi) * Math.sin(theta)
        const dirY = Math.cos(phi)
        const dirZ = Math.sin(phi) * Math.cos(theta)

        // Find which cube face and UV coordinates
        const absX = Math.abs(dirX)
        const absY = Math.abs(dirY)
        const absZ = Math.abs(dirZ)

        let faceIndex: number
        let u: number, v: number

        if (absX >= absY && absX >= absZ) {
          if (dirX > 0) {
            faceIndex = 0 // +X
            u = -dirZ / absX
            v = -dirY / absX
          } else {
            faceIndex = 1 // -X
            u = dirZ / absX
            v = -dirY / absX
          }
        } else if (absY >= absX && absY >= absZ) {
          if (dirY > 0) {
            faceIndex = 2 // +Y
            u = dirX / absY
            v = dirZ / absY
          } else {
            faceIndex = 3 // -Y
            u = dirX / absY
            v = -dirZ / absY
          }
        } else {
          if (dirZ > 0) {
            faceIndex = 4 // +Z
            u = dirX / absZ
            v = -dirY / absZ
          } else {
            faceIndex = 5 // -Z
            u = -dirX / absZ
            v = -dirY / absZ
          }
        }

        // Convert UV from [-1,1] to [0, cubeSize-1]
        const pixelX = Math.floor(((u + 1) / 2) * (cubeSize - 1))
        const pixelY = Math.floor(((v + 1) / 2) * (cubeSize - 1))

        // Sample from face
        const faceData = faces[faceIndex]
        const srcIdx = (pixelY * cubeSize + pixelX) * 4
        const dstIdx = (y * equiWidth + x) * 4

        equiData.data[dstIdx] = faceData.data[srcIdx]
        equiData.data[dstIdx + 1] = faceData.data[srcIdx + 1]
        equiData.data[dstIdx + 2] = faceData.data[srcIdx + 2]
        equiData.data[dstIdx + 3] = 255
      }
    }

    ctx.putImageData(equiData, 0, 0)

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png')
    setFisheyeImage(dataUrl)
    setFisheyeMode('viewing')
  }, [])

  // Handle fisheye click on model
  const handleFisheyeClick = useCallback((point: THREE.Vector3) => {
    captureFisheyeView(point)
  }, [captureFisheyeView])

  // Camera control state
  const isMouseDownRef = useRef(false)
  const isPanningRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const sphericalRef = useRef({ radius: 100, phi: Math.PI / 4, theta: Math.PI / 4 })
  const targetRef = useRef(new THREE.Vector3(0, 0, 0))

  const updateCameraState = useCallback(() => {
    if (!cameraRef.current) return

    const camera = cameraRef.current
    camera.updateMatrixWorld()
    const matrix = camera.matrixWorld.elements

    onCameraChange({
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
      },
      rotation: [
        [matrix[0], matrix[4], matrix[8], matrix[12]],
        [matrix[1], matrix[5], matrix[9], matrix[13]],
        [matrix[2], matrix[6], matrix[10], matrix[14]],
        [matrix[3], matrix[7], matrix[11], matrix[15]]
      ]
    })
  }, [onCameraChange])

  const updateCameraFromSpherical = useCallback(() => {
    if (!cameraRef.current) return

    const { radius, phi, theta } = sphericalRef.current
    const target = targetRef.current

    const camera = cameraRef.current
    camera.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta)
    camera.position.y = target.y + radius * Math.cos(phi)
    camera.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta)
    camera.lookAt(target)
    camera.updateProjectionMatrix()

    updateCameraState()
  }, [updateCameraState])

  const updatePivotMarker = useCallback((position: THREE.Vector3) => {
    if (!sceneRef.current) return

    // Remove old marker
    if (pivotMarkerRef.current) {
      sceneRef.current.remove(pivotMarkerRef.current)
      pivotMarkerRef.current.geometry.dispose()
      ;(pivotMarkerRef.current.material as THREE.Material).dispose()
    }

    // Create new marker
    const markerSize = sphericalRef.current.radius * 0.01
    const geometry = new THREE.SphereGeometry(markerSize, 16, 16)
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const marker = new THREE.Mesh(geometry, material)
    marker.position.copy(position)
    sceneRef.current.add(marker)
    pivotMarkerRef.current = marker
  }, [])

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return

    // Cleanup any existing renderer first
    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current.forceContextLoss()
      if (containerRef.current.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement)
      }
      rendererRef.current = null
    }

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    // Camera setup with larger far plane for big models
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100000
    )
    cameraRef.current = camera

    // Renderer setup with error handling
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    } catch (e) {
      console.error('Failed to create WebGL renderer:', e)
      return
    }

    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 100, 50)
    scene.add(directionalLight)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
    directionalLight2.position.set(-50, 50, -50)
    scene.add(directionalLight2)

    // Model group
    const modelGroup = new THREE.Group()
    scene.add(modelGroup)
    modelGroupRef.current = modelGroup

    // Animation loop with FPS tracking and performance culling
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)

      // Performance mode handling - always use merged meshes (they're rebuilt on visibility change)
      if (performanceModeRef.current && modelGroupRef.current && mergedGroupRef.current) {
        modelGroupRef.current.visible = false
        mergedGroupRef.current.visible = true
      }

      renderer.render(scene, camera)

      // FPS calculation
      frameCountRef.current++
      const now = performance.now()
      fpsUpdateIntervalRef.current += now - lastFrameTimeRef.current
      lastFrameTimeRef.current = now

      // Update diagnostics every 500ms
      if (fpsUpdateIntervalRef.current >= 500) {
        frameCountRef.current = 0
        fpsUpdateIntervalRef.current = 0
      }
    }
    animate()

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationIdRef.current)
      renderer.dispose()
      renderer.forceContextLoss()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      modelGroupRef.current = null
    }
  }, [])

  // Mouse controls
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseDown = (e: MouseEvent) => {
      isMouseDownRef.current = true
      isPanningRef.current = e.button === 2 || e.shiftKey
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    }

    const handleMouseUp = () => {
      isMouseDownRef.current = false
      isPanningRef.current = false
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDownRef.current) return

      const deltaX = e.clientX - lastMouseRef.current.x
      const deltaY = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      if (isPanningRef.current) {
        // Pan
        const panSpeed = sphericalRef.current.radius * 0.002
        const camera = cameraRef.current
        if (!camera) return

        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
        const up = new THREE.Vector3().crossVectors(right, forward).normalize()

        targetRef.current.add(right.multiplyScalar(-deltaX * panSpeed))
        targetRef.current.add(up.multiplyScalar(deltaY * panSpeed))
      } else {
        // Rotate
        sphericalRef.current.theta += deltaX * 0.01
        // Clamp phi to upper hemisphere only (0.1 to PI/2 - 0.1)
        sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, sphericalRef.current.phi - deltaY * 0.01))
      }

      updateCameraFromSpherical()
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomSpeed = 1.05
      const modelSize = modelSizeRef.current
      const minDistance = modelSize * 0.1  // Prevent crashing into meshes
      const maxDistance = modelSize * 10   // Prevent meshes from disappearing
      if (e.deltaY > 0) {
        sphericalRef.current.radius = Math.min(maxDistance, sphericalRef.current.radius * zoomSpeed)
      } else {
        sphericalRef.current.radius = Math.max(minDistance, sphericalRef.current.radius / zoomSpeed)
      }
      updateCameraFromSpherical()
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const handleDoubleClick = (e: MouseEvent) => {
      if (!cameraRef.current || !modelGroupRef.current || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )

      raycasterRef.current.setFromCamera(mouse, cameraRef.current)
      const intersects = raycasterRef.current.intersectObject(modelGroupRef.current, true)

      if (intersects.length > 0) {
        const hitPoint = intersects[0].point
        targetRef.current.copy(hitPoint)
        updatePivotMarker(hitPoint)
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (!cameraRef.current || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )

      // Handle fisheye mode clicks
      if (fisheyeMode === 'selecting' && modelGroupRef.current) {
        raycasterRef.current.setFromCamera(mouse, cameraRef.current)
        // Try to intersect with visible geometry
        const targets = mergedGroupRef.current?.visible
          ? mergedGroupRef.current
          : modelGroupRef.current
        const intersects = raycasterRef.current.intersectObject(targets, true)

        if (intersects.length > 0) {
          // Move point slightly inside the model (offset along normal or just a bit toward camera)
          const hitPoint = intersects[0].point.clone()
          const normal = intersects[0].face?.normal
          if (normal) {
            // Move point along the face normal to be inside the space
            hitPoint.add(normal.clone().multiplyScalar(0.5))
          }
          handleFisheyeClick(hitPoint)
        }
        return
      }

      // Handle alignment mode clicks
      if (aligningDrawingId) {
        const drawing = drawings.find(d => d.id === aligningDrawingId)
        if (!drawing) return

        raycasterRef.current.setFromCamera(mouse, cameraRef.current)
        const intersects = raycasterRef.current.intersectObject(drawing.mesh, false)

        if (intersects.length > 0) {
          handleAlignmentClick(intersects[0].point)
        }
      }
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('click', handleClick)
    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mouseleave', handleMouseUp)
    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('contextmenu', handleContextMenu)
    container.addEventListener('dblclick', handleDoubleClick)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('click', handleClick)
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mouseleave', handleMouseUp)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('contextmenu', handleContextMenu)
      container.removeEventListener('dblclick', handleDoubleClick)
    }
  }, [updateCameraFromSpherical, updatePivotMarker, aligningDrawingId, drawings, handleAlignmentClick, fisheyeMode, handleFisheyeClick])

  // Load IFC data
  useEffect(() => {
    if (!ifcData || !sceneRef.current || !modelGroupRef.current) return

    const loadIFC = async () => {
      console.log('Loading IFC file...')
      setLoadingState({ loading: true, stage: 'Initializing WebIFC...', meshCount: 0, totalMeshes: 0 })

      const ifcApi = new WebIFC.IfcAPI()
      ifcApi.SetWasmPath('/')
      await ifcApi.Init()
      ifcApiRef.current = ifcApi

      setLoadingState({ loading: true, stage: 'Parsing IFC file...', meshCount: 0, totalMeshes: 0 })
      await new Promise(resolve => setTimeout(resolve, 0))

      const modelID = ifcApi.OpenModel(new Uint8Array(ifcData))
      console.log('Model opened, ID:', modelID)

      // Extract IFC metadata
      setLoadingState({ loading: true, stage: 'Reading metadata...', meshCount: 0, totalMeshes: 0 })
      await new Promise(resolve => setTimeout(resolve, 0))

      const metadata = extractMetadata(ifcApi, modelID)
      onMetadataLoaded(metadata)

      setLoadingState({ loading: true, stage: 'Collecting meshes...', meshCount: 0, totalMeshes: 0 })
      await new Promise(resolve => setTimeout(resolve, 0))

      const modelGroup = modelGroupRef.current!
      const categoryData: Map<number, { count: number; meshIds: number[] }> = new Map()

      // Collect all mesh data first (synchronous callback)
      interface MeshData {
        expressID: number
        typeId: number
        geometries: Array<{
          verts: Float32Array
          indices: Uint32Array
          transform: number[]
          color: { x: number; y: number; z: number; w: number }
        }>
      }
      const collectedMeshes: MeshData[] = []
      let collectCount = 0

      let lastUpdateCount = 0
      ifcApi.StreamAllMeshes(modelID, async (mesh) => {
        const expressID = mesh.expressID

        // Get element type
        let typeId = 0
        try {
          const element = ifcApi.GetLine(modelID, expressID)
          typeId = element?.type || 0
        } catch {
          typeId = 0
        }

        if (!categoryData.has(typeId)) {
          categoryData.set(typeId, { count: 0, meshIds: [] })
        }
        categoryData.get(typeId)!.count++
        categoryData.get(typeId)!.meshIds.push(expressID)

        const meshData: MeshData = { expressID, typeId, geometries: [] }
        const placedGeometries = mesh.geometries
        for (let i = 0; i < placedGeometries.size(); i++) {
          const placedGeometry = placedGeometries.get(i)
          const geometry = ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID)

          const verts = ifcApi.GetVertexArray(
            geometry.GetVertexData(),
            geometry.GetVertexDataSize()
          )
          const indices = ifcApi.GetIndexArray(
            geometry.GetIndexData(),
            geometry.GetIndexDataSize()
          )

          if (verts.length === 0 || indices.length === 0) continue

          meshData.geometries.push({
            verts: new Float32Array(verts),
            indices: new Uint32Array(indices),
            transform: Array.from(placedGeometry.flatTransformation),
            color: { x: placedGeometry.color.x, y: placedGeometry.color.y, z: placedGeometry.color.z, w: placedGeometry.color.w }
          })
        }
        if (meshData.geometries.length > 0) {
          collectedMeshes.push(meshData)
        }

        // Update progress (will batch but shows final count)
        collectCount++
        if (collectCount % 100 === 0 && collectCount !== lastUpdateCount) {
          lastUpdateCount = collectCount
          setLoadingState({ loading: true, stage: 'Collecting meshes...', meshCount: collectCount, totalMeshes: 0 })
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      })

      const totalMeshes = collectedMeshes.length
      console.log('Collected', totalMeshes, 'meshes')
      setLoadingState({ loading: true, stage: 'Loading geometry...', meshCount: 0, totalMeshes })
      await new Promise(resolve => setTimeout(resolve, 0))

      // Process collected meshes in batches to allow UI updates
      let meshCount = 0
      for (let m = 0; m < collectedMeshes.length; m++) {
        const meshData = collectedMeshes[m]

        for (const geomData of meshData.geometries) {
          // Create Three.js geometry
          const bufferGeometry = new THREE.BufferGeometry()

          const positions: number[] = []
          const normals: number[] = []

          for (let j = 0; j < geomData.verts.length; j += 6) {
            positions.push(geomData.verts[j], geomData.verts[j + 1], geomData.verts[j + 2])
            normals.push(geomData.verts[j + 3], geomData.verts[j + 4], geomData.verts[j + 5])
          }

          bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
          bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
          bufferGeometry.setIndex(Array.from(geomData.indices))

          // Apply transformation
          const matrix = new THREE.Matrix4()
          matrix.fromArray(geomData.transform)
          bufferGeometry.applyMatrix4(matrix)

          // Create material with color from IFC
          const color = new THREE.Color(
            geomData.color.x,
            geomData.color.y,
            geomData.color.z
          )

          const material = new THREE.MeshPhongMaterial({
            color,
            opacity: geomData.color.w,
            transparent: geomData.color.w < 1,
            side: THREE.DoubleSide
          })

          const threeMesh = new THREE.Mesh(bufferGeometry, material)
          threeMesh.userData.expressID = meshData.expressID
          threeMesh.userData.categoryId = meshData.typeId
          threeMesh.matrixAutoUpdate = false // Optimization: static meshes don't need matrix updates
          threeMesh.updateMatrix()

          modelGroup.add(threeMesh)
          meshCount++
        }

        // Yield to browser every 50 meshes to allow UI updates
        if (m % 50 === 0) {
          setLoadingState({ loading: true, stage: 'Loading geometry...', meshCount: m + 1, totalMeshes })
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      console.log('Created', meshCount, 'meshes')

      // Create merged geometries for performance mode
      setLoadingState({ loading: true, stage: 'Optimizing geometry...', meshCount: totalMeshes, totalMeshes })
      await new Promise(resolve => setTimeout(resolve, 0))

      const mergedGroup = new THREE.Group()
      mergedGroup.visible = false // Hidden by default
      sceneRef.current!.add(mergedGroup)
      mergedGroupRef.current = mergedGroup

      // Group geometries by color
      const colorGroups = new Map<string, { geometries: THREE.BufferGeometry[], color: THREE.Color, opacity: number }>()

      modelGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) {
          const mat = obj.material as THREE.MeshPhongMaterial
          const colorKey = `${mat.color.r.toFixed(3)},${mat.color.g.toFixed(3)},${mat.color.b.toFixed(3)},${mat.opacity}`

          if (!colorGroups.has(colorKey)) {
            colorGroups.set(colorKey, {
              geometries: [],
              color: mat.color.clone(),
              opacity: mat.opacity
            })
          }
          colorGroups.get(colorKey)!.geometries.push(obj.geometry.clone())
        }
      })

      // Merge geometries for each color group
      let mergedCount = 0
      colorGroups.forEach(({ geometries, color, opacity }) => {
        if (geometries.length > 0) {
          try {
            let merged = mergeGeometries(geometries, false)
            if (merged) {
              const material = new THREE.MeshPhongMaterial({
                color,
                opacity,
                transparent: opacity < 1,
                side: THREE.DoubleSide
              })
              const mergedMesh = new THREE.Mesh(merged, material)
              mergedMesh.matrixAutoUpdate = false
              mergedGroup.add(mergedMesh)
              mergedCount++
            }
          } catch (e) {
            console.warn('Failed to merge geometries:', e)
          }
        }
      })

      console.log(`Created ${mergedCount} merged meshes from ${meshCount} original meshes`)

      // Compute bounding box and center camera
      const box = new THREE.Box3()
      box.setFromObject(modelGroup)

      if (box.isEmpty()) {
        console.warn('Bounding box is empty, using default camera position')
        targetRef.current.set(0, 0, 0)
        sphericalRef.current.radius = 100
        modelSizeRef.current = 100
      } else {
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)

        console.log('Model center:', center)
        console.log('Model size:', size)
        console.log('Max dimension:', maxDim)

        targetRef.current.copy(center)
        sphericalRef.current.radius = maxDim * 2
        modelSizeRef.current = maxDim  // Store for zoom limits

        // Create red wireframe bounding box
        const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z)
        const edges = new THREE.EdgesGeometry(boxGeometry)
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
        const boundingBoxHelper = new THREE.LineSegments(edges, lineMaterial)
        boundingBoxHelper.position.copy(center)
        sceneRef.current!.add(boundingBoxHelper)
        boundingBoxHelperRef.current = boundingBoxHelper

        // Create corner labels at bottom 4 vertices
        const minY = box.min.y
        const corners = [
          new THREE.Vector3(box.min.x, minY, box.min.z),
          new THREE.Vector3(box.max.x, minY, box.min.z),
          new THREE.Vector3(box.max.x, minY, box.max.z),
          new THREE.Vector3(box.min.x, minY, box.max.z),
        ]

        const createTextSprite = (text: string): THREE.Sprite => {
          const canvas = document.createElement('canvas')
          canvas.width = 64
          canvas.height = 64
          const ctx = canvas.getContext('2d')!
          // Draw number with outline for visibility (transparent background)
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 6
          ctx.font = 'bold 48px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.strokeText(text, 32, 32)
          ctx.fillStyle = '#ff0000'
          ctx.fillText(text, 32, 32)
          const texture = new THREE.CanvasTexture(canvas)
          const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,  // Always render in front
            depthWrite: false
          })
          const sprite = new THREE.Sprite(material)
          sprite.scale.set(maxDim * 0.05, maxDim * 0.05, 1)
          sprite.renderOrder = 999  // Render on top of everything
          return sprite
        }

        corners.forEach((corner, index) => {
          const sprite = createTextSprite(String(index + 1))
          sprite.position.copy(corner)
          sceneRef.current!.add(sprite)
          cornerLabelsRef.current.push(sprite)
        })

        // Update camera near/far based on model size
        if (cameraRef.current) {
          cameraRef.current.near = maxDim * 0.001
          cameraRef.current.far = maxDim * 100
          cameraRef.current.updateProjectionMatrix()
        }
      }

      updateCameraFromSpherical()

      // Build categories for UI
      const categoriesArray: ElementCategory[] = Array.from(categoryData.entries())
        .filter(([, data]) => data.count > 0)
        .map(([id, data]) => ({
          id,
          name: getTypeName(id),
          count: data.count,
          visible: true,
          meshIds: data.meshIds
        }))
        .sort((a, b) => b.count - a.count)

      console.log('Categories:', categoriesArray.length)
      onCategoriesLoaded(categoriesArray)

      setLoadingState({ loading: false, stage: 'Complete', meshCount, totalMeshes: meshCount })
    }

    loadIFC().catch(err => {
      console.error('Error loading IFC:', err)
    })

    return () => {
      if (ifcApiRef.current) {
        try {
          ifcApiRef.current.CloseModel(0)
        } catch {
          // Ignore close errors
        }
      }
    }
  }, [ifcData, onCategoriesLoaded, onMetadataLoaded, updateCameraFromSpherical])

  // Update visibility based on categories and selected storey
  useEffect(() => {
    if (!modelGroupRef.current || categories.length === 0) return

    // Skip if performance mode is active (it handles visibility)
    if (performanceMode) return

    const visibilityMap = new Map(categories.map(c => [c.id, c.visible]))
    const storeyElementSet = selectedStorey !== null
      ? new Set(storeys.find(s => s.id === selectedStorey)?.elementIds || [])
      : null

    modelGroupRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.categoryId !== undefined) {
        const categoryVisible = visibilityMap.get(obj.userData.categoryId) ?? true
        const expressID = obj.userData.expressID

        // Check storey filter
        const storeyVisible = storeyElementSet === null || storeyElementSet.has(expressID)

        obj.visible = categoryVisible && storeyVisible
      }
    })
  }, [categories, performanceMode, selectedStorey, storeys])

  return (
    <div className="ifc-viewer" ref={containerRef}>
      {loadingState.loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-stage">{loadingState.stage}</div>
            {loadingState.totalMeshes > 0 ? (
              <>
                <div className="loading-percentage">
                  {Math.round((loadingState.meshCount / loadingState.totalMeshes) * 100)}%
                </div>
                <div className="loading-count">
                  {loadingState.meshCount.toLocaleString()} / {loadingState.totalMeshes.toLocaleString()} meshes
                </div>
              </>
            ) : loadingState.meshCount > 0 && (
              <div className="loading-count">
                {loadingState.meshCount.toLocaleString()} meshes found
              </div>
            )}
          </div>
        </div>
      )}
      <div className="diagnostics-panel">
        <button
          className={`perf-mode-toggle ${performanceMode ? 'active' : ''}`}
          onClick={() => setPerformanceMode(!performanceMode)}
        >
          {performanceMode ? 'Perf Mode ON' : 'Perf Mode OFF'}
        </button>

        <button
          className={`perf-mode-toggle ${showBoundingBox ? 'active' : ''}`}
          onClick={() => setShowBoundingBox(!showBoundingBox)}
        >
          {showBoundingBox ? 'Bounds ON' : 'Bounds OFF'}
        </button>

        <button
          className={`perf-mode-toggle ${fisheyeMode !== 'off' ? 'active' : ''}`}
          onClick={() => {
            if (fisheyeMode === 'off') {
              setFisheyeMode('selecting')
            } else {
              setFisheyeMode('off')
              setFisheyeImage(null)
            }
          }}
        >
          {fisheyeMode === 'off' ? 'Fisheye' : fisheyeMode === 'selecting' ? 'Click Model...' : 'Exit Fisheye'}
        </button>
      </div>

      {/* Fisheye view overlay */}
      {fisheyeMode === 'viewing' && fisheyeImage && (
        <div className="fisheye-overlay" onClick={() => {
          setFisheyeMode('off')
          setFisheyeImage(null)
        }}>
          <img src={fisheyeImage} alt="360 View" className="fisheye-image" />
          <div className="fisheye-hint">Click anywhere to return to model view</div>
        </div>
      )}

      {/* Drawing planes panel */}
      <div className="drawings-panel">
        <input
          ref={drawingInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              handleAddDrawing(file)
              e.target.value = ''
            }
          }}
        />
        <button
          className="add-drawing-btn"
          onClick={() => drawingInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
          </svg>
          Add Drawing
        </button>
        {drawings.length > 0 && (
          <div className="drawings-list">
            {drawings.map((drawing) => (
              <div key={drawing.id} className={`drawing-item ${!drawing.visible ? 'hidden' : ''}`}>
                <button
                  className="toggle-drawing-btn"
                  onClick={() => handleToggleDrawing(drawing.id)}
                  title={drawing.visible ? 'Hide drawing' : 'Show drawing'}
                >
                  {drawing.visible ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </button>
                <span className="drawing-name" title={drawing.name}>
                  {drawing.name}
                </span>
                <button
                  className="align-drawing-btn"
                  onClick={() => handleStartAlign(drawing.id)}
                  title="Align drawing to model"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
                  </svg>
                </button>
                <button
                  className="remove-drawing-btn"
                  onClick={() => handleRemoveDrawing(drawing.id)}
                  title="Remove drawing"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alignment mode overlay */}
      {aligningDrawingId && (
        <div className="alignment-overlay">
          <div className="alignment-instructions">
            <span className="alignment-title">Align Model</span>
            <span className="alignment-progress">
              {alignmentPoints.length < 4
                ? `Point ${alignmentPoints.length + 1}/4`
                : 'Applying...'}
            </span>
            <button className="cancel-align-btn" onClick={handleCancelAlign}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function getTypeName(typeId: number): string {
  const typeNames: Record<number, string> = {
    [WebIFC.IFCWALL]: 'Wall',
    [WebIFC.IFCWALLSTANDARDCASE]: 'Wall',
    [WebIFC.IFCSLAB]: 'Slab',
    [WebIFC.IFCBEAM]: 'Beam',
    [WebIFC.IFCCOLUMN]: 'Column',
    [WebIFC.IFCDOOR]: 'Door',
    [WebIFC.IFCWINDOW]: 'Window',
    [WebIFC.IFCSTAIR]: 'Stair',
    [WebIFC.IFCSTAIRFLIGHT]: 'Stair Flight',
    [WebIFC.IFCRAILING]: 'Railing',
    [WebIFC.IFCROOF]: 'Roof',
    [WebIFC.IFCCURTAINWALL]: 'Curtain Wall',
    [WebIFC.IFCPLATE]: 'Plate',
    [WebIFC.IFCMEMBER]: 'Member',
    [WebIFC.IFCFOOTING]: 'Footing',
    [WebIFC.IFCFURNISHINGELEMENT]: 'Furnishing',
    [WebIFC.IFCFLOWSEGMENT]: 'Flow Segment',
    [WebIFC.IFCFLOWFITTING]: 'Flow Fitting',
    [WebIFC.IFCFLOWTERMINAL]: 'Flow Terminal',
    [WebIFC.IFCBUILDINGELEMENTPROXY]: 'Building Element',
    [WebIFC.IFCSPACE]: 'Space',
    [WebIFC.IFCCOVERING]: 'Covering',
  }
  return typeNames[typeId] || `Element (${typeId})`
}

// Extract metadata from IFC file
function extractMetadata(ifcApi: WebIFC.IfcAPI, modelID: number): IFCMetadata {
  const metadata: IFCMetadata = { storeys: [] }

  try {
    // Get schema version
    metadata.schema = 'IFC'

    // Get project info
    const projects = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT)
    if (projects.size() > 0) {
      const project = ifcApi.GetLine(modelID, projects.get(0))
      metadata.project = {
        name: project.Name?.value || project.LongName?.value,
        description: project.Description?.value,
        phase: project.Phase?.value
      }
    }

    // Get site info
    const sites = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSITE)
    if (sites.size() > 0) {
      const site = ifcApi.GetLine(modelID, sites.get(0))
      metadata.site = {
        name: site.Name?.value || site.LongName?.value,
        description: site.Description?.value
      }
    }

    // Get building info
    const buildings = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING)
    if (buildings.size() > 0) {
      const building = ifcApi.GetLine(modelID, buildings.get(0))
      metadata.building = {
        name: building.Name?.value || building.LongName?.value,
        description: building.Description?.value
      }
    }

    // Get building storeys with their contained elements
    const storeys = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)

    // Build a map of storey ID to element IDs using spatial containment relationships
    const storeyElementsMap = new Map<number, number[]>()

    try {
      const relContained = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)
      for (let i = 0; i < relContained.size(); i++) {
        const rel = ifcApi.GetLine(modelID, relContained.get(i))
        const spatialStructure = rel.RelatingStructure?.value
        if (spatialStructure && rel.RelatedElements) {
          const elementIds: number[] = []
          for (let j = 0; j < rel.RelatedElements.length; j++) {
            const elementRef = rel.RelatedElements[j]
            if (elementRef?.value) {
              elementIds.push(elementRef.value)
            }
          }
          const existing = storeyElementsMap.get(spatialStructure) || []
          storeyElementsMap.set(spatialStructure, [...existing, ...elementIds])
        }
      }
    } catch {
      // Ignore errors parsing relationships
    }

    for (let i = 0; i < storeys.size(); i++) {
      const storeyId = storeys.get(i)
      const storey = ifcApi.GetLine(modelID, storeyId)
      const name = storey.Name?.value || storey.LongName?.value || `Level ${i + 1}`
      const elevation = storey.Elevation?.value
      const elementIds = storeyElementsMap.get(storeyId) || []

      metadata.storeys.push({
        id: storeyId,
        name,
        elevation,
        elementIds
      })
    }

    // Sort storeys by elevation (lowest first)
    metadata.storeys.sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))

    // Get owner history for author/organization info
    const ownerHistories = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCOWNERHISTORY)
    if (ownerHistories.size() > 0) {
      const history = ifcApi.GetLine(modelID, ownerHistories.get(0))

      // Get person/organization
      if (history.OwningUser) {
        try {
          const personOrg = ifcApi.GetLine(modelID, history.OwningUser.value)
          if (personOrg.ThePerson) {
            const person = ifcApi.GetLine(modelID, personOrg.ThePerson.value)
            const names = [person.GivenName?.value, person.FamilyName?.value].filter(Boolean)
            metadata.author = names.join(' ')
          }
          if (personOrg.TheOrganization) {
            const org = ifcApi.GetLine(modelID, personOrg.TheOrganization.value)
            metadata.organization = org.Name?.value
          }
        } catch {
          // Ignore errors accessing nested properties
        }
      }

      // Get application
      if (history.OwningApplication) {
        try {
          const app = ifcApi.GetLine(modelID, history.OwningApplication.value)
          metadata.application = app.ApplicationFullName?.value || app.ApplicationIdentifier?.value
        } catch {
          // Ignore errors
        }
      }

      // Get creation date
      if (history.CreationDate) {
        const timestamp = history.CreationDate.value
        if (timestamp) {
          const date = new Date(timestamp * 1000)
          metadata.creationDate = date.toLocaleDateString()
        }
      }
    }

    // Get units
    const unitAssignments = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCUNITASSIGNMENT)
    if (unitAssignments.size() > 0) {
      const assignment = ifcApi.GetLine(modelID, unitAssignments.get(0))
      metadata.units = {}

      if (assignment.Units) {
        for (let i = 0; i < assignment.Units.length; i++) {
          try {
            const unitRef = assignment.Units[i]
            const unit = ifcApi.GetLine(modelID, unitRef.value)
            const unitType = unit.UnitType?.value
            const name = unit.Name?.value

            if (unitType === 'LENGTHUNIT') {
              metadata.units.length = name || 'METRE'
            } else if (unitType === 'AREAUNIT') {
              metadata.units.area = name || 'SQUARE_METRE'
            } else if (unitType === 'VOLUMEUNIT') {
              metadata.units.volume = name || 'CUBIC_METRE'
            }
          } catch {
            // Ignore unit parsing errors
          }
        }
      }
    }
  } catch (err) {
    console.error('Error extracting metadata:', err)
  }

  return metadata
}
