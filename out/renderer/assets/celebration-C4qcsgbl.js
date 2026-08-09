import { r as reactExports, j as jsxRuntimeExports, m as motion, f as formatDuration, c as createRoot } from "./format-nk-eI89E.js";
const COLORS = ["var(--amber)", "var(--amber-bright)", "var(--moss)", "var(--lavender)", "var(--slate)"];
function ConfettiBurst({ payload, onDone }) {
  reactExports.useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);
  const pieces = reactExports.useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({
      id: i,
      angle: Math.PI * 2 * i / 60 + Math.random() * 0.3,
      distance: 200 + Math.random() * 300,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 720 - 360,
      size: 6 + Math.random() * 6
    })),
    []
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%", height: "100%", position: "relative" }, children: [
    pieces.map((piece) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.div,
      {
        initial: { x: 0, y: 0, opacity: 1, rotate: 0 },
        animate: {
          x: Math.cos(piece.angle) * piece.distance,
          y: Math.sin(piece.angle) * piece.distance + 200,
          opacity: 0,
          rotate: piece.rotate
        },
        transition: { duration: 1.8, ease: [0.16, 1, 0.3, 1] },
        style: {
          position: "absolute",
          top: 60,
          left: "50%",
          width: piece.size,
          height: piece.size * 0.6,
          background: piece.color,
          borderRadius: 2
        }
      },
      piece.id
    )),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          position: "absolute",
          top: 90,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color: "var(--text)"
        },
        children: payload.threadTitle
      }
    )
  ] });
}
function InkBloom({ payload, onDone }) {
  reactExports.useEffect(() => {
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
  }, [onDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.div,
      {
        initial: { scale: 0, opacity: 0.9 },
        animate: { scale: 6, opacity: 0 },
        transition: { duration: 1.8, ease: "easeOut" },
        style: {
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--amber) 0%, transparent 70%)"
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.9 },
        animate: { opacity: 1, scale: 1 },
        transition: { delay: 0.3, duration: 0.5 },
        style: { fontFamily: "var(--font-display)", fontSize: 28, color: "var(--text)", textAlign: "center" },
        children: payload.threadTitle
      }
    )
  ] });
}
function Constellation({ payload, onDone }) {
  reactExports.useEffect(() => {
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [onDone]);
  const count = Math.max(3, Math.min(12, payload.steps));
  const points = reactExports.useMemo(
    () => Array.from({ length: count }, (_, i) => {
      const angle = Math.PI * 2 * i / count;
      return { x: 200 + Math.cos(angle) * 120, y: 160 + Math.sin(angle) * 90 };
    }),
    [count]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: 400, height: 320, viewBox: "0 0 400 320", children: [
      points.map((point, i) => {
        const next = points[(i + 1) % points.length];
        if (!next) return null;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.line,
          {
            x1: point.x,
            y1: point.y,
            x2: next.x,
            y2: next.y,
            stroke: "var(--amber)",
            strokeWidth: 1,
            initial: { pathLength: 0, opacity: 0 },
            animate: { pathLength: 1, opacity: 0.5 },
            transition: { delay: 0.1 * i, duration: 0.5 }
          },
          `line-${i}`
        );
      }),
      points.map((point, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        motion.circle,
        {
          cx: point.x,
          cy: point.y,
          r: 4,
          fill: "var(--amber-bright)",
          initial: { opacity: 0, scale: 0 },
          animate: { opacity: 1, scale: 1 },
          transition: { delay: 0.1 * i, duration: 0.3 }
        },
        `star-${i}`
      ))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          position: "absolute",
          bottom: "30%",
          fontFamily: "var(--font-display)",
          fontSize: 20,
          color: "var(--text)"
        },
        children: payload.threadTitle
      }
    )
  ] });
}
function Rise({ payload, onDone }) {
  reactExports.useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "center" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      motion.div,
      {
        initial: { y: 40, opacity: 0 },
        animate: { y: -60, opacity: [0, 1, 1, 0] },
        transition: { duration: 2, ease: "easeOut" },
        style: { fontFamily: "var(--font-display)", fontSize: 26, color: "var(--text)" },
        children: payload.threadTitle
      }
    ),
    payload.steps > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
      motion.div,
      {
        className: "mono",
        initial: { opacity: 1 },
        animate: { opacity: 0 },
        transition: { delay: 1, duration: 1 },
        style: { fontSize: 14, color: "var(--moss)", marginTop: 8 },
        children: [
          payload.steps,
          " steps done"
        ]
      }
    ) : null
  ] }) });
}
function BossDefeated({ payload, onDone }) {
  reactExports.useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [onDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    motion.div,
    {
      animate: { x: [0, -6, 6, -4, 4, 0] },
      transition: { duration: 0.4, delay: 1 },
      style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "center", fontFamily: "var(--font-mono)" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 18, color: "var(--amber-bright)", marginBottom: 10 }, children: payload.threadTitle }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              width: 280,
              height: 18,
              border: "2px solid var(--text)",
              padding: 2,
              imageRendering: "pixelated"
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              motion.div,
              {
                initial: { width: "100%" },
                animate: { width: "0%" },
                transition: { duration: 1, delay: 0.4, ease: "linear" },
                style: { height: "100%", background: "var(--danger)" }
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.div,
          {
            initial: { opacity: 0, scale: 0.8 },
            animate: { opacity: 1, scale: 1 },
            transition: { delay: 1.5 },
            style: { fontSize: 24, color: "var(--moss)", marginTop: 14, letterSpacing: "0.1em" },
            children: "DEFEATED"
          }
        )
      ] })
    }
  );
}
function TickerTape({ payload, onDone }) {
  reactExports.useEffect(() => {
    const timer = setTimeout(onDone, 3400);
    return () => clearTimeout(timer);
  }, [onDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", overflow: "hidden" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      initial: { x: "100vw" },
      animate: { x: "-100%" },
      transition: { duration: 3, ease: "linear" },
      style: {
        whiteSpace: "nowrap",
        fontFamily: "var(--font-display)",
        fontSize: 32,
        color: "var(--amber-bright)"
      },
      children: [
        "✓ ",
        payload.threadTitle,
        " — ",
        formatDuration(payload.focusMs),
        " focused — ",
        payload.band
      ]
    }
  ) });
}
const CELEBRATION_REGISTRY = [
  { id: "confetti-burst", name: "Confetti Burst", tier: "common", durationMs: 2200, reducedMotionSafe: false, Component: ConfettiBurst },
  { id: "ink-bloom", name: "Ink Bloom", tier: "common", durationMs: 2400, reducedMotionSafe: true, Component: InkBloom },
  { id: "constellation", name: "Constellation", tier: "common", durationMs: 2600, reducedMotionSafe: true, Component: Constellation },
  { id: "rise", name: "Rise", tier: "common", durationMs: 2200, reducedMotionSafe: true, Component: Rise },
  { id: "boss-defeated", name: "Boss Defeated", tier: "rare", durationMs: 3200, reducedMotionSafe: false, Component: BossDefeated },
  { id: "ticker-tape", name: "Ticker Tape", tier: "rare", durationMs: 3400, reducedMotionSafe: true, Component: TickerTape }
];
function findPack(id) {
  return CELEBRATION_REGISTRY.find((pack) => pack.id === id);
}
function CelebrationApp() {
  const [cue, setCue] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const offPlay = window.thread.on("celebration:play", setCue);
    const offStop = window.thread.on("celebration:stop", () => setCue(null));
    return () => {
      offPlay();
      offStop();
    };
  }, []);
  if (!cue) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100vw", height: "100vh" } });
  const pack = findPack(cue.packId);
  if (!pack) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100vw", height: "100vh" } });
  const done = () => {
    setCue(null);
    void window.thread.invoke["celebration:done"](void 0);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(pack.Component, { payload: cue.payload, onDone: done }) });
}
createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CelebrationApp, {}) })
);
