import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

interface Props {
  message: { text: string; ok: boolean } | null;
  /** Keyboard hints as [key, label] pairs. */
  hint: Array<[string, string]>;
}

export function StatusBar({ message, hint }: Props) {
  return (
    <Box marginTop={1} flexDirection="column">
      {message && (
        <Text color={message.ok ? colors.approved : colors.closed} wrap="truncate-end">
          {message.ok ? "✓ " : "✗ "}
          {message.text}
        </Text>
      )}
      <Text wrap="truncate-end">
        {hint.map(([key, label], i) => (
          <Text key={key}>
            {i > 0 && <Text color={colors.dim}>{" · "}</Text>}
            <Text color={colors.text} bold>
              {key}
            </Text>
            <Text color={colors.dim}>{" " + label}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
