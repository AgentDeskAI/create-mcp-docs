#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { CLI } from "./components/CLI.js";

const program = new Command();

program
  .name("create-mcp-docs")
  .description("Create a new MCP documentation server")
  .version("0.1.0")
  .argument("[project-name]", "Name of the project to create")
  .option(
    "-d, --directory <dir>",
    "Directory to create the project in",
    process.cwd()
  )
  .parse();

const options = program.opts();
const projectName = program.args[0];

// Start the Ink CLI interface
render(
  React.createElement(CLI, {
    projectName,
    directory: options.directory,
  })
);
