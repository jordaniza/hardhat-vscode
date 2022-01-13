import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CodeActionResolver } from "../types";
import * as parser from "@solidity-parser/parser";

const constrainMutability: CodeActionResolver = (
  diagnostic: Diagnostic,
  { document, uri }: { document: TextDocument; uri: string }
): CodeAction[] => {
  if (!diagnostic.data) {
    return [];
  }

  const modifier = diagnostic.message.includes("pure") ? "pure" : "view";

  const { functionSourceLocation } = diagnostic.data as {
    functionSourceLocation: { start: number; end: number };
  };

  const functionText = document.getText(
    Range.create(
      document.positionAt(functionSourceLocation.start),
      document.positionAt(functionSourceLocation.end)
    )
  );

  const ast = parser.parse(functionText, {
    range: true,
    tolerant: true,
    tokens: true,
  });

  if (
    ast.children.length === 0 ||
    ast.children[0].type !== "FunctionDefinition"
  ) {
    return [];
  }

  const functionDefinitionNode = ast.children[0];
  const mutability = functionDefinitionNode.stateMutability;

  if (mutability === "view") {
    return modifyViewToPureAction(document, ast, functionSourceLocation, uri);
  } else {
    return addMutabilityAction(
      document,
      ast,
      functionSourceLocation,
      uri,
      functionDefinitionNode.visibility,
      modifier
    );
  }
};

function modifyViewToPureAction(
  document: TextDocument,
  ast: ReturnType<typeof parser.parse>,
  functionSourceLocation: { start: number; end: number },
  uri: string
): CodeAction[] {
  const viewKeyword = ast.tokens?.find(
    (t) => t.type === "Keyword" && t.value === "view"
  );

  if (!viewKeyword || !viewKeyword.range) {
    throw new Error("Unable to find keyword `view`");
  }

  const action: CodeAction = {
    title: "Change view modifier to pure",
    kind: CodeActionKind.QuickFix,
    isPreferred: true,
    edit: {
      changes: {
        [uri]: [
          {
            range: Range.create(
              document.positionAt(
                functionSourceLocation.start + viewKeyword.range[0]
              ),
              document.positionAt(
                functionSourceLocation.start + viewKeyword.range[1]
              )
            ),
            newText: "pure",
          },
        ],
      },
    },
  };

  return [action];
}

function addMutabilityAction(
  document: TextDocument,
  ast: ReturnType<typeof parser.parse>,
  functionSourceLocation: { start: number; end: number },
  uri: string,
  visibilty: string,
  modifier: string
): CodeAction[] {
  const visibilityKeyword = ast.tokens?.find(
    (t) => t.type === "Keyword" && t.value === visibilty
  );

  if (!visibilityKeyword || !visibilityKeyword.range) {
    return [];
  }

  const endOfVisibilityChar =
    functionSourceLocation.start + visibilityKeyword.range[1] + 1;

  const addMutabilityAction: CodeAction = {
    title: `Add ${modifier} modifier`,
    kind: CodeActionKind.QuickFix,
    isPreferred: true,
    edit: {
      changes: {
        [uri]: [
          {
            range: Range.create(
              document.positionAt(endOfVisibilityChar),
              document.positionAt(endOfVisibilityChar)
            ),
            newText: `${modifier} `,
          },
        ],
      },
    },
  };

  return [addMutabilityAction];
}
export { constrainMutability };
