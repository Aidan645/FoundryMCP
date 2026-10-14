/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tabletop: {
          dark: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          amber: '#f59e0b',
          gold: '#fbbf24',
          emerald: '#10b981',
          crimson: '#ef4444'
        }
      }
    },
  },
  plugins: [],
}
