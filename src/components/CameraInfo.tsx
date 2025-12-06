import type { CameraState } from '../types'
import './CameraInfo.css'

interface CameraInfoProps {
  cameraState: CameraState
}

function formatNumber(n: number): string {
  return n.toFixed(3).padStart(8)
}

export function CameraInfo({ cameraState }: CameraInfoProps) {
  const { position, rotation } = cameraState

  return (
    <div className="camera-info">
      <div className="camera-section">
        <div className="camera-label">Position</div>
        <div className="camera-values">
          <span>X: {formatNumber(position.x)}</span>
          <span>Y: {formatNumber(position.y)}</span>
          <span>Z: {formatNumber(position.z)}</span>
        </div>
      </div>
      <div className="camera-section">
        <div className="camera-label">Rotation Matrix</div>
        <div className="matrix">
          {rotation.map((row, i) => (
            <div key={i} className="matrix-row">
              {row.map((val, j) => (
                <span key={j}>{formatNumber(val)}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
