/** Tiny DOM helpers. Not a framework — just enough to stop repeating myself. */

function isPlainObject(value) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Node);
}

/**
 * h('button.big', { onclick }, 'Go') -> <button class="big">Go</button>
 * The tag accepts `tag.class.class` shorthand.
 */
export function h(spec, props, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  // The props argument is optional, so h('p', 'hello') and h('ul', items) have
  // to work too. Anything that is not a plain object is a child.
  if (!isPlainObject(props)) {
    children.unshift(props);
    props = {};
  }

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      node.className = [node.className, value].filter(Boolean).join(' ');
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key in node && key !== 'list') {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }

  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function render(node, ...children) {
  clear(node).append(...children.flat(Infinity).filter(Boolean));
  return node;
}
