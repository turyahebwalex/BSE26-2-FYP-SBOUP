import React, { useState } from 'react';

/**
 * SBOUP Avatar Component
 *
 * @param {string} src         - Image URL
 * @param {string} name        - Used to generate fallback initials
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} online     - Show green online indicator dot
 * @param {string} className
 */
const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
};

const dotSizeClasses = {
  sm: 'w-2 h-2 bottom-0 right-0',
  md: 'w-2.5 h-2.5 bottom-0 right-0',
  lg: 'w-3.5 h-3.5 bottom-0.5 right-0.5',
};

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const Avatar = ({
  src,
  name = '',
  size = 'md',
  online = false,
  className = '',
  ...rest
}) => {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;

  return (
    <div
      className={['relative inline-flex shrink-0', className].join(' ')}
      {...rest}
    >
      <div
        className={[
          'rounded-full overflow-hidden flex items-center justify-center font-semibold select-none',
          sizeClasses[size],
          showImage ? '' : 'bg-primary/20 text-primary',
        ].join(' ')}
        aria-label={name || 'Avatar'}
      >
        {showImage ? (
          <img
            src={src}
            alt={name || 'User avatar'}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      {online && (
        <span
          aria-label="Online"
          className={[
            'absolute rounded-full bg-success border-2 border-white',
            dotSizeClasses[size],
          ].join(' ')}
        />
      )}
    </div>
  );
};

export default Avatar;
