/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Fundo em camadas grafite (base -> painel), do design operacao-maumau-v3
        ink: {
          950: '#0a0a0e',
          900: '#0e0e11',
          850: '#14141a',
          800: '#18181e',
          750: '#1c1c24',
          700: '#222228',
          600: '#2a2a34',
        },
        // Acento principal (azul do design v3: #4A8FD4)
        brand: {
          50: '#eaf2fb',
          100: '#d3e4f6',
          200: '#a9cbec',
          300: '#7db0e4',
          400: '#63a0dc',
          500: '#4a8fd4',
          600: '#3a78bd',
          700: '#2e62a0',
          800: '#26518a',
          900: '#1e4272',
        },
        // Acento secundário (teal)
        accent: {
          400: '#4bc0ba',
          500: '#3aafa9',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(74,143,212,0.35), 0 8px 40px -8px rgba(74,143,212,0.45)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: 0, transform: 'scale(0.97)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s cubic-bezier(0.22,1,0.36,1)',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
};
