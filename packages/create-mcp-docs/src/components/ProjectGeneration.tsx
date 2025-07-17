import React, { useState, useEffect } from "react";
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
      let spinner = ora();
      
      try {
        const templateConfig: TemplateConfig = {
          projectName,
          description,
          urls,
          providerType,
        };

        const template = getProjectTemplate(templateConfig);
        const projectPath = path.join(process.cwd(), "packages", template.name);

        spinner = ora("Creating project directories...").start();
        setStatus("Creating project directories...");
        await fs.mkdir(projectPath, { recursive: true });
        spinner.succeed("Project directories created");

        spinner = ora("Writing project files...").start();
        setStatus("Writing project files...");
        for (const [fileName, content] of Object.entries(template.files)) {
          const filePath = path.join(projectPath, fileName);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content);
        }
        spinner.succeed("Project files written");

        // Create root files if packages folder does not exist
        if (!(await fs.stat(path.join(process.cwd(), 'packages')).catch(() => false))) {
          spinner = ora("Creating monorepo root files...").start();
          setStatus("Creating monorepo root files...");
          for (const [fileName, content] of Object.entries(template.rootFiles)) {
            const filePath = path.join(process.cwd(), fileName);
            await fs.writeFile(filePath, content);
          }
          spinner.succeed("Monorepo root files created");
        }

        spinner = ora("Installing dependencies with pnpm...").start();
        setStatus("Installing dependencies with pnpm...");
        const installProcess = spawn("pnpm", ["install"], {
          cwd: process.cwd(),
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
    };

    generateProject();
  }, [projectName, description, urls, providerType, onComplete]);

  return <Text>{status}</Text>;
} 