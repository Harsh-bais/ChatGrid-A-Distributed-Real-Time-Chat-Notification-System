export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'ui-sans-serif', 'system-ui'],
        body: ['DM Sans', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        brand: {
          green: '#00c896',
          cyan: '#0ea5e9',
          violet: '#8b5cf6',
        },
      },
      boxShadow: {
        glow: '0 0 40px rgba(0, 200, 150, 0.3)',
        'glow-sm': '0 0 20px rgba(0, 200, 150, 0.2)',
      },
      animation: {
        'fade-up': 'fadeUp 220ms cubic-bezier(0.2, 0, 0.2, 1) both',
        'typing-dot': 'typingDot 1.1s ease-in-out infinite',
        'modal-in': 'modalIn 220ms cubic-bezier(0.2, 0, 0.2, 1) both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        typingDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: 0.3 },
          '40%': { transform: 'translateY(-5px)', opacity: 1 },
        },
        modalIn: {
          '0%': { opacity: 0, transform: 'scale(0.95) translateY(10px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
