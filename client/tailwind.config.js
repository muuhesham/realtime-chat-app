/** @type {import('tailwindcss').Config} */
// Tell Tailwind which React and HTML files contain the utility classes used by the UI.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#182230',
        muted: '#8490a5',
        lavender: '#7465f2',
      },
      boxShadow: {
        panel: '0 20px 60px rgba(44, 55, 85, 0.08)',
      },
    },
  },
  plugins: [],
}
