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

// Sample IFC folders and files available in public/ifc
const SAMPLE_FOLDERS: SampleFolder[] = [
  {
    name: 'lnr',
    files: [
      // { name: 'LNR4A-ASB-DC-CEG-PRECAST.ifc', path: '/ifc/lnr/LNR4A-ASB-DC-CEG-PRECAST.ifc', size: 133371797 },
      // { name: 'LNR4A-DC-CEG-PRECAST.ifc', path: '/ifc/lnr/LNR4A-DC-CEG-PRECAST.ifc', size: 146947484 },
      { name: 'LNR-4A-C-UTILITY-DRY.ifc', path: '/ifc/lnr/LNR-4A-C-UTILITY-DRY.ifc', size: 79161686 },
      { name: 'LNR-4A-C-UTILITY.ifc', path: '/ifc/lnr/LNR-4A-C-UTILITY.ifc', size: 79161686 },
      { name: 'LNR4A-ALL-BCC-STRU.ifc', path: '/ifc/lnr/LNR4A-ALL-BCC-STRU.ifc', size: 6923688 },
      { name: 'LNR4A-ASB-UND-DHG-DWTR.ifc', path: '/ifc/lnr/LNR4A-ASB-UND-DHG-DWTR.ifc', size: 778469 },
      { name: 'LNR4A-ASB-UND-DHG-FWTR.ifc', path: '/ifc/lnr/LNR4A-ASB-UND-DHG-FWTR.ifc', size: 3298736 },
      { name: 'LNR4A-ASB-UND-DHG-SSWR.ifc', path: '/ifc/lnr/LNR4A-ASB-UND-DHG-SSWR.ifc', size: 2177873 },
      { name: 'LNR4A-ASB-UND-DHG-STRM.ifc', path: '/ifc/lnr/LNR4A-ASB-UND-DHG-STRM.ifc', size: 2295876 },
      { name: 'LNR4A-DC-ARCH_detached.ifc', path: '/ifc/lnr/LNR4A-DC-ARCH_detached.ifc', size: 83517068 },
      { name: 'LNR4A-DC-STRU.ifc', path: '/ifc/lnr/LNR4A-DC-STRU.ifc', size: 23741088 },
      { name: 'LNR4A-DC-STRU_no_deck.ifc', path: '/ifc/lnr/LNR4A-DC-STRU_no_deck.ifc', size: 23735077 },
      { name: 'LNR4A-DC-STRU_Shell_1.ifc', path: '/ifc/lnr/LNR4A-DC-STRU_Shell_1.ifc', size: 12330677 },
      { name: 'LNR4A-DC-STRU_Shell_2.ifc', path: '/ifc/lnr/LNR4A-DC-STRU_Shell_2.ifc', size: 1685885 },
      { name: 'LNR4A-DC-WBI-GEO.ifc', path: '/ifc/lnr/LNR4A-DC-WBI-GEO.ifc', size: 185034 },
      { name: 'LNR4A-DCH-EAS-HVAC.ifc', path: '/ifc/lnr/LNR4A-DCH-EAS-HVAC.ifc', size: 61896163 },
      { name: 'LNR4A-DCH-EAS-MECH.ifc', path: '/ifc/lnr/LNR4A-DCH-EAS-MECH.ifc', size: 136500966 },
      { name: 'LNR4A-DCH-EAS-PLBG.ifc', path: '/ifc/lnr/LNR4A-DCH-EAS-PLBG.ifc', size: 264940023 },
      { name: 'LNR4A-ELEC-MMR_1.ifc', path: '/ifc/lnr/LNR4A-ELEC-MMR_1.ifc', size: 23832003 },
      { name: 'LNR4A-ELEC-MMR_2.ifc', path: '/ifc/lnr/LNR4A-ELEC-MMR_2.ifc', size: 53452061 },
      { name: 'LNR4A-ELEC-MMR_3.ifc', path: '/ifc/lnr/LNR4A-ELEC-MMR_3.ifc', size: 21822035 },
      { name: 'LNR4A-EYD-BCC-STRU.ifc', path: '/ifc/lnr/LNR4A-EYD-BCC-STRU.ifc', size: 3740490 },
      { name: 'LNR4A-EYD-EAS-MECH.ifc', path: '/ifc/lnr/LNR4A-EYD-EAS-MECH.ifc', size: 82491554 },
      { name: 'LNR4A-EYD-EAS-PLBG.ifc', path: '/ifc/lnr/LNR4A-EYD-EAS-PLBG.ifc', size: 4909738 },
      { name: 'LNR4A-EYD-STRU.ifc', path: '/ifc/lnr/LNR4A-EYD-STRU.ifc', size: 15465880 },
      { name: 'LNR4A-MYD-ASB-UND-EAS-MECH.ifc', path: '/ifc/lnr/LNR4A-MYD-ASB-UND-EAS-MECH.ifc', size: 16824861 },
      { name: 'LNR4A-MYD-BCC-STRU.ifc', path: '/ifc/lnr/LNR4A-MYD-BCC-STRU.ifc', size: 1416111 },
      { name: 'LNR4A-MYD-EAS-PLBG.ifc', path: '/ifc/lnr/LNR4A-MYD-EAS-PLBG.ifc', size: 19247648 },
      { name: 'LNR4A-MYD-STRU.ifc', path: '/ifc/lnr/LNR4A-MYD-STRU.ifc', size: 2538235 },
      { name: 'LNR4A-PH1-STF-STRU.ifc', path: '/ifc/lnr/LNR4A-PH1-STF-STRU.ifc', size: 14057912 },
      { name: 'LNR4A-PH2-STF-STRU.ifc', path: '/ifc/lnr/LNR4A-PH2-STF-STRU.ifc', size: 8272184 },
      { name: 'LNR4A-UND-DHG-DWTR.ifc', path: '/ifc/lnr/LNR4A-UND-DHG-DWTR.ifc', size: 16794747 },
      { name: 'LNR4A-UND-DHG-FWTR.ifc', path: '/ifc/lnr/LNR4A-UND-DHG-FWTR.ifc', size: 6573136 },
      { name: 'LNR4A-UND-DHG-SSWR.ifc', path: '/ifc/lnr/LNR4A-UND-DHG-SSWR.ifc', size: 1761835 },
      { name: 'LNR4A-UND-DHG-STRM.ifc', path: '/ifc/lnr/LNR4A-UND-DHG-STRM.ifc', size: 3849384 },
      { name: 'LNR4A-UND-MMR-ELEC.ifc', path: '/ifc/lnr/LNR4A-UND-MMR-ELEC.ifc', size: 101742957 },
    ]
  },
  {
    name: 'sample',
    files: [
      { name: 'cafe.ifc', path: '/ifc/sample/cafe.ifc', size: 710115 },
    ]
  },
  {
    name: 'uno',
    files: [
      { name: 'UNO2A-EYD-STRU_IFC4.ifc', path: '/ifc/uno/UNO2A-EYD-STRU_IFC4.ifc', size: 26874688 },
      { name: 'UNO3A-DC-ARCH.ifc', path: '/ifc/uno/UNO3A-DC-ARCH.ifc', size: 50489311 },
      { name: 'UNO3A-EYD.ifc', path: '/ifc/uno/UNO3A-EYD.ifc', size: 89538452 },
      { name: 'UNO3A-MYD-ALL.ifc', path: '/ifc/uno/UNO3A-MYD-ALL.ifc', size: 46021080 },
      { name: 'UNO3A-MYD-PRODUCT-ALL.ifc', path: '/ifc/uno/UNO3A-MYD-PRODUCT-ALL.ifc', size: 189584831 },
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
