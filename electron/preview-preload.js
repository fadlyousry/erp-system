const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('previewAPI', {
    print: () => ipcRenderer.invoke('preview:doPrint')
});
