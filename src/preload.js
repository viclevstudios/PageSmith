const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pdfWerkstatt', {
  selectFiles: (filters) => ipcRenderer.invoke('select-files', filters),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  getDefaultOutputFolder: () => ipcRenderer.invoke('get-default-output-folder'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  runJob: (request) => ipcRenderer.invoke('run-job', request),
  revealFile: (filePath) => ipcRenderer.invoke('reveal-file', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getPdfInfo: (filePath) => ipcRenderer.invoke('get-pdf-info', filePath),
  getPdfThumbnails: (filePath, pageNumbers) => ipcRenderer.invoke('get-pdf-thumbnails', filePath, pageNumbers)
});
