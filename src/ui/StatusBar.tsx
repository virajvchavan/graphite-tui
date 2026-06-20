import React from "react";
import { Box, Text } from "ink";

interface Props {
  message: { text: string; ok: boolean } | null;
  /** Keyboard hints as [key, label] pairs. */
  hint: Array<[string, string]>;
}

export function StatusBar({ message, hint }: Props) {
  return (
    <Box marginTop={1} flexDirection="column">
      {message && (
        <Text color={message.ok ? "green" : "red"} wrap="truncate-end">
          {message.ok ? "✓ " : "✗ "}
          {message.text}
        </Text>
      )}
      <Text wrap="truncate-end">
        {hint.map(([key, label], i) => (
          <Text key={key}>
            {i > 0 && <Text color="gray">{" · "}</Text>}
            <Text color="white" bold>
              {key}
            </Text>
            <Text color="gray">{" " + label}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
