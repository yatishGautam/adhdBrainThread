import { ipcRenderer, contextBridge } from "electron";
const REQUEST_CHANNELS = [
  "threads:list",
  "threads:get",
  "threads:create",
  "threads:update",
  "threads:setStatus",
  "threads:remove",
  "threads:done",
  "steps:add",
  "steps:toggle",
  "steps:update",
  "steps:remove",
  "steps:reorder",
  "day:get",
  "day:today",
  "day:list",
  "day:setIntent",
  "day:setNote",
  "todo:add",
  "todo:toggle",
  "todo:update",
  "todo:remove",
  "todo:reorder",
  "todo:promote",
  "thought:add",
  "thought:remove",
  "thought:process",
  "session:start",
  "session:pause",
  "session:resume",
  "session:end",
  "session:switch",
  "session:distraction",
  "session:state",
  "session:forThread",
  "session:resolveRecovery",
  "analytics:scope",
  "analytics:rebuild",
  "settings:get",
  "settings:update",
  "data:repair",
  "data:export",
  "data:reveal",
  "window:mainReady",
  "hud:show",
  "hud:reset",
  "hud:hide",
  "celebration:done"
];
const invoke = Object.fromEntries(
  REQUEST_CHANNELS.map((channel) => [
    channel,
    (payload) => ipcRenderer.invoke(channel, payload)
  ])
);
function on(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}
const api = {
  invoke,
  on
};
contextBridge.exposeInMainWorld("thread", api);
