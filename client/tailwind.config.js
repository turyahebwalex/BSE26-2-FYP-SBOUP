/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F97316',
          dark:    '#EA6C0A',
          light:   '#FED7AA',
        },
        surface:  '#F9FAFB',
        border:   '#E5E7EB',
        success:  '#10B981',
        warning:  '#F59E0B',
        error:    '#EF4444',
        text: {
          primary:   '#111827',
          secondary: '#6B7280',
          muted:     '#9CA3AF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        xs:   ['12px', { lineHeight: '1.5' }],
        sm:   ['14px', { lineHeight: '1.5' }],
        base: ['16px', { lineHeight: '1.5' }],
        lg:   ['18px', { lineHeight: '1.4' }],
        xl:   ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.3' }],
        '3xl': ['30px', { lineHeight: '1.2' }],
      },
      spacing: {
        1:  '4px',
        2:  '8px',
        3:  '12px',
        4:  '16px',
        5:  '20px',
        6:  '24px',
        8:  '32px',
        10: '40px',
        12: '48px',
      },
      borderRadius: {
        sm:   '6px',
        md:   '10px',
        lg:   '16px',
        xl:   '20px',
        '2xl': '24px',
        full: '9999px',
      },
      boxShadow: {
        sm:  '0 1px 3px rgba(0,0,0,0.08)',
        md:  '0 4px 12px rgba(0,0,0,0.08)',
        lg:  '0 8px 24px rgba(0,0,0,0.10)',
        card: '0 2px 8px rgba(0,0,0,0.06)',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};
