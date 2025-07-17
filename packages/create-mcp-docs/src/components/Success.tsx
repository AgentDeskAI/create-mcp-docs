import React from 'react';
import { Box, Text } from 'ink';
import type { ProjectConfig } from '../types.js';

interface SuccessProps {
  projectName: string;
}

export function Success({ projectName }: SuccessProps) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">
        🎉 Success!
      </Text>
      <Box marginTop={1}>
        <Text>
          Your MCP documentation server has been created at{" "}
          <Text bold>packages/{projectName}</Text>.
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Next steps:</Text>
        <Text>
          1. `cd` into your new project:{" "}
          <Text bold>cd packages/{projectName}</Text>
        </Text>
        <Text>2. Run `pnpm install`</Text>
        <Text>3. Run `pnpm build` to create your first index</Text>
        <Text>4. Run `pnpm start` to run your server</Text>
      </Box>
    </Box>
  );
} 