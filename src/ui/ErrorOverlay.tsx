import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

interface Props {
  /** Full command output to display. */
  text: string;
  /** First visible line index. */
  scrollOffset: number;
  /** Number of output lines that fit on screen. */
  visible: number;
}

/**
 * Full-screen, scrollable view of a failed command's complete output. The last
 * action's `detail` is shown verbatim (every line of stdout/stderr) so multi-line
 * gt errors — conflicts, rebase guidance — aren't truncated to one line.
 */
export function ErrorOverlay({ text, scrollOffset, visible }: Props) {
  const lines = text.split("\n");
  const start = Math.max(0, Math.min(scrollOffset, Math.max(0, lines.length - visible)));
  const window = lines.slice(start, start + visible);
  const more = lines.length - (start + window.length);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.closed}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={colors.closed}>
        Command failed{lines.length > visible ? ` (${lines.length} lines)` : ""}
      </Text>
      <Box height={1} />
      {start > 0 && <Text color={colors.dim}>↑ {start} more</Text>}
      {window.map((line, i) => (
        <Text key={start + i} wrap="truncate-end">
          {line || " "}
        </Text>
      ))}
      {more > 0 && <Text color={colors.dim}>↓ {more} more</Text>}
      <Box height={1} />
      <Text color={colors.dim}>↑/↓ or j/k scroll · esc/e/q close</Text>
    </Box>
  );
}
