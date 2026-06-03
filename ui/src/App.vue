<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as pdfjs from 'pdfjs-dist'
import PDFWorker from './pdf.worker.wrapper.ts?worker'

// Instantiate worker thread for pdfjs with Promise.try polyfill
pdfjs.GlobalWorkerOptions.workerPort = new PDFWorker()

// State
const sidebarOpen = ref(true)
const sidebarTab = ref<'files' | 'pages' | 'search' | 'annotations'>('files')
const inspectorOpen = ref(true)

const sidebarWidth = ref(210)
const inspectorWidth = ref(300)

const currentPdfPath = ref<string | null>(null)
const currentPdfName = ref<string | null>(null)
const currentFolder = ref<string | null>(null)
const folderFiles = ref<{ name: string; path: string }[]>([])
const searchQuery = ref('')

const totalPages = ref(0)
const currentPage = ref(1)
const zoom = ref(1.25)
const isLoading = ref(false)
const statusText = ref('Ready')

const pdfDocument = shallowRef<any | null>(null)
const pageCanvases = ref<Record<number, HTMLCanvasElement>>({})
const pageTextLayers = ref<Record<number, HTMLDivElement>>({})
const pageSizes = ref<Record<number, { width: number; height: number }>>({})
const viewportRef = ref<HTMLDivElement | null>(null)
const thumbnailListRef = ref<HTMLDivElement | null>(null)

// Render tracking state
const renderedPages = ref<Set<number>>(new Set())
const activeRenderTasks = ref<Record<number, any>>({})
let pageObserver: IntersectionObserver | null = null

// Notes
const pdfNotes = ref<Record<string, string>>({})
const currentPageNote = ref('')
let saveNoteTimeout: any = null

// Metadata
const pdfMetadata = ref({
  fileName: '',
  filePath: '',
  author: '',
  creator: '',
})

// Search State
const pdfTextCache = ref<Record<number, string>>({})
const searchResults = ref<{ pageNum: number; snippet: string }[]>([])

// Highlights & Comments State
interface HighlightAnnotation {
  id: string
  pageNum: number
  text: string
  color: string
  comment: string
  boxes: { left: number; top: number; width: number; height: number }[]
  createdAt: string
}
const highlights = ref<HighlightAnnotation[]>([])
const showHighlightMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const selectedText = ref('')
const selectedRange = ref<Range | null>(null)
let saveHighlightsTimeout: any = null

// New Highlight Studio State
const highlightColors = ['yellow', 'green', 'blue', 'pink'] as const
const activeHighlightColor = ref<(typeof highlightColors)[number]>('yellow')
const autoHighlightEnabled = ref(false)
const preTypedComment = ref('')
const sidebarHighlightQuery = ref('')
const wordHighlightQuery = ref('')
const isWordHighlighting = ref(false)
const undoStack = ref<HighlightAnnotation[][]>([])

const saveToUndoStack = () => {
  if (undoStack.value.length >= 50) {
    undoStack.value.shift()
  }
  undoStack.value.push(JSON.parse(JSON.stringify(highlights.value)))
}

const undo = () => {
  if (undoStack.value.length === 0) return
  const previousState = undoStack.value.pop()
  if (previousState !== undefined) {
    highlights.value = previousState
    saveHighlightsImmediately()
  }
}

const searchInputRef = ref<HTMLInputElement | null>(null)
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)
const cachedPagesCount = computed(() => Object.keys(pdfTextCache.value).length)

// Drag and drop state
const draggingOver = ref(false)

// Truncate path for UI display
const truncatePath = (path: string) => {
  if (path.length <= 40) return path
  return path.slice(0, 15) + '...' + path.slice(-25)
}

// Select Sidebar Tab
const selectTab = (tab: 'files' | 'pages' | 'search' | 'annotations') => {
  if (sidebarOpen.value && sidebarTab.value === tab) {
    sidebarOpen.value = false
  } else {
    sidebarTab.value = tab
    sidebarOpen.value = true
  }
}

// Sidebar Resize Handler
const startResizeSidebar = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    const newWidth = Math.max(150, Math.min(450, startWidth + (moveEvent.clientX - startX)))
    sidebarWidth.value = newWidth
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// Inspector Resize Handler
const startResizeInspector = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = inspectorWidth.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    const newWidth = Math.max(200, Math.min(500, startWidth - (moveEvent.clientX - startX)))
    inspectorWidth.value = newWidth
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// Zoom Controls
let debounceZoomTimeout: any = null

const triggerZoomChangeDebounced = () => {
  if (debounceZoomTimeout) {
    clearTimeout(debounceZoomTimeout)
  }
  debounceZoomTimeout = setTimeout(() => {
    handleZoomChange()
  }, 250)
}

const zoomViewportCentered = (direction: 1 | -1) => {
  const container = viewportRef.value || document.querySelector('.page-viewport') as HTMLDivElement
  if (!container) return

  const oldZoom = zoom.value
  let newZoom = oldZoom + (direction * 0.15)
  newZoom = Math.max(0.5, Math.min(4.0, parseFloat(newZoom.toFixed(2))))

  if (newZoom !== oldZoom) {
    const containerRect = container.getBoundingClientRect()
    const centerX = containerRect.width / 2
    const centerY = containerRect.height / 2

    // Find the page closest to the viewport center
    const wrappers = container.querySelectorAll('.paper-wrap') as NodeListOf<HTMLElement>
    let targetPage: HTMLElement | null = null
    let minDistance = Infinity

    for (const w of wrappers) {
      const rect = w.getBoundingClientRect()
      const pageCenterY = rect.top + rect.height / 2
      const dist = Math.abs(pageCenterY - (containerRect.top + centerY))
      if (dist < minDistance) {
        minDistance = dist
        targetPage = w
      }
    }

    if (targetPage) {
      const pageRect = targetPage.getBoundingClientRect()
      const pageCenterY = (containerRect.top + centerY) - pageRect.top
      const pageCenterX = (containerRect.left + centerX) - pageRect.left

      zoom.value = newZoom
      const ratio = newZoom / oldZoom

      nextTick(() => {
        const targetScrollTop = container.scrollTop + (pageCenterY * ratio - pageCenterY)
        container.scrollTop = targetScrollTop

        if (container.scrollWidth > container.clientWidth) {
          container.scrollLeft = container.scrollLeft + (pageCenterX * ratio - pageCenterX)
        }
      })
    } else {
      zoom.value = newZoom
    }

    triggerZoomChangeDebounced()
  }
}

const zoomIn = () => {
  if (zoom.value < 4.0) {
    zoomViewportCentered(1)
  }
}

const zoomOut = () => {
  if (zoom.value > 0.5) {
    zoomViewportCentered(-1)
  }
}

const triggerVisiblePagesRender = () => {
  const container = viewportRef.value || document.querySelector('.page-viewport')
  if (!container) return
  
  const containerRect = container.getBoundingClientRect()
  const wrappers = container.querySelectorAll('.paper-wrap') as NodeListOf<HTMLElement>
  
  for (const wrapper of wrappers) {
    const rect = wrapper.getBoundingClientRect()
    // Check if the page wrapper overlaps vertically with the container viewport
    const isVisible = (rect.bottom >= containerRect.top - 400) && (rect.top <= containerRect.bottom + 400)
    
    if (isVisible) {
      const pageNumAttr = wrapper.getAttribute('data-page-number')
      if (pageNumAttr) {
        const pageNum = parseInt(pageNumAttr, 10)
        if (pageNum && !renderedPages.value.has(pageNum)) {
          renderSpecificPage(pageNum)
        }
      }
    }
  }
}

const handleZoomChange = () => {
  renderedPages.value.clear()
  
  // Cancel active renders
  Object.keys(activeRenderTasks.value).forEach((pageNumStr) => {
    const pageNum = parseInt(pageNumStr, 10)
    try {
      activeRenderTasks.value[pageNum].cancel()
    } catch (e) {}
  })
  activeRenderTasks.value = {}

  // Trigger high-res render for currently visible pages immediately without resetting observer
  nextTick(() => {
    triggerVisiblePagesRender()
  })
}

// Page Navigation / Scrolling
const prevPage = () => {
  if (currentPage.value > 1) {
    setCurrentPage(currentPage.value - 1)
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    setCurrentPage(currentPage.value + 1)
  }
}

const setCurrentPage = (pageNum: number, scrollIntoView = true) => {
  if (pageNum >= 1 && pageNum <= totalPages.value) {
    saveNotesImmediately()
    currentPage.value = pageNum
    currentPageNote.value = pdfNotes.value[currentPage.value.toString()] || ''
    
    if (scrollIntoView) {
      const container = viewportRef.value
      const target = container?.querySelector(`[data-page-number="${pageNum}"]`) as HTMLElement
      if (container && target) {
        container.scrollTo({
          top: target.offsetTop,
          behavior: 'smooth'
        })
      }
    }

    // Auto-close sidebar on mobile/split view overlay screens
    if (window.innerWidth <= 1040) {
      sidebarOpen.value = false
    }
  }
}

const jumpToPage = (e: Event) => {
  const input = e.target as HTMLInputElement
  const val = parseInt(input.value, 10)
  if (!isNaN(val) && val >= 1 && val <= totalPages.value) {
    setCurrentPage(val)
  } else {
    input.value = currentPage.value.toString()
  }
}

// Dynamic Ref Binders
const setPageCanvasRef = (el: any, pageNum: number) => {
  if (el) {
    pageCanvases.value[pageNum] = el
  } else {
    delete pageCanvases.value[pageNum]
  }
}

const setPageTextLayerRef = (el: any, pageNum: number) => {
  if (el) {
    pageTextLayers.value[pageNum] = el
  } else {
    delete pageTextLayers.value[pageNum]
  }
}

// Setup Page Scroll Observer
const setupPageObserver = () => {
  if (pageObserver) {
    pageObserver.disconnect()
  }

  const scrollContainer = viewportRef.value || document.querySelector('.page-viewport')
  if (!scrollContainer) {
    console.warn('Page viewport scroll container not found!')
    return
  }

  pageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const pageNumAttr = entry.target.getAttribute('data-page-number')
        if (pageNumAttr) {
          const pageNum = parseInt(pageNumAttr, 10)
          if (pageNum) {
            currentPage.value = pageNum
            currentPageNote.value = pdfNotes.value[pageNum.toString()] || ''
            
            if (!renderedPages.value.has(pageNum)) {
              renderSpecificPage(pageNum)
            }
          }
        }
      }
    })
  }, {
    root: scrollContainer,
    rootMargin: '400px 0px 400px 0px', // fetch slightly ahead
    threshold: 0.05
  })

  const wrappers = scrollContainer.querySelectorAll('.paper-wrap')
  if (wrappers.length === 0) {
    setTimeout(() => {
      const retryContainer = viewportRef.value || document.querySelector('.page-viewport')
      const retryWrappers = retryContainer?.querySelectorAll('.paper-wrap')
      retryWrappers?.forEach(w => pageObserver?.observe(w))
    }, 120)
  } else {
    wrappers.forEach(w => pageObserver?.observe(w))
  }
}

// Render Specific Page on demand
const renderSpecificPage = async (pageNum: number) => {
  if (!pdfDocument.value || renderedPages.value.has(pageNum)) return
  renderedPages.value.add(pageNum)

  try {
    const page = await pdfDocument.value.getPage(pageNum)
    const viewport = page.getViewport({ scale: zoom.value })
    
    // Store size
    pageSizes.value[pageNum] = { 
      width: viewport.width / zoom.value, 
      height: viewport.height / zoom.value 
    }

    const canvas = pageCanvases.value[pageNum]
    if (!canvas) {
      renderedPages.value.delete(pageNum)
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      renderedPages.value.delete(pageNum)
      return
    }

    canvas.height = viewport.height
    canvas.width = viewport.width

    if (activeRenderTasks.value[pageNum]) {
      try {
        activeRenderTasks.value[pageNum].cancel()
      } catch (e) {}
    }

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    }
    const renderTask = page.render(renderContext)
    activeRenderTasks.value[pageNum] = renderTask
    
    await renderTask.promise
    delete activeRenderTasks.value[pageNum]

    // Render transparent selection text layer
    const textLayerDiv = pageTextLayers.value[pageNum]
    if (textLayerDiv) {
      textLayerDiv.innerHTML = ''
      try {
        const textContent = await page.getTextContent()
        console.log(`[TextLayer Debug] Page ${pageNum} textContent items:`, textContent?.items?.length)
        
        const pdfjsLib = pdfjs as any;
        if (pdfjsLib['TextLayer']) {
          console.log(`[TextLayer Debug] Using TextLayer class for page ${pageNum}`)
          const textLayer = new pdfjsLib['TextLayer']({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
          })
          await textLayer.render()
          console.log(`[TextLayer Debug] TextLayer class render success for page ${pageNum}. Child count:`, textLayerDiv.children.length)
        } else if (pdfjsLib['renderTextLayer']) {
          console.log(`[TextLayer Debug] Using fallback renderTextLayer for page ${pageNum}`)
          await pdfjsLib['renderTextLayer']({
            textContentStream: page.streamTextContent(),
            container: textLayerDiv,
            viewport: viewport,
            textContent: textContent
          }).promise
          console.log(`[TextLayer Debug] Fallback renderTextLayer success for page ${pageNum}. Child count:`, textLayerDiv.children.length)
        } else {
          console.warn(`[TextLayer Debug] No text layer rendering method found in pdfjsLib!`)
        }
      } catch (e) {
        console.error(`[TextLayer Debug] Text layer rendering failed for page ${pageNum}:`, e)
      }
    }

  } catch (err: any) {
    if (err.name !== 'RenderingCancelledException') {
      console.error(`Error rendering page ${pageNum}:`, err)
      renderedPages.value.delete(pageNum)
    }
  }
}

// Loading PDF Document
const loadPdf = async (filePath: string) => {
  if (!filePath) return
  isLoading.value = true
  statusText.value = 'Reading PDF file...'

  saveNotesImmediately()

  try {
    const arrayBuffer = await window.desktopApi.readPdfFile(filePath)
    statusText.value = 'Parsing PDF...'
    
    const loadingTask = pdfjs.getDocument({ 
      data: arrayBuffer,
      wasmUrl: window.location.origin + '/wasm/'
    })
    const pdf = await loadingTask.promise
    
    pdfDocument.value = pdf
    totalPages.value = pdf.numPages
    currentPage.value = 1
    currentPdfPath.value = filePath
    
    const parts = filePath.split(/[\\/]/)
    const name = parts[parts.length - 1]
    currentPdfName.value = name

    const meta = await pdf.getMetadata().catch(() => null)
    const info = meta?.info as any
    pdfMetadata.value = {
      fileName: name,
      filePath: filePath,
      author: info?.Author || 'Unknown',
      creator: info?.Creator || 'Unknown',
    }

    if (!currentFolder.value) {
      const folderPath = filePath.substring(0, filePath.lastIndexOf(parts[parts.length - 1]) - 1)
      currentFolder.value = folderPath
      await refreshFolderFiles()
    }

    await loadNotes(filePath)
    currentPageNote.value = pdfNotes.value['1'] || ''

    // Clear previous sizes, text caches, highlights, & renders
    pageSizes.value = {}
    renderedPages.value.clear()
    pageCanvases.value = {}
    pageTextLayers.value = {}
    pdfTextCache.value = {}
    searchResults.value = []
    highlights.value = []
    showHighlightMenu.value = false
    undoStack.value = []
    isNotesViewActive.value = false
    
    // Load saved highlights
    await loadHighlights(filePath)

    // Estimate sizes from first page
    const firstPage = await pdf.getPage(1)
    const firstViewport = firstPage.getViewport({ scale: 1.0 })
    const standardWidth = firstViewport.width
    const standardHeight = firstViewport.height
    
    const sizes: Record<number, { width: number; height: number }> = {}
    for (let i = 1; i <= pdf.numPages; i++) {
      sizes[i] = { width: standardWidth, height: standardHeight }
    }
    pageSizes.value = sizes

    sidebarTab.value = 'pages'
    
    // Auto-close sidebar on mobile/split view when loading a PDF
    if (window.innerWidth <= 1040) {
      sidebarOpen.value = false
    }
    
    // Start page observer after DOM updates
    nextTick(() => {
      setupPageObserver()
      if (viewportRef.value) {
        viewportRef.value.scrollTop = 0
      }
      // Start background text caching
      cachePdfText()
    })

  } catch (err: any) {
    console.error('Error loading PDF:', err)
    statusText.value = 'Error loading PDF'
    alert(`Could not open PDF: ${err.message}`)
  } finally {
    isLoading.value = false
  }
}

// Background Page Text Indexing
const cachePdfText = async () => {
  console.log('PDF Search: Starting text caching/indexing...')
  if (!pdfDocument.value) {
    console.warn('PDF Search: Caching aborted, no document loaded.')
    return
  }
  const doc = pdfDocument.value
  const total = totalPages.value
  
  for (let i = 1; i <= total; i++) {
    if (doc !== pdfDocument.value) {
      console.log('PDF Search: Document changed, stopping indexing.')
      break
    }
    try {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()
      
      const text = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      pdfTextCache.value[i] = text
      
      // Update searches dynamically if user is currently searching
      if (searchQuery.value) {
        performSearch()
      }
    } catch (e) {
      console.error(`PDF Search: Failed to extract text for page ${i}:`, e)
    }
  }
  console.log('PDF Search: Finished indexing text for all pages.', Object.keys(pdfTextCache.value).length, 'pages cached.')
}

// Search Logic
const performSearch = () => {
  console.log('PDF Search: performSearch triggered for query:', searchQuery.value)
  if (!pdfDocument.value || !searchQuery.value) {
    searchResults.value = []
    return
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    searchResults.value = []
    return
  }

  const matches: { pageNum: number; snippet: string }[] = []

  // Check if search query matches a page number jump shortcut
  const pageNumSearch = parseInt(query, 10)
  if (!isNaN(pageNumSearch) && pageNumSearch >= 1 && pageNumSearch <= totalPages.value) {
    matches.push({
      pageNum: pageNumSearch,
      snippet: `Go to Page ${pageNumSearch}`
    })
  }

  // Word/Phrase search inside cached text
  const total = totalPages.value
  let matchCount = 0
  for (let i = 1; i <= total; i++) {
    const text = pdfTextCache.value[i]
    if (text) {
      const idx = text.toLowerCase().indexOf(query)
      if (idx !== -1) {
        matchCount++
        // Extract a snippet containing search match
        const start = Math.max(0, idx - 40)
        const end = Math.min(text.length, idx + query.length + 40)
        let snippet = text.slice(start, end)
        if (start > 0) snippet = '...' + snippet
        if (end < text.length) snippet = snippet + '...'
        
        matches.push({
          pageNum: i,
          snippet: snippet
        })
      }
    }
  }

  console.log(`PDF Search: Found ${matches.length} matches across ${matchCount} pages for "${query}"`)
  searchResults.value = matches
}

// HTML safe search highlight function
const highlightKeyword = (text: string, keyword: string) => {
  if (!keyword) return text
  
  // Safe HTML escape
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  // Highlight keyword
  const query = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') // escape regex symbols
  const regex = new RegExp(`(${query})`, 'gi')
  return escapedText.replace(regex, '<mark style="background: rgba(229, 72, 63, 0.35); color: #fff; border-radius: 2px; padding: 0 2px;">$1</mark>')
}

// Watch Search Input
watch(searchQuery, (newVal) => {
  console.log('PDF Search: watch(searchQuery) triggered with:', newVal)
  if (currentPdfPath.value) {
    if (newVal) {
      if (sidebarTab.value !== 'search') {
        sidebarTab.value = 'search'
      }
      sidebarOpen.value = true
      performSearch()
    } else {
      // Do not force switch tab to 'pages' if the user is already on the 'search' tab
      if (sidebarTab.value !== 'search') {
        sidebarTab.value = 'pages'
      }
      searchResults.value = []
    }
  }
})

// Auto-focus sidebar search input when switching to search tab while sidebar is open
watch([sidebarTab, sidebarOpen], ([newTab, isOpen]) => {
  if (newTab === 'search' && isOpen) {
    nextTick(() => {
      sidebarSearchInputRef.value?.focus()
    })
  }
})

// Highlight Selection Handler
const handleSelection = () => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    showHighlightMenu.value = false
    return
  }

  const text = selection.toString().trim()
  if (!text) {
    showHighlightMenu.value = false
    return
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  
  // Find viewer container relative rect
  const viewer = document.querySelector('.viewer')
  if (!viewer) return
  const viewerRect = viewer.getBoundingClientRect()

  // Calculate coordinates relative to .viewer container
  menuX.value = rect.left - viewerRect.left + (rect.width / 2)
  menuY.value = rect.top - viewerRect.top - 46 // floating 46px above the selection
  
  selectedText.value = text
  selectedRange.value = range.cloneRange()
  
  if (autoHighlightEnabled.value) {
    addHighlight(activeHighlightColor.value)
  } else {
    showHighlightMenu.value = true
  }
}

// Add Highlight Annotation
const addHighlight = (color: string) => {
  if (!selectedRange.value || !selectedText.value) return

  // Traverse hierarchy upwards to find parent .paper-wrap element
  let node: Node | null = selectedRange.value.startContainer
  let pageElement: HTMLElement | null = null
  
  while (node) {
    if (node instanceof HTMLElement && node.classList.contains('paper-wrap')) {
      pageElement = node
      break
    }
    node = node.parentNode
  }

  if (!pageElement) {
    console.warn('Selection container page element not found!')
    return
  }

  const pageNum = parseInt(pageElement.getAttribute('data-page-number') || '1', 10)
  const pageRect = pageElement.getBoundingClientRect()
  
  // Get all text rect blocks inside the selection range
  const rects = Array.from(selectedRange.value.getClientRects())
  
  // Map rect coordinates relative to page container, divided by zoom so they scale cleanly
  const boxes = rects.map(rect => ({
    left: (rect.left - pageRect.left) / zoom.value,
    top: (rect.top - pageRect.top) / zoom.value,
    width: rect.width / zoom.value,
    height: rect.height / zoom.value
  }))

  saveToUndoStack()

  const newHl: HighlightAnnotation = {
    id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    pageNum: pageNum,
    text: selectedText.value,
    color: color,
    comment: preTypedComment.value || '',
    boxes: boxes,
    createdAt: new Date().toLocaleString()
  }

  highlights.value.push(newHl)
  saveHighlightsImmediately()

  // Clear selections
  window.getSelection()?.removeAllRanges()
  showHighlightMenu.value = false
  selectedRange.value = null
  selectedText.value = ''

  // Navigate sidebar to show highlights/annotations tab immediately
  sidebarTab.value = 'annotations'
  sidebarOpen.value = true
}

const handleSidebarColorClick = (color: "yellow" | "green" | "blue" | "pink") => {
  activeHighlightColor.value = color
  if (selectedRange.value && selectedText.value) {
    addHighlight(color)
  }
}

const deleteHighlight = (id: string) => {
  saveToUndoStack()
  highlights.value = highlights.value.filter(h => h.id !== id)
  saveHighlightsImmediately()
}

const clearAllHighlights = () => {
  if (confirm('Are you sure you want to clear all highlights and comments from this document?')) {
    saveToUndoStack()
    highlights.value = []
    saveHighlightsImmediately()
  }
}

const changeHighlightColor = (id: string, color: string) => {
  saveToUndoStack()
  const hl = highlights.value.find(h => h.id === id)
  if (hl) {
    hl.color = color
    saveHighlightsImmediately()
  }
}

const highlightWordDocumentWide = async () => {
  const query = wordHighlightQuery.value.trim()
  if (!query) {
    alert('Please enter a word or phrase to highlight.')
    return
  }

  if (!pdfDocument.value) {
    alert('No document is open.')
    return
  }

  saveToUndoStack()

  isWordHighlighting.value = true
  let count = 0

  try {
    const total = totalPages.value
    const lowercaseQuery = query.toLowerCase()
    
    for (let i = 1; i <= total; i++) {
      const page = await pdfDocument.value.getPage(i)
      const textContent = await page.getTextContent()
      const viewport = page.getViewport({ scale: 1.0 })
      
      for (const item of textContent.items) {
        if (!item.str) continue
        const strVal = item.str.toLowerCase()
        let idx = strVal.indexOf(lowercaseQuery)
        
        while (idx !== -1) {
          // Calculate character width approximation
          const charWidth = item.width / item.str.length
          const matchLeft = item.transform[4] + (idx * charWidth)
          const matchWidth = query.length * charWidth
          
          // Estimate baseline and height
          const fontHeight = Math.abs(item.transform[3]) || 12
          const matchBottom = item.transform[5]
          
          // Convert PDF box to viewport box at scale 1.0 (zoom-independent)
          const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle([
            matchLeft,
            matchBottom,
            matchLeft + matchWidth,
            matchBottom + fontHeight
          ])
          
          const boxLeft = Math.min(vx1, vx2)
          const boxTop = Math.min(vy1, vy2)
          const boxWidth = Math.abs(vx2 - vx1)
          const boxHeight = Math.abs(vy2 - vy1)
          
          const newHl: HighlightAnnotation = {
            id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            pageNum: i,
            text: item.str.substring(idx, idx + query.length),
            color: activeHighlightColor.value,
            comment: preTypedComment.value || `Auto-highlighted phrase: "${query}"`,
            boxes: [{
              left: boxLeft,
              top: boxTop,
              width: boxWidth,
              height: boxHeight
            }],
            createdAt: new Date().toLocaleString()
          }
          
          highlights.value.push(newHl)
          count++
          
          // Move past the current match in this item
          idx = strVal.indexOf(lowercaseQuery, idx + query.length)
        }
      }
    }

    if (count > 0) {
      saveHighlightsImmediately()
      wordHighlightQuery.value = ''
      alert(`Successfully highlighted ${count} occurrences of "${query}" across the document!`)
    } else {
      alert(`No occurrences of "${query}" found in this document.`)
    }
  } catch (err: any) {
    console.error('Word highlighting failed:', err)
    alert(`Error highlighting words: ${err.message}`)
  } finally {
    isWordHighlighting.value = false
  }
}

// Notes View State & Helpers
const isNotesViewActive = ref(false)

const totalHighlightsCount = computed(() => highlights.value.length)

const notesCount = computed(() => {
  return Object.values(pdfNotes.value).filter(val => val && val.trim()).length
})

const pagesWithNotes = computed(() => {
  const pageNumbers = new Set<number>()
  
  Object.keys(pdfNotes.value).forEach(pStr => {
    const pNum = parseInt(pStr, 10)
    if (!isNaN(pNum) && pdfNotes.value[pStr] && pdfNotes.value[pStr].trim()) {
      pageNumbers.add(pNum)
    }
  })
  
  highlights.value.forEach(h => {
    if (h.pageNum) {
      pageNumbers.add(h.pageNum)
    }
  })
  
  return Array.from(pageNumbers)
    .sort((a, b) => a - b)
    .map(pNum => {
      const pageHls = highlights.value
        .filter(h => h.pageNum === pNum)
        .sort((a, b) => {
          const aTop = a.boxes?.[0]?.top || 0
          const bTop = b.boxes?.[0]?.top || 0
          return aTop - bTop
        })
      return {
        pageNum: pNum,
        note: pdfNotes.value[pNum.toString()] || '',
        highlights: pageHls
      }
    })
})

const jumpToPdfPage = (pageNum: number) => {
  isNotesViewActive.value = false
  nextTick(() => {
    setCurrentPage(pageNum, true)
  })
}


const printNotes = async () => {
  if (!currentPdfPath.value) return
  
  const defaultExportPath = currentPdfPath.value.replace(/\.pdf$/i, '') + '_study_notes.pdf'
  try {
    statusText.value = 'Generating PDF...'
    isLoading.value = true
    
    // Wait a brief tick for the UI state to settle
    await nextTick()
    
    const success = await window.desktopApi.saveNotesToPdf(defaultExportPath)
    if (success) {
      alert(`PDF study notes saved successfully next to your PDF:\n${defaultExportPath}`)
    } else {
      alert('Failed to generate PDF')
    }
  } catch (err: any) {
    console.error('Failed to export PDF:', err)
    alert(`Failed to save PDF: ${err.message}`)
  } finally {
    isLoading.value = false
    statusText.value = 'Ready'
  }
}

// Sorting annotations page by page and top by top
const sortedHighlights = computed(() => {
  if (!highlights.value) return []
  return [...highlights.value].sort((a, b) => {
    if (a.pageNum !== b.pageNum) {
      return a.pageNum - b.pageNum
    }
    const aTop = a.boxes?.[0]?.top || 0
    const bTop = b.boxes?.[0]?.top || 0
    return aTop - bTop
  })
})

const filteredHighlights = computed(() => {
  let list = sortedHighlights.value || []
  if (sidebarHighlightQuery.value) {
    const q = sidebarHighlightQuery.value.toLowerCase()
    list = list.filter(h => {
      const textMatch = h.text ? h.text.toLowerCase().includes(q) : false
      const commentMatch = h.comment ? h.comment.toLowerCase().includes(q) : false
      return textMatch || commentMatch
    })
  }
  return list
})

const getPageHighlights = (pageNum: number) => {
  return highlights.value.filter(h => h.pageNum === pageNum)
}

const getHighlightColor = (color: string) => {
  switch (color) {
    case 'green': return 'rgba(76, 175, 80, 0.24)'
    case 'blue': return 'rgba(33, 150, 243, 0.24)'
    case 'pink': return 'rgba(233, 30, 99, 0.24)'
    case 'yellow':
    default:
      return 'rgba(255, 235, 59, 0.24)'
  }
}

const getHighlightColorHex = (color: string) => {
  switch (color) {
    case 'green': return '#4caf50'
    case 'blue': return '#2196f3'
    case 'pink': return '#e91e63'
    case 'yellow':
    default:
      return '#f5e642'
  }
}

// Page Notes Loading and Saving
const loadNotes = async (pdfPath: string) => {
  const notesPath = pdfPath + '.notes.json'
  try {
    const content = await window.desktopApi.readTextFile(notesPath)
    if (content) {
      pdfNotes.value = JSON.parse(content)
    } else {
      pdfNotes.value = {}
    }
  } catch {
    pdfNotes.value = {}
  }
}

const saveNotesImmediately = async () => {
  if (!currentPdfPath.value) return
  
  pdfNotes.value[currentPage.value.toString()] = currentPageNote.value
  
  const notesPath = currentPdfPath.value + '.notes.json'
  const jsonContent = JSON.stringify(pdfNotes.value, null, 2)
  
  try {
    await window.desktopApi.writeTextFile(notesPath, jsonContent)
  } catch (err) {
    console.error('Failed to save notes:', err)
  }
}

const handleNoteInput = () => {
  pdfNotes.value[currentPage.value.toString()] = currentPageNote.value
  
  if (saveNoteTimeout) {
    clearTimeout(saveNoteTimeout)
  }
  saveNoteTimeout = setTimeout(() => {
    saveNotesImmediately()
  }, 1000)
}

// Loading & Saving Highlights
const loadHighlights = async (pdfPath: string) => {
  const hlPath = pdfPath + '.highlights.json'
  try {
    const content = await window.desktopApi.readTextFile(hlPath)
    if (content) {
      highlights.value = JSON.parse(content)
    } else {
      highlights.value = []
    }
  } catch {
    highlights.value = []
  }
}

const saveHighlightsImmediately = async () => {
  if (!currentPdfPath.value) return
  
  const hlPath = currentPdfPath.value + '.highlights.json'
  const jsonContent = JSON.stringify(highlights.value, null, 2)
  
  try {
    await window.desktopApi.writeTextFile(hlPath, jsonContent)
  } catch (err) {
    console.error('Failed to save highlights:', err)
  }
}

const saveHighlightsDebounced = () => {
  if (saveHighlightsTimeout) {
    clearTimeout(saveHighlightsTimeout)
  }
  saveHighlightsTimeout = setTimeout(() => {
    saveHighlightsImmediately()
  }, 1000)
}

// Dialog Actions
const openFile = async () => {
  try {
    const path = await window.desktopApi.openPdfFile()
    if (path) {
      await loadPdf(path)
    }
  } catch (err) {
    console.error(err)
  }
}

const openFolder = async () => {
  try {
    const path = await window.desktopApi.openPdfFolder()
    if (path) {
      currentFolder.value = path
      await refreshFolderFiles()
      sidebarTab.value = 'files'
    }
  } catch (err) {
    console.error(err)
  }
}

const refreshFolderFiles = async () => {
  if (!currentFolder.value) return
  try {
    const files = await window.desktopApi.listPdfFiles(currentFolder.value)
    folderFiles.value = files
  } catch (err) {
    console.error('Error listing PDF files:', err)
  }
}

const filteredFiles = computed(() => {
  if (!searchQuery.value) return folderFiles.value
  const query = searchQuery.value.toLowerCase()
  return folderFiles.value.filter(f => f.name.toLowerCase().includes(query))
})

// Keyboard Navigation
const handleKeyDown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault()
    openFile()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    openFolder()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevPage()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextPage()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    zoomIn()
  } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault()
    zoomOut()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undo()
  }
}

// Drag and drop event handlers
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  draggingOver.value = true
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  draggingOver.value = false
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  draggingOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    const filePath = (file as any).path
    if (filePath) {
      await loadPdf(filePath)
    }
  }
}

const handleWheel = (e: WheelEvent) => {
  if (e.ctrlKey) {
    e.preventDefault()
    
    const container = viewportRef.value || document.querySelector('.page-viewport') as HTMLDivElement
    if (!container) return

    const delta = Math.abs(e.deltaY)
    const direction = e.deltaY < 0 ? 1 : -1
    
    // Scale step dynamically: mouse scroll delta is typically ~100+, touchpad pinch delta is ~1-30
    let zoomStep = 0.05
    if (delta > 20) {
      // Snappy steps for standard mouse wheels
      zoomStep = Math.min(0.25, delta * 0.0018)
    } else {
      // Responsive accumulation for touchpad continuous pinching
      zoomStep = Math.min(0.08, delta * 0.012)
    }
    
    const oldZoom = zoom.value
    let newZoom = oldZoom + (direction * zoomStep)
    // Constrain zoom bounds between 0.5 (50%) and 4.0 (400%)
    newZoom = Math.max(0.5, Math.min(4.0, parseFloat(newZoom.toFixed(2))))
    
    if (newZoom !== oldZoom) {
      // Find the page wrapper (.paper-wrap) nearest to the mouse cursor
      const wrappers = container.querySelectorAll('.paper-wrap') as NodeListOf<HTMLElement>
      let targetPage: HTMLElement | null = null
      let minDistance = Infinity
      
      for (const w of wrappers) {
        const rect = w.getBoundingClientRect()
        // If mouse is within the vertical bounds of this page
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetPage = w
          break
        }
      }
      
      // Fallback: if mouse is not directly over any page, find the first visible page in viewport
      if (!targetPage) {
        const containerRect = container.getBoundingClientRect()
        for (const w of wrappers) {
          const rect = w.getBoundingClientRect()
          if (rect.bottom >= containerRect.top && rect.top <= containerRect.bottom) {
            const dist = Math.abs(rect.top - containerRect.top)
            if (dist < minDistance) {
              minDistance = dist
              targetPage = w
            }
          }
        }
      }
      
      // If we found a target page, anchor scroll position relative to it
      if (targetPage) {
        const pageRect = targetPage.getBoundingClientRect()
        const pageMouseY = e.clientY - pageRect.top
        const pageMouseX = e.clientX - pageRect.left
        
        zoom.value = newZoom
        const ratio = newZoom / oldZoom
        
        nextTick(() => {
          const targetScrollTop = container.scrollTop + (pageMouseY * ratio - pageMouseY)
          container.scrollTop = targetScrollTop
          
          // Adjust scrollLeft if the page is wider than the viewport
          if (container.scrollWidth > container.clientWidth) {
            container.scrollLeft = container.scrollLeft + (pageMouseX * ratio - pageMouseX)
          }
        })
      } else {
        // Fallback to simple scaling if no page is found
        zoom.value = newZoom
      }

      triggerZoomChangeDebounced()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  
  // Attach non-passive wheel event listener to allow call to preventDefault()
  const viewport = viewportRef.value || document.querySelector('.page-viewport')
  if (viewport) {
    viewport.addEventListener('wheel', handleWheel, { passive: false })
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  
  const viewport = viewportRef.value || document.querySelector('.page-viewport')
  if (viewport) {
    viewport.removeEventListener('wheel', handleWheel)
  }
  
  saveNotesImmediately()
  saveHighlightsImmediately()
  if (saveNoteTimeout) clearTimeout(saveNoteTimeout)
  if (saveHighlightsTimeout) clearTimeout(saveHighlightsTimeout)
  if (pageObserver) pageObserver.disconnect()
})
</script>

<template>
  <div 
    class="reader-shell" 
    :class="{ 'dragging': draggingOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Topbar -->
    <header class="reader-topbar">
      <div class="window-cluster">
        <span></span>
        <span></span>
        <span></span>
      </div>
      
      <button 
        class="top-icon" 
        title="Toggle Sidebar"
        @click="sidebarOpen = !sidebarOpen"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>

      <div class="doc-title">
        <strong :title="currentPdfName || 'No document open'">
          {{ currentPdfName || 'PDF Studio' }}
        </strong>
        <span :title="currentPdfPath || 'Drag a PDF or click Open to start'">
          {{ currentPdfPath ? truncatePath(currentPdfPath) : 'No file open' }}
        </span>
      </div>

      <div class="search-pill" @click="searchInputRef?.focus()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 2px;">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input 
          ref="searchInputRef"
          v-model="searchQuery"
          type="text" 
          :placeholder="currentPdfPath ? 'Search words or page numbers...' : (currentFolder ? 'Filter folder files...' : 'Search...')"
          :disabled="!currentFolder && !currentPdfPath"
        />
      </div>

      <div class="top-actions" style="display: flex; gap: 8px;">
        <!-- Mobile Search Icon Button (visible only on small screens) -->
        <button 
          class="top-icon mobile-search-btn" 
          title="Search Document"
          @click="selectTab('search')"
          :disabled="!currentPdfPath"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <button 
          v-if="currentPdfPath && totalPages > 0"
          class="ghost-button" 
          @click="isNotesViewActive = !isNotesViewActive"
          :title="isNotesViewActive ? 'Switch to PDF Document View' : 'Switch to Compiled Study Notes Page'"
          style="display: flex; align-items: center; gap: 6px; font-weight: 750;"
          :style="isNotesViewActive ? { borderColor: 'var(--accent-2)', color: 'var(--accent-2)', background: 'rgba(91, 141, 239, 0.08)' } : {}"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>{{ isNotesViewActive ? 'View PDF' : 'Study Notes' }}</span>
        </button>
        <button class="ghost-button desktop-only-btn" @click="openFolder">Open Folder</button>
        <button class="accent-button desktop-only-btn" @click="openFile">Open File</button>
      </div>
    </header>

    <!-- Body -->
    <div 
      class="reader-body" 
      :class="{ 'sidebar-closed': !sidebarOpen, 'inspector-open': inspectorOpen }"
      :style="{ 
        '--sidebar-width': `${sidebarWidth}px`, 
        '--inspector-width': `${inspectorWidth}px` 
      }"
    >
      <!-- Tool Rail -->
      <aside class="tool-rail">
        <button 
          class="rail-action" 
          :class="{ 'active': sidebarOpen && sidebarTab === 'files' }"
          title="Folder Files"
          @click="selectTab('files')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        
        <button 
          class="rail-action" 
          :class="{ 'active': sidebarOpen && sidebarTab === 'pages' }"
          title="Pages & Thumbnails"
          :disabled="!currentPdfPath"
          @click="selectTab('pages')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </button>

        <button 
          class="rail-action" 
          :class="{ 'active': sidebarOpen && sidebarTab === 'search' }"
          title="Search Document Text"
          :disabled="!currentPdfPath"
          @click="selectTab('search')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <button 
          class="rail-action" 
          :class="{ 'active': sidebarOpen && sidebarTab === 'annotations' }"
          title="Highlights & Comments"
          :disabled="!currentPdfPath"
          @click="selectTab('annotations')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>

        <div style="flex-grow: 1;"></div>

        <button 
          class="rail-action" 
          :class="{ 'active': inspectorOpen }"
          title="Toggle Inspector"
          @click="inspectorOpen = !inspectorOpen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </aside>

      <!-- Thumb/Folder Panel -->
      <section class="thumb-panel">
        <!-- Explorer Tab -->
        <div v-if="sidebarTab === 'files'" style="height: 100%; display: flex; flex-direction: column;">
          <div class="panel-title">
            <span>FOLDER EXPLORER</span>
            <button title="Collapse Sidebar" @click="sidebarOpen = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
          
          <div v-if="filteredFiles.length > 0" class="thumb-list" style="padding: 6px;">
            <button 
              v-for="file in filteredFiles" 
              :key="file.path"
              class="thumb-card"
              :class="{ 'selected': currentPdfPath === file.path }"
              @click="loadPdf(file.path)"
              style="grid-template-columns: 24px minmax(0, 1fr); gap: 6px; padding: 10px; margin-bottom: 4px;"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e5483f" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; font-weight: 500;">
                {{ file.name }}
              </span>
            </button>
          </div>
          
          <div v-else class="quiet-state">
            <strong>No PDF files</strong>
            <span>{{ currentFolder ? 'No matching PDFs found in this folder.' : 'Open a folder to see files here.' }}</span>
            <button class="accent-button" style="margin-top: 10px; font-size: 0.8rem; height: 30px;" @click="openFolder">
              Open Folder
            </button>
          </div>
        </div>

        <!-- Pages Tab -->
        <div v-else-if="sidebarTab === 'pages'" style="height: 100%; display: flex; flex-direction: column;">
          <div class="panel-title">
            <span>DOCUMENT PAGES</span>
            <button title="Collapse Sidebar" @click="sidebarOpen = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
          
          <div v-if="totalPages > 0" class="thumb-list" ref="thumbnailListRef">
            <button 
              v-for="pageNum in totalPages" 
              :key="pageNum"
              class="thumb-card"
              :class="{ 'selected': currentPage === pageNum }"
              @click="setCurrentPage(pageNum, true)"
            >
              <div class="mini-page">
                <strong>{{ pageNum }}</strong>
              </div>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-size: 0.8rem; font-weight: 600; color: var(--text)">Page {{ pageNum }}</span>
                <span v-if="pdfNotes[pageNum]" style="font-size: 0.7rem; color: var(--accent-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;">
                  📝 Has Note
                </span>
              </div>
            </button>
          </div>
          
          <div v-else class="quiet-state">
            <strong>No document</strong>
            <span>Open a PDF to see pages here.</span>
          </div>
        </div>

        <!-- Search Tab -->
        <div v-else-if="sidebarTab === 'search'" style="height: 100%; display: flex; flex-direction: column;">
          <div class="panel-title">
            <span>SEARCH RESULTS</span>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button v-if="searchQuery" title="Clear Search" @click="searchQuery = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <button title="Collapse Sidebar" @click="sidebarOpen = false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Sidebar Search Input Bar -->
          <div style="padding: 8px 12px; border-bottom: 1px solid var(--line);">
            <div class="search-pill-sidebar" style="display: grid; grid-template-columns: 20px minmax(0, 1fr) 20px; align-items: center; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: var(--muted);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--muted-2);">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input 
                ref="sidebarSearchInputRef"
                v-model="searchQuery"
                type="text" 
                placeholder="Search document text..."
                style="width: 100%; height: 100%; min-width: 0; border: 0; background: transparent; color: var(--text); outline: none; font-size: 0.8rem;"
                :disabled="!currentPdfPath"
              />
              <button 
                v-if="searchQuery" 
                @click="searchQuery = ''" 
                style="background: transparent; border: 0; color: var(--muted-2); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; font-size: 1.1rem; line-height: 1;"
              >
                &times;
              </button>
            </div>
          </div>
          
          <div v-if="searchResults.length > 0" class="thumb-list" style="padding: 6px;">
            <button 
              v-for="(result, index) in searchResults" 
              :key="index"
              class="thumb-card"
              :class="{ 'selected': currentPage === result.pageNum }"
              @click="setCurrentPage(result.pageNum, true)"
              style="grid-template-columns: 1fr; gap: 4px; padding: 12px; margin-bottom: 6px; align-items: flex-start;"
            >
              <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 2px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-2)">Page {{ result.pageNum }}</span>
                <span v-if="result.snippet.startsWith('Go to Page')" style="font-size: 0.72rem; color: var(--ok); font-weight: 600;">Jump Shortcut</span>
              </div>
              <span 
                style="font-size: 0.78rem; line-height: 1.35; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
                v-html="highlightKeyword(result.snippet, searchQuery)"
              ></span>
            </button>
          </div>
          
          <div v-else class="quiet-state">
            <strong>No matches found</strong>
            <span>Type words or page numbers in the top search bar.</span>
            <div style="margin-top: 14px; font-size: 0.72rem; color: var(--muted-2); text-align: left; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 8px; border: 1px solid var(--line); line-height: 1.45; width: 100%;">
              <div style="font-weight: 700; margin-bottom: 4px; color: var(--muted);">Diagnostic Info:</div>
              <div>• Indexed Pages: {{ cachedPagesCount }} / {{ totalPages }}</div>
              <div>• Search Query: "{{ searchQuery }}"</div>
              <div>• Document Loaded: {{ currentPdfPath ? 'Yes' : 'No' }}</div>
            </div>
          </div>
        </div>

        <!-- Highlights & Comments Tab -->
        <div v-else-if="sidebarTab === 'annotations'" style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
          <div class="panel-title">
            <span>HIGHLIGHT STUDIO</span>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button 
                v-if="undoStack.length > 0"
                title="Undo Last Action (Ctrl+Z)" 
                @click="undo" 
                style="font-size: 0.7rem; color: var(--accent-2); font-weight: 700; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,0.02); cursor: pointer;"
              >
                Undo
              </button>
              <button 
                v-if="highlights.length > 0"
                title="Delete All" 
                @click="clearAllHighlights" 
                style="font-size: 0.7rem; color: var(--danger); font-weight: 700; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,0.02); cursor: pointer;"
              >
                Clear All
              </button>
              <button title="Collapse Sidebar" @click="sidebarOpen = false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Highlight Studio Dashboard at the top -->
          <div class="studio-dashboard">
            <!-- Active Color Selector Swatches -->
            <div class="studio-section">
              <div class="studio-label">Active Highlight Color</div>
              <div class="color-presets-row">
                <button
                  v-for="color in highlightColors"
                  :key="color"
                  class="color-preset-swatch"
                  :class="{ 'active': activeHighlightColor === color }"
                  :style="{ backgroundColor: getHighlightColorHex(color) }"
                  @click="handleSidebarColorClick(color)"
                  :title="`Active color: ${color}`"
                >
                  <span class="active-check" v-if="activeHighlightColor === color">✓</span>
                </button>
              </div>
            </div>

            <!-- Auto-Highlight Toggle & Pre-typed Comment -->
            <div class="studio-section">
              <label class="toggle-container">
                <input type="checkbox" v-model="autoHighlightEnabled" />
                <span class="toggle-slider"></span>
                <span class="toggle-label">Auto-highlight on text selection</span>
              </label>
            </div>

            <div class="studio-section">
              <div class="studio-label">Pre-typed Comment (optional)</div>
              <div class="studio-input-wrap">
                <input 
                  v-model="preTypedComment"
                  type="text" 
                  placeholder="Attach comment automatically..." 
                  class="studio-input"
                />
                <button 
                  v-if="preTypedComment" 
                  class="clear-input-btn"
                  @click="preTypedComment = ''"
                  title="Clear text"
                >✕</button>
              </div>
            </div>

            <!-- Document-wide Word Search & Highlight -->
            <div class="studio-section border-top">
              <div class="studio-label">Highlight All Word Occurrences</div>
              <div class="word-highlighter-form">
                <input 
                  v-model="wordHighlightQuery"
                  type="text" 
                  placeholder="Type word or phrase..." 
                  class="studio-input"
                  @keydown.enter="highlightWordDocumentWide"
                />
                <button 
                  class="studio-action-button"
                  :disabled="isWordHighlighting || !wordHighlightQuery"
                  @click="highlightWordDocumentWide"
                >
                  <span v-if="isWordHighlighting">Processing...</span>
                  <span v-else>Highlight All</span>
                </button>
              </div>
            </div>

            <!-- Stats display -->
            <div class="studio-stats" v-if="highlights.length > 0">
              <span class="stat-badge total">Total: {{ highlights.length }}</span>
              <span class="stat-badge yellow" v-if="highlights.filter(h => h.color === 'yellow').length > 0">
                Y: {{ highlights.filter(h => h.color === 'yellow').length }}
              </span>
              <span class="stat-badge green" v-if="highlights.filter(h => h.color === 'green').length > 0">
                G: {{ highlights.filter(h => h.color === 'green').length }}
              </span>
              <span class="stat-badge blue" v-if="highlights.filter(h => h.color === 'blue').length > 0">
                B: {{ highlights.filter(h => h.color === 'blue').length }}
              </span>
              <span class="stat-badge pink" v-if="highlights.filter(h => h.color === 'pink').length > 0">
                P: {{ highlights.filter(h => h.color === 'pink').length }}
              </span>
            </div>

            <!-- Search box to filter highlights -->
            <div class="studio-section border-top" v-if="highlights.length > 0">
              <div class="studio-input-wrap search">
                <input 
                  v-model="sidebarHighlightQuery"
                  type="text" 
                  placeholder="Filter highlights & comments..." 
                  class="studio-input"
                />
                <button 
                  v-if="sidebarHighlightQuery" 
                  class="clear-input-btn"
                  @click="sidebarHighlightQuery = ''"
                  title="Clear filter"
                >✕</button>
              </div>
            </div>
          </div>
          
          <!-- Highlights List -->
          <div v-if="filteredHighlights.length > 0" class="thumb-list" style="padding: 6px; flex: 1; min-height: 0; height: auto;">
            <div 
              v-for="hl in filteredHighlights" 
              :key="hl.id"
              class="thumb-card highlight-card"
              :class="{ 'selected': currentPage === hl.pageNum }"
              style="grid-template-columns: 1fr; gap: 8px; padding: 12px; margin-bottom: 8px; align-items: flex-start; flex-direction: column;"
            >
              <!-- Card Header -->
              <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <!-- Dynamic swatch colors in list card -->
                  <div class="card-color-picker">
                    <button 
                      v-for="color in highlightColors" 
                      :key="color"
                      class="card-color-dot"
                      :class="{ 'active': hl.color === color }"
                      :style="{ backgroundColor: getHighlightColorHex(color) }"
                      @click.stop="changeHighlightColor(hl.id, color)"
                      :title="`Change color to ${color}`"
                    ></button>
                  </div>
                  <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-2); margin-left: 4px;">Page {{ hl.pageNum }}</span>
                </div>
                <button 
                  @click.stop="deleteHighlight(hl.id)"
                  style="background: transparent; border: 0; color: var(--muted-2); font-size: 0.8rem; cursor: pointer; padding: 0 4px;"
                  title="Delete highlight"
                >
                  ✕
                </button>
              </div>

              <!-- Highlighted text context -->
              <blockquote 
                @click="setCurrentPage(hl.pageNum, true)"
                style="margin: 0; font-size: 0.78rem; line-height: 1.35; color: var(--text); border-left: 3px solid; padding-left: 8px; width: 100%; font-style: italic; cursor: pointer;"
                :style="{ borderLeftColor: getHighlightColorHex(hl.color) }"
              >
                "{{ hl.text }}"
              </blockquote>

              <!-- Comment Input field -->
              <div style="width: 100%; display: flex; flex-direction: column; gap: 4px;">
                <textarea 
                  v-model="hl.comment"
                  @input="saveHighlightsDebounced"
                  placeholder="Add a comment to this highlight..."
                  style="width: 100%; min-height: 48px; font-size: 0.76rem; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,0.04); color: var(--text); outline: none; resize: vertical; font-family: inherit;"
                ></textarea>
              </div>
              
              <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-top: 2px;">
                <span style="font-size: 0.65rem; color: var(--muted-2);">{{ hl.createdAt }}</span>
              </div>
            </div>
          </div>
          
          <div v-else class="quiet-state" style="flex: 1;">
            <strong>No highlights found</strong>
            <span>{{ highlights.length > 0 ? 'No highlights match your search filter.' : 'Select text on any page to highlight and add comments.' }}</span>
          </div>
        </div>
      </section>

      <!-- Sidebar resize handle -->
      <div 
        class="pane-resize-handle sidebar-handle" 
        @mousedown="startResizeSidebar"
      ></div>

      <!-- Viewer area -->
      <main class="viewer">
        <!-- Floating Highlight Menu -->
        <div 
          v-if="showHighlightMenu" 
          class="floating-toolbar"
          :style="{
            position: 'absolute',
            left: `${menuX}px`,
            top: `${menuY}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
            margin: '0',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }"
        >
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--muted); margin-left: 4px; margin-right: 2px;">HIGHLIGHT:</span>
          
          <!-- Highlight Color Buttons -->
          <button 
            v-for="color in highlightColors" 
            :key="color"
            class="round-button"
            :style="{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: getHighlightColorHex(color),
              border: '2px solid rgba(255,255,255,0.4)',
              padding: '0',
              cursor: 'pointer'
            }"
            :title="`Highlight ${color}`"
            @click="addHighlight(color)"
          ></button>
          
          <div class="divider" style="height: 18px; margin: 0 2px;"></div>
          
          <button 
            class="round-button" 
            title="Dismiss" 
            @click="showHighlightMenu = false"
            style="width: 20px; height: 20px; font-size: 0.72rem; padding: 0; line-height: 1;"
          >
            ✕
          </button>
        </div>

        <!-- Floating Toolbar -->
        <div v-if="currentPdfPath && totalPages > 0 && !isNotesViewActive" class="floating-toolbar">
          <button class="round-button" title="Zoom Out" @click="zoomOut">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          
          <span class="zoom-chip">{{ Math.round(zoom * 100) }}%</span>
          
          <button class="round-button" title="Zoom In" @click="zoomIn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <div class="divider"></div>

          <div class="page-jump">
            <button class="round-button" title="Previous Page" :disabled="currentPage <= 1" @click="prevPage">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            
            <input 
              type="text" 
              :value="currentPage"
              @keydown.enter="jumpToPage"
              style="width: 32px; text-align: center;"
            />
            <span>/ {{ totalPages }}</span>

            <button class="round-button" title="Next Page" :disabled="currentPage >= totalPages" @click="nextPage">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Page Viewport (Scrollable container showing all pages) -->
        <div 
          v-show="currentPdfPath && totalPages > 0 && !isNotesViewActive" 
          class="page-viewport" 
          ref="viewportRef"
          @mouseup="handleSelection"
        >
          <div 
            v-for="pageNum in totalPages" 
            :key="pageNum"
            class="paper-wrap"
            :data-page-number="pageNum"
            :style="{
              width: `${(pageSizes[pageNum]?.width || 600) * zoom}px`,
              height: `${(pageSizes[pageNum]?.height || 840) * zoom}px`,
              marginBottom: '24px',
              '--total-scale-factor': zoom
            }"
          >
            <!-- Highlights Overlay Layer -->
            <div class="highlights-layer">
              <div 
                v-for="hl in getPageHighlights(pageNum)" 
                :key="hl.id"
              >
                <div
                  v-for="(box, bIdx) in hl.boxes"
                  :key="bIdx"
                  :style="{
                    position: 'absolute',
                    left: `${box.left * zoom}px`,
                    top: `${box.top * zoom}px`,
                    width: `${box.width * zoom}px`,
                    height: `${box.height * zoom}px`,
                    backgroundColor: getHighlightColor(hl.color),
                    mixBlendMode: 'multiply',
                    pointerEvents: 'auto',
                    cursor: 'pointer'
                  }"
                  :title="hl.comment || 'Click to view comment'"
                  @click="selectTab('annotations')"
                ></div>
              </div>
            </div>

            <!-- Page Canvas -->
            <canvas :ref="el => setPageCanvasRef(el, pageNum)"></canvas>

            <!-- Selection/Text Layer Overlay -->
            <div class="text-layer textLayer" :ref="el => setPageTextLayerRef(el, pageNum)"></div>
          </div>
        </div>

        <!-- Compiled Notes Viewport -->
        <div 
          v-if="currentPdfPath && totalPages > 0 && isNotesViewActive" 
          class="notes-viewport"
        >
          <div class="notes-container">
            <!-- Notes Header -->
            <div class="notes-header">
              <div class="notes-title-area">
                <h1 class="notes-title">
                  Study Notes & Summary
                </h1>
                <span class="notes-meta">
                  Compiled from <strong>{{ currentPdfName }}</strong> • {{ totalHighlightsCount }} Highlights • {{ notesCount }} Page Notes
                </span>
              </div>
              <!-- Export Actions -->
              <div class="notes-export-actions">
                <button 
                  class="accent-button notes-save-btn" 
                  @click="printNotes"
                  title="Save study notes directly as a PDF (.pdf) document"
                >
                  📄 Save as PDF (.pdf)
                </button>
              </div>
            </div>

            <!-- Empty State for Notes -->
            <div 
              v-if="totalHighlightsCount === 0 && notesCount === 0" 
              class="notes-empty-state"
            >
              <div style="font-size: 2.5rem;">📝</div>
              <strong>Your notes canvas is empty</strong>
              <span style="font-size: 0.85rem; max-width: 320px;">
                Start selecting text in the PDF reader to add highlights and comments, or write notes in the inspector panel.
              </span>
              <button class="accent-button" @click="isNotesViewActive = false" style="margin-top: 10px;">
                Back to PDF Viewer
              </button>
            </div>

            <!-- Notes Content organized by Page -->
            <div v-else class="notes-page-list">
              <div 
                v-for="pageData in pagesWithNotes" 
                :key="pageData.pageNum"
                class="notes-page-item"
              >
                <!-- Page Title Header (clickable link back to PDF page) -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <button 
                    @click="jumpToPdfPage(pageData.pageNum)"
                    title="Jump to this page in PDF"
                    class="notes-page-jump-btn"
                  >
                    <span>📖 Page {{ pageData.pageNum }}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                </div>

                <!-- Page Notes Block -->
                <div 
                  v-if="pageData.note"
                  class="notes-page-note-box"
                >
                  <div style="font-size: 0.72rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-2);">
                    Page Note
                  </div>
                  <div style="font-size: 0.9rem; line-height: 1.5; color: var(--text); white-space: pre-wrap;">
                    {{ pageData.note }}
                  </div>
                </div>

                <!-- Page Highlights & Comments List -->
                <div v-if="pageData.highlights.length > 0" style="display: flex; flex-direction: column; gap: 16px;">
                  <div 
                    v-for="hl in pageData.highlights" 
                    :key="hl.id"
                    class="notes-highlight-item"
                  >
                    <!-- Color-left-bordered blockquote for the highlight text -->
                    <blockquote 
                      class="notes-blockquote"
                      :style="{ borderLeftColor: getHighlightColorHex(hl.color) }"
                    >
                      "{{ hl.text }}"
                    </blockquote>

                    <!-- Nested Comment block if comment is present -->
                    <div 
                      v-if="hl.comment"
                      class="notes-comment-box"
                    >
                      <span style="font-size: 0.9rem; line-height: 1;">💬</span>
                      <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.75rem; color: var(--muted-2); font-weight: 650;">Comment</span>
                        <p style="margin: 0; font-size: 0.84rem; line-height: 1.4; color: var(--muted);">
                          {{ hl.comment }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state or welcome message -->
        <div v-if="!currentPdfPath" class="reader-message hero-empty">
          <div class="empty-mark">PDF</div>
          <strong>Welcome to PDF Studio</strong>
          <span>Drag and drop a PDF file here or open a folder to browse.</span>
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="ghost-button" @click="openFolder">Open Folder</button>
            <button class="accent-button" @click="openFile">Open PDF File</button>
          </div>
        </div>

        <!-- Loading spinner message overlay -->
        <div v-if="isLoading" class="reader-message">
          <strong style="display: flex; align-items: center; gap: 10px;">
            <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;">
              <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="8" />
            </svg>
            Processing...
          </strong>
          <span>{{ statusText }}</span>
        </div>

        <!-- Status bar at bottom left -->
        <div class="bottom-status">
          <span :class="{ 'pulse': isLoading }"></span>
          <span>{{ isLoading ? statusText : (currentPdfPath ? `Ready • Page ${currentPage} of ${totalPages}` : 'Ready') }}</span>
        </div>
      </main>

      <!-- Inspector resize handle -->
      <div 
        class="pane-resize-handle inspector-handle"
        :class="{ 'inspector-handle-closed': !inspectorOpen }"
        @mousedown="startResizeInspector"
      ></div>

      <!-- Inspector -->
      <aside class="inspector" :class="{ 'inspector-closed': !inspectorOpen }">
        <div class="panel-title">
          <span>DOCUMENT METADATA</span>
          <button title="Collapse Inspector" @click="inspectorOpen = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div v-if="currentPdfPath" style="display: flex; flex-direction: column; height: calc(100% - 46px); overflow-y: auto;">
          <dl class="info-grid">
            <div>
              <dt>File Name</dt>
              <dd>{{ pdfMetadata.fileName }}</dd>
            </div>
            <div>
              <dt>File Path</dt>
              <dd style="font-size: 0.78rem; opacity: 0.85;">{{ pdfMetadata.filePath }}</dd>
            </div>
            <div>
              <dt>Total Pages</dt>
              <dd>{{ totalPages }} pages</dd>
            </div>
            <div v-if="pdfMetadata.author && pdfMetadata.author !== 'Unknown'">
              <dt>Author</dt>
              <dd>{{ pdfMetadata.author }}</dd>
            </div>
            <div v-if="pdfMetadata.creator && pdfMetadata.creator !== 'Unknown'">
              <dt>Creator</dt>
              <dd>{{ pdfMetadata.creator }}</dd>
            </div>
          </dl>

          <hr style="border: 0; border-top: 1px solid var(--line); margin: 6px 0;" />

          <label class="notes-label">PAGE {{ currentPage }} NOTES</label>
          <textarea 
            class="notes-field"
            v-model="currentPageNote"
            placeholder="Type notes for this page here... Notes are saved automatically to a companion file."
            @input="handleNoteInput"
          ></textarea>
        </div>

        <div v-else class="quiet-state">
          <strong>No details available</strong>
          <span>Open a document to see properties and write notes.</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 1041px) {
  .reader-body:not(.inspector-open) {
    grid-template-columns:
      54px
      var(--sidebar-width, 210px)
      8px
      minmax(0, 1fr)
      0
      0;
  }

  .reader-body.sidebar-closed:not(.inspector-open) {
    grid-template-columns:
      54px
      0
      8px
      minmax(0, 1fr)
      0
      0;
  }
}

@media (max-width: 1040px) {
  .pane-resize-handle {
    display: none !important;
  }
}

.inspector-handle-closed {
  display: none !important;
}

.inspector-closed {
  display: none !important;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  display: inline-block;
  color: var(--accent-2);
}

</style>
