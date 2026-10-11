import { Script } from 'node:vm';
import ts from 'typescript';

// Node parsing alone accepts logical assignment operators that the Apps Script
// editor rejects. This targeted guard runs before generating any installer.
// It is not a replacement for testing in the actual Apps Script runtime.
export function assertGasServerSyntax(source, filename = 'Code.gs') {
  new Script(source, { filename });
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2019, true, ts.ScriptKind.JS);
  const unsupportedAssignments = new Set([
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken,
  ]);
  function visit(node) {
    if (ts.isBinaryExpression(node) && unsupportedAssignments.has(node.operatorToken.kind)) {
      const location = tree.getLineAndCharacterOfPosition(node.operatorToken.getStart(tree));
      throw new SyntaxError(`${filename}:${location.line + 1}:${location.character + 1}: Apps Script 서버 코드에서 ${node.operatorToken.getText(tree)} 대신 if 문을 사용하세요.`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
