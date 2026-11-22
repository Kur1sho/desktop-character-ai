import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type CompanionApi } from '../shared/ipc'

const api: CompanionApi = {
  setClickThrough: (passThrough) => ipcRenderer.send(IPC.setClickThrough, passThrough),
  onLayout: (cb) => ipcRenderer.on(IPC.layout, (_e, layout) => cb(layout)),
  onLoadModel: (cb) => ipcRenderer.on(IPC.loadModel, (_e, data, name) => cb(data, name)),
  onSummon: (cb) => ipcRenderer.on(IPC.summon, () => cb()),
  onOpenChat: (cb) => ipcRenderer.on(IPC.openChat, () => cb()),
  onSettingsChanged: (cb) => ipcRenderer.on(IPC.settingsChanged, () => cb()),
  onListen: (cb) => ipcRenderer.on(IPC.listen, () => cb()),
  onPersonaChanged: (cb) => ipcRenderer.on(IPC.personaChanged, (_e, id) => cb(id)),
  getInitialModel: () => ipcRenderer.invoke(IPC.getInitialModel),
  chat: (text) => ipcRenderer.invoke(IPC.chat, text),
  chatPrepare: (text) => ipcRenderer.invoke(IPC.chatPrepare, text),
  chatRecord: (u, r) => ipcRenderer.invoke(IPC.chatRecord, u, r),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (s) => ipcRenderer.invoke(IPC.saveSettings, s),
  setApiKey: (p, k) => ipcRenderer.invoke(IPC.setApiKey, p, k),
  clearMemory: () => ipcRenderer.invoke(IPC.clearMemory),
  openSettings: () => ipcRenderer.send(IPC.openSettings),
  runAction: (a, source) => ipcRenderer.invoke(IPC.runAction, a, source),
  readClipboard: () => ipcRenderer.invoke(IPC.readClipboard),
  logConversation: (line) => ipcRenderer.send(IPC.logConversation, line),
  openConversationLog: () => ipcRenderer.send(IPC.openConversationLog),
  openActivityLog: () => ipcRenderer.send(IPC.openActivityLog)
}

contextBridge.exposeInMainWorld('companion', api)
