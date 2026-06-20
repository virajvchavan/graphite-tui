import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { basename } from "node:path";

interface Props {
  repoRoot: string;
  busy: string | null;
  /** Match the content panels' width so the right-side hint aligns with their
   * right edge instead of the terminal edge. */
  width: number;
}

export function Header({ repoRoot, busy, width }: Props) {
  return (
    <Box justifyContent="space-between" marginBottom={1} width={width}>
      <Box>
        <Text bold>Graphite: {basename(repoRoot)}</Text>
      </Box>
      <Box>
        {busy ? (
          <Text color="cyan">
            <Spinner type="dots" /> {busy}
          </Text>
        ) : (
          <Text wrap="truncate-end">
            <Text color="white" bold>
              R
            </Text>
            <Text color="gray">{" to refresh"}</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
