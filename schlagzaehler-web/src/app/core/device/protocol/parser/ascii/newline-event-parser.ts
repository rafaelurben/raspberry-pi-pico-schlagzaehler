/**
 * Buffers incoming text chunks and extracts complete newline-delimited events.
 *
 * Handles both LF (\n) and CRLF (\r\n) line endings, preserves partial lines
 * across chunk boundaries, and ignores empty lines.
 */
export class NewlineEventParser {
  private buffer = '';

  /**
   * Appends an incoming decoded string chunk to the buffer,
   * extracts any complete lines (terminated by \n or \r\n),
   * and preserves the incomplete remainder for subsequent chunks.
   *
   * Empty lines (e.g. \n\n or \r\n\r\n) are explicitly ignored.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      // Handle CRLF by removing trailing carriage return
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }

      // Explicit decision: ignore empty lines
      if (line.length > 0) {
        lines.push(line);
      }

      newlineIndex = this.buffer.indexOf('\n');
    }

    return lines;
  }

  /**
   * Flushes any unparsed content remaining in the buffer (stripping trailing \r).
   * Useful when a stream closes or disconnects.
   */
  flush(): string[] {
    let remainder = this.buffer;
    this.buffer = '';

    if (remainder.endsWith('\r')) {
      remainder = remainder.slice(0, -1);
    }

    return remainder.length > 0 ? [remainder] : [];
  }

  /**
   * Clears the current buffer.
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * Gets the current unparsed remainder in the buffer.
   */
  get buffered(): string {
    return this.buffer;
  }
}
