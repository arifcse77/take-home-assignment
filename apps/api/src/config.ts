export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  storageDir: process.env.STORAGE_DIR ?? "./data/documents",
  openAiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  mockLlm: process.env.MOCK_LLM === "1" || !process.env.OPENAI_API_KEY,
  fixturesDir: process.env.FIXTURES_DIR ?? "",
};