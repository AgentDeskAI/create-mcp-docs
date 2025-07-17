import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from './TextInput.js';
import { validateProjectName, validateDescription } from '../types.js';

interface ProjectSetupProps {
  onSubmit: (name: string, description: string) => void;
  projectName?: string;
}

export function ProjectSetup({
  onSubmit,
  projectName: initialProjectName,
}: ProjectSetupProps) {
  const [name, setName] = useState(initialProjectName || '');
  const [description, setDescription] = useState('');
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProjectName) {
      setIsDescriptionFocused(true);
    }
  }, [initialProjectName]);

  const handleNameSubmit = () => {
    const validation = validateProjectName(name);
    if (!validation.isValid) {
      setNameError(validation.error || "Invalid project name");
      return;
    }
    setNameError(null);
    setIsDescriptionFocused(true);
  };

  const handleDescriptionSubmit = () => {
    const nameValidation = validateProjectName(name);
    if (!nameValidation.isValid) {
      setNameError(nameValidation.error || 'Invalid project name');
      return;
    }
    setNameError(null);

    const descValidation = validateDescription(description);
    if (!descValidation.isValid) {
      setDescError(descValidation.error || 'Invalid description');
      return;
    }
    setDescError(null);
    onSubmit(name, description);
  };

  return (
    <Box flexDirection="column">
      <Text bold>📝 Project Setup</Text>
      {!initialProjectName && (
        <Box marginTop={1}>
          <Text>Enter project name: </Text>
          <TextInput
            value={name}
            onChange={setName}
            focus={!isDescriptionFocused}
            onSubmit={handleNameSubmit}
          />
        </Box>
      )}
      {nameError && (
        <Box marginTop={1}>
          <Text color="red">❌ {nameError}</Text>
        </Box>
      )}
      {isDescriptionFocused && (
        <Box marginTop={1}>
          <Text>Enter description (required): </Text>
          <TextInput
            value={description}
            onChange={setDescription}
            focus={isDescriptionFocused}
            onSubmit={handleDescriptionSubmit}
          />
        </Box>
      )}
      {descError && (
        <Box marginTop={1}>
          <Text color="red">❌ {descError}</Text>
        </Box>
      )}
    </Box>
  );
} 