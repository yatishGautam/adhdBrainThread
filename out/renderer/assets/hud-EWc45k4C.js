import { r as reactExports, M as MotionConfigContext, j as jsxRuntimeExports, u as useConstant, P as PresenceContext, a as usePresence, b as useIsomorphicLayoutEffect, L as LayoutGroupContext, m as motion, d as formatClock, c as createRoot } from "./format-nk-eI89E.js";
import { R as Ring } from "./Ring-NFbTj05H.js";
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
function computeUrgency(progress) {
  const remainingFraction = 1 - Math.max(0, Math.min(1, progress));
  if (remainingFraction <= 0.15) return "urgent";
  if (remainingFraction <= 0.4) return "building";
  return "calm";
}
function urgencyColor(urgency) {
  if (urgency === "calm") return "var(--amber)";
  return "var(--amber-bright)";
}
function MiniRing({
  progress,
  paused,
  urgency
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { WebkitAppRegion: "no-drag", flexShrink: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    Ring,
    {
      value: progress,
      size: 22,
      strokeWidth: 2.5,
      dim: paused,
      color: urgencyColor(urgency),
      pulse: !paused && urgency === "urgent"
    }
  ) });
}
function ThreadLabel({ title, nextAction }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { minWidth: 0, textAlign: "center" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        title,
        style: {
          fontSize: 14,
          fontWeight: 600,
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
        title: nextAction,
        style: {
          fontSize: 11,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 1
        },
        children: nextAction
      }
    ) : null
  ] });
}
function Countdown({
  remainingMs,
  paused,
  urgency
}) {
  const pulsing = !paused && urgency === "urgent";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 6 }, children: [
    paused ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 9, color: "var(--text-faint)" }, children: "PAUSED" }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.span,
      {
        className: "mono",
        animate: pulsing ? { opacity: [1, 0.7, 1] } : { opacity: 1 },
        transition: pulsing ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 },
        style: {
          fontSize: 26,
          lineHeight: 1,
          fontWeight: 600,
          color: paused ? "var(--text-muted)" : urgencyColor(urgency),
          display: "inline-block"
        },
        children: formatClock(remainingMs)
      }
    )
  ] });
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
        style: { ...hudBtn, color: "var(--amber)" },
        title: "Tap when your attention drifts — it adds time back and costs you nothing. Hold to add detail.",
        children: "Distracted"
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
          width: 170,
          zIndex: 10
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 9, color: "var(--text-faint)", marginBottom: 5 }, children: "What pulled you away?" }),
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
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => tag("internal"), style: tagBtn, title: "A thought, an urge, your own head", children: "My head" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => tag("external"), style: tagBtn, title: "A person, a ping, the world", children: "Outside" })
          ] })
        ]
      }
    ) : null
  ] });
}
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
  onSkip,
  onEnd
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        display: "flex",
        gap: 5,
        flexShrink: 0,
        flexWrap: "wrap",
        justifyContent: "flex-end",
        WebkitAppRegion: "no-drag"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HudButton,
          {
            onClick: onPauseResume,
            title: paused ? "Resume the timer" : "Pause the timer",
            label: paused ? "Resume" : "Pause"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DistractionButton, { onDistraction }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HudButton,
          {
            onClick: onSkip,
            title: "Finish this session right now — it still counts as complete, nothing is lost",
            label: "Skip"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HudButton,
          {
            onClick: onEnd,
            title: "Stop the timer without finishing it",
            label: "Stop"
          }
        )
      ]
    }
  );
}
function HudButton({
  onClick,
  title,
  label,
  ...rest
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick, title, style: hudBtn, ...rest, children: label });
}
const hudBtn = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface-raised)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 10,
  whiteSpace: "nowrap",
  minWidth: 56
};
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
      children: "Nothing running — open ADHD Superpower to pick something"
    }
  );
}
function HudApp() {
  const [state, setState] = reactExports.useState(null);
  const [tick, setTick] = reactExports.useState(null);
  const [toast, setToast] = reactExports.useState(null);
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
  const urgency = computeUrgency(progress);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        width: "100vw",
        height: "100vh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 8,
        padding: "10px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 22,
        opacity: paused ? 0.75 : 1,
        transition: "opacity var(--motion-slow) var(--ease-out)",
        // The whole HUD doubles as its own drag handle; only interactive controls opt out.
        WebkitAppRegion: "drag"
      },
      children: [
        !state ? /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyHud, {}) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ThreadLabel,
            {
              title: state.threadTitle,
              nextAction: state.nextAction
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(MiniRing, { progress, paused, urgency }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Countdown, { remainingMs, paused, urgency }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ControlBar,
              {
                paused,
                onPauseResume: () => void window.thread.invoke[paused ? "session:resume" : "session:pause"](void 0),
                onDistraction: (kind, note) => void window.thread.invoke["session:distraction"]({ kind, note }),
                onSkip: () => void window.thread.invoke["session:end"]({ outcome: "completed" }),
                onEnd: () => void window.thread.invoke["session:end"]({})
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(HudToast, { text: toast })
      ]
    }
  );
}
createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HudApp, {}) })
);
