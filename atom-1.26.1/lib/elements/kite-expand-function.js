'use strict';

const {openDocumentationInWebURL} = require('../urls');
const {renderSymbolHeader, renderExtend, renderUsages, renderParameters, renderExamples, renderDefinition, renderInvocations, debugData, renderReturnType, renderDocs} = require('./html-utils');
const {idIsEmpty} = require('../kite-data-utils');
const {renderPatterns, renderLanguageSpecificArguments} = require('./function-utils');
const KiteExpandPanel = require('./kite-expand-panel');

class KiteExpandFunction extends KiteExpandPanel {
  static initClass() {
    return document.registerElement('kite-expand-function', {prototype: this.prototype});
  }

  setData(data) {
    const {symbol} = data;
    const [value] = symbol.value;

    this.innerHTML = `
    ${renderSymbolHeader(symbol)}
    ${renderExtend(value)}

    <div class="scroll-wrapper">
      <div class="sections-wrapper">
        ${renderParameters(value)}
        ${renderReturnType(symbol)}
        ${renderLanguageSpecificArguments(value)}
        ${renderPatterns(value)}
        ${renderDocs(data)}
        ${renderUsages(data)}
        ${renderExamples(data)}
        ${renderDefinition(data)}
        ${renderInvocations(value)}
        ${debugData(data)}
      </div>
    </div>

    <footer>
      <div class="actions"></div>
      <div class="flex-separator"></div>
      ${!idIsEmpty(value.id)
        ? `<kite-open-link data-url="${openDocumentationInWebURL(value.id)}"></kite-open-link>`
      : ''}
      <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
    </footer>
    `;
  }
}

module.exports = KiteExpandFunction.initClass();
