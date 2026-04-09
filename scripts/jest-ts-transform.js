const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const generate = require('@babel/generator').default;

function collectBindingNames(id, names = []) {
  if (t.isIdentifier(id)) {
    names.push(id.name);
    return names;
  }

  if (t.isObjectPattern(id)) {
    for (const property of id.properties) {
      if (t.isRestElement(property)) {
        collectBindingNames(property.argument, names);
        continue;
      }

      collectBindingNames(property.value, names);
    }
    return names;
  }

  if (t.isArrayPattern(id)) {
    for (const element of id.elements) {
      if (!element) continue;
      if (t.isRestElement(element)) {
        collectBindingNames(element.argument, names);
        continue;
      }
      collectBindingNames(element, names);
    }
  }

  return names;
}

function createExportAssignments(names) {
  return names.map((name) =>
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier('exports'), t.identifier(name)),
        t.identifier(name),
      ),
    ),
  );
}

function resolveImportSource(sourceValue, sourcePath) {
  if (!sourceValue.startsWith('.') || !sourceValue.endsWith('.js')) {
    return sourceValue;
  }

  const candidatePath = path.resolve(
    path.dirname(sourcePath),
    sourceValue.slice(0, -3) + '.ts',
  );

  if (fs.existsSync(candidatePath)) {
    return sourceValue.slice(0, -3) + '.ts';
  }

  return sourceValue;
}

function createRequireStatements(node, state, sourcePath) {
  if (node.importKind === 'type') {
    return [];
  }

  const specifiers = node.specifiers.filter((specifier) => specifier.importKind !== 'type');
  if (specifiers.length === 0) {
    return [];
  }

  const source = t.stringLiteral(resolveImportSource(node.source.value, sourcePath));
  const defaultSpecifier = specifiers.find((specifier) => t.isImportDefaultSpecifier(specifier)) || null;
  const namespaceSpecifier = specifiers.find((specifier) => t.isImportNamespaceSpecifier(specifier)) || null;
  const namedSpecifiers = specifiers.filter((specifier) => t.isImportSpecifier(specifier));

  if (!defaultSpecifier && !namespaceSpecifier && namedSpecifiers.length > 0) {
    return [
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.objectPattern(
            namedSpecifiers.map((specifier) =>
              t.objectProperty(
                t.identifier(specifier.imported.name),
                t.identifier(specifier.local.name),
                false,
                specifier.imported.name === specifier.local.name,
              ),
            ),
          ),
          t.callExpression(t.identifier('require'), [source]),
        ),
      ]),
    ];
  }

  const tempIdentifier = t.identifier(`__jestImport${state.importCounter++}`);
  const statements = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        tempIdentifier,
        t.callExpression(t.identifier('require'), [source]),
      ),
    ]),
  ];

  if (defaultSpecifier) {
    state.needsDefaultInterop = true;
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(defaultSpecifier.local.name),
          t.callExpression(t.identifier('__jestTsDefault'), [tempIdentifier]),
        ),
      ]),
    );
  }

  if (namespaceSpecifier) {
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier(namespaceSpecifier.local.name), tempIdentifier),
      ]),
    );
  }

  if (namedSpecifiers.length > 0) {
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.objectPattern(
            namedSpecifiers.map((specifier) =>
              t.objectProperty(
                t.identifier(specifier.imported.name),
                t.identifier(specifier.local.name),
                false,
                specifier.imported.name === specifier.local.name,
              ),
            ),
          ),
          tempIdentifier,
        ),
      ]),
    );
  }

  return statements;
}

function stripTypeSyntax(ast, sourcePath) {
  const state = {
    importCounter: 0,
    needsDefaultInterop: false,
  };

  traverse(ast, {
    enter(path) {
      const { node } = path;

      if ('typeAnnotation' in node) {
        node.typeAnnotation = null;
      }
      if ('returnType' in node) {
        node.returnType = null;
      }
      if ('typeParameters' in node) {
        node.typeParameters = null;
      }
      if ('typeArguments' in node) {
        node.typeArguments = null;
      }
      if ('superTypeParameters' in node) {
        node.superTypeParameters = null;
      }
      if ('implements' in node) {
        node.implements = [];
      }
      if ('declare' in node) {
        node.declare = null;
      }
      if ('definite' in node) {
        node.definite = null;
      }
      if ('abstract' in node) {
        node.abstract = null;
      }
      if ('readonly' in node) {
        node.readonly = null;
      }
      if (
        'optional' in node &&
        !t.isOptionalMemberExpression(node) &&
        !t.isOptionalCallExpression(node)
      ) {
        node.optional = false;
      }
      if ('accessibility' in node) {
        node.accessibility = null;
      }
      if ('override' in node) {
        node.override = null;
      }
    },
    CallExpression(path) {
      const [firstArgument] = path.node.arguments;
      if (
        t.isIdentifier(path.node.callee, { name: 'require' }) &&
        t.isStringLiteral(firstArgument)
      ) {
        firstArgument.value = resolveImportSource(firstArgument.value, sourcePath);
      }
    },
    ImportDeclaration(path) {
      path.replaceWithMultiple(createRequireStatements(path.node, state, sourcePath));
    },
    ExportNamedDeclaration(path) {
      if (path.node.exportKind === 'type') {
        path.remove();
        return;
      }

      if (path.node.declaration) {
        const declaration = path.node.declaration;
        let exportedNames = [];

        if (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) {
          if (declaration.id) {
            exportedNames = [declaration.id.name];
          }
        } else if (t.isVariableDeclaration(declaration)) {
          exportedNames = declaration.declarations.flatMap((declarator) => collectBindingNames(declarator.id));
        }

        path.replaceWith(declaration);
        if (exportedNames.length > 0) {
          path.insertAfter(createExportAssignments(exportedNames));
        }
        return;
      }

      if (path.node.source) {
        const tempIdentifier = t.identifier(`__jestExport${state.importCounter++}`);
        const statements = [
          t.variableDeclaration('const', [
            t.variableDeclarator(
              tempIdentifier,
              t.callExpression(t.identifier('require'), [
                t.stringLiteral(resolveImportSource(path.node.source.value, sourcePath)),
              ]),
            ),
          ]),
          ...path.node.specifiers.map((specifier) =>
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(t.identifier('exports'), t.identifier(specifier.exported.name)),
                t.memberExpression(tempIdentifier, t.identifier(specifier.local.name)),
              ),
            ),
          ),
        ];

        path.replaceWithMultiple(statements);
        return;
      }

      path.replaceWithMultiple(
        path.node.specifiers.map((specifier) =>
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('exports'), t.identifier(specifier.exported.name)),
              t.identifier(specifier.local.name),
            ),
          ),
        ),
      );
    },
    ExportDefaultDeclaration(path) {
      if (t.isFunctionDeclaration(path.node.declaration) || t.isClassDeclaration(path.node.declaration)) {
        const declaration = path.node.declaration;
        const identifier = declaration.id || t.identifier('__defaultExport');
        declaration.id = identifier;
        path.replaceWithMultiple([
          declaration,
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('module'), t.identifier('exports')),
              identifier,
            ),
          ),
        ]);
        return;
      }

      path.replaceWith(
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(t.identifier('module'), t.identifier('exports')),
            path.node.declaration,
          ),
        ),
      );
    },
    TSAsExpression(path) {
      path.replaceWith(path.node.expression);
    },
    TSNonNullExpression(path) {
      path.replaceWith(path.node.expression);
    },
    TSSatisfiesExpression(path) {
      path.replaceWith(path.node.expression);
    },
    TSInstantiationExpression(path) {
      path.replaceWith(path.node.expression);
    },
    TSInterfaceDeclaration(path) {
      path.remove();
    },
    TSTypeAliasDeclaration(path) {
      path.remove();
    },
    TSDeclareFunction(path) {
      path.remove();
    },
  });

  if (state.needsDefaultInterop) {
    ast.program.body.unshift(
      parser.parse(
        'function __jestTsDefault(mod) { return mod && mod.__esModule ? mod.default : mod; }',
        { sourceType: 'script' },
      ).program.body[0],
    );
  }
}

module.exports = {
  process(sourceText, sourcePath) {
    const ast = parser.parse(sourceText, {
      sourceType: 'unambiguous',
      plugins: [
        'typescript',
        'importAttributes',
      ],
    });

    stripTypeSyntax(ast, sourcePath);

    return {
      code: generate(ast, { sourceMaps: 'inline' }, sourceText).code,
    };
  },
};
