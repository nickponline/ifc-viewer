export interface CameraState {
  position: { x: number; y: number; z: number }
  rotation: number[][]
}

export interface ElementCategory {
  id: number
  name: string
  count: number
  visible: boolean
  meshIds: number[]
  color?: string
}

export interface IFCMesh {
  expressID: number
  category: number
  geometry: {
    position: Float32Array
    normal: Float32Array
    index: Uint32Array
  }
  flatTransformation: number[]
}

export interface StoreyInfo {
  id: number
  name: string
  elevation?: number
  elementIds: number[]
}

export interface IFCMetadata {
  project?: {
    name?: string
    description?: string
    phase?: string
  }
  site?: {
    name?: string
    description?: string
  }
  building?: {
    name?: string
    description?: string
  }
  storeys: StoreyInfo[]
  author?: string
  organization?: string
  application?: string
  creationDate?: string
  units?: {
    length?: string
    area?: string
    volume?: string
  }
  schema?: string
}
