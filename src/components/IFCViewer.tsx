import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'

import * as WebIFC from 'web-ifc'
import type { ElementCategory, IFCMetadata, StoreyInfo } from '../types'
import './IFCViewer.css'

interface IFCViewerProps {
  ifcData: ArrayBuffer
  fileName: string
  categories: ElementCategory[]
  onCategoriesLoaded: (categories: ElementCategory[]) => void
  onMetadataLoaded: (metadata: IFCMetadata) => void
  selectedStorey: number | null
  storeys: StoreyInfo[]
  onGalleryViewChange?: (isGalleryView: boolean) => void
}

export function IFCViewer({
  ifcData,
  fileName,
  categories,
  onCategoriesLoaded,
  onMetadataLoaded,
  selectedStorey,
  storeys,
  onGalleryViewChange
}: IFCViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null)
  const [cameraType, setCameraType] = useState<'perspective' | 'orthographic'>('perspective')
  const cameraTypeRef = useRef<'perspective' | 'orthographic'>('perspective')
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const ifcApiRef = useRef<WebIFC.IfcAPI | null>(null)
  const animationIdRef = useRef<number>(0)
  const pivotMarkerRef = useRef<THREE.Mesh | null>(null)
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const lastFrameTimeRef = useRef<number>(performance.now())
  const frameCountRef = useRef<number>(0)
  const fpsUpdateIntervalRef = useRef<number>(0)

  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState({
    fps: 0,
    triangles: 0,
    drawCalls: 0,
    geometries: 0,
    textures: 0,
    mergedMeshes: 0,
    pixelRatio: 1
  })
  const [diagnosticsCollapsed, setDiagnosticsCollapsed] = useState(true)

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


  // Model adjustment state
  const [modelYOffset, setModelYOffset] = useState(0)

  // Drawing planes state
  interface DrawingPlane {
    id: string
    name: string
    mesh: THREE.Mesh
    visible: boolean
    opacity: number
    autoAligned?: boolean
  }
  const [drawings, setDrawings] = useState<DrawingPlane[]>([])
  const [showDrawingPicker, setShowDrawingPicker] = useState(false)
  const [loadingDrawing, setLoadingDrawing] = useState<string | null>(null)

  // Camera sets state (separate from drawings)
  interface CameraMarker {
    id: number
    mesh: THREE.Mesh
    location: { x: number; y: number; yaw: number }
    image: string
    imagesPath: string // Path to images folder for this walkthrough
  }
  interface CameraSet {
    id: string
    name: string
    cameras: CameraMarker[]
    visible: boolean
    yOffset: number
  }
  const [cameraSets, setCameraSets] = useState<CameraSet[]>([])
  const camerasVisible = true
  const [showCameraPicker, setShowCameraPicker] = useState(false)
  const [loadingCameras, setLoadingCameras] = useState<string | null>(null)
  const [selectedCameraSetId, setSelectedCameraSetId] = useState<string | null>(null)

  // Available drawing files from public/drawings (with pre-computed dimensions)
  // Some drawings have pre-defined alignment transforms for the model

  const AVAILABLE_DRAWINGS = [
    // { name: 'Cafe.png', path: '/drawings/Cafe.png', width: 2387, height: 1782 },
     {
      name: 'UNO3 Treasure.jpeg',
      path: '/drawings/UNO3 Treasure.jpeg',
      width: 5184,
      height: 6912,
      alignmentTransform: {
        'UNO3A-DC-ARCH.ifc': {
          rotation: -0.0070 * Math.PI / 180, // degrees to radians
          scale: 0.999269,
          translation: { x: -34685.6943, y: -387.2199, z: 24325.6559 }
        },
        'UNO3A-EYD.ifc': {
          rotation: 0.1040 * Math.PI / 180, // degrees to radians
          scale: 1.369397,
          translation: { x: -47469.1905, y: -484.8392, z: 33427.5292 }
        },
        'UNO3A-MYD-ALL.ifc': {
          rotation: -0.0368 * Math.PI / 180, // degrees to radians
          scale: 0.994327,
          translation: { x: -34527.0589, y: -377.0496, z: 24186.9114 }
        }
      }
    },
    {
      name: 'UNO3 Ground Level.png',
      path: '/drawings/UNO3 Ground Level.png',
      width: 5184,
      height: 6912,
      alignmentTransform: {
        'UNO3A-DC-ARCH.ifc': {
          rotation: -0.0070 * Math.PI / 180, // degrees to radians
          scale: 0.999269,
          translation: { x: -34685.6943, y: -387.2199, z: 24325.6559 }
        },
        'UNO3A-EYD.ifc': {
          rotation: 0.1040 * Math.PI / 180, // degrees to radians
          scale: 1.369397,
          translation: { x: -47469.1905, y: -484.8392, z: 33427.5292 }
        },
        'UNO3A-MYD-ALL.ifc': {
          rotation: -0.0368 * Math.PI / 180, // degrees to radians
          scale: 0.994327,
          translation: { x: -34527.0589, y: -377.0496, z: 24186.9114 }
        }
      }
    },
    {
      name: 'UNO3 Colorized.png',
      path: '/drawings/UNO3 Colorized.png',
      width: 5184,
      height: 6912,
      alignmentTransform: {
        'UNO3A-DC-ARCH.ifc': {
          rotation: -0 * Math.PI / 180, // degrees to radians
          scale: 1,
          translation: { x: -34685.6943, y: -388.2199, z: 24325.6559 }
        },
        'UNO3A-EYD.ifc': {
          rotation: 0 * Math.PI / 180, // degrees to radians
          scale: 1.369397,
          translation: { x: -47469.1905, y: -484.8392, z: 33427.5292 }
        },
        'UNO3A-MYD-ALL.ifc': {
          rotation: -0 * Math.PI / 180, // degrees to radians
          scale: 1,
          translation: { x: -34527.0589, y: -377.0496, z: 24186.9114 }
        }
      }
    },
  ]

  // Available camera files from public/walkthroughs
  const AVAILABLE_WALKTHROUGHS = [
    { name: '6930a2ed1837c39750badd5d', files: ['cameras_hitl.json'], displayName: 'Data Hall' },
    { name: '6930a07ad42b53733abadd59', files: ['cameras_hitl.json'], displayName: 'Office' },
  ]

  // Alignment mode state
  const [aligningDrawingId, setAligningDrawingId] = useState<string | null>(null)
  const [alignmentPoints, setAlignmentPoints] = useState<(THREE.Vector3 | null)[]>([null, null]) // Drawing points 1 and 2
  const [modelAlignmentPoints, setModelAlignmentPoints] = useState<(THREE.Vector3 | null)[]>([null, null]) // Model points A and B
  const alignmentMarkersRef = useRef<(THREE.Mesh | null)[]>([null, null]) // Drawing point markers
  const modelAlignmentMarkersRef = useRef<(THREE.Mesh | null)[]>([null, null]) // Model point markers
  const alignmentLinesRef = useRef<THREE.Line | null>(null)
  const alignmentConnectingLinesRef = useRef<(Line2 | null)[]>([null, null])
  const [selectedAlignmentPoint, setSelectedAlignmentPoint] = useState<'1' | '2' | 'A' | 'B'>('A')

  // Camera view state (for viewing images and fisheye from camera positions)
  const [cameraViewMode, setCameraViewMode] = useState<'off' | 'image' | 'fisheye' | 'xray'>('off')
  const [selectedCamera, setSelectedCamera] = useState<CameraMarker | null>(null)
  const [fisheyeImage, setFisheyeImage] = useState<string | null>(null)
  const [xrayBlend, setXrayBlend] = useState(0.5) // 0 = photo only, 1 = model only
  const cubeRenderTargetRef = useRef<THREE.WebGLCubeRenderTarget | null>(null)
  const cubeCameraRef = useRef<THREE.CubeCamera | null>(null)

  // Notify parent when gallery view changes
  useEffect(() => {
    onGalleryViewChange?.(cameraViewMode !== 'off')
  }, [cameraViewMode, onGalleryViewChange])

  // Original model transform for reset
  const originalTransformRef = useRef<{
    position: THREE.Vector3
    rotation: THREE.Euler
    scale: THREE.Vector3
  } | null>(null)

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
        // Visibility will be handled by animation loop
      }
    }
  }, [performanceMode])

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  // Update mesh colors when category colors change
  useEffect(() => {
    if (!modelGroupRef.current) return

    // Build a map of categoryId -> color
    const categoryColors = new Map<number, string>()
    for (const cat of categories) {
      if (cat.color) {
        categoryColors.set(cat.id, cat.color)
      }
    }

    // Update mesh materials
    modelGroupRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.categoryId !== undefined) {
        const color = categoryColors.get(obj.userData.categoryId)
        if (color && obj.material instanceof THREE.MeshPhongMaterial) {
          obj.material.color.set(color)
        }
      }
    })

    // Rebuild merged meshes if in performance mode to reflect new colors
    if (performanceMode && mergedGroupRef.current) {
      rebuildMergedMeshes()
    }
  }, [categories, performanceMode, rebuildMergedMeshes])

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

  // Apply Y offset to model
  useEffect(() => {
    if (modelGroupRef.current && originalTransformRef.current) {
      modelGroupRef.current.position.y = originalTransformRef.current.position.y + modelYOffset
    }
    if (mergedGroupRef.current && originalTransformRef.current) {
      mergedGroupRef.current.position.y = originalTransformRef.current.position.y + modelYOffset
    }
  }, [modelYOffset])

  // Loading state
  const [loadingState, setLoadingState] = useState<{
    loading: boolean
    stage: string
    meshCount: number
    totalMeshes: number
  }>({ loading: true, stage: 'Initializing...', meshCount: 0, totalMeshes: 0 })

  // Add drawing plane from URL path (uses pre-defined dimensions from AVAILABLE_DRAWINGS)
  const handleAddDrawingFromPath = useCallback(async (
    name: string,
    path: string,
    width: number,
    height: number,
    alignmentTransform?: { rotation: number; scale: number; translation: { x: number; y: number; z: number } }
  ) => {
    if (!sceneRef.current || !modelGroupRef.current || !mergedGroupRef.current) return

    setLoadingDrawing(name)
    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(path, resolve, undefined, reject)
      })

      // Get model bounds to size the plane appropriately (before any transform)
      const box = new THREE.Box3().setFromObject(modelGroupRef.current!)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const minY = box.min.y

      // Create plane geometry sized to model footprint using pre-defined dimensions
      const planeSize = Math.max(size.x, size.z) * 1.2
      const aspectRatio = width / height
      const planeWidth = planeSize
      const planeHeight = planeSize / aspectRatio
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)

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
      const planeY = minY - 1
      plane.position.set(center.x, planeY, center.z)

      sceneRef.current!.add(plane)

      const drawing: DrawingPlane = {
        id: crypto.randomUUID(),
        name: name,
        mesh: plane,
        visible: true,
        opacity: 1,
        autoAligned: !!alignmentTransform
      }

      setDrawings(prev => [...prev, drawing])
      setShowDrawingPicker(false)

      // Apply alignment transform after placing the drawing
      if (alignmentTransform) {
        const { rotation, scale, translation } = alignmentTransform

        // Apply to model group
        modelGroupRef.current.rotation.y = rotation
        modelGroupRef.current.scale.set(scale, scale, scale)
        modelGroupRef.current.position.set(translation.x, translation.y, translation.z)

        // Apply to merged group
        mergedGroupRef.current.rotation.y = rotation
        mergedGroupRef.current.scale.set(scale, scale, scale)
        mergedGroupRef.current.position.set(translation.x, translation.y, translation.z)

        console.log('Applied pre-defined alignment transform for', name)
      }
    } catch (err) {
      console.error('Failed to load drawing:', err)
      alert('Failed to load drawing')
    } finally {
      setLoadingDrawing(null)
    }
  }, [])

  // Remove drawing plane
  const handleRemoveDrawing = useCallback((id: string) => {
    setDrawings(prev => {
      const drawing = prev.find(d => d.id === id)
      if (drawing && sceneRef.current) {
        // Remove drawing mesh
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
        const newVisible = !d.visible
        d.mesh.visible = newVisible
        return { ...d, visible: newVisible }
      }
      return d
    }))
  }, [])

  // Change drawing opacity
  const handleDrawingOpacity = useCallback((id: string, opacity: number) => {
    setDrawings(prev => prev.map(d => {
      if (d.id === id) {
        const material = d.mesh.material as THREE.MeshBasicMaterial
        material.opacity = opacity
        material.transparent = opacity < 1
        material.needsUpdate = true
        return { ...d, opacity }
      }
      return d
    }))
  }, [])

  // Update minimum pan Y based on visible drawing planes
  useEffect(() => {
    const visibleDrawings = drawings.filter(d => d.visible)
    if (visibleDrawings.length > 0) {
      minPanYRef.current = Math.min(...visibleDrawings.map(d => d.mesh.position.y))
    } else {
      minPanYRef.current = null
    }
  }, [drawings])

  // Add camera set from JSON data (positions relative to drawing plane, not model)
  const handleAddCameraSet = useCallback(async (name: string, jsonPath: string, imagesPath: string) => {
    if (!sceneRef.current) return

    // Remove all existing camera sets first
    for (const existingSet of cameraSets) {
      for (const cam of existingSet.cameras) {
        sceneRef.current.remove(cam.mesh)
        cam.mesh.geometry.dispose()
        if (cam.mesh.material instanceof THREE.Material) {
          cam.mesh.material.dispose()
        }
      }
    }
    setCameraSets([])
    setSelectedCamera(null)
    setSelectedCameraSetId(null)

    setLoadingCameras(name)
    try {
      const response = await fetch(jsonPath)
      const data = await response.json()

      if (data.cameras && Array.isArray(data.cameras)) {
        // Get the first drawing's position and size to align cameras with it
        // Cameras are normalized to the drawing, so we need the drawing's world position
        const firstDrawing = drawings[0]
        if (!firstDrawing) {
          alert('Please add a drawing first before loading cameras')
          setLoadingCameras(null)
          return
        }

        const drawingMesh = firstDrawing.mesh
        const drawingCenter = drawingMesh.position.clone()
        const drawingGeometry = drawingMesh.geometry as THREE.PlaneGeometry
        const planeWidth = drawingGeometry.parameters.width
        const planeHeight = drawingGeometry.parameters.height
        const planeY = drawingCenter.y

        const sphereRadius = Math.max(planeWidth, planeHeight) * 0.00125
        const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 12, 12)
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x2266aa })

        const cameraMarkers: CameraMarker[] = []

        for (const cam of data.cameras) {
          if (cam.location && typeof cam.location.x === 'number' && typeof cam.location.y === 'number' && cam.image) {
            // Position cameras relative to drawing plane center
            const worldX = drawingCenter.x + (cam.location.x - 0.5) * planeWidth
            const worldZ = drawingCenter.z + (0.5 - cam.location.y) * planeHeight

            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial.clone())
            sphere.position.set(worldX, planeY + sphereRadius * 2, worldZ)
            sphere.userData.cameraId = cam.id
            sphere.visible = camerasVisible

            sceneRef.current!.add(sphere)

            cameraMarkers.push({
              id: cam.id,
              mesh: sphere,
              location: cam.location,
              image: cam.image,
              imagesPath: imagesPath
            })
          }
        }

        const cameraSet: CameraSet = {
          id: crypto.randomUUID(),
          name: name,
          cameras: cameraMarkers,
          visible: true,
          yOffset: 0
        }

        setCameraSets(prev => [...prev, cameraSet])
        console.log(`Loaded ${cameraMarkers.length} cameras from ${name}`)
      }
      setShowCameraPicker(false)
    } catch (err) {
      console.error('Failed to load cameras:', err)
      alert('Failed to load cameras')
    } finally {
      setLoadingCameras(null)
    }
  }, [camerasVisible, drawings, cameraSets])

  // Remove camera set
  const handleRemoveCameraSet = useCallback((id: string) => {
    setCameraSets(prev => {
      const cameraSet = prev.find(cs => cs.id === id)
      if (cameraSet && sceneRef.current) {
        for (const cam of cameraSet.cameras) {
          sceneRef.current.remove(cam.mesh)
          cam.mesh.geometry.dispose()
          if (cam.mesh.material instanceof THREE.Material) {
            cam.mesh.material.dispose()
          }
        }
      }
      return prev.filter(cs => cs.id !== id)
    })
  }, [])

  // Toggle camera set visibility
  const handleToggleCameraSet = useCallback((id: string) => {
    setCameraSets(prev => prev.map(cs => {
      if (cs.id === id) {
        const newVisible = !cs.visible
        for (const cam of cs.cameras) {
          cam.mesh.visible = newVisible && camerasVisible
        }
        return { ...cs, visible: newVisible }
      }
      return cs
    }))
  }, [camerasVisible])

  // Update camera set Y offset
  const handleCameraSetYOffset = useCallback((id: string, yOffset: number) => {
    setCameraSets(prev => prev.map(cs => {
      if (cs.id === id) {
        const deltaY = yOffset - cs.yOffset
        for (const cam of cs.cameras) {
          cam.mesh.position.y += deltaY
        }
        return { ...cs, yOffset }
      }
      return cs
    }))
  }, [])

  // Start alignment mode for a drawing
  const handleStartAlign = useCallback((id: string) => {
    setAligningDrawingId(id)
    setAlignmentPoints([null, null])
    setModelAlignmentPoints([null, null])
    setSelectedAlignmentPoint('A')
    // Clear any existing drawing point markers
    alignmentMarkersRef.current.forEach(marker => {
      if (marker) {
        sceneRef.current?.remove(marker)
        marker.geometry.dispose()
        if (marker.material instanceof THREE.Material) marker.material.dispose()
      }
    })
    alignmentMarkersRef.current = [null, null]
    // Clear any existing model point markers
    modelAlignmentMarkersRef.current.forEach(marker => {
      if (marker) {
        sceneRef.current?.remove(marker)
        marker.geometry.dispose()
        if (marker.material instanceof THREE.Material) marker.material.dispose()
      }
    })
    modelAlignmentMarkersRef.current = [null, null]
    if (alignmentLinesRef.current) {
      sceneRef.current?.remove(alignmentLinesRef.current)
      alignmentLinesRef.current.geometry.dispose()
      alignmentLinesRef.current = null
    }
    // Clear connecting lines (Line2)
    alignmentConnectingLinesRef.current.forEach(line => {
      if (line) {
        sceneRef.current?.remove(line)
        line.geometry.dispose()
        ;(line.material as LineMaterial).dispose()
      }
    })
    alignmentConnectingLinesRef.current = [null, null]
  }, [])

  // Cancel alignment mode
  const handleCancelAlign = useCallback(() => {
    setAligningDrawingId(null)
    setAlignmentPoints([null, null])
    setModelAlignmentPoints([null, null])
    setSelectedAlignmentPoint('A')
    // Clear drawing point markers
    alignmentMarkersRef.current.forEach(marker => {
      if (marker) {
        sceneRef.current?.remove(marker)
        marker.geometry.dispose()
        if (marker.material instanceof THREE.Material) marker.material.dispose()
      }
    })
    alignmentMarkersRef.current = [null, null]
    // Clear model point markers
    modelAlignmentMarkersRef.current.forEach(marker => {
      if (marker) {
        sceneRef.current?.remove(marker)
        marker.geometry.dispose()
        if (marker.material instanceof THREE.Material) marker.material.dispose()
      }
    })
    modelAlignmentMarkersRef.current = [null, null]
    if (alignmentLinesRef.current) {
      sceneRef.current?.remove(alignmentLinesRef.current)
      alignmentLinesRef.current.geometry.dispose()
      alignmentLinesRef.current = null
    }
    // Clear connecting lines (Line2)
    alignmentConnectingLinesRef.current.forEach(line => {
      if (line) {
        sceneRef.current?.remove(line)
        line.geometry.dispose()
        ;(line.material as LineMaterial).dispose()
      }
    })
    alignmentConnectingLinesRef.current = [null, null]
  }, [])

  // Reset model to original position
  const handleResetModel = useCallback(() => {
    if (!modelGroupRef.current || !mergedGroupRef.current || !originalTransformRef.current) return

    const { position, rotation, scale } = originalTransformRef.current

    // Reset model group
    modelGroupRef.current.position.copy(position)
    modelGroupRef.current.rotation.copy(rotation)
    modelGroupRef.current.scale.copy(scale)

    // Reset merged group
    mergedGroupRef.current.position.copy(position)
    mergedGroupRef.current.rotation.copy(rotation)
    mergedGroupRef.current.scale.copy(scale)

    // Recalculate model bounds and update camera target
    const newBox = new THREE.Box3().setFromObject(modelGroupRef.current)
    const newCenter = newBox.getCenter(new THREE.Vector3())
    const newSize = newBox.getSize(new THREE.Vector3())
    const maxDim = Math.max(newSize.x, newSize.y, newSize.z)

    // Update model size reference for zoom limits
    modelSizeRef.current = maxDim

    // Update camera target to new center
    targetRef.current.copy(newCenter)
  }, [])

  // Add or update alignment point when clicking on drawing (points 1 and 2)
  const handleDrawingAlignmentClick = useCallback((point: THREE.Vector3) => {
    if (!aligningDrawingId || !sceneRef.current) return
    if (selectedAlignmentPoint !== '1' && selectedAlignmentPoint !== '2') return

    const index = selectedAlignmentPoint === '1' ? 0 : 1
    const sphereRadius = sphericalRef.current.radius * 0.0025

    // Update drawing alignment points
    const newPoints = [...alignmentPoints]
    newPoints[index] = point.clone()
    setAlignmentPoints(newPoints)

    // Create or update sphere marker (blue for drawing points)
    if (alignmentMarkersRef.current[index]) {
      alignmentMarkersRef.current[index]!.position.copy(point)
    } else {
      const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16)
      const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x2266aa })
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.copy(point)
      sceneRef.current.add(sphere)
      alignmentMarkersRef.current[index] = sphere
    }

    // Update line connecting drawing points 1 and 2
    if (alignmentLinesRef.current) {
      sceneRef.current.remove(alignmentLinesRef.current)
      alignmentLinesRef.current.geometry.dispose()
      alignmentLinesRef.current = null
    }
    if (newPoints[0] && newPoints[1]) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints([newPoints[0], newPoints[1]])
      const lineMat = new THREE.LineBasicMaterial({ color: 0x4a9eff })
      const line = new THREE.Line(lineGeom, lineMat)
      sceneRef.current.add(line)
      alignmentLinesRef.current = line
    }
  }, [aligningDrawingId, alignmentPoints, selectedAlignmentPoint])

  // Add or update alignment point when clicking on model mesh (points A and B)
  const handleModelAlignmentClick = useCallback((point: THREE.Vector3) => {
    if (!aligningDrawingId || !sceneRef.current) return
    if (selectedAlignmentPoint !== 'A' && selectedAlignmentPoint !== 'B') return

    const index = selectedAlignmentPoint === 'A' ? 0 : 1
    const sphereRadius = sphericalRef.current.radius * 0.0025

    // Update model alignment points
    const newPoints = [...modelAlignmentPoints]
    newPoints[index] = point.clone()
    setModelAlignmentPoints(newPoints)

    // Create or update sphere marker (red for model points)
    if (modelAlignmentMarkersRef.current[index]) {
      modelAlignmentMarkersRef.current[index]!.position.copy(point)
    } else {
      const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16)
      const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xaa2222 })
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.copy(point)
      sceneRef.current.add(sphere)
      modelAlignmentMarkersRef.current[index] = sphere
    }
  }, [aligningDrawingId, modelAlignmentPoints, selectedAlignmentPoint])

  // Update connecting lines when points change
  useEffect(() => {
    if (!sceneRef.current) return

    // Update connecting lines for both pairs (A-1 and B-2)
    for (let index = 0; index < 2; index++) {
      const modelPoint = modelAlignmentPoints[index]
      const drawingPoint = alignmentPoints[index]

      // Clear existing connecting line
      if (alignmentConnectingLinesRef.current[index]) {
        sceneRef.current.remove(alignmentConnectingLinesRef.current[index]!)
        alignmentConnectingLinesRef.current[index]!.geometry.dispose()
        ;(alignmentConnectingLinesRef.current[index]!.material as LineMaterial).dispose()
        alignmentConnectingLinesRef.current[index] = null
      }

      // Only create line if both points exist
      if (!modelPoint || !drawingPoint) continue

      const lineGeometry = new LineGeometry()
      lineGeometry.setPositions([
        modelPoint.x, modelPoint.y, modelPoint.z,
        drawingPoint.x, drawingPoint.y, drawingPoint.z
      ])
      lineGeometry.setColors([
        1, 0, 0,  // Red at model point
        0, 0.4, 1 // Blue at drawing point
      ])
      const lineMaterial = new LineMaterial({
        linewidth: 3,
        vertexColors: true,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
      })
      const connectingLine = new Line2(lineGeometry, lineMaterial)
      connectingLine.computeLineDistances()
      sceneRef.current.add(connectingLine)
      alignmentConnectingLinesRef.current[index] = connectingLine
    }
  }, [modelAlignmentPoints, alignmentPoints])

  // Update alignment lines when markers are dragged
  const updateAlignmentLines = useCallback(() => {
    // Update connecting lines using model alignment points (Line2 geometry)
    alignmentConnectingLinesRef.current.forEach((line, index) => {
      const modelPoint = modelAlignmentPoints[index]
      if (line && alignmentPoints[index] && modelPoint) {
        const lineGeom = line.geometry as LineGeometry
        lineGeom.setPositions([
          modelPoint.x, modelPoint.y, modelPoint.z,
          alignmentPoints[index]!.x, alignmentPoints[index]!.y, alignmentPoints[index]!.z
        ])
        line.computeLineDistances()
      }
    })

    // Update line between drawing alignment points
    if (alignmentLinesRef.current && alignmentPoints[0] && alignmentPoints[1]) {
      const positions = new Float32Array([
        alignmentPoints[0].x, alignmentPoints[0].y, alignmentPoints[0].z,
        alignmentPoints[1].x, alignmentPoints[1].y, alignmentPoints[1].z
      ])
      alignmentLinesRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      alignmentLinesRef.current.geometry.attributes.position.needsUpdate = true
    }
  }, [alignmentPoints, modelAlignmentPoints])

  // Update alignment lines when points change
  useEffect(() => {
    updateAlignmentLines()
  }, [alignmentPoints, modelAlignmentPoints, updateAlignmentLines])

  // Apply alignment transformation - transform the MODEL to align with the drawing
  // Uses Procrustes analysis with SVD to find optimal scale, rotation, and translation
  // M = model points A and B (source), D = drawing points 1 and 2 (target)
  // Transform: A -> 1, B -> 2
  const applyAlignment = useCallback((modelPoints: THREE.Vector3[], drawingPoints: THREE.Vector3[]) => {
    if (!aligningDrawingId || !modelGroupRef.current || !mergedGroupRef.current || !originalTransformRef.current) return

    const drawing = drawings.find(d => d.id === aligningDrawingId)
    if (!drawing) return

    const modelGroup = modelGroupRef.current
    const mergedGroup = mergedGroupRef.current

    // First, reset model to original position/scale/rotation
    const origTransform = originalTransformRef.current
    modelGroup.position.copy(origTransform.position)
    modelGroup.rotation.copy(origTransform.rotation)
    modelGroup.scale.copy(origTransform.scale)
    mergedGroup.position.copy(origTransform.position)
    mergedGroup.rotation.copy(origTransform.rotation)
    mergedGroup.scale.copy(origTransform.scale)

    // M = model points array (working in XZ plane, using x and z as 2D coordinates)
    // Point A (index 0) maps to drawing point 1, Point B (index 1) maps to drawing point 2
    const M = [
      [modelPoints[0].x, modelPoints[0].z], // Point A
      [modelPoints[1].x, modelPoints[1].z], // Point B
    ]

    // D = drawing points array (target)
    const D = [
      [drawingPoints[0].x, drawingPoints[0].z], // Point 1
      [drawingPoints[1].x, drawingPoints[1].z], // Point 2
    ]

    // Calculate centroids
    const M_centroid = [
      (M[0][0] + M[1][0]) / 2,
      (M[0][1] + M[1][1]) / 2
    ]
    const D_centroid = [
      (D[0][0] + D[1][0]) / 2,
      (D[0][1] + D[1][1]) / 2
    ]

    // Center the points
    const M_centered = M.map(p => [p[0] - M_centroid[0], p[1] - M_centroid[1]])
    const D_centered = D.map(p => [p[0] - D_centroid[0], p[1] - D_centroid[1]])

    // Calculate scale: sqrt(sum(centered^2) / n) for each set
    const M_sumSq = M_centered.reduce((sum, p) => sum + p[0] * p[0] + p[1] * p[1], 0)
    const D_sumSq = D_centered.reduce((sum, p) => sum + p[0] * p[0] + p[1] * p[1], 0)
    const M_scale = Math.sqrt(M_sumSq / M_centered.length)
    const D_scale = Math.sqrt(D_sumSq / D_centered.length)

    if (M_scale === 0) {
      console.error('Model points are the same. Cannot compute alignment.')
      return
    }

    const scale = D_scale / M_scale

    // Scale M_centered
    const M_scaled = M_centered.map(p => [p[0] * scale, p[1] * scale])

    // For 2D rotation, we use the Procrustes solution:
    // The rotation matrix R that minimizes ||M_scaled @ R.T - D_centered||
    // can be found from atan2 of the cross and dot products

    // Compute cross and dot products between scaled model and drawing vectors
    let dotSum = 0, crossSum = 0
    for (let i = 0; i < M_scaled.length; i++) {
      dotSum += M_scaled[i][0] * D_centered[i][0] + M_scaled[i][1] * D_centered[i][1]
      crossSum += M_scaled[i][0] * D_centered[i][1] - M_scaled[i][1] * D_centered[i][0]
    }

    const angle = Math.atan2(crossSum, dotSum)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    // Rotation matrix R = [[cos, -sin], [sin, cos]]
    // Transform is: P' = scale * (P @ R.T) + translation
    // R.T = [[cos, sin], [-sin, cos]]

    // Translation: D_centroid - scale * (R @ M_centroid)
    // R @ M_centroid = [cos*Mx - sin*Mz, sin*Mx + cos*Mz]
    const rotatedMCentroid = [
      cosA * M_centroid[0] - sinA * M_centroid[1],
      sinA * M_centroid[0] + cosA * M_centroid[1]
    ]
    const tx = D_centroid[0] - scale * rotatedMCentroid[0]
    const tz = D_centroid[1] - scale * rotatedMCentroid[1]

    const rotationDeg = angle * 180 / Math.PI
    console.log('Alignment transform (Procrustes):', { scale, rotationDeg, tx, tz })

    // Verify: transform M and check against D
    const M_transformed = M.map(p => {
      const rotated = [cosA * p[0] - sinA * p[1], sinA * p[0] + cosA * p[1]]
      return [scale * rotated[0] + tx, scale * rotated[1] + tz]
    })
    console.log('M transformed:', M_transformed)
    console.log('D target:', D)

    // Apply the transformation using a matrix approach
    // The transform we want is: P' = scale * R @ P + translation (in XZ plane)
    //
    // We'll build a 4x4 matrix that:
    // 1. Scales uniformly by 'scale'
    // 2. Rotates around Y axis by 'angle'
    // 3. Translates by (tx, 0, tz)
    //
    // Then multiply this with the current model matrix

    // Build the alignment transform matrix
    // Order in Three.js: Translation * Rotation * Scale
    const alignMatrix = new THREE.Matrix4()

    // Create individual transform components
    const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale)
    const rotationMatrix = new THREE.Matrix4().makeRotationY(angle)
    const translationMatrix = new THREE.Matrix4().makeTranslation(tx, 0, tz)

    // Combine: T * R * S (applied right to left: first scale, then rotate, then translate)
    alignMatrix.multiplyMatrices(translationMatrix, rotationMatrix)
    alignMatrix.multiply(scaleMatrix)

    // Get current world matrix of the model group
    modelGroup.updateMatrixWorld(true)
    const currentMatrix = modelGroup.matrixWorld.clone()

    // New world matrix = alignMatrix * currentMatrix
    const newMatrix = new THREE.Matrix4()
    newMatrix.multiplyMatrices(alignMatrix, currentMatrix)

    // Decompose back to position, rotation, scale
    const newPosition = new THREE.Vector3()
    const newQuaternion = new THREE.Quaternion()
    const newScale = new THREE.Vector3()
    newMatrix.decompose(newPosition, newQuaternion, newScale)

    // Convert quaternion to euler for Y rotation
    const newEuler = new THREE.Euler().setFromQuaternion(newQuaternion, 'YXZ')

    console.log('New transform from matrix:', {
      position: { x: newPosition.x, y: newPosition.y, z: newPosition.z },
      rotationY: newEuler.y * 180 / Math.PI,
      scale: newScale.x
    })

    // Apply to model group
    modelGroup.position.copy(newPosition)
    modelGroup.rotation.copy(newEuler)
    modelGroup.scale.copy(newScale)

    // Apply same transform to merged group
    mergedGroup.position.copy(newPosition)
    mergedGroup.rotation.copy(newEuler)
    mergedGroup.scale.copy(newScale)

    // Adjust Y position so model sits on the drawing
    const drawingY = drawing.mesh.position.y
    const newModelBox = new THREE.Box3().setFromObject(modelGroup)
    const yOffset = drawingY - newModelBox.min.y + 0.01
    modelGroup.position.y += yOffset
    mergedGroup.position.y += yOffset

    // Debug: verify the alignment
    const finalBox = new THREE.Box3().setFromObject(modelGroup)
    const finalCorners = [
      new THREE.Vector3(finalBox.min.x, finalBox.min.y, finalBox.min.z),
      new THREE.Vector3(finalBox.max.x, finalBox.min.y, finalBox.min.z),
      new THREE.Vector3(finalBox.max.x, finalBox.min.y, finalBox.max.z),
      new THREE.Vector3(finalBox.min.x, finalBox.min.y, finalBox.max.z),
    ]
    console.log('Target points:', drawingPoints.map(p => ({ x: p.x.toFixed(2), z: p.z.toFixed(2) })))
    console.log('Result corners:', finalCorners.map(p => ({ x: p.x.toFixed(2), z: p.z.toFixed(2) })))

    // Update model size reference for zoom limits
    const newBox = new THREE.Box3().setFromObject(modelGroup)
    const newSize = newBox.getSize(new THREE.Vector3())
    const maxDim = Math.max(newSize.x, newSize.y, newSize.z)
    modelSizeRef.current = maxDim

    // Log the final transform values
    console.log('=== ALIGNMENT TRANSFORM APPLIED ===')
    console.log('Rotation (Y-axis):', (modelGroup.rotation.y * 180 / Math.PI).toFixed(4), 'degrees')
    console.log('Scale:', modelGroup.scale.x.toFixed(6))
    console.log('Translation:', {
      x: modelGroup.position.x.toFixed(4),
      y: modelGroup.position.y.toFixed(4),
      z: modelGroup.position.z.toFixed(4)
    })
    console.log('===================================')

    // Clean up alignment mode
    handleCancelAlign()
  }, [aligningDrawingId, drawings, handleCancelAlign])

  // Handle applying the transform
  const handleApplyTransform = useCallback(() => {
    if (modelAlignmentPoints[0] && modelAlignmentPoints[1] && alignmentPoints[0] && alignmentPoints[1]) {
      applyAlignment([modelAlignmentPoints[0], modelAlignmentPoints[1]], [alignmentPoints[0], alignmentPoints[1]])
    }
  }, [modelAlignmentPoints, alignmentPoints, applyAlignment])

  // Capture 360 view from a point and convert to equirectangular
  // yaw parameter rotates the view (in radians)
  const captureFisheyeView = useCallback((point: THREE.Vector3, yaw: number = 0) => {
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

    // Hide all camera markers during fisheye capture
    const cameraMarkerVisibility: Map<THREE.Mesh, boolean> = new Map()
    for (const cameraSet of cameraSets) {
      for (const cam of cameraSet.cameras) {
        cameraMarkerVisibility.set(cam.mesh, cam.mesh.visible)
        cam.mesh.visible = false
      }
    }

    // Update cube camera to capture all 6 faces
    cubeCamera.update(renderer, scene)

    // Restore camera marker visibility
    for (const cameraSet of cameraSets) {
      for (const cam of cameraSet.cameras) {
        const wasVisible = cameraMarkerVisibility.get(cam.mesh)
        if (wasVisible !== undefined) cam.mesh.visible = wasVisible
      }
    }

    // Restore model/merged visibility
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
        // Apply yaw offset to rotate the view
        const theta = (x / equiWidth) * 2 * Math.PI - Math.PI + yaw // -PI to PI (longitude) + yaw offset
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
  }, [cameraSets])

  // Handle camera marker click - show image from that camera
  const handleCameraMarkerClick = useCallback((camera: CameraMarker) => {
    setSelectedCamera(camera)
    setCameraViewMode('image')
  }, [])

  // Navigate to previous/next camera
  const navigateCamera = useCallback((direction: 'prev' | 'next') => {
    if (!selectedCamera) return

    // Find which camera set contains the selected camera
    for (const cameraSet of cameraSets) {
      const index = cameraSet.cameras.findIndex(c => c.id === selectedCamera.id)
      if (index !== -1) {
        const cameras = cameraSet.cameras
        let newIndex: number
        if (direction === 'prev') {
          newIndex = index === 0 ? cameras.length - 1 : index - 1
        } else {
          newIndex = index === cameras.length - 1 ? 0 : index + 1
        }
        setSelectedCamera(cameras[newIndex])
        return
      }
    }
  }, [selectedCamera, cameraSets])

  // Capture fisheye view from selected camera position
  const captureFisheyeFromCamera = useCallback(() => {
    if (!selectedCamera) return
    // Use the camera's mesh position for the fisheye capture
    const point = selectedCamera.mesh.position.clone()
    // Offset slightly above the drawing plane
    point.y += 1
    // Get yaw from camera location (default to 0 if not present)
    // NOTE: The yaw is in the opposite direction of the camera's rotation, so we need to negate it.
    const yaw = 2*Math.PI - (selectedCamera.location.yaw - Math.PI / 2) || 0
    captureFisheyeView(point, yaw)
    setCameraViewMode('fisheye')
  }, [selectedCamera, captureFisheyeView])

  // Re-capture fisheye when camera changes while in fisheye or xray mode
  useEffect(() => {
    if ((cameraViewMode === 'fisheye' || cameraViewMode === 'xray') && selectedCamera) {
      const point = selectedCamera.mesh.position.clone()
      point.y += 1
      const yaw = 2*Math.PI - (selectedCamera.location.yaw - Math.PI / 2) || 0
      captureFisheyeView(point, yaw)
    }
  }, [selectedCamera, cameraViewMode, captureFisheyeView])

  // Camera control state
  const isMouseDownRef = useRef(false)
  const isPanningRef = useRef(false)
  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const sphericalRef = useRef({ radius: 100, phi: Math.PI / 4, theta: Math.PI / 4 })
  const targetRef = useRef(new THREE.Vector3(0, 0, 0))
  const minPanYRef = useRef<number | null>(null) // Minimum Y for panning (set by drawing planes)

  const updateCameraFromSpherical = useCallback(() => {
    const { radius, phi, theta } = sphericalRef.current
    const target = targetRef.current

    if (cameraTypeRef.current === 'perspective' && cameraRef.current) {
      const camera = cameraRef.current
      camera.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta)
      camera.position.y = target.y + radius * Math.cos(phi)
      camera.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta)
      camera.lookAt(target)
      camera.updateProjectionMatrix()
    } else if (cameraTypeRef.current === 'orthographic' && orthoCameraRef.current) {
      const camera = orthoCameraRef.current
      // Orthographic camera looks straight down
      camera.position.x = target.x
      camera.position.y = target.y + radius
      camera.position.z = target.z
      camera.lookAt(target)
      // Update ortho frustum based on radius (zoom level)
      const aspect = containerRef.current ? containerRef.current.clientWidth / containerRef.current.clientHeight : 1
      const frustumSize = radius * 0.8
      camera.left = -frustumSize * aspect
      camera.right = frustumSize * aspect
      camera.top = frustumSize
      camera.bottom = -frustumSize
      camera.updateProjectionMatrix()
    }
  }, [])

  const updatePivotMarker = useCallback((position: THREE.Vector3) => {
    if (!sceneRef.current) return

    // Remove old marker
    if (pivotMarkerRef.current) {
      sceneRef.current.remove(pivotMarkerRef.current)
      pivotMarkerRef.current.geometry.dispose()
      ;(pivotMarkerRef.current.material as THREE.Material).dispose()
    }

    // Create new marker
    const markerSize = sphericalRef.current.radius * 0.005
    const geometry = new THREE.SphereGeometry(markerSize, 16, 16)
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
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

    // Orthographic camera for top-down view
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
    const orthoCamera = new THREE.OrthographicCamera(
      -100 * aspect, 100 * aspect, 100, -100, 0.1, 100000
    )
    // Set up vector to negative Z so camera looks down with Z pointing "up" on screen
    orthoCamera.up.set(0, 0, -1)
    orthoCameraRef.current = orthoCamera

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
      if (modelGroupRef.current) {
        // In performance mode, individual meshes are hidden
        modelGroupRef.current.visible = !performanceModeRef.current
      }
      if (mergedGroupRef.current) {
        // In performance mode, merged meshes are shown
        mergedGroupRef.current.visible = performanceModeRef.current
      }

      // Use the appropriate camera based on camera type
      const activeCamera = cameraTypeRef.current === 'orthographic' ? orthoCamera : camera
      renderer.render(scene, activeCamera)

      // FPS calculation
      frameCountRef.current++
      const now = performance.now()
      fpsUpdateIntervalRef.current += now - lastFrameTimeRef.current
      lastFrameTimeRef.current = now

      // Update diagnostics every 500ms
      if (fpsUpdateIntervalRef.current >= 500) {
        const fps = Math.round((frameCountRef.current * 1000) / fpsUpdateIntervalRef.current)
        const info = renderer.info
        const mergedCount = mergedGroupRef.current?.children.length || 0
        setDiagnostics({
          fps,
          triangles: info.render.triangles,
          drawCalls: info.render.calls,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          mergedMeshes: mergedCount,
          pixelRatio: renderer.getPixelRatio()
        })
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
      // Ignore if interacting with form elements
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('.cameras-panel') || target.closest('.alignment-overlay')) {
        return
      }

      isMouseDownRef.current = true
      isPanningRef.current = e.button === 2 || e.shiftKey
      isDraggingRef.current = false
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

      // Mark as dragging if there's significant movement
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        isDraggingRef.current = true
      }

      if (isPanningRef.current || cameraTypeRef.current === 'orthographic') {
        // Pan (orthographic camera always pans, never rotates)
        const panSpeed = sphericalRef.current.radius * 0.002
        const camera = cameraTypeRef.current === 'orthographic' ? orthoCameraRef.current : cameraRef.current
        if (!camera) return

        if (cameraTypeRef.current === 'orthographic') {
          // For orthographic top-down view, pan in X and Z
          targetRef.current.x -= deltaX * panSpeed
          targetRef.current.z -= deltaY * panSpeed
        } else {
          const forward = new THREE.Vector3()
          camera.getWorldDirection(forward)
          const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
          const up = new THREE.Vector3().crossVectors(right, forward).normalize()

          targetRef.current.add(right.multiplyScalar(-deltaX * panSpeed))
          targetRef.current.add(up.multiplyScalar(deltaY * panSpeed))
        }
        // Clamp Y to not go below drawing plane
        if (minPanYRef.current !== null && targetRef.current.y < minPanYRef.current) {
          targetRef.current.y = minPanYRef.current
        }
      } else {
        // Rotate (perspective only)
        sphericalRef.current.theta += deltaX * 0.01
        // Clamp phi to upper hemisphere only (0.1 to PI/2 - 0.1)
        sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, sphericalRef.current.phi - deltaY * 0.01))
      }

      updateCameraFromSpherical()
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomSpeed = 1.02
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
      const activeCamera = cameraTypeRef.current === 'orthographic' ? orthoCameraRef.current : cameraRef.current
      if (!activeCamera || !modelGroupRef.current || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )

      raycasterRef.current.setFromCamera(mouse, activeCamera)
      const intersects = raycasterRef.current.intersectObject(modelGroupRef.current, true)

      if (intersects.length > 0) {
        const hitPoint = intersects[0].point
        targetRef.current.copy(hitPoint)
        updatePivotMarker(hitPoint)
      }
    }

    const handleClick = (e: MouseEvent) => {
      const activeCamera = cameraTypeRef.current === 'orthographic' ? orthoCameraRef.current : cameraRef.current
      if (!activeCamera || !containerRef.current) return

      // Ignore clicks that were actually drags (rotation or pan)
      if (isDraggingRef.current) {
        return
      }

      // Ignore clicks on UI elements
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('.alignment-overlay') || target.closest('.cameras-panel')) {
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )

      // Check for camera marker clicks first
      if (camerasVisible) {
        raycasterRef.current.setFromCamera(mouse, activeCamera)
        // Collect all camera marker meshes from cameraSets
        const cameraMarkerMeshes: THREE.Mesh[] = []
        for (const cameraSet of cameraSets) {
          if (cameraSet.visible && camerasVisible) {
            for (const cam of cameraSet.cameras) {
              cameraMarkerMeshes.push(cam.mesh)
            }
          }
        }
        if (cameraMarkerMeshes.length > 0) {
          const intersects = raycasterRef.current.intersectObjects(cameraMarkerMeshes, false)
          if (intersects.length > 0) {
            const clickedMesh = intersects[0].object as THREE.Mesh
            // Find the camera marker that was clicked
            for (const cameraSet of cameraSets) {
              const cam = cameraSet.cameras.find(c => c.mesh === clickedMesh)
              if (cam) {
                handleCameraMarkerClick(cam)
                return
              }
            }
          }
        }
      }

      // Handle alignment mode clicks
      if (aligningDrawingId) {
        const drawing = drawings.find(d => d.id === aligningDrawingId)
        if (!drawing) return

        raycasterRef.current.setFromCamera(mouse, activeCamera)

        // If selecting model points (A or B), raycast against model meshes
        if (selectedAlignmentPoint === 'A' || selectedAlignmentPoint === 'B') {
          if (modelGroupRef.current) {
            const intersects = raycasterRef.current.intersectObject(modelGroupRef.current, true)
            if (intersects.length > 0) {
              handleModelAlignmentClick(intersects[0].point)
            }
          }
        } else {
          // If selecting drawing points (1 or 2), raycast against drawing mesh
          const intersects = raycasterRef.current.intersectObject(drawing.mesh, false)
          if (intersects.length > 0) {
            handleDrawingAlignmentClick(intersects[0].point)
          }
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
  }, [updateCameraFromSpherical, updatePivotMarker, aligningDrawingId, drawings, handleDrawingAlignmentClick, handleModelAlignmentClick, selectedAlignmentPoint, camerasVisible, handleCameraMarkerClick, cameraSets])

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
      const categoryData: Map<number, { count: number; meshIds: number[]; color?: string }> = new Map()

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
          categoryData.set(typeId, { count: 0, meshIds: [], color: undefined })
        }
        categoryData.get(typeId)!.count++
        categoryData.get(typeId)!.meshIds.push(expressID)

        const meshData: MeshData = { expressID, typeId, geometries: [] }

        // Capture first color for this category
        const catData = categoryData.get(typeId)!
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

          // Capture first color for this category (convert to hex)
          if (!catData.color) {
            const r = Math.round(placedGeometry.color.x * 255)
            const g = Math.round(placedGeometry.color.y * 255)
            const b = Math.round(placedGeometry.color.z * 255)
            catData.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          }

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

        // Move model to origin (translate by negative center)
        modelGroup.position.sub(center)
        mergedGroup.position.sub(center)

        // Camera target is now at origin
        targetRef.current.set(0, 0, 0)
        sphericalRef.current.radius = maxDim * 2
        modelSizeRef.current = maxDim  // Store for zoom limits

        // Update camera near/far based on model size
        if (cameraRef.current) {
          cameraRef.current.near = maxDim * 0.001
          cameraRef.current.far = maxDim * 100
          cameraRef.current.updateProjectionMatrix()
        }
      }

      updateCameraFromSpherical()

      // Save original transform for reset functionality
      originalTransformRef.current = {
        position: modelGroup.position.clone(),
        rotation: modelGroup.rotation.clone(),
        scale: modelGroup.scale.clone()
      }


      // Build categories for UI
      const categoriesArray: ElementCategory[] = Array.from(categoryData.entries())
        .filter(([, data]) => data.count > 0)
        .map(([id, data]) => ({
          id,
          name: getTypeName(id),
          count: data.count,
          visible: true,
          meshIds: data.meshIds,
          color: data.color
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
  }, [ifcData, fileName, onCategoriesLoaded, onMetadataLoaded, updateCameraFromSpherical])

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
      <div className={`diagnostics-panel ${diagnosticsCollapsed ? 'collapsed' : ''}`}>
        <button
          className="diagnostics-header"
          onClick={() => setDiagnosticsCollapsed(!diagnosticsCollapsed)}
        >
          <span>Diagnostics</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
            className={`diagnostics-chevron ${diagnosticsCollapsed ? 'collapsed' : ''}`}
          >
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>
        {!diagnosticsCollapsed && (
          <>
            <div className="diagnostics-row">
              <span className="diagnostics-label">FPS</span>
              <span className="diagnostics-value">{diagnostics.fps}</span>
            </div>
            <div className="diagnostics-row">
              <span className="diagnostics-label">Triangles</span>
              <span className="diagnostics-value">{diagnostics.triangles.toLocaleString()}</span>
            </div>
            <div className="diagnostics-row">
              <span className="diagnostics-label">Draw calls</span>
              <span className="diagnostics-value">{diagnostics.drawCalls}</span>
            </div>
            <div className="diagnostics-row">
              <span className="diagnostics-label">Geometries</span>
              <span className="diagnostics-value">{diagnostics.geometries}</span>
            </div>
            <div className="diagnostics-row">
              <span className="diagnostics-label">Textures</span>
              <span className="diagnostics-value">{diagnostics.textures}</span>
            </div>

            <div className="diagnostics-divider" />

            <button
              className={`perf-mode-toggle ${performanceMode ? 'active' : ''}`}
              onClick={() => setPerformanceMode(!performanceMode)}
            >
              {performanceMode ? 'Perf Mode ON' : 'Perf Mode OFF'}
            </button>

            <button
              className={`camera-type-toggle ${cameraType === 'orthographic' ? 'active' : ''}`}
              onClick={() => {
                const newType = cameraType === 'perspective' ? 'orthographic' : 'perspective'
                setCameraType(newType)
                cameraTypeRef.current = newType
                updateCameraFromSpherical()
              }}
            >
              {cameraType === 'perspective' ? 'Perspective' : 'Orthographic'}
            </button>
          </>
        )}
      </div>

      {/* Camera view overlay */}
      {cameraViewMode !== 'off' && selectedCamera && (
        <div className="fisheye-overlay">
          {cameraViewMode === 'image' ? (
            <img src={`${selectedCamera.imagesPath}/${selectedCamera.image}`} alt={`Camera ${selectedCamera.id}`} className="fisheye-image" />
          ) : cameraViewMode === 'fisheye' ? (
            fisheyeImage && <img src={fisheyeImage} alt="360 View" className="fisheye-image fisheye-model" />
          ) : (
            /* X-Ray mode: both images overlaid */
            <div className="xray-container">
              <img src={`${selectedCamera.imagesPath}/${selectedCamera.image}`} alt={`Camera ${selectedCamera.id}`} className="fisheye-image xray-photo" style={{ opacity: 1 - xrayBlend }} />
              {fisheyeImage && <img src={fisheyeImage} alt="360 View" className="fisheye-image fisheye-model xray-model" style={{ opacity: xrayBlend }} />}
            </div>
          )}
          <div className="camera-view-controls">
            <button
              className="camera-nav-btn"
              onClick={() => navigateCamera('prev')}
              title="Previous camera"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button
              className={`camera-view-toggle ${cameraViewMode === 'image' ? 'active' : ''}`}
              onClick={() => setCameraViewMode('image')}
            >
              Photo
            </button>
            <button
              className={`camera-view-toggle ${cameraViewMode === 'fisheye' ? 'active' : ''}`}
              onClick={() => {
                if (cameraViewMode !== 'fisheye') {
                  captureFisheyeFromCamera()
                }
              }}
            >
              Model
            </button>
            <button
              className={`camera-view-toggle ${cameraViewMode === 'xray' ? 'active' : ''}`}
              onClick={() => {
                if (cameraViewMode !== 'xray') {
                  // Need to capture fisheye for xray mode
                  const point = selectedCamera.mesh.position.clone()
                  point.y += 1
                  const yaw = 2*Math.PI - (selectedCamera.location.yaw - Math.PI / 2) || 0
                  captureFisheyeView(point, yaw)
                  setCameraViewMode('xray')
                }
              }}
            >
              X-Ray
            </button>
            {cameraViewMode === 'xray' && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={xrayBlend}
                onChange={(e) => setXrayBlend(parseFloat(e.target.value))}
                className="xray-blend-slider"
                title="Blend: Photo ↔ Model"
              />
            )}
            <button
              className="camera-nav-btn"
              onClick={() => navigateCamera('next')}
              title="Next camera"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <button
              className="camera-view-close"
              onClick={() => {
                setCameraViewMode('off')
                setSelectedCamera(null)
                setFisheyeImage(null)
              }}
            >
              Close
            </button>
          </div>
          <div className="fisheye-hint">Camera {selectedCamera.id} - {selectedCamera.image}</div>
        </div>
      )}

      {/* Drawing picker modal */}
      {showDrawingPicker && (
        <div className="drawing-picker-overlay" onClick={() => setShowDrawingPicker(false)}>
          <div className="drawing-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drawing-picker-header">
              <h3>Add Drawing</h3>
              <button className="drawing-picker-close" onClick={() => setShowDrawingPicker(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="drawing-picker-list">
              {AVAILABLE_DRAWINGS.map((drawing) => (
                <button
                  key={drawing.name}
                  className={`drawing-picker-item ${loadingDrawing === drawing.name ? 'loading' : ''}`}
                  onClick={() => handleAddDrawingFromPath(drawing.name, drawing.path, drawing.width, drawing.height, (drawing as any).alignmentTransform?.[fileName])}
                  disabled={loadingDrawing !== null}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21,15 16,10 5,21"/>
                  </svg>
                  <span className="drawing-picker-item-name">{drawing.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Camera picker modal */}
      {showCameraPicker && (
        <div className="camera-picker-overlay" onClick={() => setShowCameraPicker(false)}>
          <div className="camera-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="camera-picker-header">
              <h3>Add Cameras</h3>
              <button className="camera-picker-close" onClick={() => setShowCameraPicker(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="camera-picker-list" onWheel={(e) => e.stopPropagation()}>
              {AVAILABLE_WALKTHROUGHS.map((walkthrough) => (
                <div key={walkthrough.name} className="camera-picker-folder">
                  <div className="camera-picker-folder-name">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                    </svg>
                    <span>{walkthrough.displayName}</span>
                  </div>
                  <div className="camera-picker-files">
                    {walkthrough.files.map((file) => {
                      const cameraSetName = `${walkthrough.displayName}`
                      const isAlreadyLoaded = cameraSets.some(cs => cs.name === cameraSetName)
                      return (
                      <button
                        key={file}
                        className={`camera-picker-item ${loadingCameras === cameraSetName ? 'loading' : ''} ${isAlreadyLoaded ? 'loaded' : ''}`}
                        onClick={() => handleAddCameraSet(
                          cameraSetName,
                          `/walkthroughs/${walkthrough.name}/${file}`,
                          `/walkthroughs/${walkthrough.name}/images`
                        )}
                        disabled={loadingCameras !== null || isAlreadyLoaded}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14,2 14,8 20,8"/>
                        </svg>
                        <span className="camera-picker-item-name">cameras.json</span>
                      </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drawing and cameras panels - bottom right */}
      <div className="bottom-right-panels">
      <div className="drawings-panel">
        <button
          className="add-drawing-btn"
          onClick={() => setShowDrawingPicker(true)}
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
                {drawing.autoAligned ? (
                  <span className="auto-aligned-check" title="Auto-aligned">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" width="14" height="14">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                ) : (
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
                )}
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
                <input
                  type="range"
                  className="drawing-opacity-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={drawing.opacity}
                  onChange={(e) => handleDrawingOpacity(drawing.id, parseFloat(e.target.value))}
                  title={`Opacity: ${Math.round(drawing.opacity * 100)}%`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cameras panel - bottom right */}
      <div className="cameras-panel">
        <button
          className="add-cameras-btn"
          onClick={() => setShowCameraPicker(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Add Cameras
        </button>
        {cameraSets.length > 0 && (
          <div className="camera-sets-list">
            {cameraSets.map((cameraSet) => (
              <div
                key={cameraSet.id}
                className={`camera-set-item ${!cameraSet.visible ? 'hidden' : ''} ${selectedCameraSetId === cameraSet.id ? 'selected' : ''}`}
                onClick={() => setSelectedCameraSetId(selectedCameraSetId === cameraSet.id ? null : cameraSet.id)}
              >
                <div className="camera-set-row">
                  <button
                    className="toggle-camera-set-btn"
                    onClick={(e) => { e.stopPropagation(); handleToggleCameraSet(cameraSet.id); }}
                    title={cameraSet.visible ? 'Hide camera set' : 'Show camera set'}
                  >
                    {cameraSet.visible ? (
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
                  <span className="camera-set-name" title={cameraSet.name}>
                    {cameraSet.name}
                  </span>
                  <span className="camera-set-count">{cameraSet.cameras.length}</span>
                  <button
                    className="remove-camera-set-btn"
                    onClick={(e) => { e.stopPropagation(); handleRemoveCameraSet(cameraSet.id); }}
                    title="Remove camera set"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                {selectedCameraSetId === cameraSet.id && (
                  <div className="camera-set-y-offset" onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <span className="camera-set-y-label">Y</span>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="0.5"
                      value={cameraSet.yOffset}
                      onChange={(e) => handleCameraSetYOffset(cameraSet.id, parseFloat(e.target.value))}
                      className="camera-set-y-slider"
                    />
                    <span className="camera-set-y-value">{cameraSet.yOffset.toFixed(1)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Alignment mode overlay */}
      {aligningDrawingId && (
        <div className="alignment-overlay">
          <div className="alignment-instructions" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <span className="alignment-title">Align Model</span>
            <div className="alignment-point-buttons">
              <button
                className={`alignment-point-btn model-point ${selectedAlignmentPoint === 'A' ? 'selected' : ''} ${modelAlignmentPoints[0] ? 'placed' : ''}`}
                onClick={() => setSelectedAlignmentPoint('A')}
                title="Click on model to place point A"
              >
                A
              </button>
              <button
                className={`alignment-point-btn model-point ${selectedAlignmentPoint === 'B' ? 'selected' : ''} ${modelAlignmentPoints[1] ? 'placed' : ''}`}
                onClick={() => setSelectedAlignmentPoint('B')}
                title="Click on model to place point B"
              >
                B
              </button>
              <span className="alignment-arrow">→</span>
              <button
                className={`alignment-point-btn drawing-point ${selectedAlignmentPoint === '1' ? 'selected' : ''} ${alignmentPoints[0] ? 'placed' : ''}`}
                onClick={() => setSelectedAlignmentPoint('1')}
                title="Click on drawing to place point 1"
              >
                1
              </button>
              <button
                className={`alignment-point-btn drawing-point ${selectedAlignmentPoint === '2' ? 'selected' : ''} ${alignmentPoints[1] ? 'placed' : ''}`}
                onClick={() => setSelectedAlignmentPoint('2')}
                title="Click on drawing to place point 2"
              >
                2
              </button>
            </div>
            <button
              className="transform-btn"
              onClick={handleApplyTransform}
              disabled={!modelAlignmentPoints[0] || !modelAlignmentPoints[1] || !alignmentPoints[0] || !alignmentPoints[1]}
            >
              Transform
            </button>
            <button className="cancel-align-btn" onClick={handleResetModel}>
              Reset
            </button>
            <button className="cancel-align-btn" onClick={handleCancelAlign}>
              Cancel
            </button>
            <div className="alignment-divider" />
            <div className="y-offset-control" onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()}>
              <span className="y-offset-label">Y</span>
              <input
                type="range"
                min="-50"
                max="50"
                step="0.5"
                value={modelYOffset}
                onChange={(e) => setModelYOffset(parseFloat(e.target.value))}
                className="y-offset-slider"
              />
              <span className="y-offset-value">{modelYOffset.toFixed(1)}</span>
            </div>
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
