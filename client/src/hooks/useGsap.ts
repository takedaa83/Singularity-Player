import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Hook to apply a beautiful staggered fade-in & slide-up animation to elements matching a selector.
 * @param selector CSS selector for target elements (e.g., '.track-card', '.genre-tile')
 * @param triggerDependency Value whose change should trigger the animation (e.g., query, tracks list)
 * @param staggerDelay Delay between each element's animation in seconds
 */
export const useGsapFadeIn = (
  selector: string,
  triggerDependency: any,
  staggerDelay: number = 0.04
) => {
  useEffect(() => {
    // Small delay to ensure React has finished rendering the DOM
    const ctx = gsap.context(() => {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) return;

      gsap.fromTo(elements, 
        { opacity: 0, y: 15 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: staggerDelay,
          ease: 'power3.out',
          clearProps: 'transform,opacity', // clear styles after animation completes
        }
      );
    });

    return () => ctx.revert();
  }, [triggerDependency, selector, staggerDelay]);
};

/**
 * Hook to apply a smooth springy scale/glow animation on hover using GSAP.
 */
export const useGsapHover = <T extends HTMLElement = HTMLDivElement>(
  scale: number = 1.025,
  yOffset: number = -2
) => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMouseEnter = () => {
      gsap.to(el, {
        scale: scale,
        y: yOffset,
        duration: 0.35,
        ease: 'elastic.out(1, 0.75)',
        boxShadow: '0 10px 25px -5px rgba(255, 255, 255, 0.08), 0 8px 10px -6px rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.22)',
        overwrite: 'auto',
      });
    };

    const onMouseLeave = () => {
      gsap.to(el, {
        scale: 1,
        y: 0,
        duration: 0.3,
        ease: 'power2.out',
        boxShadow: 'none',
        borderColor: '', // resets to default stylesheet border
        overwrite: 'auto',
      });
    };

    el.addEventListener('mouseenter', onMouseEnter);
    el.addEventListener('mouseleave', onMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [scale, yOffset]);

  return ref;
};
