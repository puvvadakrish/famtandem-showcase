import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        paper: "#f7f4ed",
        cream: "#fffdf8",
        moss: "#315f4b",
        sage: "#dfe8dc",
        clay: "#a65f45",
        coral: "#cf4f3d",
        cranberry: "#8f2f3c",
        amber: "#c97f1a",
        sky: "#dcebf0",
        oat: "#efe7da",
        line: "#ddd4c5",
        graphite: "#52606d"
      },
      boxShadow: {
        soft: "0 18px 50px rgb(49 95 75 / 0.10)",
        inset: "inset 0 1px 0 rgb(255 255 255 / 0.72)"
      }
    }
  },
  plugins: []
};

export default config;
