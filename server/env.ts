const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  port: Number(process.env.PORT ?? 8462),
  nodeEnv,
  isProduction: nodeEnv === "production",
};
