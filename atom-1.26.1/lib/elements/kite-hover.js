'use strict';

require('./kite-links');
const {Point} = require('atom');
const {symbolName, symbolKind, symbolId, idIsEmpty} = require('../kite-data-utils');
const {debugData} = require('./html-utils');
const {internalGotoURL, internalExpandPositionURL, internalOpenPositionInWebURL} = require('../urls');
const {wrapAfterParenthesisAndDots} = require('./html-utils');
let OverlayManager;

class KiteHover extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-hover', {prototype: this.prototype});
  }

  detachedCallback() {
    this.subscriptions && this.subscriptions.dispose();
  }

  attachedCallback() {
    this.classList.add('native-key-bindings');
    this.setAttribute('tabindex', '-1');
  }

  setData(data, editor, position) {
    position = Point.fromObject(position);

    if (data && data.symbol && data.symbol.length) {
      const [symbol] = data.symbol;
    // const type = symbolType(symbol);
      const actions = [
        `<a href="${internalExpandPositionURL(position)}">More</a>`,
      ];

      if (!idIsEmpty(symbolId(symbol))) {
        actions.unshift(`<a href="${internalOpenPositionInWebURL(position)}">Web</a>`);
      }

      if (data.report.definition &&
        data.report.definition.filename &&
        data.report.definition.filename.trim() !== '') {
        actions.push(`<a
        href="${internalGotoURL(data.report.definition)}">Def</a>`);
      }

      this.innerHTML = `
    <div class="definition">
      <span class="name"><code>${wrapAfterParenthesisAndDots(symbolName(symbol))}</code></span>
      <span class="type">${symbolKind(symbol)}</span>
    </div>
    <kite-links class="one-line" metric="Hover">
      ${actions.join(' ')}
      <div class="flex-separator"></div>
      <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
    </kite-links>
    ${debugData(data)}`;

      const links = this.querySelector('kite-links');

      if (links) {
        this.subscriptions = links.onDidClickMoreLink(() => {
          if (!OverlayManager) {
            OverlayManager = require('../overlay-manager');
          }
          OverlayManager.dismiss();
        });
      }

    } else {
      this.innerHTML = '';
    }
  }
}

module.exports = KiteHover.initClass();
