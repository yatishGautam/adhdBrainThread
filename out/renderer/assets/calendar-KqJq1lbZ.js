import { r as reactExports, j as jsxRuntimeExports, c as createRoot } from "./tokens-CwobPeMn.js";
import { t as todayLocalDate, W as WeekGrid, M as MonthGrid, D as DayTimeline, s as startOfLocalWeek, a as addLocalDays, b as startOfLocalMonth, e as endOfLocalMonth } from "./WeekGrid-C8l2I0wB.js";
function CalendarWidgetApp() {
  const [scope, setScope] = reactExports.useState("week");
  const [anchor, setAnchor] = reactExports.useState("");
  const [today, setToday] = reactExports.useState("");
  const [calendar, setCalendar] = reactExports.useState(null);
  const [nonce, setNonce] = reactExports.useState(0);
  reactExports.useEffect(() => {
    void (async () => {
      const settings = await window.thread.invoke["settings:get"](void 0);
      const now = todayLocalDate(settings.timezone);
      setToday(now);
      setAnchor(now);
      if (settings.calendarWidgetScope) setScope(settings.calendarWidgetScope);
    })();
  }, []);
  reactExports.useEffect(() => {
    if (!anchor) return;
    let live = true;
    const request = { ...rangeFor(anchor, scope), scope };
    void (async () => {
      const local = await window.thread.invoke["calendar:get"](request);
      if (!live) return;
      setCalendar(local.calendar);
      const remote = await window.thread.invoke["calendar:refresh"](request);
      if (live && remote) setCalendar(remote.calendar);
    })();
    return () => {
      live = false;
    };
  }, [anchor, scope, nonce]);
  reactExports.useEffect(() => {
    const reload = () => setNonce((n) => n + 1);
    window.thread.on("planner:weekChanged", reload);
    window.thread.on("planner:changed", reload);
    window.thread.on("day:changed", reload);
    window.thread.on("session:changed", (state) => {
      if (!state) reload();
    });
  }, []);
  const pick = (next) => {
    setScope(next);
    void window.thread.invoke["calendarWidget:scope"]({ scope: next });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "color-mix(in srgb, var(--ink) 94%, transparent)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        overflow: "hidden",
        // Only the title strip drags, or clicking a day would move the window instead.
        WebkitAppRegion: "no-drag"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TitleStrip,
          {
            scope,
            anchor,
            today,
            onScope: pick,
            onShift: (delta) => setAnchor((at) => shiftBy(at, scope, delta)),
            onToday: () => setAnchor(today)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflow: "auto", padding: "6px 8px 10px" }, children: !calendar ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: 14, fontSize: 11, color: "var(--text-faint)" }, children: "Loading…" }) : scope === "week" ? /* @__PURE__ */ jsxRuntimeExports.jsx(WeekGrid, { calendar, today, compact: true }) : scope === "month" ? /* @__PURE__ */ jsxRuntimeExports.jsx(MonthGrid, { calendar, today, month: anchor.slice(0, 7), compact: true }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          DayTimeline,
          {
            day: calendar.days.find((day) => day.localDate === anchor) ?? calendar.days[0],
            compact: true
          }
        ) })
      ]
    }
  );
}
function TitleStrip({
  scope,
  anchor,
  today,
  onScope,
  onShift,
  onToday
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 6px 6px 10px",
        borderBottom: "1px solid var(--line)",
        // The one draggable region: everything else is something you click.
        WebkitAppRegion: "drag",
        flexShrink: 0
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onToday,
            title: anchor === today ? anchor : "Back to today",
            style: {
              ...bare,
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text)",
              minWidth: 108,
              textAlign: "left"
            },
            children: label(scope, anchor)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Arrow, { label: "‹", title: "Back", onClick: () => onShift(-1) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Arrow, { label: "›", title: "Forward", onClick: () => onShift(1) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
        ["day", "week", "month"].map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => onScope(option),
            title: `${option[0]?.toUpperCase()}${option.slice(1)}`,
            style: {
              ...bare,
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              background: option === scope ? "var(--surface-raised)" : "transparent",
              color: option === scope ? "var(--text)" : "var(--text-faint)"
            },
            children: option[0]
          },
          option
        )),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => void window.thread.invoke["calendarWidget:close"](void 0),
            title: "Close",
            style: { ...bare, padding: "2px 6px", color: "var(--text-faint)", fontSize: 13 },
            children: "×"
          }
        )
      ]
    }
  );
}
function Arrow({
  label: label2,
  title,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick, title, style: { ...bare, padding: "1px 5px", fontSize: 13 }, children: label2 });
}
const bare = {
  WebkitAppRegion: "no-drag",
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  fontFamily: "inherit",
  cursor: "pointer",
  lineHeight: 1
};
function rangeFor(anchor, scope) {
  if (scope === "day") return { from: anchor, to: anchor };
  if (scope === "week") {
    const from2 = startOfLocalWeek(anchor);
    return { from: from2, to: addLocalDays(from2, 6) };
  }
  const from = startOfLocalWeek(startOfLocalMonth(anchor));
  return { from, to: addLocalDays(startOfLocalWeek(endOfLocalMonth(anchor)), 6) };
}
function shiftBy(anchor, scope, delta) {
  if (!anchor) return anchor;
  if (scope === "day") return addLocalDays(anchor, delta);
  if (scope === "week") return addLocalDays(anchor, delta * 7);
  const first = startOfLocalMonth(anchor);
  const month = Number(first.slice(5, 7)) - 1 + delta;
  const year = Number(first.slice(0, 4)) + Math.floor(month / 12);
  const m = (month % 12 + 12) % 12;
  return `${year}-${String(m + 1).padStart(2, "0")}-01`;
}
function label(scope, anchor) {
  if (!anchor) return "";
  const [y, m, d] = anchor.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  if (scope === "day") {
    return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  }
  if (scope === "month") {
    return at.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const from = startOfLocalWeek(anchor);
  const to = addLocalDays(from, 6);
  const month = (date) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1)).toLocaleDateString(
    "en-GB",
    { month: "short", timeZone: "UTC" }
  );
  const day = (date) => Number(date.slice(8, 10));
  return from.slice(0, 7) === to.slice(0, 7) ? `${month(from)} ${day(from)}–${day(to)}` : `${month(from)} ${day(from)} – ${month(to)} ${day(to)}`;
}
createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarWidgetApp, {}) })
);
