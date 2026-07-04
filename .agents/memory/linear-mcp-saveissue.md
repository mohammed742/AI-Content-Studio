---
name: Linear MCP saveIssue status field
description: Correct parameter name for changing an issue's status via mcpLinearMCP_saveIssue
---

`mcpLinearMCP_saveIssue` takes `state` (a status name or ID string, e.g. `"In Progress"`), not `status` or `stateId`. Passing either of the latter two raises an "Additional properties are not allowed" error.

**Why:** The tool schema names workflow-state changes `state` to match Linear's own terminology, even though issue read results (from `listIssues`/`getIssue`) surface the current value under a `status` field — the read and write field names differ.

**How to apply:** When moving a Linear issue between statuses (Backlog → In Progress, etc.), call `mcpLinearMCP_saveIssue({ id, state: "<status name>" })`. Use `mcpLinearMCP_listIssueStatuses({ team })` to confirm valid status names for the team if unsure.
