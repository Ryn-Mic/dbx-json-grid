import { jsonLanguage } from "@codemirror/lang-json";
import type { JsonPath } from "./json";

export function parseSource(text: string) {
  const tree = jsonLanguage.parser.parse(text);
  let valid = true;
  tree.iterate({
    enter(node) {
      if (node.type.isError) valid = false;
    },
  });
  return valid ? tree : null;
}
/** Resolve by syntax and original path, never by value text (which need not be unique). */
export function sourceRange(
  text: string,
  tree: ReturnType<typeof parseSource>,
  path: JsonPath,
): { from: number; to: number } | null {
  type SourceNode = NonNullable<
    NonNullable<ReturnType<typeof parseSource>>["topNode"]["firstChild"]
  >;
  const root = tree?.topNode.firstChild;
  if (!root) return null;
  let node: SourceNode = root;
  let from = node.from;
  for (const key of path) {
    if (node.name === "Object" && typeof key === "string") {
      let property: SourceNode | null = node.firstChild;
      while (property) {
        const name =
          property.name === "Property"
            ? property.getChild("PropertyName")
            : null;
        if (name && JSON.parse(text.slice(name.from, name.to)) === key) break;
        property = property.nextSibling;
      }
      if (!property || !property.lastChild) return null;
      from = property.from;
      node = property.lastChild;
    } else if (node.name === "Array" && typeof key === "number") {
      let child = node.firstChild,
        index = 0;
      while (child) {
        if (
          [
            "Object",
            "Array",
            "String",
            "Number",
            "True",
            "False",
            "Null",
          ].includes(child.name)
        ) {
          if (index++ === key) break;
        }
        child = child.nextSibling;
      }
      if (!child) return null;
      node = child;
      from = child.from;
    } else return null;
  }
  return { from, to: node.to };
}
