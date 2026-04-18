import React from 'react';

/**
 * SBOUP Badge Component
 *
 * @param {'active'|'filled'|'draft'|'match'} variant
 * @param {string} className
 */
const variantClasses = {
  active: 'bg-[#D1FAE5] text-[#065F46]',
  filled: 'bg-[#DBEAFE] text-[#1E40AF]',
  draft:  'bg-[#F3F4F6] text-[#374151]',
  match:  'bg-[#FED7AA] text-[#C2410C]',
};

const Badge = ({ children, variant = 'draft', className = '', ...rest }) => (
  <span
    className={[
      'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap',
      variantClasses[variant] ?? variantClasses.draft,
      className,
    ].join(' ')}
    {...rest}
  >
    {children}
  </span>
);

export default Badge;
