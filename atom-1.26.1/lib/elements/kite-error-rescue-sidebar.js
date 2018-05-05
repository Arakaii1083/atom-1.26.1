'use strict';
const relativeDate = require('tiny-relative-date');
const {Emitter, CompositeDisposable, TextEditor} = require('atom');
const {parent, stripLeadingSlash, DisposableEvent, addDelegatedEventListener} = require('../utils');
const DataLoader = require('../data-loader');
const metrics = require('../metrics');
const {ERROR_RESCUE_SHOW_SIDEBAR, ERROR_RESCUE_DONT_SHOW_SIDEBAR} = require('../constants');

const URI = 'atom://kite-error-rescue-sidebar';

class KiteErrorRescueSidebar extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-error-rescue-sidebar', {
      prototype: this.prototype,
    });
  }

  getURI() {
    return URI;
  }

  getIconName() {
    return this.tabIcon;
  }

  onDidChangeIcon(callback) {
    return this.emitter.on('did-change-icon', callback);
  }

  getTitle() {
    return 'Kite Error Rescue';
  }

  getPreferredLocation() {
    return atom.config.get('kite.sidebarPosition');
  }

  getAllowedLocations() {
    return ['left', 'right'];
  }

  isPermanentDockItem() {
    return false;
  }

  getPreferredWidth() {
    return atom.config.get('kite.sidebarWidth');
  }

  createdCallback() {
    this.innerHTML = `
      <div class="kite-column">
        <div class="header">
          <div class="messages"></div>
          <div class="settings-view">
            <a href="https://help.kite.com/article/78-what-is-error-rescue"
                title="Error Rescue automatically fixes the most common mistakes when you save your file.<br><br>Click to learn more."
                class="learn-more icon icon-question"></a>
            <div class="settings-panel">
              <div class="control-group checkbox">
                <label>
                  <input type="checkbox" class="input-toggle"></input>
                  <div class="setting-title">Enable Error Rescue</div>
                </label>
              </div>
              <div class="control-group select">
                <label>
                  <div class="setting-title">Any time code is fixed:</div>
                  <select type="checkbox" class="form-control">
                    <option value="${ERROR_RESCUE_SHOW_SIDEBAR}">Reopen this sidebar</option>
                    <option value="${ERROR_RESCUE_DONT_SHOW_SIDEBAR}">Do nothing (fix code quietly)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="content"></div>
      </div>
    `;

    this.emitter = new Emitter();
    this.messages = this.querySelector('.messages');
    this.content = this.querySelector('.content');
    this.input = this.querySelector('input');
    this.select = this.querySelector('select');
    this.element = this;
  }

  // Show hint or confirmation when the user hovers or clicks thumbs up/down
  showFeedbackFeedback(target, message, {confirmation} = {}) {
    let el = parent(target, '.diff').querySelector('.feedback-feedback');
    el.classList.toggle('confirmation', confirmation);
    el.classList.toggle('hint', !confirmation);
    el.innerHTML = message;
  }

  hideFeedbackFeedback(target) {
    let el = parent(target, '.diff').querySelector('.feedback-feedback');
    el.classList.remove('hint');
  }

  attachedCallback() {
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.config.observe('kite.enableErrorRescue', (v) => {
      this.input.checked = v;
      parent(this.input, '.control-group').classList.toggle('checked', this.input.checked);
      parent(this.input, '.kite-column').classList.toggle('error-rescue-enabled', this.input.checked);
    }));

    this.subscriptions.add(atom.config.observe('kite.actionWhenErrorRescueFixesCode', (v) => {
      this.select.value = v;
    }));

    if (atom.workspace.onDidChangeActiveTextEditor) {
      this.subscriptions.add(atom.workspace.onDidChangeActiveTextEditor(() => {
        if (atom.workspace.getActiveTextEditor()) {
          this.renderDiffs(this.getCurrentEditorCorrectionsHistory());
        } else {
          this.clearContent();
        }
      }));
    } else {
      this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
        if (item instanceof TextEditor) {
          this.renderDiffs(this.getCurrentEditorCorrectionsHistory());
        } else {
          this.clearContent();
        }
      }));
    }

    this.subscriptions.add(new DisposableEvent(this.input, 'change', (e) => {
      parent(this.input, '.control-group').classList.toggle('checked', this.input.checked);
      atom.config.set('kite.enableErrorRescue', this.input.checked);
    }));

    this.subscriptions.add(new DisposableEvent(this.select, 'change', (e) => {
      atom.config.set('kite.actionWhenErrorRescueFixesCode', this.select.value);
    }));

    this.subscriptions.add(addDelegatedEventListener(this, 'click', '.message-box .btn-close', (e) => {
      parent(e.target, '.message-box').remove();

      if (this.messages.matches(':empty')) {
        this.messages.classList.remove('has-messages');
      }
    }));

    this.subscriptions.add(addDelegatedEventListener(this, 'click', '.thumb-up', (e) => {
      DataLoader.postAutocorrectFeedbackData(this.getCurrentEditorLastCorrections(), +1);
      // Remove if clicked on another one before
      parent(e.target, '.diff').querySelectorAll('.clicked').forEach(el => el.classList.remove('clicked'));
      e.target.classList.add('clicked');

      this.showFeedbackFeedback(e.target, 'Thanks for your feedback!', {confirmation: true});
    }));

    this.subscriptions.add(addDelegatedEventListener(this, 'click', '.thumb-down', (e) => {
      DataLoader.postAutocorrectFeedbackData(this.getCurrentEditorLastCorrections(), -1);
      // Remove if clicked on another one before
      parent(e.target, '.diff').querySelectorAll('.clicked').forEach(el => el.classList.remove('clicked'));
      e.target.classList.add('clicked');

      this.showFeedbackFeedback(e.target, 'Thank you for your feedback!', {confirmation: true});
    }));

    this.subscriptions.add(addDelegatedEventListener(this, 'mouseover', '.thumb-up, .thumb-down, .go-to-code', (e) => {
      this.showFeedbackFeedback(e.target, e.target.getAttribute('aria-label'),
          {confirmation: false});
    }));

    this.subscriptions.add(addDelegatedEventListener(this, 'mouseout', '.thumb-up, .thumb-down, .go-to-code', (e) => {
      this.hideFeedbackFeedback(e.target);
    }));

    this.subscriptions.add(atom.tooltips.add(this.querySelector('.learn-more'), { title: () => '' }));

    this.renderDiffs(this.getCurrentEditorCorrectionsHistory());
  }

  getPane() {
    return atom.workspace.paneForURI(this.getURI());
  }

  isActivePaneItem() {
    const pane = this.getPane();

    return pane && pane.activeItem === this;
  }

  clearContent() {
    this.content.innerHTML = '';
  }

  detachedCallback() {
    this.subscriptions.dispose();
    metrics.featureApplied('autocorrect', '_panel_closed');
  }

  getCurrentEditorLastCorrections() {
    const editor = atom.workspace.getActiveTextEditor();
    const kiteEditor = this.Kite.kiteEditorForEditor(editor);
    return kiteEditor && kiteEditor.lastCorrectionsData;
  }
  getCurrentEditorCorrectionsHistory() {
    const editor = atom.workspace.getActiveTextEditor();
    const kiteEditor = this.Kite.kiteEditorForEditor(editor);
    return [kiteEditor && kiteEditor.fixesHistory, editor.getFileName(), editor];
  }

  renderDiffs([history, filename, editor] = []) {
    if (history && history.length) {
      const diffsHTML = history.map((fix, index) => {
        let html = '';
        switch (index) {
          case 0:
            html += `<div class="diff recent">
                <h4>Most recent code fixes</h4>`;
            break;
          case 1:
            html += `<div class="diff">
                <h4>Earlier fixes</h4>`;
            break;
          default:
            html += '<div class="diff">';
            break;
        }

        const {row, column} = editor
          ? editor.getBuffer().positionForCharacterIndex(fix.diffs[0].new_buffer_offset_bytes)
          : {};

        html += `
          <div class="timestamp">
            Fixed ${relativeDate(fix.timestamp)}:
          </div>
          ${fix.diffs.map(d => this.renderDiff(d)).join('')}
          <kite-links class="one-line feedback-actions">
            <a class="go-to-code icon icon-file-code"
               href="kite-atom-internal://goto/${encodeURI(stripLeadingSlash(editor ? editor.getPath() : filename))}:${row + 1}:${column + 1}"
               aria-label="Jump to where Error Rescue made changes">Go to code</a>
            <a class="thumb-up icon icon-thumbsup"
               aria-label="Send feedback to Kite if you like this change">I like this</a>
            <a class="thumb-down icon icon-thumbsdown"
               aria-label="Send feedback to Kite if you don’t like this change">I don’t</a>
          </kite-links>
          <div class="feedback-feedback"></div>
        </div>`;

        return html;
      }).join('');

      this.content.innerHTML = `<div class="diffs">${diffsHTML}</div>`;
    } else {
      this.content.innerHTML = `
        <div class="diffs"><div class="diff">
          <h4>Most recent code fixes</h4>
          <div class="message">No fixes made to ${filename} yet.</div>
        </div></div>`;
    }
  }

  renderDiff(diff) {
    return [
      '<code class="diff-content kite-code">',
      (diff.deleted || diff.old).map(del => `<del>
          ${del.line != null ? `<div class="line-number">${del.line + 1}</div>` : ''}
          <div class="line">${this.addEmphasis(del.text, del.emphasis)}</div>
        </del>`).join(''),
      (diff.inserted || diff.new).map(ins => `<ins>
          ${ins.line != null ? `<div class="line-number">${ins.line + 1}</div>` : ''}
          <div class="line">${this.addEmphasis(ins.text, ins.emphasis)}</div>
        </ins>`).join(''),
      '</code>',
    ].join('');

/*    <div class="line">${this.addEmphasis(ins.text, ins.emphasis)}</div>*/
  }

  showFirstRunExperience() {
    this.prependMessage(`<h4>Kite Error Rescue just fixed your code for the first time</h4>
    <p>
      Error Rescue will automatically fix the most common mistakes when
      you save your file. It uses machine learning
      and your feedback to constantly get better.
    </p>
    <a href="https://help.kite.com/article/78-what-is-error-rescue">Learn about Error Rescue</a>`);
  }

  prependMessage(msg) {
    const messageBox = document.createElement('div');
    messageBox.className = 'message-box';
    messageBox.innerHTML = `
      <button class="btn-close"><i class="icon icon-x"></i></button>
      ${msg}`;

    this.messages.classList.add('has-messages');
    this.messages.insertBefore(messageBox, this.messages.firstChild);
  }

  addEmphasis(text, emphasis = []) {
    let offset = 0;
    const offsetIncrement = '<strong></strong>'.length;

    return emphasis && emphasis.length
      ? emphasis.reduce((t, {start_runes, end_runes}) => {
        const newText = `${
          text.slice(0, start_runes + offset)
        }<strong>${
          text.slice(start_runes + offset, end_runes + offset)
        }</strong>${
          text.slice(end_runes + offset)
        }`;

        offset += offsetIncrement;

        return newText;
      }, text)
      : text;
  }

  loadModelInfo(version) {
    DataLoader.getAutocorrectModelInfo(version).then(data => {

      this.renderModelInfo(data);

      if (!this.isActivePaneItem()) {
        this.tabIcon = 'info';
        this.emitter.emit('did-change-icon');

        const sub = this.getPane().onDidChangeActiveItem((item) => {
          if (item === this) {
            delete this.tabIcon;
            this.emitter.emit('did-change-icon');
            sub.dispose();
          }
        });
      }
    });
  }

  renderModelInfo(data) {
    const html = `
      <h4>Just added: New code fix types</h4>
      ${data.examples.map((e) => {
        return `
          <p>${e.synopsis}</p>
          ${this.renderDiff(e)}`;
      }).join('')}
      <a href="https://help.kite.com/article/78-what-is-error-rescue">Learn about Error Rescue</a>
    `;

    this.prependMessage(html);
  }
}

module.exports = KiteErrorRescueSidebar.initClass();
