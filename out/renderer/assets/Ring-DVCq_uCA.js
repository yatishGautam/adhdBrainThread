import { j as jsxRuntimeExports } from "./format-C7YSyzYl.js";
const BAND_COLOR = {
  resting: "var(--lavender)",
  warming: "var(--slate)",
  rolling: "var(--amber)",
  flow: "var(--amber-bright)",
  lit: "var(--moss)"
};
function Ring({ value, size, band, strokeWidth, dim, children }) {
  const stroke = strokeWidth ?? Math.max(2, Math.round(size * 0.09));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - clamped);
  const color = band ? BAND_COLOR[band] : "var(--amber)";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
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
              stroke: color,
              strokeWidth: stroke,
              strokeLinecap: "round",
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              transform: `rotate(-90 ${size / 2} ${size / 2})`,
              style: { transition: "stroke-dashoffset var(--motion-slow) var(--ease-out)" }
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
