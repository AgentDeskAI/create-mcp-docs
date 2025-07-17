import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { ProjectSetup } from './ProjectSetup.js';
import { URLCollector } from './URLCollector.js';
import { ProviderSelector } from './ProviderSelector.js';
import { ProjectGeneration } from './ProjectGeneration.js';
import { Success } from './Success.js';
import { type SearchProvider } from '../types.js';

export interface CLIProps {
  projectName?: string;
  directory: string;
}

type Step =
  | "projectSetup"
  | "urlCollector"
  | "providerSelector"
  | "generating"
  | "success";

export function CLI() {
  const [step, setStep] = useState<Step>("projectSetup");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [providerType, setProviderType] = useState<SearchProvider>("vectra");

  const handleProjectSetupSubmit = (name: string, desc: string) => {
    setProjectName(name);
    setDescription(desc);
    setStep("urlCollector");
  };

  const handleUrlCollectorSubmit = (collectedUrls: string[]) => {
    setUrls(collectedUrls);
    setStep("providerSelector");
  };

  const handleProviderSelect = (provider: "vectra" | "flexsearch") => {
    setProviderType(provider);
    setStep("generating");
  };

  return (
    <Box flexDirection="column">
      {step === "projectSetup" && (
        <ProjectSetup onSubmit={handleProjectSetupSubmit} />
      )}
      {step === "urlCollector" && (
        <URLCollector onSubmit={handleUrlCollectorSubmit} />
      )}
      {step === "providerSelector" && (
        <ProviderSelector onSelect={handleProviderSelect} />
      )}
      {step === "generating" && (
        <ProjectGeneration
          projectName={projectName}
          description={description}
          urls={urls}
          providerType={providerType}
          onComplete={() => setStep("success")}
        />
      )}
      {step === "success" && <Success projectName={projectName} />}
    </Box>
  );
} 