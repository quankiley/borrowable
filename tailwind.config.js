/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF7ED',
        pastel: {
          pink: '#FFC8DD',
          rose: '#FFAFCC',
          peach: '#FFD6A5',
          butter: '#FDFFB6',
          mint: '#CAFFBF',
          sky: '#A0E7E5',
          lilac: '#CDB4DB',
          lavender: '#BDB2FF',
          coral: '#FFADAD',
        },
        status: {
          ok: '#B8F2C9',
          okDeep: '#7FD89C',
          warn: '#FFE08A',
          warnDeep: '#F7C035',
          due: '#FFB4A2',
          dueDeep: '#FF6B6B',
          done: '#D3D3F2',
          doneDeep: '#7C7CC7',
        },
      },
      fontFamily: {
        display: ['"Fredoka"', '"Quicksand"', 'system-ui', 'sans-serif'],
        body: ['"Quicksand"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        blob: '40% 60% 55% 45% / 50% 45% 55% 50%',
        squish: '60% 40% 50% 50% / 45% 55% 45% 55%',
      },
      boxShadow: {
        bubble: '0 10px 30px -10px rgba(0,0,0,0.18), inset 0 -6px 0 rgba(0,0,0,0.06)',
        pop: '0 6px 0 rgba(0,0,0,0.08), 0 14px 30px -8px rgba(0,0,0,0.18)',
        soft: '0 8px 24px -8px rgba(0,0,0,0.18)',
      },
      keyframes: {
        bob: {
          '0%, 100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-6px) rotate(1deg)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        pulseSoft: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        bob: 'bob 5s ease-in-out infinite',
        wiggle: 'wiggle 1.4s ease-in-out infinite',
        pulseSoft: 'pulseSoft 2.4s ease-in-out infinite',
        pop: 'pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
}
