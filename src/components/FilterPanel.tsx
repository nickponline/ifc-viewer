import { useState } from 'react'
import type { ElementCategory, IFCMetadata } from '../types'
import './FilterPanel.css'

// BIM-standard colors for architectural elements
const BIM_COLORS = [
  // Concrete/Structure - grays
  '#808080', '#A0A0A0', '#C0C0C0', '#606060',
  // Walls - warm neutrals
  '#D4C4B0', '#E8DCC8', '#C9B99A', '#B8A888',
  // Glass/Windows - blues
  '#87CEEB', '#ADD8E6', '#B0E0E6', '#6BB3D9',
  // Steel/Metal - cool grays
  '#708090', '#778899', '#B0C4DE', '#4682B4',
  // Wood - browns
  '#8B4513', '#A0522D', '#CD853F', '#DEB887',
  // MEP - system colors
  '#4169E1', '#32CD32', '#FF6347', '#FFD700',
  // Insulation/Special
  '#FFB6C1', '#DDA0DD', '#98FB98', '#F0E68C',
]

interface FilterPanelProps {
  categories: ElementCategory[]
  onCategoryToggle: (categoryId: number) => void
  onCategoryColorChange: (categoryId: number, color: string) => void
  onToggleAll: (visible: boolean) => void
  fileName: string
  metadata: IFCMetadata
  selectedStorey: number | null
  onStoreySelect: (storeyId: number | null) => void
  isGalleryView: boolean
}

const CATEGORY_NAMES: Record<number, string> = {
  // Building Elements
  1123145078: 'Wall',
  3856911033: 'Space',
  4097777520: 'Door',
  3172909278: 'Window',
  3124254112: 'Slab',
  3319311131: 'Railing',
  331165859: 'Stair',
  639361253: 'Stair Flight',
  1742049831: 'Column',
  979691226: 'Beam',
  3495092785: 'Roof',
  843113511: 'Curtain Wall',
  2963535650: 'Covering',
  1973544240: 'Covering',
  // Distribution Elements
  2188021234: 'Flow Terminal',
  4278956645: 'Flow Fitting',
  3132237377: 'Flow Segment',
  342316401: 'Distribution Element',
  1052013943: 'Distribution Flow Element',
  3040386961: 'Distribution Control Element',
  // Furniture
  1509553395: 'Furnishing Element',
  263784265: 'Furniture',
  // Structural
  3171933400: 'Plate',
  1687234759: 'Pile',
  1991999291: 'Member',
  2391406946: 'Footing',
  // MEP
  3290496277: 'Cable Segment',
  3825984169: 'Duct Fitting',
  3041715199: 'Duct Segment',
  4074379575: 'Pipe Fitting',
  3183535111: 'Pipe Segment',
  // Other
  1623761950: 'Building Element Proxy',
  1287392070: 'Proxy',
  900683007: 'Footing',
  // Generic
  0: 'Other'
}

function getCategoryDisplayName(category: ElementCategory): string {
  return CATEGORY_NAMES[category.id] || category.name || `Type ${category.id}`
}

export function FilterPanel({
  categories,
  onCategoryToggle,
  onCategoryColorChange,
  onToggleAll,
  fileName,
  metadata,
  selectedStorey,
  onStoreySelect,
  isGalleryView
}: FilterPanelProps) {
  const [activeTab, setActiveTab] = useState<'elements' | 'info'>('elements')
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [openColorPicker, setOpenColorPicker] = useState<number | null>(null)
  const visibleCount = categories.filter(c => c.visible).length
  const allVisible = visibleCount === categories.length
  const noneVisible = visibleCount === 0

  const handleColorSelect = (categoryId: number, color: string) => {
    onCategoryColorChange(categoryId, color)
    setOpenColorPicker(null)
  }

  const handleClickOutside = (e: React.MouseEvent) => {
    if (openColorPicker !== null && !(e.target as HTMLElement).closest('.color-picker-wrapper')) {
      setOpenColorPicker(null)
    }
  }

  if (isGalleryView) {
    return null
  }

  return (
    <div className={`filter-panel ${isCollapsed ? 'collapsed' : ''}`} onClick={handleClickOutside}>
      <button
        className="filter-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>{fileName}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          width="14"
          height="14"
          className={`filter-chevron ${isCollapsed ? 'collapsed' : ''}`}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>

      {!isCollapsed && (
        <>
          <div className="tab-bar">
            <button
              className={`tab-btn ${activeTab === 'elements' ? 'active' : ''}`}
              onClick={() => setActiveTab('elements')}
            >
              Elements
            </button>
            <button
              className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              Information
            </button>
          </div>

          {activeTab === 'elements' ? (
        <>
          {metadata.storeys.length > 0 && (
            <div className="storey-filter">
              <div className="storey-filter-label">Storey</div>
              <select
                className="storey-select"
                value={selectedStorey ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  onStoreySelect(value ? Number(value) : null)
                }}
              >
                <option value="">All Storeys</option>
                {metadata.storeys.map((storey) => (
                  <option key={storey.id} value={storey.id}>
                    {storey.name} ({storey.elementIds.length})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-actions">
            <button
              onClick={() => onToggleAll(true)}
              disabled={allVisible}
              className="action-btn"
            >
              Show All
            </button>
            <button
              onClick={() => onToggleAll(false)}
              disabled={noneVisible}
              className="action-btn"
            >
              Hide All
            </button>
          </div>

          <div className="category-list">
            {categories.length === 0 ? (
              <div className="loading">Loading categories...</div>
            ) : (
              [...categories]
                .sort((a, b) => getCategoryDisplayName(a).localeCompare(getCategoryDisplayName(b)))
                .map(category => (
                  <div key={category.id} className="category-item">
                    <input
                      type="checkbox"
                      checked={category.visible}
                      onChange={() => onCategoryToggle(category.id)}
                    />
                    <div className="color-picker-wrapper">
                      <button
                        className="category-color-swatch"
                        style={{ backgroundColor: category.color || '#888888' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenColorPicker(openColorPicker === category.id ? null : category.id)
                        }}
                      />
                      {openColorPicker === category.id && (
                        <div className="bim-color-picker">
                          {BIM_COLORS.map((color) => (
                            <button
                              key={color}
                              className={`bim-color-option ${category.color === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleColorSelect(category.id, color)
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="category-name">{getCategoryDisplayName(category)}</span>
                    <span className="category-count">{category.count}</span>
                  </div>
                ))
            )}
          </div>
        </>
      ) : (
        <div className="info-content">
          {metadata.project?.name && (
            <div className="info-section">
              <div className="info-label">Project</div>
              <div className="info-value">{metadata.project.name}</div>
              {metadata.project.description && (
                <div className="info-description">{metadata.project.description}</div>
              )}
              {metadata.project.phase && (
                <div className="info-detail">Phase: {metadata.project.phase}</div>
              )}
            </div>
          )}

          {metadata.site?.name && (
            <div className="info-section">
              <div className="info-label">Site</div>
              <div className="info-value">{metadata.site.name}</div>
              {metadata.site.description && (
                <div className="info-description">{metadata.site.description}</div>
              )}
            </div>
          )}

          {metadata.building?.name && (
            <div className="info-section">
              <div className="info-label">Building</div>
              <div className="info-value">{metadata.building.name}</div>
              {metadata.building.description && (
                <div className="info-description">{metadata.building.description}</div>
              )}
            </div>
          )}

          {metadata.storeys.length > 0 && (
            <div className="info-section">
              <div className="info-label">Storeys ({metadata.storeys.length})</div>
              <div className="storeys-list">
                {metadata.storeys.map((storey) => (
                  <button
                    key={storey.id}
                    className={`storey-item-btn ${selectedStorey === storey.id ? 'active' : ''}`}
                    onClick={() => {
                      onStoreySelect(selectedStorey === storey.id ? null : storey.id)
                      setActiveTab('elements')
                    }}
                  >
                    <span className="storey-name">{storey.name}</span>
                    <span className="storey-count">{storey.elementIds.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(metadata.author || metadata.organization) && (
            <div className="info-section">
              <div className="info-label">Author</div>
              {metadata.author && <div className="info-value">{metadata.author}</div>}
              {metadata.organization && (
                <div className="info-detail">{metadata.organization}</div>
              )}
            </div>
          )}

          {metadata.application && (
            <div className="info-section">
              <div className="info-label">Application</div>
              <div className="info-value">{metadata.application}</div>
            </div>
          )}

          {metadata.creationDate && (
            <div className="info-section">
              <div className="info-label">Created</div>
              <div className="info-value">{metadata.creationDate}</div>
            </div>
          )}

          {metadata.units && Object.keys(metadata.units).length > 0 && (
            <div className="info-section">
              <div className="info-label">Units</div>
              {metadata.units.length && (
                <div className="info-detail">Length: {metadata.units.length}</div>
              )}
              {metadata.units.area && (
                <div className="info-detail">Area: {metadata.units.area}</div>
              )}
              {metadata.units.volume && (
                <div className="info-detail">Volume: {metadata.units.volume}</div>
              )}
            </div>
          )}

          {!metadata.project?.name && !metadata.site?.name && !metadata.building?.name &&
           metadata.storeys.length === 0 && !metadata.author && !metadata.application && (
            <div className="no-info">No metadata available</div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
