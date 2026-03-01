import { instrumentCode } from '../src/engine/tracer';
import { SandboxEngine } from '../src/engine/Sandbox';

function runTests() {
    console.log('--- Running Backend Tests ---');

    const testCode = `
    let a = 10;
    let b = { val: 20 };
    b.next = { val: 30 };
    a = 50;
  `;

    console.log('1. Instrumenting Code...');
    const instrumented = instrumentCode(testCode);
    console.log('--- Instrumented Source ---');
    console.log(instrumented);

    console.log('\n2. Executing in Sandbox...');
    const engine = new SandboxEngine();
    const timeline = engine.execute(instrumented);

    console.log('--- Event Timeline Output ---');
    console.log(JSON.stringify(timeline, null, 2));

    if (timeline.length > 0) {
        console.log('✅ Sandbox successfully trapped execution states.');
    } else {
        console.error('❌ Sandbox failed to output a timeline.');
    }
}

runTests();
