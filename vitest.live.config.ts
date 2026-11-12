import baseConfig from "./vitest.config";

const liveConfig = {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: ["tests/live/**/*.{test,spec}.{ts,tsx}"]
  }
};

export default liveConfig;
