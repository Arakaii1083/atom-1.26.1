'use strict';

const DataLoader = require('./data-loader');
const KiteSignature = require('./elements/kite-signature');
const Plan = require('./plan');
const {delayPromise} = require('./utils');
let Kite;

let cachedBufferPosition;

const KiteProvider = {
  selector: '.source.python, .source.js',
  disableForSelector: [
    '.source.python .comment',
    '.source.python .string',
    '.source.js .comment',
    '.source.js .string',
  ].join(', '),
  inclusionPriority: 5,
  suggestionPriority: 5,
  excludeLowerPriority: false,

  // called to handle attribute completions
  getSuggestions(params) {
    if (!Kite) { Kite = require('./kite'); }

    return Kite.isEditorWhitelisted(params.editor) && Kite.app.isGrammarSupported(params.editor)
      ? delayPromise(() => {
        let promise = Plan.queryPlan();
        if (this.isInsideFunctionCall(params)) {
          if (this.shouldLoadSignature(params)) {
            promise = promise.then(() => this.loadSignature(params));
          }
        } else {
          this.clearSignature();
        }

        cachedBufferPosition = params.bufferPosition;

        if (!atom.config.get('kite.enableCompletions', false)) {
          return promise.then(() => []);
        }

        return promise.then(() =>
        DataLoader.getCompletionsAtPosition(params.editor, params.editor.getCursorBufferPosition()));
      }, 0)
      : new Promise((resolve) => {
        cachedBufferPosition = params.bufferPosition;
        resolve();
      });
  },

  // TODO: revisit whether logic below should be made language specific
  shouldLoadSignature({ bufferPosition, editor }) {
    const prevChars =  bufferPosition.column > 0 ?
        editor.getTextInBufferRange([[bufferPosition.row, bufferPosition.column - 2],
            [bufferPosition.row, bufferPosition.column + 1]]) : '';
    // hack around non-intuitive bufferPosition with initial keystroke of '(' and auto-suffixion of ')'
    const prevChar = prevChars[1] === ')' ? prevChars[0] : prevChars[1];
    const shouldLoad =
        this.isArgBeginning(bufferPosition, prevChar) || this.keystrokeNonContinuous(bufferPosition, prevChars);
    return shouldLoad;
  },

  // TODO: revisit whether logic below should be made language specific
  isArgBeginning(bufferPosition, prevChar) {
    return /^[(,]+$/.test(prevChar);
  },

  // TODO: revisit whether logic below should be made language specific
  keystrokeNonContinuous(bufferPosition, prevChars) {
    if (!cachedBufferPosition) { return true; }
    if (bufferPosition.row !== cachedBufferPosition.row) { return true; }
    if (bufferPosition.column === cachedBufferPosition.column + 1) { return false; }
    if (bufferPosition.column === cachedBufferPosition.column) {
      // hack for detecting first typed char of first arg
      if (prevChars[0] === '(' && prevChars[2] && prevChars[2] === ')') { return false; }
    }
    return true;
  },

  isInsideFunctionCall({scopeDescriptor}) {
    // Prior to version 1.24 the arguments scope didn't had the function-call|method-call
    // prefix, so we need to keed the old check otherwise we're breaking the signature
    // panel in these versions
    if (parseFloat(atom.getVersion()) <= 1.23) {
      return scopeDescriptor.scopes.some(s =>
        s.indexOf('function-call') !== -1 ||
        s.indexOf('method-call') !== -1 ||
        s.indexOf('arguments') !== -1
      );
    } else {
      return scopeDescriptor.scopes.some(s =>
        s.indexOf('function-call') !== -1 ||
        s.indexOf('method-call') !== -1
      ) &&
      scopeDescriptor.scopes.some(s =>
        s.indexOf('punctuation.definition.arguments.end.bracket.round.python') !== -1 ||
        /(function|method)-call\.arguments/.test(s)
      );
    }
  },

  loadSignature({editor}) {
    const compact = false;

    return DataLoader.getSignaturesAtPosition(editor, editor.getCursorBufferPosition())
    .then(data => {
      if (data) {
        const listElement = this.getSuggestionsListElement( );

        listElement.maxVisibleSuggestions = compact
          ? atom.config.get('autocomplete-plus.maxVisibleSuggestions')
          : atom.config.get('kite.maxVisibleSuggestionsAlongSignature');

        let isNewSigPanel = true;
        if (this.signaturePanel) { isNewSigPanel = false; }
        this.signaturePanel = this.signaturePanel || new KiteSignature();
        this.signaturePanel.setListElement(listElement);

        this.signaturePanel.setData(data, compact);
        atom.config.get('kite.hideDocumentationWhenSignatureIsAvailable')
          ? this.signaturePanel.setAttribute('no-documentation', '')
          : this.signaturePanel.removeAttribute('no-documentation');

        const element = listElement.element
          ? listElement.element
          : listElement;

        if (isNewSigPanel || this.sigPanelNeedsReinsertion(element)) {
          element.style.width = null;

          element.insertBefore(this.signaturePanel, element.lastChild);
        }
      }
    })
    .catch(err => {});
  },

  sigPanelNeedsReinsertion(element) {
    for (let i = 0; i < element.children.length; i++) {
      if (element.children[i].tagName.toLowerCase() === 'kite-signature') { return false; }
    }
    return true;
  },

  clearSignature() {
    if (this.signaturePanel && this.signaturePanel.parentNode) {
      this.signaturePanel.parentNode.removeChild(this.signaturePanel);
    }
  },

  getSuggestionsListElement() {
    if (!atom.packages.getAvailablePackageNames().includes('autocomplete-plus')) {
      return null;
    }
    if (this.suggestionListElement) { return this.suggestionListElement; }

    const pkg = atom.packages.getActivePackage('autocomplete-plus').mainModule;
    const list = pkg.autocompleteManager.suggestionList;
    this.suggestionListElement = list.suggestionListElement
      ? list.suggestionListElement
      : atom.views.getView(pkg.autocompleteManager.suggestionList);

    if (!this.suggestionListElement.ol) {
      this.suggestionListElement.renderList();
    }

    return this.suggestionListElement;
  },
};

module.exports = KiteProvider;
