/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        savvy: {
          green: '#10B981',
          'green-dark': '#059669',
          dark: '#1F2937',
          light: '#F3F4F6',
        },
      },
    },
  },
  plugins: [],
};

