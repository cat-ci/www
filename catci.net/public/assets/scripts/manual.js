(function () {
  function parseHasSelector(selector) {
    const hasRegex =
      /([^\s:]+):has\(([^)]+)\)\s+([^\s,]+)/g;
    const matches = [];
    let match;
    while ((match = hasRegex.exec(selector))) {
      matches.push({
        container: match[1], 
        has: match[2], 
        target: match[3], 
        fullSelector: match[0],
      });
    }
    return matches;
  }

  function findHasRules() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let cssRules;
      try {
        cssRules = sheet.cssRules;
      } catch (e) {
        continue;
      }
      if (!cssRules) continue;
      for (const rule of cssRules) {
        if (
          rule.type === CSSRule.STYLE_RULE &&
          rule.selectorText.includes(':has(')
        ) {
          rules.push(rule);
        }
      }
    }
    return rules;
  }

  function injectPolyfillCSS(matches, rules) {
    let styleTag = document.getElementById('polyfill-has-style');
    if (styleTag) styleTag.remove();

    styleTag = document.createElement('style');
    styleTag.id = 'polyfill-has-style';

    let css = '';
    for (let i = 0; i < matches.length; i++) {
      const { container, target, fullSelector } = matches[i];
      // Find the corresponding rule
      const rule = rules.find((r) =>
        r.selectorText.includes(fullSelector)
      );
      if (!rule) continue;
      const newSelector = `${container} ${target}[data-polyfillhas="true"]`;
      css += `${newSelector} { ${rule.style.cssText} }\n`;
    }
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  }

  function evaluateAndSet(matches) {
    for (const { container, has, target } of matches) {
      document.querySelectorAll(container).forEach((contEl) => {
        if (contEl.querySelector(has)) {
          contEl.querySelectorAll(target).forEach((targetEl) => {
            targetEl.setAttribute('data-polyfillhas', 'true');
          });
        } else {
          contEl.querySelectorAll(target).forEach((targetEl) => {
            targetEl.removeAttribute('data-polyfillhas');
          });
        }
      });
    }
  }

  function polyfillHas() {
    const rules = findHasRules();
    const allMatches = [];
    for (const rule of rules) {
      const matches = parseHasSelector(rule.selectorText);
      allMatches.push(...matches);
    }
    injectPolyfillCSS(allMatches, rules);
    evaluateAndSet(allMatches);
  }

  polyfillHas();

  const observer = new MutationObserver(polyfillHas);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['checked', 'value'],
  });

  document.body.addEventListener('change', polyfillHas, true);

  window.polyfillHas = polyfillHas;
})();