const parser = require('@babel/parser');
const { transformSync } = require('@babel/core');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const generate = require('@babel/generator').default;
const { pathToFileURL } = require('url');
const {
  collectBindingNames,
  createExportAssignments,
  createRequireStatements,
  resolveImportSource,
} = require('./jest-ts-transform/helpers.cjs');

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
      if (t.isImport(path.node.callee) && t.isStringLiteral(firstArgument)) {
        path.replaceWith(
          t.callExpression(
            t.memberExpression(
              t.callExpression(
                t.memberExpression(t.identifier('Promise'), t.identifier('resolve')),
                [],
              ),
              t.identifier('then'),
            ),
            [
              t.arrowFunctionExpression(
                [],
                t.callExpression(t.identifier('require'), [
                  t.stringLiteral(resolveImportSource(firstArgument.value, sourcePath)),
                ]),
              ),
            ],
          ),
        );
        return;
      }
      if (
        t.isIdentifier(path.node.callee, { name: 'require' }) &&
        t.isStringLiteral(firstArgument)
      ) {
        firstArgument.value = resolveImportSource(firstArgument.value, sourcePath);
      }
    },
    MemberExpression(path) {
      if (
        t.isMetaProperty(path.node.object) &&
        path.node.object.meta.name === 'import' &&
        path.node.object.property.name === 'meta' &&
        t.isIdentifier(path.node.property, { name: 'url' })
      ) {
        path.replaceWith(t.stringLiteral(pathToFileURL(sourcePath).href));
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
        'jsx',
        'importAttributes',
      ],
    });

    stripTypeSyntax(ast, sourcePath);
    const transformed = transformSync(
      generate(ast, { sourceMaps: 'inline' }, sourceText).code,
      {
        babelrc: false,
        configFile: false,
        plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'classic' }]],
      },
    );

    return {
      code: transformed?.code || generate(ast, { sourceMaps: 'inline' }, sourceText).code,
    };
  },
};
