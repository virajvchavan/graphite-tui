import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { basename } from "node:path";

interface Props {
  repoRoot: string;
  trunk: string;
  busy: string | null;
}

export function Header({ repoRoot, trunk, busy }: Props) {
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Box>
        <Text bold>GRAPHITE: BRANCHES</Text>
        <Text color="gray">  {basename(repoRoot)} · {trunk}</Text>
      </Box>
      <Box>
        {busy ? (
          <Text color="cyan">
            <Spinner type="dots" /> {busy}
          </Text>
        ) : (
          <Text color="gray">press ? for help</Text>
        )}
      </Box>
    </Box>
  );
}
