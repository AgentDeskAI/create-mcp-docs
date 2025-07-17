import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface SelectorDetectionProps {
  urls: string[];
  onComplete: (data: { 
    contentSelector?: string; 
    linkSelector?: string;
    excludePatterns?: string[];
    includePatterns?: string[];
  }) => void;
  onError: (error: Error) => void;
}

interface DetectedSelectors {
  contentSelector: string;
  linkSelector?: string;
  confidence: number;
  fallbacks: string[];
}

export function SelectorDetection({ urls, onComplete, onError }: SelectorDetectionProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [detectedSelectors, setDetectedSelectors] = useState<DetectedSelectors | null>(null);
  const [currentStep, setCurrentStep] = useState<'detecting' | 'confirming' | 'customizing'>('detecting');
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    analyzeUrls();
  }, []);

  const analyzeUrls = async () => {
    try {
      setIsAnalyzing(true);
      
      // For now, use smart defaults based on common patterns
      // TODO: Integrate actual heuristics detection
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate analysis
      
      const result = {
        contentSelector: 'main',
        linkSelector: 'a[href^="/docs"]',
        confidence: 0.8,
        fallbacks: ['article', '.content', '.documentation']
      };

      setDetectedSelectors(result);
      setCurrentStep('confirming');
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Failed to detect selectors'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  useInput((input, key) => {
    if (currentStep === 'confirming') {
      if (key.return || input === 'y' || input === 'Y') {
        // Accept detected selectors
        onComplete({
          contentSelector: detectedSelectors?.contentSelector,
          linkSelector: detectedSelectors?.linkSelector,
        });
      } else if (input === 'n' || input === 'N') {
        setCurrentStep('customizing');
        setUseCustom(true);
      }
    } else if (currentStep === 'customizing' && key.return) {
      // For now, just proceed with defaults
      onComplete({});
    }
  });

  if (isAnalyzing) {
    return (
      <Box flexDirection="column">
        <Text bold>🔍 Smart Selector Detection</Text>
        <Text dimColor>Analyzing your documentation sites...</Text>
        
        <Box marginTop={1}>
          <Text>🔎 Analyzing: {urls[0]}</Text>
          <Text dimColor>This may take a moment...</Text>
        </Box>
      </Box>
    );
  }

  if (currentStep === 'confirming' && detectedSelectors) {
    return (
      <Box flexDirection="column">
        <Text bold>🎯 Detected Selectors</Text>
        <Text dimColor>We automatically detected these selectors for your content:</Text>
        
        <Box marginTop={1} flexDirection="column">
          <Text>
            Content selector: <Text color="green">{detectedSelectors.contentSelector}</Text>
          </Text>
          {detectedSelectors.linkSelector && (
            <Text>
              Link selector: <Text color="green">{detectedSelectors.linkSelector}</Text>
            </Text>
          )}
          <Text>
            Confidence: <Text color={detectedSelectors.confidence > 0.7 ? 'green' : 'yellow'}>
              {Math.round(detectedSelectors.confidence * 100)}%
            </Text>
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text>Use these selectors? (Y/n): </Text>
        </Box>
      </Box>
    );
  }

  if (currentStep === 'customizing') {
    return (
      <Box flexDirection="column">
        <Text bold>⚙️ Custom Configuration</Text>
        <Text dimColor>You can customize selectors later in the generated project.</Text>
        
        <Box marginTop={1}>
          <Text color="green">✓ Will use smart defaults</Text>
          <Text dimColor>Press Enter to continue</Text>
        </Box>
      </Box>
    );
  }

  return null;
} 