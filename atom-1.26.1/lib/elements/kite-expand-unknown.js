'use strict';

const {renderHeader} = require('./html-utils');
const KiteExpandPanel = require('./kite-expand-panel');

class KiteExpandUnknown extends KiteExpandPanel {
  static initClass() {
    return document.registerElement('kite-expand-unknown', {prototype: this.prototype});
  }

  setData(data) {
    this.innerHTML = `
    ${renderHeader('unknown', 'unknown')}
    <div class='scroll-wrapper'>
      <div class='sections-wrapper'>
        <pre><code>${JSON.stringify(data, null, 2)}</code></pre>
        </div>
    </div>`;
  }
}

module.exports = KiteExpandUnknown.initClass();
