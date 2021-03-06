'use strict';

const {openDocumentationInWebURL} = require('../urls');
const {renderSymbolHeader, renderExtend, renderExamples, renderUsages, renderDefinition, renderMembers, renderDocs, debugData, renderParameters} = require('./html-utils');
const {idIsEmpty} = require('../kite-data-utils');
const {renderPatterns, renderLanguageSpecificArguments} = require('./function-utils');
const KiteExpandPanel = require('./kite-expand-panel');

class KiteExpandModule extends KiteExpandPanel {
  static initClass() {
    return document.registerElement('kite-expand-module', {prototype: this.prototype});
  }

  setData(data) {
    const [value] = data.symbol.value;

    this.innerHTML = `
    ${renderSymbolHeader(data.symbol)}
    ${renderExtend(value)}

    <div class="scroll-wrapper">
      <div class="sections-wrapper">
        ${
          value.kind === 'type'
            ? `${renderPatterns(value)}
               ${renderParameters(value)}
               ${renderLanguageSpecificArguments(value)}`
            : ''
        }
        ${renderMembers(value)}
        ${renderDocs(data)}
        ${renderUsages(data)}
        ${renderExamples(data)}
        ${renderDefinition(data)}
        ${debugData(data)}
      </div>
    </div>

    <footer>
      <div class="actions">
        ${!idIsEmpty(value.id)
          ? `<kite-open-link data-url="${openDocumentationInWebURL(value.id)}"></kite-open-link>`
        : ''}
      </div>
      <div class='flex-separator'></div>
      <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
    </footer>
    `;
  }
}

module.exports = KiteExpandModule.initClass();
