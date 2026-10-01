import { useEffect, useRef, useState } from "react";

/**
 * True once the observed element has entered the viewport (plus `rootMargin`), and stays true
 * after (lazy images shouldn't unmount once loaded). Falls back to `true` immediately when
 * `IntersectionObserver` isn't available (old browsers, some test environments) so nothing is
 * stuck unloaded.
 */
export function useInView(rootMargin = "300px") {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(
    typeof IntersectionObserver === "undefined" || typeof window === "undefined",
  );
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}
