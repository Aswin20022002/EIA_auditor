import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#EAEDE7",
        panel: "#F4F6F1",
        ink: "#20302B",
        muted: "#5B6B62",
        hairline: "#C7CDC3",
        teal: {
          DEFAULT: "#1F5E56",
          dark: "#123E38",
        },
        ochre: {
          DEFAULT: "#C97A2B",
          light: "#E4A75B",
        },
        brick: {
          DEFAULT: "#A8402C",
          light: "#F1DED8",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
