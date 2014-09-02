'use strict';

module.exports = Polygon;

// polygon contour as a doubly linked list

function Node(data, related, status) {
	this.data = data;

	this.related = related;
	if (related) {
		related.related = this;
		related.status = status;
	}

	this.prev = null;
	this.next = null;
}

function Polygon() {
	this.length = 0;
	this.last = null;
}

Polygon.Node = Node;

Polygon.prototype = {
	insert: function (node) {
		if (!this.last) {
			node.prev = node;
			node.next = node;
		} else {
			this.insertAfter(this.last, node);
		}
		this.last = node;
		this.length++;
	},

	insertAfter: function (newNode, node) {
		newNode.next = node.next;
		newNode.prev = node;
		node.next.prev = newNode;
		node.next = newNode;
	},

	remove: function (node) {
		if (node.next === node) this.last = null;
		else {
			node.next.prev = node.prev;
			node.prev.next = node.next;
			if (node === this.last) this.last = node.prev;
		}
	}
};
