import React from "react";
import { Box, Text } from "ink";

interface Props {
  message: string;
}

export function ConfirmDialog({ message }: Props) {
  return (
    <Box
      borderStyle="round"
      borderColor="red"
      paddingX={2}
      flexDirection="column"
    >
      <Text color="red" bold>
        {message}
      </Text>
      <Text color="gray">
        press <Text color="yellow">y</Text> to confirm,{" "}
        <Text color="yellow">n</Text>/esc to cancel
      </Text>
    </Box>
  );
}
