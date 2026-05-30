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
      },
    },
  },
  plugins: [],
};
