const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusBar", {
  getState: () => ipcRenderer.invoke("pomodoro:get-state"),
  command: (action) => ipcRenderer.invoke("pomodoro:command", action),
  updateSettings: (patch) => ipcRenderer.invoke("pomodoro:update-settings", patch),
  setTask: (task) => ipcRenderer.invoke("pomodoro:set-task", task),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("pomodoro:state", listener);
    return () => ipcRenderer.removeListener("pomodoro:state", listener);
  },
});
