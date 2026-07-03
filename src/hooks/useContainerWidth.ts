import { useEffect, useRef, useState } from 'react';

/**
 * useContainerWidth — measure a container's client width via ResizeObserver.
 *
 * Returns [ref, width]. Attach ref to the element you want to measure. Width
 * updates whenever the element's box changes size.
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(): [
  React.RefObject<T>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
