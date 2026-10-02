import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

test("Express route registrations forward asynchronous failures", () => {
  const root = path.resolve(__dirname, "..");
  const files = [path.join(root, "server.ts"), ...fs.readdirSync(path.join(root, "routes")).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => path.join(root, "routes", name))];
  const unguarded: string[] = [];
  let registrations = 0;
  for (const filename of files) {
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          ["app", "router"].includes(node.expression.expression.getText(source)) &&
          ["get", "post", "put", "patch", "delete", "use", "all", "head", "options"].includes(node.expression.name.text)) {
        registrations++;
        for (const arg of node.arguments) {
          if ((ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) && arg.parameters.length <= 3 &&
              arg.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
            unguarded.push(`${path.basename(filename)}:${source.getLineAndCharacterOfPosition(arg.getStart(source)).line + 1}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(registrations > 100, "Check must inspect the registered API surface");
  assert.deepEqual(unguarded, [], "Wrap async handlers with asyncRoute so Express 4 receives rejected promises");
});
