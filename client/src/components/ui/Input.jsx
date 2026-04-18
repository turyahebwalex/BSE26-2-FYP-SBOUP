import React, { forwardRef } from 'react';

/**
 * SBOUP Input Component
 *
 * @param {string} label
 * @param {string} error
 * @param {React.ReactNode} leftIcon
 * @param {React.ReactNode} rightIcon
 * @param {string} className
 */
const Input = forwardRef(({
  label,
  error,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...rest
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text-primary mb-1"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-text-muted pointer-events-none flex items-center">
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full px-4 py-3 border rounded-md text-text-primary placeholder-text-muted bg-white',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
            'transition-all duration-150',
            'min-h-[44px]',
            leftIcon  ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            error
              ? 'border-error focus:ring-error'
              : 'border-border',
            className,
          ].join(' ')}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...rest}
        />

        {rightIcon && (
          <span className="absolute right-3 text-text-muted flex items-center">
            {rightIcon}
          </span>
        )}
      </div>

      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1 text-xs text-error"
        >
          {error}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
