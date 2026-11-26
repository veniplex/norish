"use client";

import { useLayoutEffect } from "react";
import { applyFloatingBarStyle } from "@/lib/floating-bar-style";

import { useDevicePreference } from "@norish/shared-react/reader";

/**
 * Keeps <html> in step with the reader's Floating bar style Device Preference. The server paints
 * the first frame through `FloatingBarStyleScript`; this covers every other path (Offline
 * start-up, a settings change, a profile read that disagrees with what was painted).
 */
export function FloatingBarStyleSync() {
  const [style] = useDevicePreference("floatingBarStyle");

  useLayoutEffect(() => {
    applyFloatingBarStyle(style);

    // Pages outside the app draw no floating bars, and keep the default look.
    return () => applyFloatingBarStyle("contrast");
  }, [style]);

  return null;
}
