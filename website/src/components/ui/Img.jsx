import React, { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { imageUrl } from '../../utils/theme';

/**
 * <img> that resolves backend-relative /uploads paths to an absolute URL and
 * only falls back to a placeholder after the browser has GENUINELY failed to
 * load it (with one silent retry).
 *
 * The failed flag is keyed to the resolved URL, so the constant parent
 * re-renders caused by socket stock updates (which rebuild every product
 * object) can never wipe a working image — the previous version latched
 * `failed=true` on any transient error and never cleared it.
 */
export default function Img({ src, alt = '', className = '', imgClassName = '', iconSize = 40, ...rest }) {
  const url = imageUrl(src);
  const [failed, setFailed] = useState(!url);
  const triesRef = useRef(0);
  const imgRef = useRef(null);

  // New URL → give it a fresh chance.
  useEffect(() => {
    triesRef.current = 0;
    setFailed(!url);
  }, [url]);

  const handleError = () => {
    triesRef.current += 1;
    if (triesRef.current === 1) {
      // One silent retry with a cache-buster — clears half-loaded / aborted
      // requests that happen on a cold first paint or a flaky connection.
      const el = imgRef.current;
      if (el) el.src = url + (url.includes('?') ? '&' : '?') + 'r=' + Date.now();
      return;
    }
    setFailed(true);
  };

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ background: 'var(--color-primary-light)', color: 'var(--color-toffee)' }}
      >
        <ImageOff size={iconSize} />
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={url}
      alt={alt}
      onError={handleError}
      className={imgClassName || className}
      {...rest}
    />
  );
}
