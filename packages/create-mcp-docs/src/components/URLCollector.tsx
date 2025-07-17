import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from './TextInput.js';
import { validateURL, validateURLList } from '../types.js';

interface URLCollectorProps {
  onSubmit: (urls: string[]) => void;
}

export function URLCollector({ onSubmit }: URLCollectorProps) {
  const [urls, setUrls] = useState<string[]>([""]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [urlErrors, setUrlErrors] = useState<(string | null)[]>([null]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleUrlChange = (index: number, newUrl: string) => {
    const newUrls = [...urls];
    newUrls[index] = newUrl;
    setUrls(newUrls);
    
    // Clear error for this URL when user starts typing
    const newErrors = [...urlErrors];
    newErrors[index] = null;
    setUrlErrors(newErrors);
    setSubmitError(null);
  };

  const handleUrlSubmit = (index: number) => {
    const currentUrl = urls[index].trim();
    
    if (currentUrl !== "") {
      // Validate current URL
      const validation = validateURL(currentUrl);
      if (!validation.isValid) {
        const newErrors = [...urlErrors];
        newErrors[index] = validation.error || "Invalid URL";
        setUrlErrors(newErrors);
        return;
      }
    }
    
    if (index === urls.length - 1 && currentUrl !== "") {
      const newUrls = [...urls, ""];
      const newErrors = [...urlErrors, null];
      setUrls(newUrls);
      setUrlErrors(newErrors);
      setActiveIndex(newUrls.length - 1);
    }
  };

  useInput((input, key) => {
    if (key.return) {
      const finalUrls = urls.map((u) => u.trim()).filter(Boolean);
      const listValidation = validateURLList(finalUrls);
      
      if (!listValidation.isValid) {
        setSubmitError(listValidation.error || "Invalid URL list");
        return;
      }
      
      // Validate each individual URL
      let hasErrors = false;
      const newErrors = urls.map((url, index) => {
        if (url.trim() === "") return null;
        const validation = validateURL(url.trim());
        if (!validation.isValid) {
          hasErrors = true;
          return validation.error || "Invalid URL";
        }
        return null;
      });
      
      if (hasErrors) {
        setUrlErrors(newErrors);
        return;
      }
      
      setSubmitError(null);
      onSubmit(finalUrls);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>🔗 Add Documentation URLs</Text>
      {urls.map((url, index) => (
        <Box key={index} flexDirection="column">
          <Box>
            <Text>URL {index + 1}: </Text>
            <TextInput
              value={url}
              onChange={(newUrl) => handleUrlChange(index, newUrl)}
              onSubmit={() => handleUrlSubmit(index)}
              focus={index === activeIndex}
            />
          </Box>
          {urlErrors[index] && (
            <Box marginLeft={2}>
              <Text color="red">❌ {urlErrors[index]}</Text>
            </Box>
          )}
        </Box>
      ))}
      {submitError && (
        <Box marginTop={1}>
          <Text color="red">❌ {submitError}</Text>
        </Box>
      )}
      <Text dimColor>Press Enter when you're done.</Text>
    </Box>
  );
} 