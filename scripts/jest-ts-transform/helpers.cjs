const fs = require('fs');
const path = require('path');
const t = require('@babel/types');

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

  for (const extension of ['.ts', '.tsx']) {
    const candidatePath = path.resolve(
      path.dirname(sourcePath),
      sourceValue.slice(0, -3) + extension,
    );

    if (fs.existsSync(candidatePath)) {
      return sourceValue.slice(0, -3) + extension;
    }
  }

  return sourceValue;
}

function createRequireStatements(node, state, sourcePath) {
  if (node.importKind === 'type') return [];

  const specifiers = node.specifiers.filter((specifier) => specifier.importKind !== 'type');
  if (specifiers.length === 0) return [];

  const source = t.stringLiteral(resolveImportSource(node.source.value, sourcePath));
  const defaultSpecifier = specifiers.find((specifier) => t.isImportDefaultSpecifier(specifier)) || null;
  const namespaceSpecifier = specifiers.find((specifier) => t.isImportNamespaceSpecifier(specifier)) || null;
  const namedSpecifiers = specifiers.filter((specifier) => t.isImportSpecifier(specifier));

  if (!defaultSpecifier && !namespaceSpecifier && namedSpecifiers.length > 0) {
    return [
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.objectPattern(namedSpecifiers.map(createNamedImportProperty)),
          t.callExpression(t.identifier('require'), [source]),
        ),
      ]),
    ];
  }

  const tempIdentifier = t.identifier(`__jestImport${state.importCounter++}`);
  const statements = [
    t.variableDeclaration('const', [
      t.variableDeclarator(tempIdentifier, t.callExpression(t.identifier('require'), [source])),
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
        t.variableDeclarator(t.objectPattern(namedSpecifiers.map(createNamedImportProperty)), tempIdentifier),
      ]),
    );
  }

  return statements;
}

function createNamedImportProperty(specifier) {
  return t.objectProperty(
    t.identifier(specifier.imported.name),
    t.identifier(specifier.local.name),
    false,
    specifier.imported.name === specifier.local.name,
  );
}

module.exports = {
  collectBindingNames,
  createExportAssignments,
  createRequireStatements,
  resolveImportSource,
};
