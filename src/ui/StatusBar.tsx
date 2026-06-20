import React from "react";
import { Box, Text } from "ink";

interface Props {
  currentBranch: string | null;
  message: { text: string; ok: boolean } | null;
  hint: string;
}

export function StatusBar({ currentBranch, message, hint }: Props) {
  return (
    <Box marginTop={1} flexDirection="column">
      {message && (
        <Text color={message.ok ? "green" : "red"} wrap="truncate-end">
          {message.ok ? "✓ " : "✗ "}
          {message.text}
        </Text>
      )}
      <Box justifyContent="space-between">
        <Text color="gray" wrap="truncate-end">
          on <Text color="cyan">{currentBranch ?? "(detached)"}</Text>
        </Text>
        <Text color="gray">{hint}</Text>
      </Box>
    </Box>
  );
}
