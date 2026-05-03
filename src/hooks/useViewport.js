import { useEffect, useState } from "react";

export function useViewport(defaultWidth = 1280, defaultHeight = 900) {
  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window === "undefined" ? defaultWidth : window.innerWidth
  );
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? defaultHeight : window.innerHeight
  );

  useEffect(() => {
    function handleResize() {
      setScreenWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { screenWidth, viewportHeight };
}
