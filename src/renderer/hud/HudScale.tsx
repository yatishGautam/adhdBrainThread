import { useEffect, useState, type ReactNode } from 'react';

/**
 * Shrinks the whole HUD by a fixed factor.
 *
 * `zoom` rather than `transform: scale()` because zoom is a layout operation: the drag region,
 * the hit areas and the rounded corners all end up where they are painted. And it lives here in
 * the page rather than in `webContents.setZoomFactor`, whose zoom Chromium keys by origin —
 * all four windows are served from one origin, so zooming the HUD would zoom the dashboard too.
 *
 * The box is sized in base pixels (the window's own size divided back out by the factor), so
 * viewport units never have to survive the zoom.
 */
export function HudScale({
  scale,
  children,
}: {
  scale: number;
  children: ReactNode;
}): React.JSX.Element {
  const [size, setSize] = useState(() => baseSize(scale));

  useEffect(() => {
    const onResize = (): void => setSize(baseSize(scale));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scale]);

  return (
    <div style={{ zoom: scale, width: size.width, height: size.height }}>{children}</div>
  );
}

function baseSize(scale: number): { width: number; height: number } {
  return {
    width: document.documentElement.clientWidth / scale,
    height: document.documentElement.clientHeight / scale,
  };
}
