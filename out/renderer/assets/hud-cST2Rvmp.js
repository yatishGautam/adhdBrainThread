import { a as animateVisualElement, s as setTarget, u as useConstant, b as useIsomorphicLayoutEffect, j as jsxRuntimeExports, m as motion, d as formatClock, r as reactExports, c as createRoot } from "./format-B09i810A.js";
import { R as Ring, A as AnimatePresence } from "./Ring-DOsfr5Cg.js";
function stopAnimation(visualElement) {
  visualElement.values.forEach((value) => value.stop());
}
function setVariants(visualElement, variantLabels) {
  const reversedLabels = [...variantLabels].reverse();
  reversedLabels.forEach((key) => {
    const variant = visualElement.getVariant(key);
    variant && setTarget(visualElement, variant);
    if (visualElement.variantChildren) {
      visualElement.variantChildren.forEach((child) => {
        setVariants(child, variantLabels);
      });
    }
  });
}
function setValues(visualElement, definition) {
  if (Array.isArray(definition)) {
    return setVariants(visualElement, definition);
  } else if (typeof definition === "string") {
    return setVariants(visualElement, [definition]);
  } else {
    setTarget(visualElement, definition);
  }
}
function animationControls() {
  const subscribers = /* @__PURE__ */ new Set();
  const controls = {
    subscribe(visualElement) {
      subscribers.add(visualElement);
      return () => void subscribers.delete(visualElement);
    },
    start(definition, transitionOverride) {
      const animations = [];
      subscribers.forEach((visualElement) => {
        animations.push(animateVisualElement(visualElement, definition, {
          transitionOverride
        }));
      });
      return Promise.all(animations);
    },
    set(definition) {
      return subscribers.forEach((visualElement) => {
        setValues(visualElement, definition);
      });
    },
    stop() {
      subscribers.forEach((visualElement) => {
        stopAnimation(visualElement);
      });
    },
    mount() {
      return () => {
        controls.stop();
      };
    }
  };
  return controls;
}
function useAnimationControls() {
  const controls = useConstant(animationControls);
  useIsomorphicLayoutEffect(controls.mount, []);
  return controls;
}
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
function ParkButton() {
  const [popover, setPopover] = reactExports.useState(false);
  const [note, setNote] = reactExports.useState("");
  const timer = reactExports.useRef(null);
  const longPressed = reactExports.useRef(false);
  const park = (kind, text) => {
    void window.thread.invoke["session:park"]({
      kind,
      ...text ? { note: text } : {}
    });
  };
  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPopover(true);
    }, 600);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!longPressed.current && !popover) park("unspecified");
  };
  const tag = (kind) => {
    park(kind, note.trim() || void 0);
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
        title: "Something pulled you away? Tap this. It parks the thought and adds time back. Hold to add detail.",
        children: "Park"
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(ParkButton, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          HudButton,
          {
            onClick: onSkip,
            title: "Finish this block right now — it still counts as complete, nothing is lost",
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
function StagePanel({ stage }) {
  const isBreak = stage.kind === "break";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { minWidth: 0, textAlign: "center" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 14, fontWeight: 600 }, children: isBreak ? "Break" : "Next: focus" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          title: stage.threadTitle,
          style: {
            fontSize: 11,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1
          },
          children: stage.threadTitle
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: "mono",
          style: {
            fontSize: 26,
            lineHeight: 1,
            fontWeight: 600,
            color: isBreak ? "var(--moss)" : "var(--amber)"
          },
          children: formatClock(stage.remainingMs)
        }
      ),
      !stage.running ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 9, color: "var(--text-faint)" }, children: "WAITING FOR YOU" }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
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
                onClick: () => void window.thread.invoke["stage:resume"](void 0),
                title: isBreak ? "Start the break — it will not start on its own" : "Start the next focus block",
                label: stage.running ? "Running" : "Resume"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ParkButton, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              HudButton,
              {
                onClick: () => void window.thread.invoke["stage:skip"](void 0),
                title: isBreak ? "Skip the break" : "Start now",
                label: "Skip"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              HudButton,
              {
                onClick: () => void window.thread.invoke["stage:stop"](void 0),
                title: "Leave the cycle. Nothing is lost.",
                label: "Stop"
              }
            )
          ]
        }
      )
    ] })
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
let context = null;
function audio() {
  if (typeof AudioContext === "undefined") return null;
  context ??= new AudioContext();
  void context.resume();
  return context;
}
function tone(ctx, frequency, startAt, durationMs) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  const seconds = durationMs / 1e3;
  gain.gain.setValueAtTime(1e-4, startAt);
  gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(1e-4, startAt + seconds);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + seconds + 0.02);
}
function playStageChime(stage) {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const [first, second] = stage === "focus" ? [660, 880] : [880, 660];
  tone(ctx, first, now, 260);
  tone(ctx, second, now + 0.16, 380);
}
function HudApp() {
  const [state, setState] = reactExports.useState(null);
  const [stage, setStage] = reactExports.useState(null);
  const [tick, setTick] = reactExports.useState(null);
  const [toast, setToast] = reactExports.useState(null);
  const shell = useAnimationControls();
  reactExports.useEffect(() => {
    window.thread.invoke["session:state"](void 0).then(setState);
    window.thread.invoke["stage:state"](void 0).then(setStage);
    const offChanged = window.thread.on("session:changed", (next) => {
      setState(next);
      if (!next) setTick(null);
      if (next) setStage(null);
    });
    const offTick = window.thread.on("session:tick", setTick);
    const offStage = window.thread.on("stage:changed", setStage);
    const offStageTick = window.thread.on("stage:tick", ({ remainingMs: remainingMs2 }) => {
      setStage((current) => current ? { ...current, remainingMs: remainingMs2 } : current);
    });
    const offToast = window.thread.on("hud:toast", ({ text }) => {
      setToast(text);
      setTimeout(() => setToast(null), 1500);
    });
    const offAttention = window.thread.on("hud:attention", ({ stage: ended }) => {
      playStageChime(ended);
      void shell.start({
        scale: [1, 1.06, 1, 1.03, 1],
        x: [0, -7, 7, -4, 4, 0],
        boxShadow: [
          "0 0 0 0 rgba(242,166,90,0)",
          "0 0 28px 6px rgba(242,166,90,0.5)",
          "0 0 0 0 rgba(242,166,90,0)"
        ],
        transition: { duration: 0.85, ease: "easeInOut" }
      });
    });
    return () => {
      offChanged();
      offTick();
      offStage();
      offStageTick();
      offToast();
      offAttention();
    };
  }, [shell]);
  const remainingMs = tick?.remainingMs ?? state?.remainingMs ?? 0;
  const progress = tick?.progress ?? 0;
  const paused = state?.paused ?? false;
  const urgency = computeUrgency(progress);
  const waiting = !state && stage !== null && !stage.running;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      animate: shell,
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.div,
          {
            animate: waiting ? { opacity: [1, 0.62, 1] } : { opacity: 1 },
            transition: waiting ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 },
            style: { display: "flex", flexDirection: "column", gap: 8 },
            children: state ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ThreadLabel,
                {
                  title: state.threadTitle,
                  nextAction: state.nextAction
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(MiniRing, { progress, paused, urgency }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Countdown,
                  {
                    remainingMs,
                    paused,
                    urgency
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  ControlBar,
                  {
                    paused,
                    onPauseResume: () => void window.thread.invoke[paused ? "session:resume" : "session:pause"](void 0),
                    onSkip: () => void window.thread.invoke["session:end"]({
                      outcome: "completed"
                    }),
                    onEnd: () => void window.thread.invoke["session:end"]({})
                  }
                )
              ] })
            ] }) : stage ? /* @__PURE__ */ jsxRuntimeExports.jsx(StagePanel, { stage }) : /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyHud, {})
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(HudToast, { text: toast })
      ]
    }
  );
}
createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HudApp, {}) })
);
