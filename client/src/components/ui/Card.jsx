import React from 'react';

/**
 * SBOUP Card Component
 *
 * White surface with soft shadow and md border radius.
 * Accepts className for overrides and onClick for interactive cards.
 */
const Card = ({ children, className = '', onClick, ...rest }) => {
  const isClickable = typeof onClick === 'function';

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick(e) : undefined}
      className={[
        'bg-white rounded-lg border border-border shadow-card p-4',
        isClickable
          ? 'cursor-pointer hover:shadow-md transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
};

export default Card;
