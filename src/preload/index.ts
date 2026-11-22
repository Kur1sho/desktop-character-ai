import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type CompanionApi } from '../shared/ipc'

const api: CompanionApi = {
  setClickThrough: (passThrough) => ipcRenderer.send(IPC.setClickThrough, passThrough),
  onLayout: (cb) => ipcRenderer.on(IPC.layout, (_e, layout) => cb(layout)),
  onLoadModel: (cb) => ipcRenderer.on(IPC.loadModel, (_e, data, name) => cb(data, name)),
  onSummon: (cb) => ipcRenderer.on(IPC.summon, () => cb()),
  getInitialModel: () => ipcRenderer.invoke(IPC.getInitialModel)
}

contextBridge.exposeInMainWorld('companion', api)
