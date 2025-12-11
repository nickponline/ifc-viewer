import { useState, useCallback } from 'react'
import { IFCViewer } from './components/IFCViewer'
import { DropZone } from './components/DropZone'
import { FilterPanel } from './components/FilterPanel'
import type { ElementCategory, IFCMetadata } from './types'
import './App.css'

function App() {
  const [ifcData, setIfcData] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [categories, setCategories] = useState<ElementCategory[]>([])
  const [metadata, setMetadata] = useState<IFCMetadata>({ storeys: [] })
  const [selectedStorey, setSelectedStorey] = useState<number | null>(null)
  const [isGalleryView, setIsGalleryView] = useState(false)
  const [showDropZone, setShowDropZone] = useState(false)

  const handleFileDrop = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        setIfcData(e.target.result)
        setFileName(file.name)
        setShowDropZone(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleCategoryToggle = useCallback((categoryId: number) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId ? { ...cat, visible: !cat.visible } : cat
      )
    )
  }, [])

  const handleToggleAll = useCallback((visible: boolean) => {
    setCategories(prev => prev.map(cat => ({ ...cat, visible })))
  }, [])

  const handleCategoryColorChange = useCallback((categoryId: number, color: string) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId ? { ...cat, color } : cat
      )
    )
  }, [])

  return (
    <div className="app">
      {ifcData ? (
        <>
          <IFCViewer
            ifcData={ifcData}
            fileName={fileName}
            categories={categories}
            onCategoriesLoaded={setCategories}
            onMetadataLoaded={setMetadata}
            selectedStorey={selectedStorey}
            storeys={metadata.storeys}
            onGalleryViewChange={setIsGalleryView}
          />
          <FilterPanel
            categories={categories}
            onCategoryToggle={handleCategoryToggle}
            onCategoryColorChange={handleCategoryColorChange}
            onToggleAll={handleToggleAll}
            fileName={fileName}
            metadata={metadata}
            selectedStorey={selectedStorey}
            onStoreySelect={setSelectedStorey}
            isGalleryView={isGalleryView}
          />
        </>
      ) : (
        <div className="blank-scene" />
      )}

      {!isGalleryView && !ifcData && (
        <button
          className="add-model-btn"
          onClick={() => setShowDropZone(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Add Model
        </button>
      )}

      {showDropZone && (
        <div className="dropzone-overlay" onClick={() => setShowDropZone(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <DropZone onFileDrop={handleFileDrop} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
