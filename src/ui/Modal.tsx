import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

/** One labeled fact shown in a modal's context block. */
export interface DetailLine {
  label: string;
  value?: string;
  /** Optional color for the value (e.g. a PR-status badge color). */
  color?: string;
  /** Pre-rendered value, used instead of `value` when it needs custom styling
   * (e.g. green/red diff counts). */
  node?: React.ReactNode;
}

interface FrameProps {
  /** Full terminal width — the frame centers its dialog within it. */
  width: number;
  /** Full frame height — the frame centers its dialog vertically. */
  height: number;
  borderColor: string;
  children: React.ReactNode;
}

/**
 * Centers a bordered dialog box on an otherwise-empty full screen. Used by the
 * confirm/input overlays so a blocking prompt takes over the whole view — the
 * user can't act on anything else, so nothing else competes for attention.
 */
export function ModalFrame({ width, height, borderColor, children }: FrameProps) {
  const dialogWidth = Math.min(76, Math.max(40, width - 8));
  return (
    <Box
      width={width}
      height={height}
      justifyContent="center"
      alignItems="center"
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={2}
        paddingY={1}
        width={dialogWidth}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Renders a label/value context block (aligned labels), or nothing if empty. */
export function DetailRows({ details }: { details?: DetailLine[] }) {
  if (!details || details.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {details.map((d, i) => (
        <Box key={i}>
          <Box width={14} flexShrink={0}>
            <Text color={colors.dim}>{d.label}</Text>
          </Box>
          {d.node ?? (
            <Text color={d.color} wrap="truncate-end">
              {d.value}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
