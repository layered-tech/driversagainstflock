import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const buildScript = readFileSync(
    new URL(
        '../../node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh',
        import.meta.url,
    ),
    'utf8',
);
const cleanupExpression = buildScript.match(
    /sed(?: -E)? '([^']+)' "\$swiftinterface"/,
)[1];

for (const namespace of [
    '__ObjC.expo.CppError',
    '__ObjC::expo.__ObjC::CppError',
]) {
    test(`removes inaccessible C++ extension ${namespace} from Swift interfaces`, () => {
        const publicDeclaration =
            'public struct ScriptEvaluationError : Swift.Error {}\n';
        const input = `${publicDeclaration}extension ${namespace} : Swift.Error {\n  public var message: Swift.String {\n    get\n  }\n}\n${publicDeclaration}`;
        const result = execFileSync('sed', ['-E', cleanupExpression], {
            input,
            encoding: 'utf8',
        });

        assert.equal(result, publicDeclaration.repeat(2));
    });
}
