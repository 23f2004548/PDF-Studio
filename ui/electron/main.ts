import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as Sentry from '@sentry/electron/main'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0" // Replace with your Sentry DSN later
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

type PdfFileEntry = {
  name: string
  path: string
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 480,
    minHeight: 450,
    title: 'PDF Studio',
    backgroundColor: '#10131a',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.setMenu(null)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

ipcMain.handle('dialog:openPdfFile', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open PDF file',
    properties: ['openFile'],
    filters: [{ name: 'PDF files', extensions: ['pdf'] }],
  })

  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openPdfFolder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open folder',
    properties: ['openDirectory'],
  })

  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

ipcMain.handle('fs:listPdfFiles', async (_event, folderPath: string) => {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<PdfFileEntry>((entry) => ({
      name: entry.name,
      path: path.join(folderPath, entry.name),
    }))
})

ipcMain.handle('fs:readPdfFile', async (_event, filePath: string) => {
  const buffer = await fs.readFile(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
})

ipcMain.handle('fs:readTextFile', async (_event, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('fs:writeTextFile', async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('fs:saveNotesToPdf', async (_event, filePath: string) => {
  if (!win) return false
  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4'
  })
  console.log(`[SaveNotesToPdf] Generated PDF buffer size: ${data.length} bytes for: ${filePath}`)
  await fs.writeFile(filePath, data)
  return true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  createWindow()
  autoUpdater.checkForUpdatesAndNotify()
})
