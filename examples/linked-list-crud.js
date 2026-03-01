// ═══════════════════════════════════════════════════════
//  Interactive Linked List — CRUD Operations
//  Run: node linked-list-crud.js
//  Then use ▶ Run DSA to visualize!
// ═══════════════════════════════════════════════════════

var readline = require('readline');
var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ── Linked List Core ──

var head = null;
var size = 0;

function createNode(val) {
    return { val: val, next: null };
}

function insertAtEnd(val) {
    var node = createNode(val);
    if (head === null) {
        head = node;
    } else {
        var curr = head;
        while (curr.next !== null) {
            curr = curr.next;
        }
        curr.next = node;
    }
    size++;
    console.log('  ✅ Inserted "' + val + '" at the end. Size: ' + size);
}

function insertAtHead(val) {
    var node = createNode(val);
    node.next = head;
    head = node;
    size++;
    console.log('  ✅ Inserted "' + val + '" at the head. Size: ' + size);
}

function deleteByValue(val) {
    if (head === null) {
        console.log('  ❌ List is empty!');
        return;
    }
    if (head.val === val) {
        head = head.next;
        size--;
        console.log('  🗑️  Deleted "' + val + '". Size: ' + size);
        return;
    }
    var curr = head;
    while (curr.next !== null) {
        if (curr.next.val === val) {
            curr.next = curr.next.next;
            size--;
            console.log('  🗑️  Deleted "' + val + '". Size: ' + size);
            return;
        }
        curr = curr.next;
    }
    console.log('  ❌ "' + val + '" not found in list.');
}

function updateValue(oldVal, newVal) {
    var curr = head;
    while (curr !== null) {
        if (curr.val === oldVal) {
            curr.val = newVal;
            console.log('  ✏️  Updated "' + oldVal + '" → "' + newVal + '"');
            return;
        }
        curr = curr.next;
    }
    console.log('  ❌ "' + oldVal + '" not found in list.');
}

function printList() {
    if (head === null) {
        console.log('  📋 List is empty');
        return;
    }
    var parts = [];
    var curr = head;
    while (curr !== null) {
        parts.push('[' + curr.val + ']');
        curr = curr.next;
    }
    console.log('  📋 ' + parts.join(' → ') + ' → null');
}

// ── Interactive Menu ──

function showMenu() {
    console.log('\n╔══════════════════════════════════╗');
    console.log('║     Linked List Operations       ║');
    console.log('╠══════════════════════════════════╣');
    console.log('║  1. Insert at End                ║');
    console.log('║  2. Insert at Head               ║');
    console.log('║  3. Delete by Value              ║');
    console.log('║  4. Update Value                 ║');
    console.log('║  5. Print List                   ║');
    console.log('║  6. Quit                         ║');
    console.log('╚══════════════════════════════════╝');
}

function ask(question) {
    return new Promise(function (resolve) {
        rl.question(question, function (answer) {
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('\n🔗 Welcome to the Interactive Linked List!');
    console.log('   Each operation updates the visualizer in real-time.\n');

    // Seed with a few nodes so there's something to see
    insertAtEnd('Alice');
    insertAtEnd('Bob');
    insertAtEnd('Charlie');
    printList();

    while (true) {
        showMenu();
        var choice = await ask('\n  Choose (1-6): ');

        switch (choice) {
            case '1':
                var val1 = await ask('  Enter value to insert at end: ');
                insertAtEnd(val1);
                printList();
                break;

            case '2':
                var val2 = await ask('  Enter value to insert at head: ');
                insertAtHead(val2);
                printList();
                break;

            case '3':
                var val3 = await ask('  Enter value to delete: ');
                deleteByValue(val3);
                printList();
                break;

            case '4':
                var old = await ask('  Enter current value: ');
                var nw = await ask('  Enter new value: ');
                updateValue(old, nw);
                printList();
                break;

            case '5':
                printList();
                break;

            case '6':
                console.log('\n  👋 Goodbye!\n');
                rl.close();
                return;

            default:
                console.log('  ⚠️  Invalid choice. Pick 1-6.');
        }
    }
}

main();
