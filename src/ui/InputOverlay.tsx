import React from "react";
import { Box, Text } from "ink";
import { ModalFrame, DetailRows, type DetailLine } from "./Modal.js";
import { colors } from "./theme.js";

interface Props {
  /** Prompt headline, e.g. "New commit message". */
  title: string;
  /** Current input text. */
  value: string;
  /** Contextual facts (target branch, staged file count, …). */
  details?: DetailLine[];
  width: number;
  height: number;
}

/**
 * Full-screen single-line text prompt (commit message / new-branch name). Like
 * the confirm overlay it takes over the whole view so the user focuses only on
 * the input, with relevant context shown above the field.
 */
export function InputOverlay({ title, value, details, width, height }: Props) {
  return (
    <ModalFrame width={width} height={height} borderColor={colors.heading}>
      <Text color={colors.heading} bold>
        {title}
      </Text>

      <DetailRows details={details} />

      <Box marginTop={1}>
        <Text color={colors.dim}>› </Text>
        <Text color={colors.text}>{value}</Text>
        <Text color={colors.dim}>▏</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.dim}>
          <Text color={colors.keyHint}>↵</Text> submit{"     "}
          <Text color={colors.keyHint}>esc</Text> cancel
        </Text>
      </Box>
    </ModalFrame>
  );
}
