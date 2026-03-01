/**
 * Interactive Binary Search Tree
 * 
 * Run this with "Visualize DSA (Live Terminal)" to see the tree
 * build in real-time as you type numbers into the terminal.
 */

var readline = require('readline');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

var root = null;

function createNode(val) {
    var node = { val: val, left: null, right: null };
    return node;
}

function insert(node, val) {
    if (node === null) {
        return createNode(val);
    }

    if (val < node.val) {
        node.left = insert(node.left, val);
    } else if (val > node.val) {
        node.right = insert(node.right, val);
    }

    return node;
}

function promptUser() {
    rl.question('Enter a number to insert (or "q" to quit): ', function (answer) {
        if (answer.trim().toLowerCase() === 'q') {
            console.log('Goodbye! Final tree is displayed in the visualizer.');
            rl.close();
            return;
        }

        var num = parseInt(answer.trim(), 10);
        if (isNaN(num)) {
            console.log('Please enter a valid number.');
        } else {
            root = insert(root, num);
            console.log('Inserted ' + num + ' into the BST.');
        }

        promptUser();
    });
}

console.log('=== Interactive BST Builder ===');
console.log('Type numbers to insert into a Binary Search Tree.');
console.log('Watch the visualizer panel update in real-time!\n');

promptUser();
