/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createNode,
  getChild,
  registerChild
} from './nodes';
import { getData } from './node_data';
import {
  getContext,
  enterContext,
  restoreContext
} from './context';
import { symbols } from './symbols';
import {
  assertKeyedTagMatches,
  assertNoUnclosedTags,
  setInAttributes
} from './assertions';
import { notifications } from './notifications';


/**
 * Patches the document starting at el with the provided function. This function
 * may be called during an existing patch operation.
 * @param {!Element|!DocumentFragment} node The Element or Document
 *     to patch.
 * @param {!function(T)} fn A function containing elementOpen/elementClose/etc.
 *     calls that describe the DOM.
 * @param {T=} data An argument passed to fn to represent DOM state.
 * @template T
 */
var patch = function(node, fn, data) {
  var context = enterContext(node);
  if (process.env.NODE_ENV !== 'production') {
    setInAttributes(false);
  }

  firstChild();
  fn(data);
  parentNode();
  clearUnvisitedDOM(node);

  if (process.env.NODE_ENV !== 'production') {
    assertNoUnclosedTags(context.currentNode, node);
  }

  context.notifyChanges();
  restoreContext();
};


/**
 * Checks whether or not a given node matches the specified nodeName and key.
 *
 * @param {!Node} node An HTML node, typically an HTMLElement or Text.
 * @param {?string} nodeName The nodeName for this node.
 * @param {?string=} key An optional key that identifies a node.
 * @return {boolean} True if the node matches, false otherwise.
 */
var matches = function(node, nodeName, key) {
  var data = getData(node);

  // Key check is done using double equals as we want to treat a null key the
  // same as undefined. This should be okay as the only values allowed are
  // strings, null and undefined so the == semantics are not too weird.
  return key == data.key && nodeName === data.nodeName;
};


/**
 * Aligns the virtual Element definition with the actual DOM, moving the
 * corresponding DOM node to the correct location or creating it if necessary.
 * @param {string} nodeName For an Element, this should be a valid tag string.
 *     For a Text, this should be #text.
 * @param {?string=} key The key used to identify this element.
 * @param {?Array<*>=} statics For an Element, this should be an array of
 *     name-value pairs.
 * @return {!Node} The matching node.
 */
var alignWithDOM = function(nodeName, key, statics) {
  var context = getContext();
  var currentNode = context.currentNode;
  var parent = context.currentParent;
  var matchingNode;

  // Check to see if we have a node to reuse
  if (currentNode && matches(currentNode, nodeName, key)) {
    matchingNode = currentNode;
  } else {
    var existingNode = getChild(parent, key);

    // Check to see if the node has moved within the parent or if a new one
    // should be created
    if (existingNode) {
      if (process.env.NODE_ENV !== 'production') {
        assertKeyedTagMatches(getData(existingNode).nodeName, nodeName, key);
      }

      matchingNode = existingNode;
    } else {
      matchingNode = createNode(context.doc, nodeName, key, statics, parent);

      if (key) {
        registerChild(parent, key, matchingNode);
      }

      context.markCreated(matchingNode);
    }

    // If the node has a key, remove it from the DOM to prevent a large number
    // of re-orders in the case that it moved far or was completely removed.
    // Since we hold on to a reference through the keyMap, we can always add it
    // back.
    if (currentNode && getData(currentNode).key) {
      parent.replaceChild(matchingNode, currentNode);
      getData(parent).keyMapValid = false;
    } else {
      parent.insertBefore(matchingNode, currentNode);
    }

    context.currentNode = matchingNode;
  }

  return matchingNode;
};


/**
 * Clears out any unvisited Nodes, as the corresponding virtual element
 * functions were never called for them.
 * @param {Node} node
 */
var clearUnvisitedDOM = function(node) {
  var context = getContext();
  var data = getData(node);
  var keyMap = data.keyMap;
  var keyMapValid = data.keyMapValid;
  var lastVisitedChild = data.lastVisitedChild;
  var child = node.lastChild;
  var key;

  data.lastVisitedChild = null;

  if (child === lastVisitedChild && keyMapValid) {
    return;
  }

  if (data.attrs[symbols.placeholder] && context.currentNode !== context.root) {
    return;
  }

  while (child !== lastVisitedChild) {
    node.removeChild(child);
    context.markDeleted(/** @type {!Node}*/(child));

    key = getData(child).key;
    if (key) {
      delete keyMap[key];
    }
    child = node.lastChild;
  }

  // Clean the keyMap, removing any unusued keys.
  for (key in keyMap) {
    child = keyMap[key];
    if (!child.parentNode) {
      context.markDeleted(child);
      delete keyMap[key];
    }
  }

  data.keyMapValid = true;
};


/**
 * Marks node's parent as having visited node.
 * @param {Node} node
 */
var markVisited = function(node) {
  var context = getContext();
  var parent = context.currentParent;
  var data = getData(parent);
  data.lastVisitedChild = node;
};


/**
 * Changes to the first child of the current node.
 */
var firstChild = function() {
  var context = getContext();
  context.currentParent = context.currentNode;
  context.currentNode = context.currentNode.firstChild;
};


/**
 * Changes to the next sibling of the current node.
 */
var nextSibling = function() {
  var context = getContext();
  markVisited(context.currentNode);
  context.currentNode = context.currentNode.nextSibling;
};


/**
 * Changes to the parent of the current node, removing any unvisited children.
 */
var parentNode = function() {
  var context = getContext();
  context.currentNode = context.currentParent;
  context.currentParent = context.currentNode.parentNode;
};


/** */
export {
  alignWithDOM,
  clearUnvisitedDOM,
  patch,
  firstChild,
  nextSibling,
  parentNode
};
export { currentElement } from './context';
