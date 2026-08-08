import { r as reactExports, M as MotionConfigContext, j as jsxRuntimeExports, u as useConstant, P as PresenceContext, a as usePresence, b as useIsomorphicLayoutEffect, L as LayoutGroupContext, d as formatClock, m as motion, c as createRoot } from "./format-C7YSyzYl.js";
import { R as Ring } from "./Ring-DVCq_uCA.js";
class PopChildMeasure extends reactExports.Component {
  getSnapshotBeforeUpdate(prevProps) {
    const element = this.props.childRef.current;
    if (element && prevProps.isPresent && !this.props.isPresent) {
      const size = this.props.sizeRef.current;
      size.height = element.offsetHeight || 0;
      size.width = element.offsetWidth || 0;
      size.top = element.offsetTop;
      size.left = element.offsetLeft;
    }
    return null;
  }
  /**
   * Required with getSnapshotBeforeUpdate to stop React complaining.
   */
  componentDidUpdate() {
  }
  render() {
    return this.props.children;
  }
}
function PopChild({ children, isPresent }) {
  const id = reactExports.useId();
  const ref = reactExports.useRef(null);
  const size = reactExports.useRef({
    width: 0,
    height: 0,
    top: 0,
    left: 0
  });
  const { nonce } = reactExports.useContext(MotionConfigContext);
  reactExports.useInsertionEffect(() => {
    const { width, height, top, left } = size.current;
    if (isPresent || !ref.current || !width || !height)
      return;
    ref.current.dataset.motionPopId = id;
    const style = document.createElement("style");
    if (nonce)
      style.nonce = nonce;
    document.head.appendChild(style);
    if (style.sheet) {
      style.sheet.insertRule(`
          [data-motion-pop-id="${id}"] {
            position: absolute !important;
            width: ${width}px !important;
            height: ${height}px !important;
            top: ${top}px !important;
            left: ${left}px !important;
          }
        `);
    }
    return () => {
      document.head.removeChild(style);
    };
  }, [isPresent]);
  return jsxRuntimeExports.jsx(PopChildMeasure, { isPresent, childRef: ref, sizeRef: size, children: reactExports.cloneElement(children, { ref }) });
}
const PresenceChild = ({ children, initial, isPresent, onExitComplete, custom, presenceAffectsLayout, mode }) => {
  const presenceChildren = useConstant(newChildrenMap);
  const id = reactExports.useId();
  const memoizedOnExitComplete = reactExports.useCallback((childId) => {
    presenceChildren.set(childId, true);
    for (const isComplete of presenceChildren.values()) {
      if (!isComplete)
        return;
    }
    onExitComplete && onExitComplete();
  }, [presenceChildren, onExitComplete]);
  const context = reactExports.useMemo(
    () => ({
      id,
      initial,
      isPresent,
      custom,
      onExitComplete: memoizedOnExitComplete,
      register: (childId) => {
        presenceChildren.set(childId, false);
        return () => presenceChildren.delete(childId);
      }
    }),
    /**
     * If the presence of a child affects the layout of the components around it,
     * we want to make a new context value to ensure they get re-rendered
     * so they can detect that layout change.
     */
    presenceAffectsLayout ? [Math.random(), memoizedOnExitComplete] : [isPresent, memoizedOnExitComplete]
  );
  reactExports.useMemo(() => {
    presenceChildren.forEach((_, key) => presenceChildren.set(key, false));
  }, [isPresent]);
  reactExports.useEffect(() => {
    !isPresent && !presenceChildren.size && onExitComplete && onExitComplete();
  }, [isPresent]);
  if (mode === "popLayout") {
    children = jsxRuntimeExports.jsx(PopChild, { isPresent, children });
  }
  return jsxRuntimeExports.jsx(PresenceContext.Provider, { value: context, children });
};
function newChildrenMap() {
  return /* @__PURE__ */ new Map();
}
const getChildKey = (child) => child.key || "";
function onlyElements(children) {
  const filtered = [];
  reactExports.Children.forEach(children, (child) => {
    if (reactExports.isValidElement(child))
      filtered.push(child);
  });
  return filtered;
}
const AnimatePresence = ({ children, custom, initial = true, onExitComplete, presenceAffectsLayout = true, mode = "sync", propagate = false }) => {
  const [isParentPresent, safeToRemove] = usePresence(propagate);
  const presentChildren = reactExports.useMemo(() => onlyElements(children), [children]);
  const presentKeys = propagate && !isParentPresent ? [] : presentChildren.map(getChildKey);
  const isInitialRender = reactExports.useRef(true);
  const pendingPresentChildren = reactExports.useRef(presentChildren);
  const exitComplete = useConstant(() => /* @__PURE__ */ new Map());
  const [diffedChildren, setDiffedChildren] = reactExports.useState(presentChildren);
  const [renderedChildren, setRenderedChildren] = reactExports.useState(presentChildren);
  useIsomorphicLayoutEffect(() => {
    isInitialRender.current = false;
    pendingPresentChildren.current = presentChildren;
    for (let i = 0; i < renderedChildren.length; i++) {
      const key = getChildKey(renderedChildren[i]);
      if (!presentKeys.includes(key)) {
        if (exitComplete.get(key) !== true) {
          exitComplete.set(key, false);
        }
      } else {
        exitComplete.delete(key);
      }
    }
  }, [renderedChildren, presentKeys.length, presentKeys.join("-")]);
  const exitingChildren = [];
  if (presentChildren !== diffedChildren) {
    let nextChildren = [...presentChildren];
    for (let i = 0; i < renderedChildren.length; i++) {
      const child = renderedChildren[i];
      const key = getChildKey(child);
      if (!presentKeys.includes(key)) {
        nextChildren.splice(i, 0, child);
        exitingChildren.push(child);
      }
    }
    if (mode === "wait" && exitingChildren.length) {
      nextChildren = exitingChildren;
    }
    setRenderedChildren(onlyElements(nextChildren));
    setDiffedChildren(presentChildren);
    return;
  }
  const { forceRender } = reactExports.useContext(LayoutGroupContext);
  return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: renderedChildren.map((child) => {
    const key = getChildKey(child);
    const isPresent = propagate && !isParentPresent ? false : presentChildren === renderedChildren || presentKeys.includes(key);
    const onExit = () => {
      if (exitComplete.has(key)) {
        exitComplete.set(key, true);
      } else {
        return;
      }
      let isEveryExitComplete = true;
      exitComplete.forEach((isExitComplete) => {
        if (!isExitComplete)
          isEveryExitComplete = false;
      });
      if (isEveryExitComplete) {
        forceRender === null || forceRender === void 0 ? void 0 : forceRender();
        setRenderedChildren(pendingPresentChildren.current);
        propagate && (safeToRemove === null || safeToRemove === void 0 ? void 0 : safeToRemove());
        onExitComplete && onExitComplete();
      }
    };
    return jsxRuntimeExports.jsx(PresenceChild, { isPresent, initial: !isInitialRender.current || initial ? void 0 : false, custom: isPresent ? void 0 : custom, presenceAffectsLayout, mode, onExitComplete: isPresent ? void 0 : onExit, children: child }, key);
  }) });
};
function MiniRing({ progress, paused }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { WebkitAppRegion: "no-drag" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Ring, { value: progress, size: 20, strokeWidth: 2.5, dim: paused }) });
}
function ThreadLabel({ title, nextAction }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { minWidth: 0 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        },
        children: title
      }
    ),
    nextAction ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          fontSize: 11,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        },
        children: nextAction
      }
    ) : null
  ] });
}
function Countdown({ remainingMs }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mono", style: { fontSize: 22, flexShrink: 0 }, children: formatClock(remainingMs) });
}
function DistractionButton({
  onDistraction
}) {
  const [popover, setPopover] = reactExports.useState(false);
  const [note, setNote] = reactExports.useState("");
  const timer = reactExports.useRef(null);
  const longPressed = reactExports.useRef(false);
  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPopover(true);
    }, 600);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!longPressed.current && !popover) onDistraction("unspecified");
  };
  const tag = (kind) => {
    onDistraction(kind, note.trim() || void 0);
    setPopover(false);
    setNote("");
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { position: "relative", WebkitAppRegion: "no-drag" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onMouseDown: startPress,
        onMouseUp: endPress,
        onMouseLeave: () => timer.current && clearTimeout(timer.current),
        style: hudBtn,
        title: "Distraction",
        children: "⚡"
      }
    ),
    popover ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        style: {
          position: "absolute",
          bottom: "100%",
          right: 0,
          marginBottom: 6,
          background: "var(--surface-raised)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 8,
          width: 160,
          zIndex: 10
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              autoFocus: true,
              value: note,
              placeholder: "Note (optional)",
              onChange: (e) => setNote(e.target.value),
              style: { width: "100%", fontSize: 11, marginBottom: 6, borderBottom: "1px solid var(--line)" }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 6 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => tag("internal"), style: tagBtn, children: "Internal" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => tag("external"), style: tagBtn, children: "External" })
          ] })
        ]
      }
    ) : null
  ] });
}
const hudBtn = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface-raised)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12
};
const tagBtn = {
  flex: 1,
  fontSize: 10,
  padding: "4px 0",
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer"
};
function ControlBar({
  paused,
  onPauseResume,
  onDistraction,
  onSwitch,
  onEnd
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 6, flexShrink: 0, WebkitAppRegion: "no-drag" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onPauseResume, style: hudBtn, title: paused ? "Resume" : "Pause", children: paused ? "▶" : "❙❙" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(DistractionButton, { onDistraction }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onSwitch, style: hudBtn, title: "Switch", children: "⇄" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onEnd, style: hudBtn, title: "End", children: "■" })
  ] });
}
function Toast({ text }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: text ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    motion.div,
    {
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0 },
      transition: { duration: 0.16 },
      style: {
        position: "absolute",
        bottom: 6,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--surface-raised)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "4px 10px",
        fontSize: 11,
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
        pointerEvents: "none"
      },
      children: text
    }
  ) : null });
}
function HudToast({ text }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Toast, { text });
}
function SwitchPicker({ onDone }) {
  const [threads, setThreads] = reactExports.useState([]);
  reactExports.useEffect(() => {
    window.thread.invoke["threads:list"](void 0).then(
      (all) => setThreads(all.filter((t) => t.status !== "done"))
    );
  }, []);
  const pick = async (threadId) => {
    onDone();
    await window.thread.invoke["session:switch"]({ threadId });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        display: "flex",
        gap: 6,
        overflowX: "auto",
        flex: 1,
        WebkitAppRegion: "no-drag"
      },
      children: [
        threads.slice(0, 6).map((thread) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => void pick(thread.id),
            style: {
              flexShrink: 0,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: 12,
              cursor: "pointer",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            },
            children: thread.title
          },
          thread.id
        )),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onDone,
            style: { background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 12 },
            children: "✕"
          }
        )
      ]
    }
  );
}
function EmptyHud() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: () => void window.thread.invoke["hud:hide"](void 0),
      style: {
        flex: 1,
        fontSize: 12,
        color: "var(--text-faint)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer"
      },
      children: "Nothing running — open Thread to pick something"
    }
  );
}
function HudApp() {
  const [state, setState] = reactExports.useState(null);
  const [tick, setTick] = reactExports.useState(null);
  const [toast, setToast] = reactExports.useState(null);
  const [switching, setSwitching] = reactExports.useState(false);
  reactExports.useEffect(() => {
    window.thread.invoke["session:state"](void 0).then(setState);
    const offChanged = window.thread.on("session:changed", (next) => {
      setState(next);
      if (!next) setTick(null);
    });
    const offTick = window.thread.on("session:tick", setTick);
    const offToast = window.thread.on("hud:toast", ({ text }) => {
      setToast(text);
      setTimeout(() => setToast(null), 1500);
    });
    return () => {
      offChanged();
      offTick();
      offToast();
    };
  }, []);
  const remainingMs = tick?.remainingMs ?? state?.remainingMs ?? 0;
  const progress = tick?.progress ?? 0;
  const paused = state?.paused ?? false;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        width: "100vw",
        height: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        gap: 12,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        opacity: paused ? 0.6 : 1,
        transition: "opacity var(--motion-slow) var(--ease-out)",
        // The title bar area doubles as the drag handle.
        WebkitAppRegion: "drag"
      },
      children: [
        !state ? /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyHud, {}) : switching ? /* @__PURE__ */ jsxRuntimeExports.jsx(SwitchPicker, { onDone: () => setSwitching(false) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(MiniRing, { progress, paused }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ThreadLabel, { title: state.threadTitle, nextAction: state.nextAction }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Countdown, { remainingMs })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ControlBar,
            {
              paused,
              onPauseResume: () => void window.thread.invoke[paused ? "session:resume" : "session:pause"](void 0),
              onDistraction: (kind, note) => void window.thread.invoke["session:distraction"]({ kind, note }),
              onSwitch: () => setSwitching(true),
              onEnd: () => void window.thread.invoke["session:end"]({})
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(HudToast, { text: toast })
      ]
    }
  );
}
createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HudApp, {}) })
);
