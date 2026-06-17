/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{vue,ts,tsx,js,jsx,md}'],
  darkMode: 'class',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        codex: {
          ink: '#1f1710',
          parchment: '#f8efe0',
          vellum: '#fff9ed',
          gold: '#d9a441',
          ember: '#ff6b00',
          wax: '#8b1e1e',
          night: '#101014',
          steel: '#2b2f3a',
        },
      },
      fontFamily: {
        constitution: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        interface: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        codex: '0 24px 80px rgba(30, 20, 10, 0.18)',
        seal: '0 0 0 1px rgba(217, 164, 65, 0.35), 0 18px 45px rgba(0, 0, 0, 0.16)',
        'glow-orange': '0 0 20px rgba(255, 107, 0, 0.3)',
        'glow-orange-lg': '0 0 40px rgba(255, 107, 0, 0.4)',
        'glow-orange-sm': '0 0 10px rgba(255, 107, 0, 0.2)',
      },
      backgroundImage: {
        'card-gradient':
          'linear-gradient(135deg, rgba(26,26,26,0.95) 0%, rgba(255,107,0,0.05) 100%)',
        'header-gradient':
          'linear-gradient(135deg, #1f1f1f 0%, rgba(255,107,0,0.12) 100%)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        smooth: '300ms',
      },
    },
  },
  plugins: [],
};
