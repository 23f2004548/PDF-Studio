import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopApi', {
  openPdfFile: () => ipcRenderer.invoke('dialog:openPdfFile'),
  openPdfFolder: () => ipcRenderer.invoke('dialog:openPdfFolder'),
  listPdfFiles: (folderPath: string) => ipcRenderer.invoke('fs:listPdfFiles', folderPath),
  readPdfFile: (filePath: string) => ipcRenderer.invoke('fs:readPdfFile', filePath),
  readTextFile: (filePath: string) => ipcRenderer.invoke('fs:readTextFile', filePath),
  writeTextFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeTextFile', filePath, content),
  saveNotesToPdf: (filePath: string) => ipcRenderer.invoke('fs:saveNotesToPdf', filePath),
})
