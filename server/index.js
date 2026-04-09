import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 8787;
const isProd = process.env.NODE_ENV === "production";

app.use(express.json({ limit: "2mb" }));

if (!isProd) {
  app.use(cors({ origin: true }));
}

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    return res.status(500).json({
      error: { message: "Set ANTHROPIC_API_KEY in a .env file in the project root." },
    });
  }

  const {
    messages,
    system,
    model = "claude-sonnet-4-6",
    max_tokens = 4096,
  } = req.body;

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: { message: "Expected messages array." } });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens,
        system: system ?? "",
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: { message: e.message || "Request failed" } });
  }
});

if (isProd) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(
    isProd
      ? `App + API at http://localhost:${PORT}`
      : `API at http://localhost:${PORT} (Vite proxies /api here in dev)`
  );
});
