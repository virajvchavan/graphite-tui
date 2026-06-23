import React from "react";
import { Box, Text } from "ink";
import { ModalFrame, DetailRows, type DetailLine } from "./Modal.js";
import { colors } from "./theme.js";

interface Props {
  /** Headline question, e.g. "Delete branch?". */
  title: string;
  /** The thing being acted on, shown prominently (branch name / file path). */
  target?: string;
  /** Contextual facts (PR number, status, children, …). */
  details?: DetailLine[];
  /** Bullet list of what confirming will do. */
  consequences?: string[];
  /** Label for the confirm action, e.g. "Delete branch". */
  confirmLabel: string;
  width: number;
  height: number;
}

/**
 * Full-screen confirmation for a destructive action. Shows the target plus any
 * relevant context (so the user sees exactly what they're about to affect)
 * before committing. Confirmed with ↵, cancelled with n / esc.
 */
export function ConfirmOverlay({
  title,
  target,
  details,
  consequences,
  confirmLabel,
  width,
  height,
}: Props) {
  return (
    <ModalFrame width={width} height={height} borderColor={colors.closed}>
      <Text color={colors.closed} bold>
        ⚠ {"  "}
        {title}
      </Text>

      {target && (
        <Box marginTop={1}>
          <Text color={colors.warning} bold wrap="truncate-end">
            {target}
          </Text>
        </Box>
      )}

      <DetailRows details={details} />

      {consequences && consequences.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {consequences.map((c, i) => (
            <Box key={i}>
              <Text color={colors.dim}>• {c}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={colors.closed} bold>
          ↵ {confirmLabel}
        </Text>
        <Text color={colors.dim}>
          {"     "}
          <Text color={colors.keyHint}>n</Text> / <Text color={colors.keyHint}>esc</Text> cancel
        </Text>
      </Box>
    </ModalFrame>
  );
}
