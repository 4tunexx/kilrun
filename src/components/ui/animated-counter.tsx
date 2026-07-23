'use client';

import { useEffect, useState, useRef } from 'react';

const AnimatedCounter = ({
  end,
  duration = 2,
  className,
  suffix = '',
  prefix = '',
  decimals = 0,
}: {
  end: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    const el = ref.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
    };
  }, []);

  useEffect(() => {
    if (!isInView) return;

    const start = 0;
    const final = end;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / (duration * 1000), 1);
      const current = start + (final - start) * percentage;

      setCount(current);

      if (percentage < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(final);
      }
    };
    requestAnimationFrame(animate);
  }, [isInView, end, duration]);

  const formatValue = (value: number) => {
    if (decimals > 0) {
      return value.toFixed(decimals);
    }
    return Math.floor(value).toLocaleString();
  };

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatValue(count)}
      {suffix}
    </span>
  );
};

export default AnimatedCounter;
