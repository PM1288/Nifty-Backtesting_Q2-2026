/*
 * Runtime white-label text replacement.
 * Only rewrites user-visible labels; never touches URLs/asset paths.
 */
(function () {
  "use strict";

  function rewriteText(value) {
    if (!value || typeof value !== "string") {
      return value;
    }

    return value
      .replace(/Grafana Labs/gi, "DigiTrader Labs")
      .replace(/GRAFANA_ALERTS/g, "DIGITRADER_ALERTS")
      .replace(/\bGrafana\b/g, "DigiTrader")
      .replace(/\bgrafana\b/g, "DigiTrader");
  }

  function isBlockedTag(tagName) {
    return tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT";
  }

  function shouldRewriteTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return false;
    }
    var parent = node.parentElement;
    if (!parent) {
      return true;
    }
    return !isBlockedTag(parent.tagName);
  }

  function rewriteNodeText(node) {
    if (!shouldRewriteTextNode(node)) {
      return;
    }
    var current = node.nodeValue;
    var next = rewriteText(current);
    if (next !== current) {
      node.nodeValue = next;
    }
  }

  function rewriteElementAttrs(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE || isBlockedTag(el.tagName)) {
      return;
    }

    var attrs = ["title", "aria-label", "placeholder", "alt", "data-tooltip"];
    for (var i = 0; i < attrs.length; i++) {
      var key = attrs[i];
      var current = el.getAttribute(key);
      if (!current) {
        continue;
      }
      var next = rewriteText(current);
      if (next !== current) {
        el.setAttribute(key, next);
      }
    }
  }

  function sweep(root) {
    if (!root) {
      return;
    }

    if (root.nodeType === Node.TEXT_NODE) {
      rewriteNodeText(root);
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE) {
      rewriteElementAttrs(root);
      if (isBlockedTag(root.tagName)) {
        return;
      }
    }

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var textNode;
    while ((textNode = walker.nextNode())) {
      rewriteNodeText(textNode);
    }

    var all = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < all.length; i++) {
      rewriteElementAttrs(all[i]);
    }
  }

  function boot() {
    sweep(document.documentElement);

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "characterData") {
          rewriteNodeText(m.target);
          continue;
        }
        if (m.type === "attributes") {
          rewriteElementAttrs(m.target);
          continue;
        }
        if (!m.addedNodes || !m.addedNodes.length) {
          continue;
        }
        for (var j = 0; j < m.addedNodes.length; j++) {
          sweep(m.addedNodes[j]);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder", "alt", "data-tooltip"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
