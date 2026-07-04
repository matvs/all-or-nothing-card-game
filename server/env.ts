/** Runtime configuration, read once from the environment. */
export const env = {
  port: Number(process.env.PORT ?? 8462),
  isProduction: process.env.NODE_ENV === "production",
};
