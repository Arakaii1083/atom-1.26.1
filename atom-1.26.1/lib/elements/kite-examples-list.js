'use strict';

const {CompositeDisposable} = require('atom');
const {renderExample, debugData} = require('./html-utils');

class KiteExamplesList extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-examples-list', {
      prototype: this.prototype,
    });
  }

  setData(data) {
    this.examples = data.report.examples || [];

    this.subscriptions = new CompositeDisposable();

    this.innerHTML = `
    <div class="expand-header"><span class="name">How to use <code>${data.value.repr}</code></span></div>
    <div class="scroll-wrapper"><div class="sections-wrapper">
      <ul>${this.examples.map(m => renderExample(m)).join('')}</ul>
    </div></div>
    ${debugData(data)}
    `;

    this.list = this.querySelector('ul');
  }
}

module.exports = KiteExamplesList.initClass();
