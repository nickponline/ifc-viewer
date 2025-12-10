import { useState, useCallback, type DragEvent } from 'react'
import './DropZone.css'

interface SampleFile {
  name: string
  path: string
  size: number
}

interface SampleFolder {
  name: string
  files: SampleFile[]
}

// Sample IFC folders and files available in public/ifcs
const SAMPLE_FOLDERS: SampleFolder[] = [
  {
    name: 'test',
    files: [
      { name: 'test.ifc', path: '/ifc/test/test.ifc', size: 710115 },
    ]
  },
  {
    name: 'uno',
    files: [
      { name: '2898f00c5461f9e88f7586e5f4b2bd8b.ifc', path: '/ifc/uno/2898f00c5461f9e88f7586e5f4b2bd8b.ifc', size: 50345193 },
      { name: 'dc26d5fc9dfd702d34921936a4cc622b.ifc', path: '/ifc/uno/dc26d5fc9dfd702d34921936a4cc622b.ifc', size: 189584831 },
      { name: 'de59b920a88f48bf2f7fabbe0eb3c660.ifc', path: '/ifc/uno/de59b920a88f48bf2f7fabbe0eb3c660.ifc', size: 46021080 },
      { name: 'f51d603b0b0c8a787f1b20d83d548746.ifc', path: '/ifc/uno/f51d603b0b0c8a787f1b20d83d548746.ifc', size: 89538452 },
    ]
  },
  {
    name: 'lnr',
    files: [
      { name: '0a962e73d684fad1a042e077b3266f78.ifc', path: '/ifc/lnr/0a962e73d684fad1a042e077b3266f78.ifc', size: 16824861 },
      { name: '0c6df02d0b1c1fbe5cdd87153887f38e.ifc', path: '/ifc/lnr/0c6df02d0b1c1fbe5cdd87153887f38e.ifc', size: 8272184 },
      { name: '1ddc7b418a6fbc5bdfafdbedae1141b5.ifc', path: '/ifc/lnr/1ddc7b418a6fbc5bdfafdbedae1141b5.ifc', size: 61896163 },
      { name: '2c6d4cc3da89bca11b20f9c93ca26d69.ifc', path: '/ifc/lnr/2c6d4cc3da89bca11b20f9c93ca26d69.ifc', size: 4909738 },
      { name: '347c7609e1f012323c8ced735415aa2c.ifc', path: '/ifc/lnr/347c7609e1f012323c8ced735415aa2c.ifc', size: 3298736 },
      { name: '438e8b1dc38f916ee059a86691a080e8.ifc', path: '/ifc/lnr/438e8b1dc38f916ee059a86691a080e8.ifc', size: 53452061 },
      { name: '5162404c47cd191b7ef8de7fb879f6f8.ifc', path: '/ifc/lnr/5162404c47cd191b7ef8de7fb879f6f8.ifc', size: 19247648 },
      { name: '563966201a08b0a482d4292df53ffd25.ifc', path: '/ifc/lnr/563966201a08b0a482d4292df53ffd25.ifc', size: 1416111 },
      { name: '5c6ed014bca689d46dc55cf1916bdb86.ifc', path: '/ifc/lnr/5c6ed014bca689d46dc55cf1916bdb86.ifc', size: 778469 },
      { name: '62e766aac7ff9e3bd8dd68bfbf996beb.ifc', path: '/ifc/lnr/62e766aac7ff9e3bd8dd68bfbf996beb.ifc', size: 14057912 },
      { name: '70d9521e80f527babc85ee8d50bd2433.ifc', path: '/ifc/lnr/70d9521e80f527babc85ee8d50bd2433.ifc', size: 2295876 },
      { name: 'a5a0dec69b30718e67036900bc06468e.ifc', path: '/ifc/lnr/a5a0dec69b30718e67036900bc06468e.ifc', size: 6923688 },
      { name: 'b15eff890a9021df091ab39ec9de9a0b.ifc', path: '/ifc/lnr/b15eff890a9021df091ab39ec9de9a0b.ifc', size: 82491554 },
      { name: 'bec388f335776993c92d7094a8681f57.ifc', path: '/ifc/lnr/bec388f335776993c92d7094a8681f57.ifc', size: 3740490 },
      { name: 'c2932b62a3868112a2e9ec2c7d7098fe.ifc', path: '/ifc/lnr/c2932b62a3868112a2e9ec2c7d7098fe.ifc', size: 23832003 },
      { name: 'c43344dfa691932e45ad779e506bff75.ifc', path: '/ifc/lnr/c43344dfa691932e45ad779e506bff75.ifc', size: 264940023 },
      { name: 'da08150a04a85ece22c2590b7bb4a76f.ifc', path: '/ifc/lnr/da08150a04a85ece22c2590b7bb4a76f.ifc', size: 101742957 },
      { name: 'dee35414aaa86d3b2149e8b097ba31bd.ifc', path: '/ifc/lnr/dee35414aaa86d3b2149e8b097ba31bd.ifc', size: 133371797 },
      { name: 'e05128341ca0310295875cd574910c8a.ifc', path: '/ifc/lnr/e05128341ca0310295875cd574910c8a.ifc', size: 21822035 },
      { name: 'e2d3d4ff5424a44742e78dff33a09209.ifc', path: '/ifc/lnr/e2d3d4ff5424a44742e78dff33a09209.ifc', size: 136500966 },
      { name: 'eb48337343a4127d697be344b1b2b779.ifc', path: '/ifc/lnr/eb48337343a4127d697be344b1b2b779.ifc', size: 2177873 },
    ]
  },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DropZoneProps {
  onFileDrop: (file: File) => void
}

export function DropZone({ onFileDrop }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [loadingSample, setLoadingSample] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.name.toLowerCase().endsWith('.ifc')) {
        onFileDrop(file)
      } else {
        alert('Please drop an IFC file')
      }
    }
  }, [onFileDrop])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onFileDrop(files[0])
    }
  }, [onFileDrop])

  const handleSampleClick = useCallback(async (sample: SampleFile) => {
    setLoadingSample(sample.name)
    try {
      const response = await fetch(sample.path)
      const blob = await response.blob()
      const file = new File([blob], sample.name, { type: 'application/octet-stream' })
      onFileDrop(file)
    } catch (error) {
      console.error('Failed to load sample file:', error)
      alert('Failed to load sample file')
    } finally {
      setLoadingSample(null)
    }
  }, [onFileDrop])

  return (
    <div
      className={`drop-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="drop-zone-content">
        <svg className="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17,8 12,3 7,8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <h2>Drop IFC File Here</h2>
        <p>or click to browse</p>
        <input
          type="file"
          accept=".ifc"
          onChange={handleFileInput}
          className="file-input"
        />
      </div>

      <div className="sample-files">
        <h3>Or try a sample file:</h3>
        {selectedFolder === null ? (
          <div className="folder-list">
            {SAMPLE_FOLDERS.map((folder) => (
              <button
                key={folder.name}
                className="folder-item"
                onClick={() => setSelectedFolder(folder.name)}
              >
                <span className="folder-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                  </svg>
                </span>
                <span className="folder-name">{folder.name}</span>
                <span className="folder-count">{folder.files.length} files</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="sample-list">
            <button
              className="back-button"
              onClick={() => setSelectedFolder(null)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to folders
            </button>
            {SAMPLE_FOLDERS.find(f => f.name === selectedFolder)?.files.map((sample) => (
              <button
                key={sample.name}
                className={`sample-item ${loadingSample === sample.name ? 'loading' : ''}`}
                onClick={() => handleSampleClick(sample)}
                disabled={loadingSample !== null}
              >
                <span className="sample-name">{sample.name}</span>
                <span className="sample-size">{formatFileSize(sample.size)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
