import type { Request, Response } from "express";

// AI controller using Ollama
export const generateProjectDescription = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: "User not authenticated" }
      });
    }

    const { projectName, projectType } = req.body;

    if (!projectName) {
      return res.status(400).json({
        success: false,
        error: { message: "projectName is required" },
      });
    }

    console.log("Generating description for:", projectName);

    const prompt = `Project name: ${projectName}
Project type: ${projectType || "Web application"}

Write a concise, professional project description (3-4 sentences). Focus on the problem it solves and its key features. Avoid repetition and buzzwords.`;

    // Test Ollama connection first
    let ollamaResponse;
    try {
      ollamaResponse = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "phi3:latest",// Change this to your installed model
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 150,
          }
        }),
      });
    } catch (fetchError: any) {
      console.error("Ollama connection error:", fetchError);
      return res.status(500).json({
        success: false,
        error: {
          message: "Cannot connect to Ollama. Make sure Ollama is running with 'ollama serve'"
        },
      });
    }

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error("Ollama API error:", ollamaResponse.status, errorText);

      if (ollamaResponse.status === 404) {
        return res.status(500).json({
          success: false,
          error: {
            message: "Model not found. Please install the model with 'ollama pull llama3.2'"
          },
        });
      }

      throw new Error(`Ollama API error: ${ollamaResponse.status}`);
    }

    const data = await ollamaResponse.json();
    const description = data.response?.trim();

    if (!description) {
      return res.status(500).json({
        success: false,
        error: { message: "AI generated empty response" },
      });
    }

    console.log("Generated description:", description);

    return res.status(200).json({
      success: true,
      description,
    });
  } catch (error: any) {
    console.error("AI generation error:", error);

    if (error.message?.includes("connect") || error.code === "ECONNREFUSED") {
      return res.status(500).json({
        success: false,
        error: { message: "Ollama service is not running. Please start Ollama with 'ollama serve'" },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        message: error?.message || "Failed to generate project description",
      },
    });
  }
};