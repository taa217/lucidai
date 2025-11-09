/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Primary (Midnight Blue): #0D1B3E - Core text and dark backgrounds
        primary: {
          50: '#e8ebf0',
          100: '#d1d7e1',
          200: '#a3afc3',
          300: '#7587a5',
          400: '#475f87',
          500: '#0D1B3E', // Base primary color
          600: '#0a162f',
          700: '#081025',
          800: '#050b1a',
          900: '#03050f',
        },
        // Accent (Electric Teal): #00F6BB - Interactive elements (buttons, links, highlights)
        accent: {
          50: '#e6fffa',
          100: '#ccfff5',
          200: '#99ffeb',
          300: '#66ffe1',
          400: '#33ffd7',
          500: '#00F6BB', // Base accent color
          600: '#00c596',
          700: '#009470',
          800: '#00624b',
          900: '#003125',
        },
        // Neutral (Cloud Gray): #F5F7FA - Light backgrounds
        neutral: {
          50: '#F5F7FA', // Base neutral color
          100: '#e8eef5',
          200: '#d1ddeb',
          300: '#bacce1',
          400: '#a3bbd7',
          500: '#8caacd',
          600: '#7089a4',
          700: '#54687b',
          800: '#384752',
          900: '#1c2629',
        },
        // Secondary (Slate Blue): #4A5C80 - Secondary text, icons, borders
        secondary: {
          50: '#eef0f5',
          100: '#dde1eb',
          200: '#bbc3d7',
          300: '#99a5c3',
          400: '#7787af',
          500: '#4A5C80', // Base secondary color
          600: '#3b4a66',
          700: '#2c384d',
          800: '#1e2633',
          900: '#0f131a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
