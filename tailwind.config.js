/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#0b1220",       // Your main background
        panel: "#0f1a2f",      // Card background
        border: "rgba(255,255,255,0.08)", // Subtle border
        accent: "#4f7cff",     // The blue brand color
        success: "#21c55d",    // Green
        muted: "#9fb2d8",      // Light blue-ish gray text
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'glow': "radial-gradient(1200px 600px at 20% 0%, rgba(79,124,255,0.15), transparent 60%), radial-gradient(1000px 500px at 80% 10%, rgba(33,197,93,0.10), transparent 55%)"
      }
    },
  },
  plugins: [],
}