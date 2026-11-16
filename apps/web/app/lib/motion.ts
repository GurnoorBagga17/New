'use client';

import { useEffect, useState, useRef, type RefObject } from 'react';

/**
 * Standard cubic-bezier easing curves across the Axiom product line.
 */
export const EASINGS = {
  /** "The Gate" snap curve: quick acceleration, smooth deceleration */
  gate: [0.16, 1, 0.3, 1] as const,
  /** Standard ease-out for entrances */
  easeOut: [0, 0, 0.2, 1] as const,
  /** Standard ease-in-out for loops and ambient states */
  easeInOut: [0.4, 0, 0.2, 1] as const,
  /** Linear transition */
  linear: [0, 0, 1, 1] as const,
} as const;

/**
 * Duration tokens in seconds for transitions and animations.
 */
export const DURATIONS = {
  fast: 0.15,
  normal: 0.35,
  deliberate: 0.65,
  cycle: 2.4, // Live radar and scenario pulse cycle
} as const;

/**
 * Hook to detect and react to user prefers-reduced-motion OS preference.
 * Defaults to false on SSR, then updates reliably on hydration.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReduced(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Fallback for older WebKit runtimes
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  return prefersReduced;
}

export interface UseInViewOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Lightweight IntersectionObserver hook to trigger scroll animations and lazy visuals.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {}
): [RefObject<T | null>, boolean] {
  const { threshold = 0.15, rootMargin = '0px 0px -50px 0px', triggerOnce = true } = options;
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState<boolean>(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          setIsInView(true);
          if (triggerOnce) {
            observer.disconnect();
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce]);

  return [ref, isInView];
}
