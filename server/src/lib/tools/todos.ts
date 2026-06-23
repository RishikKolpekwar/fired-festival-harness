// Agent-facing todo tools. "add to my todo: build a crypto wallet" → add_todo.
// This is the general project/task store; people-to-contact go to add_outreach.
// Open todos resurface in the morning brief until marked done.
import { addTodo, listTodos, completeTodo } from "../todos.js";
import type { Tool } from "../harness/types.js";

export const addTodoTool: Tool<{ title: string; detail?: string; tag?: string; dueDate?: string }> = {
  name: "add_todo",
  description:
    "Add a personal todo or project task to the user's persistent to-do list (e.g. 'add to my todo: build a crypto wallet from scratch'). Use this for ANY task, reminder, or project that is NOT about contacting a specific person (people go to add_outreach). If the user gives a specific date ('remind me on June 20', 'by friday'), pass `dueDate` as YYYY-MM-DD — a dated todo only surfaces in the brief on/around that date, not every day. Undated todos resurface daily until done. You CAN do this — never tell the user there is no todo list.",
  parameters: {
    title: { type: "string", description: "The task, short and clear (e.g. 'build a crypto wallet from scratch')", required: true },
    detail: { type: "string", description: "Optional extra context, scope, or notes" },
    tag: { type: "string", description: "Optional grouping label (e.g. 'project', 'errand', 'learning')" },
    dueDate: { type: "string", description: "Optional due/reminder date as YYYY-MM-DD. Set this when the user names a specific date so it doesn't nag every day." },
  },
  effect: "write",
  async execute({ title, detail, tag, dueDate }) {
    const t = addTodo({ title, detail, tag, dueDate });
    const when = t.dueDate ? ` it will surface in your brief around ${t.dueDate}.` : " it will show in your morning brief until you mark it done.";
    return { ok: true, data: { id: t.id, title: t.title, status: t.status, dueDate: t.dueDate }, error: null, modelText: `added to your todo list: "${t.title}".${when}` };
  },
};

export const listTodosTool: Tool<{ status?: "open" | "done" }> = {
  name: "list_todos",
  description: "List the user's todos. Defaults to open todos. Use to answer 'what's on my todo list' or before claiming a task isn't tracked.",
  parameters: {
    status: { type: "string", description: "'open' (default) or 'done'" },
  },
  effect: "read",
  async execute({ status }) {
    const todos = listTodos(status ?? "open");
    const lines = todos.map((t) => `- ${t.title}${t.tag ? ` [${t.tag}]` : ""}${t.detail ? ` — ${t.detail}` : ""}`).join("\n");
    return { ok: true, data: { count: todos.length, todos }, error: null, modelText: todos.length ? `${todos.length} ${status ?? "open"} todo(s):\n${lines}` : `no ${status ?? "open"} todos.` };
  },
};

export const completeTodoTool: Tool<{ id?: string; title?: string }> = {
  name: "complete_todo",
  description: "Mark a todo done by its id, or by a title match if no id is given. Removes it from the morning brief.",
  parameters: {
    id: { type: "string", description: "The todo id (preferred)" },
    title: { type: "string", description: "A title substring to match if you don't have the id" },
  },
  effect: "write",
  async execute({ id, title }) {
    let targetId = id;
    if (!targetId && title) {
      const match = listTodos("open").find((t) => t.title.toLowerCase().includes(title.toLowerCase()));
      targetId = match?.id;
    }
    if (!targetId) return { ok: false, data: null, error: "no matching open todo found", signals: [] };
    const ok = completeTodo(targetId);
    return ok ? { ok: true, data: { id: targetId }, error: null, modelText: "marked it done." } : { ok: false, data: null, error: "todo not found", signals: [] };
  },
};
