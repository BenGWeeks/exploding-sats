import { useEffect, useState } from "react"

// Detect touch devices (phones, tablets, iPads)
// - Touch capability is the primary check (shows touch controls)
// - iPadOS reports as "Macintosh" but has touch points
// - Screen size as fallback for small devices
function checkIsTouchDevice(): boolean {
  // Check for touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Detect iPad (iPadOS 13+ reports as Mac but has touch)
  const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  // Screen size checks (for devices that might not report touch correctly)
  const isSmallHeight = window.innerHeight < 500; // Landscape phone
  const isSmallWidth = window.innerWidth < 768; // Portrait phone

  return hasTouch || isIPad || isSmallHeight || isSmallWidth;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(checkIsTouchDevice);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(checkIsTouchDevice());
    };

    window.addEventListener("resize", checkMobile);
    checkMobile();
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}
