import { j as jsxRuntimeExports, m as motion } from "./format-nk-eI89E.js";
const BAND_COLOR = {
  resting: "var(--lavender)",
  warming: "var(--slate)",
  rolling: "var(--amber)",
  flow: "var(--amber-bright)",
  lit: "var(--moss)"
};
function Ring({ value, size, band, color, strokeWidth, dim, pulse, children }) {
  const stroke = strokeWidth ?? Math.max(2, Math.round(size * 0.09));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - clamped);
  const resolvedColor = color ?? (band ? BAND_COLOR[band] : "var(--amber)");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      animate: pulse ? { scale: [1, 1.08, 1] } : { scale: 1 },
      transition: pulse ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 },
      style: {
        position: "relative",
        width: size,
        height: size,
        opacity: dim ? 0.6 : 1,
        transition: "opacity var(--motion-slow) var(--ease-out)"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "circle",
            {
              cx: size / 2,
              cy: size / 2,
              r: radius,
              fill: "none",
              stroke: "var(--line)",
              strokeWidth: stroke
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "circle",
            {
              cx: size / 2,
              cy: size / 2,
              r: radius,
              fill: "none",
              stroke: resolvedColor,
              strokeWidth: stroke,
              strokeLinecap: "round",
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              transform: `rotate(-90 ${size / 2} ${size / 2})`,
              style: {
                transition: "stroke-dashoffset var(--motion-slow) var(--ease-out), stroke var(--motion-slow) var(--ease-out)"
              }
            }
          )
        ] }),
        children ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            },
            children
          }
        ) : null
      ]
    }
  );
}
export {
  Ring as R
};
