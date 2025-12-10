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

  const handleFileDrop = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        setIfcData(e.target.result)
        setFileName(file.name)
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

  return (
    <div className="app">
      {!ifcData ? (
        <DropZone onFileDrop={handleFileDrop} />
      ) : (
        <>
          <IFCViewer
            ifcData={ifcData}
            categories={categories}
            onCategoriesLoaded={setCategories}
            onMetadataLoaded={setMetadata}
            selectedStorey={selectedStorey}
            storeys={metadata.storeys}
          />
          <FilterPanel
            categories={categories}
            onCategoryToggle={handleCategoryToggle}
            onToggleAll={handleToggleAll}
            fileName={fileName}
            metadata={metadata}
            selectedStorey={selectedStorey}
            onStoreySelect={setSelectedStorey}
          />
        </>
      )}
    </div>
  )
}

export default App
