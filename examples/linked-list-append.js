function createNode(value) {
    return { val: value, next: null };
}

function append(head, value) {
    let current = head;
    while (current.next !== null) {
        current = current.next;
    }
    current.next = createNode(value);
}

// 1. Create head Node
let linkedList = createNode("A");

// 2. Append elements to it
append(linkedList, "B");
append(linkedList, "C");
append(linkedList, "D");
