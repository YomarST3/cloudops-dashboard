/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cloud: {
          bg: '#F8FAFC',
          sidebar: '#0F172A',
          primary: '#2563EB',
          security: '#16A34A',
          costs: '#F59E0B',
          alerts: '#DC2626',
          text: '#1E293B',
          muted: '#64748B',
          border: '#E2E8F0',
          card: '#FFFFFF',
          darkBg: '#0B1120',
          darkCard: '#1E293B',
          darkBorder: '#334155',
          darkText: '#F1F5F9',
          darkMuted: '#94A3B8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        pulseTraffic: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.95)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        flowDash: {
          'to': { strokeDashoffset: '-20' }
        }
      },
      animation: {
        traffic: 'pulseTraffic 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        flow: 'flowDash 1.2s linear infinite',
      }
    },
  },
  plugins: [],
}
