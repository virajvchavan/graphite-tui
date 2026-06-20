import React from "react";
import { Box, Text } from "ink";

const KEYS: [string, string][] = [
  ["↑/k ↓/j", "move selection"],
  ["↵ or c", "checkout branch"],
  ["o / O", "open PR / stack on Graphite"],
  ["g", "open PR on GitHub"],
  ["s", "sync with trunk"],
  ["r", "restack"],
  ["S", "submit stack"],
  ["d", "delete branch (confirm)"],
  ["/", "fuzzy filter"],
  ["y", "copy PR url / branch name"],
  ["R", "refresh"],
  ["? ", "toggle this help"],
  ["q", "quit"],
];

export function HelpOverlay() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyan">
        Keybindings
      </Text>
      <Box height={1} />
      {KEYS.map(([k, desc]) => (
        <Box key={k}>
          <Box width={12}>
            <Text color="yellow">{k}</Text>
          </Box>
          <Text color="gray">{desc}</Text>
        </Box>
      ))}
      <Box height={1} />
      <Text color="gray">press ? or esc to close</Text>
    </Box>
  );
}
