export interface ParsedMessage {
  id: string;
  timestamp: number;
  sender: string;
  receiver?: string;
  content: string;
  sessionId: string;
  raw: string;
}

// Strip ANSI escape sequences from terminal output
function stripAnsi(text: string): string {
  // Matches all common ANSI escape sequences (colors, cursor movement, etc.)
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g, '');
}

// Message patterns from Claude Code's agent team communication
const PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => { sender: string; receiver?: string; content: string } | null;
}> = [
  // @agentname> message content (real Claude Code agent output)
  {
    regex: /^@([\w-]+)>\s*(.+)/,
    extract: (m) => ({ sender: m[1], content: m[2].trim() }),
  },
  // @agentname → @targetname: message (SendMessage between agents)
  {
    regex: /^@([\w-]+)\s*→\s*@([\w-]+):\s*(.+)/,
    extract: (m) => ({ sender: m[1], receiver: m[2], content: m[3].trim() }),
  },
  // [AgentName → TargetName]: message
  {
    regex: /^\[([\w][\w\s-]*?)\s*→\s*([\w][\w\s-]*?)\]:\s*(.+)/,
    extract: (m) => ({ sender: m[1].trim(), receiver: m[2].trim(), content: m[3].trim() }),
  },
  // Sending message to AgentName: message
  {
    regex: /^Sending message to ([\w][\w\s-]*?):\s*(.+)/,
    extract: (m) => ({ sender: 'lead', receiver: m[1].trim(), content: m[2].trim() }),
  },
  // Message from AgentName: message
  {
    regex: /^Message from ([\w][\w\s-]*?):\s*(.+)/,
    extract: (m) => ({ sender: m[1].trim(), content: m[2].trim() }),
  },
  // → AgentName: message
  {
    regex: /^→\s*([\w][\w\s-]*?):\s*(.+)/,
    extract: (m) => ({ sender: m[1].trim(), content: m[2].trim() }),
  },
];

const seenHashes = new Set<string>();
let messageCounter = 0;

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}

export function parseMessages(text: string, sessionId: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  // Strip ANSI codes before splitting into lines
  const clean = stripAnsi(text);
  const lines = clean.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const pattern of PATTERNS) {
      const match = trimmed.match(pattern.regex);
      if (!match) continue;

      const extracted = pattern.extract(match);
      if (!extracted) continue;

      const { sender, receiver, content } = extracted;

      // Deduplicate
      const dedupKey = hashContent(`${sender}:${receiver || ''}:${content}`);
      if (seenHashes.has(dedupKey)) break;
      seenHashes.add(dedupKey);

      // Keep hash set bounded
      if (seenHashes.size > 5000) {
        const arr = Array.from(seenHashes);
        for (let i = 0; i < 1000; i++) {
          seenHashes.delete(arr[i]);
        }
      }

      messages.push({
        id: `msg-${++messageCounter}`,
        timestamp: Date.now(),
        sender,
        receiver,
        content,
        sessionId,
        raw: trimmed,
      });

      break; // Only match first pattern per line
    }
  }

  return messages;
}

export function resetParser(): void {
  seenHashes.clear();
  messageCounter = 0;
}
