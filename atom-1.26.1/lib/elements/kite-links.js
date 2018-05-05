'use strict';

const {CompositeDisposable, Emitter} = require('atom');
const LinkScheme = require('../link-scheme');
let Kite;

const {stripLeadingSlash, parseRangeInPath, parsePositionInPath, parseDefinitionInPath} = require('../utils');

class KiteLinks extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-links', {
      prototype: this.prototype,
    });
  }

  onDidClickMoreLink(listener) {
    return this.emitter.on('did-click-more-link', listener);
  }

  createdCallback() {
    this.emitter = new Emitter();
  }

  attachedCallback() {
    this.subscriptions = new CompositeDisposable();
    this.scheme = new LinkScheme('kite-atom-internal', this);

    this.subscriptions.add(this.scheme);
    this.subscriptions.add(this.emitter);
    this.subscriptions.add(this.scheme.onDidClickLink(({url, target}) => {
      if (!Kite) { Kite = require('../kite'); }
      const editor = atom.workspace.getActiveTextEditor();
      const kiteEditor = Kite.kiteEditorForEditor(editor);

      if (url.host === 'open-settings') {
        atom.applicationDelegate.openExternal('atom://settings-view/show-package?package=kite');
        return;
      }

      if (!editor || !kiteEditor) { return; }

      switch (url.host) {
        case 'goto': {
          const [filename, line, column] = parseDefinitionInPath(url.path);
          kiteEditor.openDefinition({filename, line, column}).catch(err => {
            atom.notifications.addWarning('Can\'t find the definition', {
              dismissable: true,
            });
          });
          break;
        }
        case 'goto-id': {
          const id = stripLeadingSlash(url.path);
          kiteEditor.openDefinitionForId(id).catch(() => {
            atom.notifications.addWarning(`Can't find a definition for id \`${id}\``, {
              dismissable: true,
            });
          });
          break;
        }
        case 'goto-range': {
          const range = parseRangeInPath(url.path);
          kiteEditor.openDefinitionAtRange(range)
          .catch(err => {
            atom.notifications.addWarning(`Can't find a definition at range \`${range}\``, {
              dismissable: true,
            });
          });
          break;
        }
        case 'open-range': {
          const range = parseRangeInPath(url.path);
          kiteEditor.openInWebAtRange(range);
          break;
        }
        case 'expand-range': {
          this.emitter.emit('did-click-more-link');
          const range = parseRangeInPath(url.path);
          kiteEditor.expandRange(range);
          break;
        }
        case 'goto-position': {
          const position = parsePositionInPath(url.path);
          kiteEditor.openDefinitionAtPosition(position)
          .catch(err => {
            atom.notifications.addWarning(`Can't find a definition at position \`${position}\``, {
              dismissable: true,
            });
          });
          break;
        }
        case 'open-position': {
          const position = parsePositionInPath(url.path);
          kiteEditor.openInWebAtPosition(position);
          break;
        }
        case 'expand-position': {
          this.emitter.emit('did-click-more-link');
          const position = parsePositionInPath(url.path);
          kiteEditor.expandPosition(position);
          break;
        }
        case 'type':
        case 'expand': {
          this.emitter.emit('did-click-more-link');
          const id = stripLeadingSlash(url.path);
          kiteEditor.expandId(id);
          break;
        }
      }
    }));
  }

  detachedCallback() {
    this.subscriptions && this.subscriptions.dispose();
  }
}

module.exports = KiteLinks.initClass();
