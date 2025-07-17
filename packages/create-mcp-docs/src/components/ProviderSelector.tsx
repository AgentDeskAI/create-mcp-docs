import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { type SearchProvider } from "../types.js";

interface ProviderSelectorProps {
  onSelect: (provider: SearchProvider) => void;
}

export function ProviderSelector({ onSelect }: ProviderSelectorProps) {
  const items: { label: string; value: SearchProvider }[] = [
    {
      label:
        "Vectra (Vector Search) - Recommended for larger documentation sites.",
      value: "vectra",
    },
    {
      label:
        "FlexSearch (Keyword Search) - A lightweight option for smaller sites.",
      value: "flexsearch",
    },
  ];

  return (
    <Box flexDirection="column">
      <Text>Which search provider would you like to use?</Text>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
    </Box>
  );
} 