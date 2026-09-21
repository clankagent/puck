// Generate application declarations from the actual public control definition.
export function codeControl(c) {
  return c.kind === "continuous"
    ? `control.continuous(${JSON.stringify(c.source)}, ${JSON.stringify(c.options)})`
    : c.kind === "gesture"
      ? `control.gesture(${JSON.stringify(c.input)}, ${JSON.stringify(c.options)})`
      : `control.interaction(${JSON.stringify({ ...c.options, value: "__nested_value__" }).replace(JSON.stringify("__nested_value__"), typeof c.options.value === "string" ? JSON.stringify(c.options.value) : codeControl(c.options.value))})`;
}
