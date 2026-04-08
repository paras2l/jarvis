import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          50: "#f6f7f9",
          100: "#edf0f4",
          200: "#dce2ea",
          800: "#1a202c",
          900: "#10151f"
        },
        accent: {
          DEFAULT: "#0ea5a4",
          strong: "#0a7f7f"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(0, 0, 0, 0.14)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;
