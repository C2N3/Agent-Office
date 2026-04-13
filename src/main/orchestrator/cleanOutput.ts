/**
 * Clean raw PTY/terminal output for human-readable display.
 *
 * Strips:
 *   - All ANSI escape sequences (CSI, OSC, private mode like \x1b[?25l, etc.)
 *   - Stand-alone control characters (keeps \n, \r, \t)
 *   - Bracketed paste markers
 *
 * Then normalizes line endings, collapses excess blank lines, and trims
 * trailing whitespace per line.
 */

'use strict';

// ansi-regex (https://github.com/chalk/ansi-regex) — covers CSI, OSC, and most
// private-mode sequences. Inlined to avoid adding a dependency.
const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

// Lone ESC followed by a single byte (e.g. ESC = , ESC > , charset selectors).
const LONE_ESC_REGEX = /\x1B[@-Z\\-_]/g;

// C0 control chars except \t (\x09), \n (\x0A), \r (\x0D), plus DEL.
const CONTROL_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripAnsi(input) {
  if (!input) return '';
  return String(input)
    .replace(ANSI_REGEX, '')
    .replace(LONE_ESC_REGEX, '');
}

function cleanTerminalOutput(input) {
  if (!input) return '';
  let s = stripAnsi(input);

  // Normalize line endings.
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Drop remaining control characters.
  s = s.replace(CONTROL_REGEX, '');

  // Trim trailing whitespace on each line.
  s = s.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n');

  // Collapse 3+ blank lines into a single blank line.
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

module.exports = { cleanTerminalOutput, stripAnsi };
