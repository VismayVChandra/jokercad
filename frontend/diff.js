// A line-by-line diff between two versions of generated code, for the
// Compare tool. Longest-common-subsequence (Myers-equivalent for the line
// granularity used here): O(n*m), fine for scripts of a few hundred lines.

/** Returns a list of {type: "same" | "add" | "remove", line}, oldest to newest. */
export function diffLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = la.length;
  const m = lb.length;
  // dp[i][j] = length of the longest common subsequence of la[i:] and lb[j:].
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (la[i] === lb[j]) {
      ops.push({ type: "same", line: la[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", line: la[i] });
      i++;
    } else {
      ops.push({ type: "add", line: lb[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", line: la[i++] });
  while (j < m) ops.push({ type: "add", line: lb[j++] });
  return ops;
}

/** Whether two diff ops represent any real change (not just a no-op on equal text). */
export function hasChanges(ops) {
  return ops.some((op) => op.type !== "same");
}
