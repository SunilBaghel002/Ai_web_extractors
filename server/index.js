import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get available providers
app.get("/api/providers", (req, res) => {
  res.json([
    { id: "groq", name: "Groq", available: !!process.env.GROQ_API_KEY },
    {
      id: "gemini",
      name: "Google Gemini",
      available: !!process.env.GEMINI_API_KEY,
    },
    { id: "ollama", name: "Ollama", available: true },
    { id: "openai", name: "OpenAI", available: !!process.env.OPENAI_API_KEY },
  ]);
});

// Main extraction endpoint
app.post("/api/extract", async (req, res) => {
  try {
    const config = req.body;

    console.log(
      "Received extraction request:",
      JSON.stringify(config, null, 2)
    );

    // Write config to input.json
    const inputPath = path.join(__dirname, "../src/input.json");
    fs.writeFileSync(inputPath, JSON.stringify(config, null, 2));

    // Run the extractor
    const extractorPath = path.join(__dirname, "../src/main.js");

    const result = await runExtractor(extractorPath);

    // Read results from dataset
    const datasetPath = path.join(__dirname, "../storage/datasets/default");
    const results = [];

    if (fs.existsSync(datasetPath)) {
      const files = fs
        .readdirSync(datasetPath)
        .filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const data = JSON.parse(
          fs.readFileSync(path.join(datasetPath, file), "utf-8")
        );
        results.push(data);
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Extraction error:", error);
    res.status(500).json({
      error: "Extraction failed",
      message: error.message,
    });
  }
});

// Run extractor as child process
function runExtractor(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, APIFY_IS_AT_HOME: "0" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
});
