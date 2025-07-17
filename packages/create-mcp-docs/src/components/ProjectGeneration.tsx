import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import path from "path";
import ora from "ora";
import { getProjectTemplate, TemplateConfig } from "../utils/templates.js";
import { type SearchProvider } from "../types.js";

interface ProjectGenerationProps {
  projectName: string;
  description: string;
  urls: string[];
  providerType: SearchProvider;
  onComplete: () => void;
}

export function ProjectGeneration({
  projectName,
  description,
  urls,
  providerType,
  onComplete,
}: ProjectGenerationProps) {
  const [status, setStatus] = useState("Starting project generation...");

  useEffect(() => {
    const generateProject = async () => {
      let spinner = ora("Starting project generation...").start();
      
      try {
        const config: TemplateConfig = {
          projectName,
          description,
          urls,
          providerType,
          isLocalDevelopment: false,
        };

        // Correctly create the full path for the new project
        const projectPath = path.join(process.cwd(), projectName);
        await fs.mkdir(projectPath, { recursive: true });

        setStatus("Generating project files...");
        const templates = getProjectTemplate(config);
        for (const template of Object.values(templates)) {
          const dir = path.dirname(template.filePath);
          if (dir !== ".") {
            await fs.mkdir(path.join(projectPath, dir), { recursive: true });
          }
          await fs.writeFile(
            path.join(projectPath, template.filePath),
            template.content
          );
        }
        spinner.succeed("Project directories and files created");

        spinner = ora("Installing dependencies with pnpm...").start();
        setStatus("Installing dependencies with pnpm...");
        try {
          // Correctly create the full path for the new project
          const projectPath = path.join(process.cwd(), projectName);
          await fs.mkdir(projectPath, { recursive: true });

          setStatus("Generating project files...");
          const templates = getProjectTemplate(config);
          for (const template of Object.values(templates)) {
            const dir = path.dirname(template.filePath);
            if (dir !== ".") {
              await fs.mkdir(path.join(projectPath, dir), { recursive: true });
            }
            await fs.writeFile(
              path.join(projectPath, template.filePath),
              template.content
            );
          }
          spinner.succeed("Project directories and files created");

          spinner = ora("Installing dependencies with pnpm...").start();
          setStatus("Installing dependencies with pnpm...");
          const installProcess = spawn("pnpm", ["install"], {
            cwd: projectPath, // Use the new project's path
            stdio: "pipe",
          });

          let errorOutput = "";
          installProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
          });

          // Handle spawn errors (e.g., pnpm not found)
          installProcess.on("error", (error) => {
            spinner.fail("Failed to start pnpm process");
            setStatus(
              `Error starting pnpm process: ${error.message}\nPlease ensure pnpm is installed and in your PATH.`
            );
          });

          installProcess.on("close", (code) => {
            if (code === 0) {
              spinner.succeed("Dependencies installed successfully");
              setStatus("✅ Project generated successfully!");
              setTimeout(onComplete, 1000);
            } else {
              spinner.fail("Failed to install dependencies");
              setStatus(
                `Error installing dependencies. Exit code: ${code}\n${errorOutput}`
              );
            }
          });
        } catch (error) {
          spinner.fail("Project generation failed");
          if (error instanceof Error) {
            setStatus(`An error occurred: ${error.message}`);
          } else {
            setStatus("An unknown error occurred during project generation.");
          }
        }
      } catch (error) {
        spinner.fail("Project generation failed");
        if (error instanceof Error) {
          setStatus(`An error occurred: ${error.message}`);
        } else {
          setStatus("An unknown error occurred during project generation.");
        }
      }
    };

    generateProject();
  }, [projectName, description, urls, providerType, onComplete]);

  return <Text>{status}</Text>;
} 