/// <reference types="vite/client" />

interface Window {
  desktopApi: {
    openPdfFile: () => Promise<string | null>
    openPdfFolder: () => Promise<string | null>
    listPdfFiles: (folderPath: string) => Promise<{ name: string; path: string }[]>
    readPdfFile: (filePath: string) => Promise<ArrayBuffer>
    readTextFile: (filePath: string) => Promise<string | null>
    writeTextFile: (filePath: string, content: string) => Promise<boolean>
    saveNotesToPdf: (filePath: string) => Promise<boolean>
  }
}

